import { app } from 'electron'
import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { join } from 'path'
import {
  WEATHER_SEASONS,
  WEATHER_SEED_RECORDS,
  type WeatherSeason,
  type WeatherSeedRecord
} from './weatherSeed'
import { ENERGY_RATIO_BY_DATE, type HourlyEnergyRatio } from './energyRatioSeed'
import { GENERATION_KWH_BY_DATE, type HourlyGenerationKwh } from './generationSeed'

const WEATHER_SEEDED_KEY = 'weather_seeded_v2'
const GENERATION_KWH_SEEDED_KEY = 'generation_kwh_seeded_v1'

const WEATHER_COLUMNS =
  'id, season, date, month, day, humidity, temperature, weather, precipitation, sunrise, sunset, sunlight_max, created_at, updated_at'

const REQUIRED_WEATHER_COLUMNS = [
  'id',
  'season',
  'date',
  'month',
  'day',
  'humidity',
  'temperature',
  'weather',
  'precipitation',
  'sunrise',
  'sunset',
  'sunlight_max',
  'created_at',
  'updated_at'
]

export type { HourlyEnergyRatio, HourlyGenerationKwh, WeatherSeason }

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

interface EnergyRatioRow {
  hour: number
  time: string
  ratio: number
}

interface GenerationKwhRow {
  hour: number
  time: string
  kwh: number
}

interface WeatherRow {
  id: number
  season: WeatherSeason
  date: string
  month: number
  day: number
  humidity: number
  temperature: number
  weather: string
  precipitation: number
  sunrise: string
  sunset: string
  sunlight_max: string
  created_at: string
  updated_at: string
}

let database: Database.Database | null = null

export function closeWeatherDatabase(): void {
  database?.close()
  database = null
}

export function getAppMetadataValue(key: string): string | null {
  const row = getWeatherDatabase()
    .prepare('SELECT value FROM app_metadata WHERE key = ?')
    .get(normalizeMetadataKey(key)) as { value: string } | undefined

  return row?.value ?? null
}

export function setAppMetadataValue(key: string, value: string): void {
  getWeatherDatabase()
    .prepare('INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)')
    .run(normalizeMetadataKey(key), String(value))
}

export function removeAppMetadataValue(key: string): void {
  getWeatherDatabase()
    .prepare('DELETE FROM app_metadata WHERE key = ?')
    .run(normalizeMetadataKey(key))
}

export function listWeatherRecords(query: WeatherListQuery = {}): WeatherRecord[] {
  const db = getWeatherDatabase()
  const params: Record<string, string> = {}
  const filters: string[] = []
  const keyword = query.keyword?.trim()

  if (query.season) {
    params.season = normalizeSeason(query.season)
    filters.push('season = @season')
  }

  if (keyword) {
    params.keyword = `%${keyword}%`
    filters.push(
      `(season LIKE @keyword OR weather LIKE @keyword OR date LIKE @keyword OR printf('%02d/%02d', month, day) LIKE @keyword)`
    )
  }

  return db
    .prepare(
      `SELECT ${WEATHER_COLUMNS}
       FROM weather_records
       ${filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''}
       ORDER BY ${getWeatherOrderSql()}`
    )
    .all(params)
    .map(mapWeatherRow)
}

export function getWeatherForecastRecords(query: WeatherForecastQuery): WeatherRecord[] {
  const season = normalizeSeason(query.season)
  const startDay = normalizeForecastDay(query.startDay)
  const count = normalizeForecastCount(query.count)
  const records = listWeatherRecords({ season })

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
          (season, date, month, day, humidity, temperature, weather, precipitation, sunrise, sunset, sunlight_max, created_at, updated_at)
         VALUES
          (@season, @date, @month, @day, @humidity, @temperature, @weather, @precipitation, @sunrise, @sunset, @sunlightMax, @now, @now)`
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
         SET season = @season,
             date = @date,
             month = @month,
             day = @day,
             humidity = @humidity,
             temperature = @temperature,
             weather = @weather,
             precipitation = @precipitation,
             sunrise = @sunrise,
             sunset = @sunset,
             sunlight_max = @sunlightMax,
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

export function updateWeatherEnergyRatios(
  date: string,
  ratios: HourlyEnergyRatio[]
): WeatherRecord {
  const db = getWeatherDatabase()
  const normalizedDate = normalizeDate(date).date
  const normalizedRatios = normalizeHourlyEnergyRatios(ratios)
  const now = new Date().toISOString()

  if (!getWeatherRowByDate(normalizedDate)) {
    throw new Error('未找到对应日期的天气记录')
  }

  const upsert = db.prepare(
    `INSERT INTO energy_ratio_records (date, hour, time, ratio, updated_at)
     VALUES (@date, @hour, @time, @ratio, @now)
     ON CONFLICT(date, hour) DO UPDATE SET
       time = excluded.time,
       ratio = excluded.ratio,
       updated_at = excluded.updated_at`
  )

  db.transaction((items: HourlyEnergyRatio[]) => {
    for (const item of items) {
      upsert.run({ ...item, date: normalizedDate, now })
    }
  })(normalizedRatios)

  return getWeatherRecordByDate(normalizedDate)
}

export function updateWeatherGenerationKwh(
  date: string,
  generationKwh: HourlyGenerationKwh[]
): WeatherRecord {
  const db = getWeatherDatabase()
  const normalizedDate = normalizeDate(date).date
  const normalizedGenerationKwh = normalizeHourlyGenerationKwh(generationKwh)
  const now = new Date().toISOString()

  if (!getWeatherRowByDate(normalizedDate)) {
    throw new Error('未找到对应日期的天气记录')
  }

  const upsert = db.prepare(
    `INSERT INTO generation_kwh_records (date, hour, time, kwh, updated_at)
     VALUES (@date, @hour, @time, @kwh, @now)
     ON CONFLICT(date, hour) DO UPDATE SET
       time = excluded.time,
       kwh = excluded.kwh,
       updated_at = excluded.updated_at`
  )

  db.transaction((items: HourlyGenerationKwh[]) => {
    for (const item of items) {
      upsert.run({ ...item, date: normalizedDate, now })
    }
  })(normalizedGenerationKwh)

  return getWeatherRecordByDate(normalizedDate)
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
  `)

  migrateWeatherSchema(db)

  db.exec(`
    CREATE TABLE IF NOT EXISTS weather_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season TEXT NOT NULL CHECK (season IN ('春秋', '夏', '冬')),
      date TEXT NOT NULL,
      month INTEGER NOT NULL,
      day INTEGER NOT NULL,
      humidity REAL NOT NULL,
      temperature REAL NOT NULL,
      weather TEXT NOT NULL,
      precipitation REAL NOT NULL DEFAULT 0,
      sunrise TEXT NOT NULL,
      sunset TEXT NOT NULL,
      sunlight_max TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (season, month, day)
    );
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS energy_ratio_records (
      date TEXT NOT NULL,
      hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
      time TEXT NOT NULL,
      ratio REAL NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (date, hour)
    );

    CREATE INDEX IF NOT EXISTS idx_energy_ratio_records_date
      ON energy_ratio_records(date);
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS generation_kwh_records (
      date TEXT NOT NULL,
      hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
      time TEXT NOT NULL,
      kwh REAL NOT NULL CHECK (kwh >= 0),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (date, hour)
    );

    CREATE INDEX IF NOT EXISTS idx_generation_kwh_records_date
      ON generation_kwh_records(date);
  `)

  seedWeatherRecords(db)
  seedEnergyRatioRecords(db)
  seedGenerationKwhRecords(db)
}

function migrateWeatherSchema(db: Database.Database): void {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'weather_records'")
    .get()

  if (!table) {
    return
  }

  const columns = db
    .prepare('PRAGMA table_info(weather_records)')
    .all()
    .map((column) => String((column as { name: unknown }).name))
  const hasRequiredColumns = REQUIRED_WEATHER_COLUMNS.every((column) => columns.includes(column))

  if (!hasRequiredColumns) {
    db.exec(`
      DROP TABLE weather_records;
      DELETE FROM app_metadata WHERE key LIKE 'weather_seeded_%';
    `)
  }
}

function seedWeatherRecords(db: Database.Database): void {
  const seeded = db.prepare('SELECT value FROM app_metadata WHERE key = ?').get(WEATHER_SEEDED_KEY)

  if (seeded) {
    return
  }

  const recordCount = (
    db.prepare('SELECT COUNT(*) AS count FROM weather_records').get() as {
      count: number
    }
  ).count
  const setSeeded = db.prepare('INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)')
  const now = new Date().toISOString()

  if (recordCount > 0) {
    setSeeded.run(WEATHER_SEEDED_KEY, now)
    return
  }

  const insert = db.prepare(
    `INSERT INTO weather_records
      (season, date, month, day, humidity, temperature, weather, precipitation, sunrise, sunset, sunlight_max, created_at, updated_at)
     VALUES
      (@season, @date, @month, @day, @humidity, @temperature, @weather, @precipitation, @sunrise, @sunset, @sunlightMax, @now, @now)`
  )

  db.transaction((records: WeatherSeedRecord[]) => {
    for (const record of records) {
      insert.run({ ...normalizeWeatherInput(record), now })
    }

    setSeeded.run(WEATHER_SEEDED_KEY, now)
  })(WEATHER_SEED_RECORDS)
}

function seedEnergyRatioRecords(db: Database.Database): void {
  const recordCount = (
    db.prepare('SELECT COUNT(*) AS count FROM energy_ratio_records').get() as {
      count: number
    }
  ).count

  if (recordCount > 0) {
    return
  }

  const now = new Date().toISOString()
  const insert = db.prepare(
    `INSERT INTO energy_ratio_records (date, hour, time, ratio, updated_at)
     VALUES (@date, @hour, @time, @ratio, @now)`
  )
  const seedItems = Object.entries(ENERGY_RATIO_BY_DATE).flatMap(([date, ratios]) =>
    ratios.map((ratio) => ({ ...ratio, date, now }))
  )

  db.transaction((items: Array<HourlyEnergyRatio & { date: string; now: string }>) => {
    for (const item of items) {
      insert.run(item)
    }
  })(seedItems)
}

function seedGenerationKwhRecords(db: Database.Database): void {
  const seeded = db
    .prepare('SELECT value FROM app_metadata WHERE key = ?')
    .get(GENERATION_KWH_SEEDED_KEY)

  if (seeded) {
    return
  }

  const now = new Date().toISOString()
  const upsert = db.prepare(
    `INSERT INTO generation_kwh_records (date, hour, time, kwh, updated_at)
     VALUES (@date, @hour, @time, @kwh, @now)
     ON CONFLICT(date, hour) DO UPDATE SET
       time = excluded.time,
       kwh = excluded.kwh,
       updated_at = excluded.updated_at`
  )
  const setSeeded = db.prepare('INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)')
  const seedItems = Object.entries(GENERATION_KWH_BY_DATE).flatMap(([date, values]) =>
    values.map((item) => ({ ...item, date, now }))
  )

  db.transaction((items: Array<HourlyGenerationKwh & { date: string; now: string }>) => {
    for (const item of items) {
      upsert.run(item)
    }

    setSeeded.run(GENERATION_KWH_SEEDED_KEY, now)
  })(seedItems)
}

function getWeatherRecord(id: number): WeatherRecord {
  const row = getWeatherDatabase()
    .prepare(
      `SELECT ${WEATHER_COLUMNS}
       FROM weather_records
       WHERE id = ?`
    )
    .get(id) as WeatherRow | undefined

  if (!row) {
    throw new Error('未找到天气记录')
  }

  return mapWeatherRow(row)
}

function getWeatherRecordByDate(date: string): WeatherRecord {
  const row = getWeatherRowByDate(date)

  if (!row) {
    throw new Error('未找到天气记录')
  }

  return mapWeatherRow(row)
}

function getWeatherRowByDate(date: string): WeatherRow | undefined {
  return getWeatherDatabase()
    .prepare(
      `SELECT ${WEATHER_COLUMNS}
       FROM weather_records
       WHERE date = ?`
    )
    .get(date) as WeatherRow | undefined
}

function mapWeatherRow(row: unknown): WeatherRecord {
  const weatherRow = row as WeatherRow
  const energyRatios = getEnergyRatiosByDateFromDatabase(weatherRow.date)
  const generationKwh = getGenerationKwhByDateFromDatabase(weatherRow.date)

  return {
    id: weatherRow.id,
    season: weatherRow.season,
    date: weatherRow.date,
    month: weatherRow.month,
    day: weatherRow.day,
    monthDay: formatMonthDay(weatherRow.month, weatherRow.day),
    humidity: weatherRow.humidity,
    temperature: weatherRow.temperature,
    weather: weatherRow.weather,
    precipitation: weatherRow.precipitation,
    sunrise: weatherRow.sunrise,
    sunset: weatherRow.sunset,
    sunlightMax: weatherRow.sunlight_max,
    energyRatios,
    energyRatioTotal: getEnergyRatioTotal(energyRatios),
    generationKwh,
    generationKwhTotal: getGenerationKwhTotal(generationKwh),
    createdAt: weatherRow.created_at,
    updatedAt: weatherRow.updated_at
  }
}

function getEnergyRatiosByDateFromDatabase(date: string): HourlyEnergyRatio[] {
  const rows = getWeatherDatabase()
    .prepare(
      `SELECT hour, time, ratio
       FROM energy_ratio_records
       WHERE date = ?
       ORDER BY hour ASC`
    )
    .all(date) as EnergyRatioRow[]

  if (rows.length > 0) {
    return rows.map((row) => ({
      hour: row.hour,
      time: row.time,
      ratio: row.ratio
    }))
  }

  return ENERGY_RATIO_BY_DATE[date]?.map((item) => ({ ...item })) ?? []
}

function getEnergyRatioTotal(ratios: HourlyEnergyRatio[]): number {
  const total = ratios.reduce((sum, item) => sum + item.ratio, 0)

  return Math.round(total * 1000) / 1000
}

function getGenerationKwhByDateFromDatabase(date: string): HourlyGenerationKwh[] {
  const rows = getWeatherDatabase()
    .prepare(
      `SELECT hour, time, kwh
       FROM generation_kwh_records
       WHERE date = ?
       ORDER BY hour ASC`
    )
    .all(date) as GenerationKwhRow[]

  if (rows.length > 0) {
    return rows.map((row) => ({
      hour: row.hour,
      time: row.time,
      kwh: row.kwh
    }))
  }

  return GENERATION_KWH_BY_DATE[date]?.map((item) => ({ ...item })) ?? []
}

function getGenerationKwhTotal(items: HourlyGenerationKwh[]): number {
  const total = items.reduce((sum, item) => sum + item.kwh, 0)

  return Math.round(total * 1000) / 1000
}

function normalizeWeatherInput(
  input: WeatherRecordInput
): WeatherRecordInput & { month: number; day: number } {
  const season = normalizeSeason(input.season)
  const { date, month, day } = normalizeDate(input.date)
  const humidity = Number(input.humidity)
  const temperature = Number(input.temperature)
  const precipitation = Number(input.precipitation)
  const weather = String(input.weather ?? '').trim()
  const sunrise = String(input.sunrise ?? '').trim()
  const sunset = String(input.sunset ?? '').trim()
  const sunlightMax = String(input.sunlightMax ?? '').trim()

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

  if (!isTimeValue(sunrise) || !isTimeValue(sunset) || !isTimeValue(sunlightMax)) {
    throw new Error('日出时间、日落时间和当日光照 Max 必须是 HH:mm 格式')
  }

  return {
    season,
    date,
    month,
    day,
    humidity,
    temperature,
    weather,
    precipitation,
    sunrise,
    sunset,
    sunlightMax
  }
}

function normalizeHourlyEnergyRatios(ratios: HourlyEnergyRatio[]): HourlyEnergyRatio[] {
  if (!Array.isArray(ratios) || ratios.length !== 24) {
    throw new Error('能耗占比必须包含 24 个小时段')
  }

  const seenHours = new Set<number>()
  const normalized = ratios.map((item) => {
    const hour = Number(item.hour)
    const ratio = Number(item.ratio)

    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      throw new Error('能耗小时必须是 0 到 23 之间的整数')
    }

    if (seenHours.has(hour)) {
      throw new Error('能耗小时不能重复')
    }

    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 100) {
      throw new Error('能耗占比必须在 0 到 100 之间')
    }

    seenHours.add(hour)

    return {
      hour,
      time: `${String(hour).padStart(2, '0')}:00`,
      ratio: Math.round(ratio * 1000) / 1000
    }
  })

  for (let hour = 0; hour < 24; hour += 1) {
    if (!seenHours.has(hour)) {
      throw new Error('能耗占比缺少小时段数据')
    }
  }

  return normalized.sort((left, right) => left.hour - right.hour)
}

function normalizeHourlyGenerationKwh(items: HourlyGenerationKwh[]): HourlyGenerationKwh[] {
  if (!Array.isArray(items) || items.length !== 24) {
    throw new Error('发电量必须包含 24 个小时段')
  }

  const seenHours = new Set<number>()
  const normalized = items.map((item) => {
    const hour = Number(item.hour)
    const kwh = Number(item.kwh)

    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      throw new Error('发电小时必须是 0 到 23 之间的整数')
    }

    if (seenHours.has(hour)) {
      throw new Error('发电小时不能重复')
    }

    if (!Number.isFinite(kwh) || kwh < 0) {
      throw new Error('发电量必须是大于或等于 0 的有限数值')
    }

    seenHours.add(hour)

    return {
      hour,
      time: `${String(hour).padStart(2, '0')}:00`,
      kwh: Math.round(kwh * 1000) / 1000
    }
  })

  for (let hour = 0; hour < 24; hour += 1) {
    if (!seenHours.has(hour)) {
      throw new Error('发电量缺少小时段数据')
    }
  }

  return normalized.sort((left, right) => left.hour - right.hour)
}

function normalizeId(id: number): number {
  const recordId = Number(id)

  if (!Number.isInteger(recordId) || recordId < 1) {
    throw new Error('记录 ID 不正确')
  }

  return recordId
}

function normalizeMetadataKey(key: string): string {
  const normalizedKey = String(key ?? '').trim()

  if (!normalizedKey || normalizedKey.length > 100) {
    throw new Error('应用配置键不正确')
  }

  return normalizedKey
}

function normalizeSeason(season: WeatherSeason): WeatherSeason {
  if (WEATHER_SEASONS.includes(season)) {
    return season
  }

  throw new Error('季节模式必须是春秋、夏或冬')
}

function normalizeDate(value: string): { date: string; month: number; day: number } {
  const date = String(value ?? '').trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)

  if (!match) {
    throw new Error('日期必须是 YYYY-MM-DD 格式')
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error('日期不正确')
  }

  return {
    date,
    month,
    day
  }
}

function normalizeForecastDay(day: number): number {
  const startDay = Number(day)

  if (!Number.isInteger(startDay) || startDay < 1 || startDay > 31) {
    throw new Error('预测起始日期必须是 1 到 31 之间的整数')
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

function formatMonthDay(month: number, day: number): string {
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`
}

function getWeatherOrderSql(): string {
  return `
    CASE season
      WHEN '春秋' THEN 1
      WHEN '夏' THEN 2
      WHEN '冬' THEN 3
      ELSE 4
    END ASC,
    month ASC,
    day ASC,
    id ASC
  `
}

function normalizeDatabaseError(error: unknown): Error {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''

  if (code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return new Error('该季节模式下的日期已存在，请修改后再保存')
  }

  return error instanceof Error ? error : new Error('天气数据操作失败')
}
