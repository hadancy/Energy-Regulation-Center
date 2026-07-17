import { ElectronAPI } from '@electron-toolkit/preload'

export interface CameraStreamInfo {
  id: string
  label: string
  channel: string
  rtspPath: string
  snapshotPath: string
  streamMode: 'rtsp' | 'snapshot'
  streamUrl: string
  snapshotUrl: string
  streamActive: boolean
  streamReady: boolean
  streamOpenedAt: number
  streamFirstFrameAt: number
  streamLastFrameAt: number
  activeTransport: string
  streamError: string
}

export interface CameraInfo {
  brand: string
  host: string
  username: string
  channel: string
  rtspPort: number
  rtspTransport: string
  rtspPath: string
  snapshotPath: string
  streamMode: 'rtsp' | 'snapshot'
  streamUrl: string
  snapshotUrl: string
  healthUrl: string
  proxyReady: boolean
  proxyError: string
  streamError: string
  streams: CameraStreamInfo[]
  ffmpegPath: string
  ffmpegAvailable: boolean
}

export type WeatherSeason = '春秋' | '夏' | '冬'

export interface WeatherRecordInput {
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

export interface HourlyEnergyRatio {
  hour: number
  time: string
  ratio: number
}

export interface HourlyGenerationKwh {
  hour: number
  time: string
  kwh: number
}

export interface WeatherRecord extends WeatherRecordInput {
  id: number
  month: number
  day: number
  monthDay: string
  energyRatios: HourlyEnergyRatio[]
  energyRatioTotal: number
  generationKwh: HourlyGenerationKwh[]
  generationKwhTotal: number
  createdAt: string
  updatedAt: string
}

export interface WeatherListQuery {
  keyword?: string
  season?: WeatherSeason
}

export interface WeatherForecastQuery {
  season: WeatherSeason
  startDay: number
  count?: number
}

export interface PlcValues {
  windSpeed: number | null
  temperature: number | null
  humidity: number | null
  illuminance: number | null
}

export type PlcPointDataType = 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32'
export type PlcValueKey = keyof PlcValues

export interface PlcReadPoint {
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

export interface PlcPointReading {
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

export interface PlcTestInput {
  host?: string
  port?: number
  unitId?: number
  timeoutMs?: number
  points?: PlcReadPoint[]
}

export interface PlcConfigurationInput {
  host: string
  port: number
  unitId: number
  timeoutMs: number
  points: PlcReadPoint[]
}

export interface PlcTestResult {
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

export interface PlcWeatherWriteInput {
  dateIndex: number
  weatherCode: number
  rainfall: number
  temperature: number
  humidity: number
  sunrise: string
  sunset: string
}

export interface PlcWritePointResult {
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

export interface PlcWeatherWriteResult {
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

export type PlcTrafficWriteResult = PlcWeatherWriteResult
export type PlcDashboardDateWriteResult = PlcWeatherWriteResult

export type PlcWorkOrderStatus = 'idle' | 'monitoring' | 'completion-email-pending' | 'completed'

export interface PlcWorkOrderState {
  status: PlcWorkOrderStatus
  statusText: string
  workOrderNumber: string
  startedAt: string
  notificationEmailSentAt: string
  notificationEmailMessageId: string
  completedAt: string
  completionEmailSentAt: string
  completionEmailMessageId: string
  completionEmailAttemptCount: number
  lastCompletionEmailAttemptAt: string
  lastCheckedAt: string
  lastValue: number | null
  lastError: string
}

export interface PlcWorkOrderTriggerWriteResult extends PlcWeatherWriteResult {
  email: EmailSendResult
  workOrder: PlcWorkOrderState
}

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

export interface EmailRecipient {
  id: string
  name: string
  email: string
}

export interface EmailSettings {
  smtpHost: string
  smtpPort: number
  secure: boolean
  user: string
  senderName: string
  hasAuthorizationCode: boolean
  recipients: EmailRecipient[]
  updatedAt: string
}

export interface EmailSettingsInput {
  smtpHost: string
  smtpPort: number
  secure: boolean
  user: string
  authorizationCode?: string
  senderName: string
  recipients: EmailRecipient[]
}

export interface EmailSendResult {
  ok: boolean
  skipped: boolean
  statusText: string
  error: string
  accepted: string[]
  rejected: string[]
  messageId: string
  sentAt: string
}

export interface PlcState {
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
  values: PlcValues
  points: PlcReadPoint[]
  readings: PlcPointReading[]
  lastUpdatedAt: string
  lastUpdatedTimestamp: number
  error: string
  consecutiveFailures: number
  workOrder: PlcWorkOrderState
}

export interface AppAPI {
  camera: {
    getInfo: () => Promise<CameraInfo>
    getSnapshot: (channel?: string) => Promise<string>
  }
  plc: {
    getState: () => Promise<PlcState>
    startPolling: () => Promise<PlcState>
    stopPolling: () => Promise<PlcState>
    updatePoints: (points: PlcReadPoint[]) => Promise<PlcState>
    saveConfig: (input: PlcConfigurationInput) => Promise<PlcState>
    resetConfig: () => Promise<PlcState>
    testConnection: (input: PlcTestInput) => Promise<PlcTestResult>
    writeWeather: (input: PlcWeatherWriteInput) => Promise<PlcWeatherWriteResult>
    writeTraffic: (value: number) => Promise<PlcTrafficWriteResult>
    writeDashboardDate: (value: number) => Promise<PlcDashboardDateWriteResult>
    writeWorkOrderTrigger: () => Promise<PlcWorkOrderTriggerWriteResult>
    onUpdate: (callback: (state: PlcState) => void) => () => void
  }
  weather: {
    list: (query?: WeatherListQuery) => Promise<WeatherRecord[]>
    forecast: (query: WeatherForecastQuery) => Promise<WeatherRecord[]>
    create: (input: WeatherRecordInput) => Promise<WeatherRecord>
    update: (id: number, input: WeatherRecordInput) => Promise<WeatherRecord>
    updateEnergyRatios: (date: string, ratios: HourlyEnergyRatio[]) => Promise<WeatherRecord>
    updateGenerationKwh: (
      date: string,
      generationKwh: HourlyGenerationKwh[]
    ) => Promise<WeatherRecord>
    remove: (id: number) => Promise<{ success: true }>
  }
  externalApp: {
    getSettings: () => Promise<ExternalAppSettings>
    choose: () => Promise<ExternalAppActionResult>
    saveSettings: (settings: ExternalAppSettings) => Promise<ExternalAppSettings>
    launch: () => Promise<ExternalAppActionResult>
  }
  email: {
    getSettings: () => Promise<EmailSettings>
    saveSettings: (input: EmailSettingsInput) => Promise<EmailSettings>
    test: () => Promise<EmailSendResult>
  }
  window: {
    getFullscreen: () => Promise<boolean>
    toggleFullscreen: () => Promise<boolean>
    onFullscreenChanged: (callback: (isFullscreen: boolean) => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppAPI
  }
}
