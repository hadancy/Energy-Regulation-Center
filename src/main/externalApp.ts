import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { execFile } from 'child_process'
import { basename, extname, join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'

export interface ExternalAppSettings {
  path: string
  name: string
}

export interface ExternalAppActionResult {
  success: boolean
  settings: ExternalAppSettings
  error: string
  action?: 'launched' | 'activated' | 'already-running'
}

type WindowsActivationResult = 'not-running' | 'activated' | 'already-running' | 'unsupported'

const WINDOWS_ACTIVATE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$targetPath = [IO.Path]::GetFullPath($env:ENERGY_EXTERNAL_APP_PATH)

if ([IO.Path]::GetExtension($targetPath) -ieq '.lnk') {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($targetPath)
  if ($shortcut.TargetPath) {
    $targetPath = [IO.Path]::GetFullPath($shortcut.TargetPath)
  }
}

if ([IO.Path]::GetExtension($targetPath) -ine '.exe') {
  [Console]::Out.Write('UNSUPPORTED')
  exit 0
}

$processes = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
  try {
    $_.Path -and [string]::Equals(
      [IO.Path]::GetFullPath($_.Path),
      $targetPath,
      [StringComparison]::OrdinalIgnoreCase
    )
  } catch {
    $false
  }
})

if ($processes.Count -eq 0) {
  [Console]::Out.Write('NOT_RUNNING')
  exit 0
}

$windowProcess = $processes | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1

if (-not $windowProcess) {
  [Console]::Out.Write('ALREADY_RUNNING')
  exit 0
}

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class ExternalWindowActivator
{
    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@

$handle = $windowProcess.MainWindowHandle
$showCommand = if ([ExternalWindowActivator]::IsIconic($handle)) { 9 } else { 5 }
[ExternalWindowActivator]::ShowWindowAsync($handle, $showCommand) | Out-Null

$automation = New-Object -ComObject WScript.Shell
$activatedByShell = $automation.AppActivate($windowProcess.Id)
[ExternalWindowActivator]::BringWindowToTop($handle) | Out-Null
$activatedByApi = [ExternalWindowActivator]::SetForegroundWindow($handle)

if ($activatedByShell -or $activatedByApi) {
  [Console]::Out.Write('ACTIVATED')
} else {
  [Console]::Out.Write('ALREADY_RUNNING')
}
`

const activateRunningWindowsApp = (filePath: string): Promise<WindowsActivationResult> =>
  new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        WINDOWS_ACTIVATE_SCRIPT
      ],
      {
        env: { ...process.env, ENERGY_EXTERNAL_APP_PATH: filePath },
        timeout: 8_000,
        windowsHide: true
      },
      (error, stdout) => {
        if (error) {
          resolve('unsupported')
          return
        }

        switch (stdout.trim()) {
          case 'NOT_RUNNING':
            resolve('not-running')
            break
          case 'ACTIVATED':
            resolve('activated')
            break
          case 'ALREADY_RUNNING':
            resolve('already-running')
            break
          default:
            resolve('unsupported')
        }
      }
    )
  })

const emptySettings = (): ExternalAppSettings => ({ path: '', name: '' })

const getSettingsPath = (): string => join(app.getPath('userData'), 'external-app.json')

const normalizeSettings = (value: unknown): ExternalAppSettings => {
  if (!value || typeof value !== 'object') return emptySettings()

  const candidate = value as Partial<ExternalAppSettings>
  return {
    path: typeof candidate.path === 'string' ? candidate.path.trim() : '',
    name: typeof candidate.name === 'string' ? candidate.name.trim() : ''
  }
}

const readSettings = (): ExternalAppSettings => {
  try {
    return normalizeSettings(JSON.parse(readFileSync(getSettingsPath(), 'utf8')))
  } catch {
    return emptySettings()
  }
}

const saveSettings = (settings: ExternalAppSettings): ExternalAppSettings => {
  const normalized = normalizeSettings(settings)
  writeFileSync(getSettingsPath(), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  return normalized
}

const inferAppName = (filePath: string): string => {
  const extension = extname(filePath)
  return basename(filePath, extension) || '外部软件'
}

const getDialogProperties = (): Array<'openFile' | 'openDirectory'> =>
  process.platform === 'darwin' ? ['openFile', 'openDirectory'] : ['openFile']

const launchExternalApp = async (): Promise<ExternalAppActionResult> => {
  const settings = readSettings()

  if (!settings.path) {
    return { success: false, settings, error: '请先在系统设置中选择要跳转的软件' }
  }

  if (!existsSync(settings.path)) {
    return {
      success: false,
      settings,
      error: '已配置的软件不存在，请在系统设置中重新选择'
    }
  }

  if (process.platform === 'win32') {
    const activationResult = await activateRunningWindowsApp(settings.path)

    if (activationResult === 'activated') {
      return { success: true, settings, error: '', action: 'activated' }
    }

    if (activationResult === 'already-running') {
      return { success: true, settings, error: '', action: 'already-running' }
    }
  }

  const error = await shell.openPath(settings.path)
  return {
    success: error.length === 0,
    settings,
    error,
    action: error.length === 0 ? 'launched' : undefined
  }
}

let pendingLaunch: Promise<ExternalAppActionResult> | null = null
const LAUNCH_DEBOUNCE_MS = 1_500

export function registerExternalAppIpc(): void {
  ipcMain.handle('external-app:get-settings', () => readSettings())

  ipcMain.handle('external-app:choose', async (event): Promise<ExternalAppActionResult> => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: '选择要跳转的软件',
      buttonLabel: '选择软件',
      properties: getDialogProperties(),
      filters:
        process.platform === 'win32'
          ? [
              { name: '应用程序或快捷方式', extensions: ['exe', 'lnk', 'bat', 'cmd'] },
              { name: '所有文件', extensions: ['*'] }
            ]
          : undefined
    }
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, settings: readSettings(), error: '' }
    }

    const path = result.filePaths[0]
    const settings = saveSettings({ path, name: inferAppName(path) })
    return { success: true, settings, error: '' }
  })

  ipcMain.handle(
    'external-app:save-settings',
    (_event, input: ExternalAppSettings): ExternalAppSettings => {
      const settings = normalizeSettings(input)

      if (!settings.path || !existsSync(settings.path)) {
        throw new Error('所选软件不存在，请重新选择')
      }

      return saveSettings(settings)
    }
  )

  ipcMain.handle('external-app:launch', async (): Promise<ExternalAppActionResult> => {
    const launch = pendingLaunch ?? launchExternalApp()
    pendingLaunch = launch

    try {
      return await launch
    } finally {
      setTimeout(() => {
        if (pendingLaunch === launch) pendingLaunch = null
      }, LAUNCH_DEBOUNCE_MS)
    }
  })
}
