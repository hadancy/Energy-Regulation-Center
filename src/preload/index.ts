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
    list: (query?: { keyword?: string }) => ipcRenderer.invoke('weather:list', query),
    forecast: (query: WeatherForecastQuery) => ipcRenderer.invoke('weather:forecast', query),
    create: (input: WeatherRecordInput) => ipcRenderer.invoke('weather:create', input),
    update: (id: number, input: WeatherRecordInput) =>
      ipcRenderer.invoke('weather:update', id, input),
    remove: (id: number) => ipcRenderer.invoke('weather:remove', id)
  }
}

interface WeatherRecordInput {
  day: number
  humidity: number
  temperature: number
  weather: string
  precipitation: number
  sunrise: string
  sunset: string
}

interface WeatherForecastQuery {
  startDay: number
  count?: number
}

interface PlcState {
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
  values: {
    windSpeed: number | null
    temperature: number | null
    humidity: number | null
    illuminance: number | null
  }
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
