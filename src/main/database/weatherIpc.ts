import { ipcMain } from 'electron'
import {
  createWeatherRecord,
  getWeatherForecastRecords,
  listWeatherRecords,
  removeWeatherRecord,
  updateWeatherRecord,
  type WeatherForecastQuery,
  type WeatherListQuery,
  type WeatherRecordInput
} from './weatherRepository'

export function registerWeatherIpc(): void {
  ipcMain.handle('weather:list', (_event, query?: WeatherListQuery) => listWeatherRecords(query))
  ipcMain.handle('weather:forecast', (_event, query: WeatherForecastQuery) =>
    getWeatherForecastRecords(query)
  )
  ipcMain.handle('weather:create', (_event, input: WeatherRecordInput) =>
    createWeatherRecord(input)
  )
  ipcMain.handle('weather:update', (_event, id: number, input: WeatherRecordInput) =>
    updateWeatherRecord(id, input)
  )
  ipcMain.handle('weather:remove', (_event, id: number) => removeWeatherRecord(id))
}
