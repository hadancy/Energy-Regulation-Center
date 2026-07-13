import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
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
}

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

    const error = await shell.openPath(settings.path)
    return { success: error.length === 0, settings, error }
  })
}
