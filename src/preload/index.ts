import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  camera: {
    getInfo: () => ipcRenderer.invoke('camera:get-info'),
    getSnapshot: (channel?: string) => ipcRenderer.invoke('camera:get-snapshot', channel)
  },
  plc: {
    getState: () => ipcRenderer.invoke('plc:get-state'),
    startPolling: (): Promise<PlcState> => ipcRenderer.invoke('plc:start-polling'),
    stopPolling: (): Promise<PlcState> => ipcRenderer.invoke('plc:stop-polling'),
    updatePoints: (points: PlcReadPoint[]): Promise<PlcState> =>
      ipcRenderer.invoke('plc:update-points', points),
    testConnection: (input: PlcTestInput): Promise<PlcTestResult> =>
      ipcRenderer.invoke('plc:test-connection', input),
    writeWeather: (input: PlcWeatherWriteInput): Promise<PlcWeatherWriteResult> =>
      ipcRenderer.invoke('plc:write-weather', input),
    writeTraffic: (value: number): Promise<PlcTrafficWriteResult> =>
      ipcRenderer.invoke('plc:write-traffic', value),
    writeDashboardDate: (value: number): Promise<PlcDashboardDateWriteResult> =>
      ipcRenderer.invoke('plc:write-dashboard-date', value),
    onUpdate: (callback: (state: PlcState) => void) => {
      const listener = (_event: IpcRendererEvent, state: PlcState): void => {
        callback(state)
      }

      ipcRenderer.on('plc:update', listener)

      return () => {
        ipcRenderer.removeListener('plc:update', listener)
      }
    }
  },
  weather: {
    list: (query?: WeatherListQuery) => ipcRenderer.invoke('weather:list', query),
    forecast: (query: WeatherForecastQuery) => ipcRenderer.invoke('weather:forecast', query),
    create: (input: WeatherRecordInput) => ipcRenderer.invoke('weather:create', input),
    update: (id: number, input: WeatherRecordInput) =>
      ipcRenderer.invoke('weather:update', id, input),
    updateEnergyRatios: (date: string, ratios: HourlyEnergyRatio[]) =>
      ipcRenderer.invoke('weather:update-energy-ratios', date, ratios),
    updateGenerationKwh: (date: string, generationKwh: HourlyGenerationKwh[]) =>
      ipcRenderer.invoke('weather:update-generation-kwh', date, generationKwh),
    remove: (id: number) => ipcRenderer.invoke('weather:remove', id)
  },
  externalApp: {
    getSettings: (): Promise<ExternalAppSettings> =>
      ipcRenderer.invoke('external-app:get-settings'),
    choose: (): Promise<ExternalAppActionResult> => ipcRenderer.invoke('external-app:choose'),
    saveSettings: (settings: ExternalAppSettings): Promise<ExternalAppSettings> =>
      ipcRenderer.invoke('external-app:save-settings', settings),
    launch: (): Promise<ExternalAppActionResult> => ipcRenderer.invoke('external-app:launch')
  },
  window: {
    getFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:get-fullscreen'),
    toggleFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:toggle-fullscreen'),
    onFullscreenChanged: (callback: (isFullscreen: boolean) => void) => {
      const listener = (_event: IpcRendererEvent, isFullscreen: boolean): void => {
        callback(isFullscreen)
      }

      ipcRenderer.on('window:fullscreen-changed', listener)

      return () => {
        ipcRenderer.removeListener('window:fullscreen-changed', listener)
      }
    }
  }
}

interface ExternalAppSettings {
  path: string
  name: string
}

interface ExternalAppActionResult {
  success: boolean
  settings: ExternalAppSettings
  error: string
}

interface WeatherRecordInput {
  season: WeatherSeason
  date: string
  humidity: number
  temperature: number
  weather: string
  precipitation: number
  sunrise: string
  sunset: string
  sunlightMax: string
}

type WeatherSeason = '春秋' | '夏' | '冬'

interface WeatherListQuery {
  keyword?: string
  season?: WeatherSeason
}

interface WeatherForecastQuery {
  season: WeatherSeason
  startDay: number
  count?: number
}

interface HourlyEnergyRatio {
  hour: number
  time: string
  ratio: number
}

interface HourlyGenerationKwh {
  hour: number
  time: string
  kwh: number
}

type PlcPointDataType = 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32'
type PlcValueKey = 'windSpeed' | 'temperature' | 'humidity' | 'illuminance'

interface PlcReadPoint {
  id: string
  name: string
  registerArea: string
  dbBlock: number
  offsetAddress: number
  dataType: PlcPointDataType
  scale: number
  unit: string
  enabled: boolean
  valueKey?: PlcValueKey
}

interface PlcPointReading {
  pointId: string
  name: string
  registerArea: string
  dbBlock: number
  offsetAddress: number
  dataType: PlcPointDataType
  valueKey?: PlcValueKey
  unit: string
  status: 'success' | 'error' | 'skipped'
  rawRegisters: number[]
  rawValue: number | null
  value: number | null
  error: string
  readAt: string
  readTimestamp: number
}

interface PlcTestInput {
  host?: string
  port?: number
  unitId?: number
  timeoutMs?: number
  points?: PlcReadPoint[]
}

interface PlcTestResult {
  ok: boolean
  protocol: string
  host: string
  port: number
  unitId: number
  timeoutMs: number
  statusText: string
  readings: PlcPointReading[]
  error: string
  startedAt: string
  completedAt: string
  durationMs: number
}

interface PlcWeatherWriteInput {
  dateIndex: number
  weatherCode: number
  rainfall: number
  temperature: number
  humidity: number
  sunrise: string
  sunset: string
  seasonCode: number
}

interface PlcWritePointResult {
  pointId: string
  name: string
  registerArea: string
  dbBlock: number
  offsetAddress: number
  dataType: PlcPointDataType
  unit: string
  status: 'success' | 'error'
  modbusRegisterAddress: number | null
  sourceValue: number | string
  displayValue: number | string
  rawValue: number | null
  rawRegisters: number[]
  verifyRegisters: number[]
  verifyValue: number | string | null
  verified: boolean
  error: string
  writtenAt: string
  writtenTimestamp: number
}

interface PlcWeatherWriteResult {
  ok: boolean
  protocol: string
  host: string
  port: number
  unitId: number
  timeoutMs: number
  statusText: string
  writes: PlcWritePointResult[]
  error: string
  startedAt: string
  completedAt: string
  durationMs: number
}

type PlcTrafficWriteResult = PlcWeatherWriteResult
type PlcDashboardDateWriteResult = PlcWeatherWriteResult

interface PlcState {
  protocol: string
  brand: string
  series: string
  host: string
  port: number
  unitId: number
  startAddress: number
  illuminanceAddress: number
  registerCount: number
  pollIntervalMs: number
  timeoutMs: number
  status: 'idle' | 'connecting' | 'connected' | 'partial' | 'error'
  statusText: string
  values: {
    windSpeed: number | null
    temperature: number | null
    humidity: number | null
    illuminance: number | null
  }
  points: PlcReadPoint[]
  readings: PlcPointReading[]
  lastUpdatedAt: string
  lastUpdatedTimestamp: number
  error: string
  consecutiveFailures: number
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
