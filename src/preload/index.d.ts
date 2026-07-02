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

export interface WeatherRecordInput {
  day: number
  humidity: number
  temperature: number
  weather: string
  precipitation: number
  sunrise: string
  sunset: string
}

export interface WeatherRecord extends WeatherRecordInput {
  id: number
  createdAt: string
  updatedAt: string
}

export interface WeatherListQuery {
  keyword?: string
}

export interface WeatherForecastQuery {
  startDay: number
  count?: number
}

export interface PlcValues {
  windSpeed: number | null
  temperature: number | null
  humidity: number | null
  illuminance: number | null
}

export interface PlcState {
  brand: string
  series: string
  host: string
  port: number
  unitId: number
  startAddress: number
  registerCount: number
  pollIntervalMs: number
  timeoutMs: number
  status: 'idle' | 'connecting' | 'connected' | 'error'
  statusText: string
  values: PlcValues
  lastUpdatedAt: string
  lastUpdatedTimestamp: number
  error: string
  consecutiveFailures: number
}

export interface AppAPI {
  camera: {
    getInfo: () => Promise<CameraInfo>
    getSnapshot: (channel?: string) => Promise<string>
  }
  plc: {
    getState: () => Promise<PlcState>
    onUpdate: (callback: (state: PlcState) => void) => () => void
  }
  weather: {
    list: (query?: WeatherListQuery) => Promise<WeatherRecord[]>
    forecast: (query: WeatherForecastQuery) => Promise<WeatherRecord[]>
    create: (input: WeatherRecordInput) => Promise<WeatherRecord>
    update: (id: number, input: WeatherRecordInput) => Promise<WeatherRecord>
    remove: (id: number) => Promise<{ success: true }>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppAPI
  }
}
