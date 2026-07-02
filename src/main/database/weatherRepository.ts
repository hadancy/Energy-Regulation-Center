import { app } from 'electron'
import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { WEATHER_SEED_RECORDS, type WeatherSeedRecord } from './weatherSeed'

const WEATHER_SEEDED_KEY = 'weather_seeded_v1'

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

interface WeatherRow {
  id: number
  day: number
  humidity: number
  temperature: number
  weather: string
  precipitation: number
  sunrise: string
  sunset: string
  created_at: string
  updated_at: string
}

let database: Database.Database | null = null

export function closeWeatherDatabase(): void {
  database?.close()
  database = null
}

export function listWeatherRecords(query: WeatherListQuery = {}): WeatherRecord[] {
  const db = getWeatherDatabase()
  const keyword = query.keyword?.trim()

  if (!keyword) {
    return db
      .prepare(
        `SELECT id, day, humidity, temperature, weather, precipitation, sunrise, sunset, created_at, updated_at
         FROM weather_records
         ORDER BY day ASC, id ASC`
      )
      .all()
      .map(mapWeatherRow)
  }

  const likeKeyword = `%${keyword}%`
  return db
    .prepare(
      `SELECT id, day, humidity, temperature, weather, precipitation, sunrise, sunset, created_at, updated_at
       FROM weather_records
       WHERE weather LIKE @keyword OR CAST(day AS TEXT) LIKE @keyword
       ORDER BY day ASC, id ASC`
    )
    .all({ keyword: likeKeyword })
    .map(mapWeatherRow)
}

export function getWeatherForecastRecords(query: WeatherForecastQuery): WeatherRecord[] {
  const startDay = normalizeForecastDay(query.startDay)
  const count = normalizeForecastCount(query.count)
  const records = listWeatherRecords()

  if (records.length === 0) {
    return []
  }

  const firstAvailableIndex = records.findIndex((record) => record.day >= startDay)
  const startIndex = firstAvailableIndex === -1 ? 0 : firstAvailableIndex
  const resultLength = Math.min(count, records.length)

  return Array.from({ length: resultLength }, (_, index) => {
    return records[(startIndex + index) % records.length]
  })
}

export function createWeatherRecord(input: WeatherRecordInput): WeatherRecord {
  const db = getWeatherDatabase()
  const payload = normalizeWeatherInput(input)
  const now = new Date().toISOString()

  try {
    const result = db
      .prepare(
        `INSERT INTO weather_records
          (day, humidity, temperature, weather, precipitation, sunrise, sunset, created_at, updated_at)
         VALUES
          (@day, @humidity, @temperature, @weather, @precipitation, @sunrise, @sunset, @now, @now)`
      )
      .run({ ...payload, now })

    return getWeatherRecord(Number(result.lastInsertRowid))
  } catch (error) {
    throw normalizeDatabaseError(error)
  }
}

export function updateWeatherRecord(id: number, input: WeatherRecordInput): WeatherRecord {
  const db = getWeatherDatabase()
  const recordId = normalizeId(id)
  const payload = normalizeWeatherInput(input)
  const now = new Date().toISOString()

  try {
    const result = db
      .prepare(
        `UPDATE weather_records
         SET day = @day,
             humidity = @humidity,
             temperature = @temperature,
             weather = @weather,
             precipitation = @precipitation,
             sunrise = @sunrise,
             sunset = @sunset,
             updated_at = @now
         WHERE id = @id`
      )
      .run({ ...payload, id: recordId, now })

    if (result.changes === 0) {
      throw new Error('未找到要更新的天气记录')
    }

    return getWeatherRecord(recordId)
  } catch (error) {
    throw normalizeDatabaseError(error)
  }
}

export function removeWeatherRecord(id: number): { success: true } {
  const db = getWeatherDatabase()
  const result = db.prepare('DELETE FROM weather_records WHERE id = ?').run(normalizeId(id))

  if (result.changes === 0) {
    throw new Error('未找到要删除的天气记录')
  }

  return { success: true }
}

function getWeatherDatabase(): Database.Database {
  if (!database) {
    const databaseDir = app.getPath('userData')
    mkdirSync(databaseDir, { recursive: true })
    database = new Database(join(databaseDir, 'weather.sqlite'))
    database.pragma('journal_mode = WAL')
    initializeWeatherDatabase(database)
  }

  return database
}

function initializeWeatherDatabase(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS weather_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day INTEGER NOT NULL UNIQUE,
      humidity REAL NOT NULL,
      temperature REAL NOT NULL,
      weather TEXT NOT NULL,
      precipitation REAL NOT NULL DEFAULT 0,
      sunrise TEXT NOT NULL,
      sunset TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  seedWeatherRecords(db)
}

function seedWeatherRecords(db: Database.Database): void {
  const seeded = db.prepare('SELECT value FROM app_metadata WHERE key = ?').get(WEATHER_SEEDED_KEY)

  if (seeded) {
    return
  }

  const insert = db.prepare(
    `INSERT INTO weather_records
      (day, humidity, temperature, weather, precipitation, sunrise, sunset, created_at, updated_at)
     VALUES
      (@day, @humidity, @temperature, @weather, @precipitation, @sunrise, @sunset, @now, @now)`
  )
  const setSeeded = db.prepare('INSERT INTO app_metadata (key, value) VALUES (?, ?)')
  const now = new Date().toISOString()

  db.transaction((records: WeatherSeedRecord[]) => {
    for (const record of records) {
      insert.run({ ...record, now })
    }

    setSeeded.run(WEATHER_SEEDED_KEY, now)
  })(WEATHER_SEED_RECORDS)
}

function getWeatherRecord(id: number): WeatherRecord {
  const row = getWeatherDatabase()
    .prepare(
      `SELECT id, day, humidity, temperature, weather, precipitation, sunrise, sunset, created_at, updated_at
       FROM weather_records
       WHERE id = ?`
    )
    .get(id) as WeatherRow | undefined

  if (!row) {
    throw new Error('未找到天气记录')
  }

  return mapWeatherRow(row)
}

function mapWeatherRow(row: unknown): WeatherRecord {
  const weatherRow = row as WeatherRow

  return {
    id: weatherRow.id,
    day: weatherRow.day,
    humidity: weatherRow.humidity,
    temperature: weatherRow.temperature,
    weather: weatherRow.weather,
    precipitation: weatherRow.precipitation,
    sunrise: weatherRow.sunrise,
    sunset: weatherRow.sunset,
    createdAt: weatherRow.created_at,
    updatedAt: weatherRow.updated_at
  }
}

function normalizeWeatherInput(input: WeatherRecordInput): WeatherRecordInput {
  const day = Number(input.day)
  const humidity = Number(input.humidity)
  const temperature = Number(input.temperature)
  const precipitation = Number(input.precipitation)
  const weather = String(input.weather ?? '').trim()
  const sunrise = String(input.sunrise ?? '').trim()
  const sunset = String(input.sunset ?? '').trim()

  if (!Number.isInteger(day) || day < 1 || day > 366) {
    throw new Error('日期必须是 1 到 366 之间的整数')
  }

  if (!Number.isFinite(humidity) || humidity < 0 || humidity > 100) {
    throw new Error('平均湿度必须在 0 到 100 之间')
  }

  if (!Number.isFinite(temperature) || temperature < -80 || temperature > 80) {
    throw new Error('平均温度必须在 -80 到 80 之间')
  }

  if (!weather || weather.length > 20) {
    throw new Error('天气不能为空，且不能超过 20 个字符')
  }

  if (!Number.isFinite(precipitation) || precipitation < 0) {
    throw new Error('降水量必须大于或等于 0')
  }

  if (!isTimeValue(sunrise) || !isTimeValue(sunset)) {
    throw new Error('日出时间和日落时间必须是 HH:mm 格式')
  }

  return {
    day,
    humidity,
    temperature,
    weather,
    precipitation,
    sunrise,
    sunset
  }
}

function normalizeId(id: number): number {
  const recordId = Number(id)

  if (!Number.isInteger(recordId) || recordId < 1) {
    throw new Error('记录 ID 不正确')
  }

  return recordId
}

function normalizeForecastDay(day: number): number {
  const startDay = Number(day)

  if (!Number.isInteger(startDay) || startDay < 1 || startDay > 366) {
    throw new Error('预测起始日期必须是 1 到 366 之间的整数')
  }

  return startDay
}

function normalizeForecastCount(count = 10): number {
  const forecastCount = Number(count)

  if (!Number.isInteger(forecastCount) || forecastCount < 1 || forecastCount > 31) {
    throw new Error('预测天数必须是 1 到 31 之间的整数')
  }

  return forecastCount
}

function isTimeValue(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value)

  if (!match) {
    return false
  }

  const hour = Number(match[1])
  const minute = Number(match[2])

  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
}

function normalizeDatabaseError(error: unknown): Error {
  if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return new Error('该日期已存在，请修改日期后再保存')
  }

  return error instanceof Error ? error : new Error('天气数据操作失败')
}
