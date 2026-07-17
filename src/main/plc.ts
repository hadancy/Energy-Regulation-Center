import { BrowserWindow, ipcMain } from 'electron'
import { Socket } from 'net'
import ModbusRTU from 'modbus-serial'
import {
  getAppMetadataValue,
  removeAppMetadataValue,
  setAppMetadataValue
} from './database/weatherRepository'
import {
  createSkippedEmailResult,
  sendWorkOrderCompletionNotification,
  sendWorkOrderNotification,
  type EmailSendResult
} from './email'

const PLC_PROTOCOL = process.env['PLC_PROTOCOL'] ?? 'Modbus TCP'
const PLC_BRAND = process.env['PLC_BRAND'] ?? '西门子'
const PLC_SERIES = process.env['PLC_SERIES'] ?? 'S7-1200'
const PLC_HOST = process.env['PLC_HOST'] ?? '192.168.0.1'
const DEFAULT_PROTOCOL_PORT = '503'
const PLC_PORT = Number.parseInt(process.env['PLC_PORT'] ?? DEFAULT_PROTOCOL_PORT, 10)
const PLC_UNIT_ID = Number.parseInt(process.env['PLC_UNIT_ID'] ?? '1', 10)
const PLC_RACK = Number.parseInt(process.env['PLC_RACK'] ?? '0', 10)
const PLC_SLOT = Number.parseInt(process.env['PLC_SLOT'] ?? '1', 10)
const PLC_REGISTER_AREA = process.env['PLC_REGISTER_AREA'] ?? 'MW'
const PLC_DB_BLOCK = Number.parseInt(process.env['PLC_DB_BLOCK'] ?? '0', 10)
const PLC_START_ADDRESS = Number.parseInt(process.env['PLC_START_ADDRESS'] ?? '500', 10)
const PLC_ILLUMINANCE_ADDRESS = Number.parseInt(process.env['PLC_ILLUMINANCE_ADDRESS'] ?? '', 10)
const PLC_MODBUS_MEMORY_BASE_ADDRESS = Number.parseInt(
  process.env['PLC_MODBUS_MEMORY_BASE_ADDRESS'] ?? '500',
  10
)
const PLC_POLL_INTERVAL_MS = Number.parseInt(process.env['PLC_POLL_INTERVAL_MS'] ?? '3000', 10)
const PLC_TIMEOUT_MS = Number.parseInt(process.env['PLC_TIMEOUT_MS'] ?? '3000', 10)
const PLC_READ_POINTS_JSON = process.env['PLC_READ_POINTS'] ?? ''
const PLC_CONFIGURATION_KEY = 'plc_configuration_v1'
const PLC_CONFIGURATION_VERSION = 1
const WORK_ORDER_STATE_KEY = 'work_order_monitor_state_v1'
const WORK_ORDER_STATE_VERSION = 1
const WORK_ORDER_NUMBER = 'CN-GC-26374'
const WORK_ORDER_COMPLETION_EMAIL_RETRY_MS = 60_000

const DEFAULT_PORT = Number.isFinite(PLC_PORT)
  ? PLC_PORT
  : Number.parseInt(DEFAULT_PROTOCOL_PORT, 10)
const DEFAULT_UNIT_ID = Number.isFinite(PLC_UNIT_ID) ? PLC_UNIT_ID : 1
const DEFAULT_RACK = Number.isFinite(PLC_RACK) ? PLC_RACK : 0
const DEFAULT_SLOT = Number.isFinite(PLC_SLOT) ? PLC_SLOT : 1
const DEFAULT_REGISTER_AREA = PLC_REGISTER_AREA.trim() || 'MW'
const DEFAULT_DB_BLOCK = Number.isFinite(PLC_DB_BLOCK) ? PLC_DB_BLOCK : 0
const DEFAULT_START_ADDRESS = Number.isFinite(PLC_START_ADDRESS) ? PLC_START_ADDRESS : 500
const DEFAULT_ILLUMINANCE_ADDRESS = Number.isFinite(PLC_ILLUMINANCE_ADDRESS)
  ? PLC_ILLUMINANCE_ADDRESS
  : DEFAULT_START_ADDRESS + 6
const DEFAULT_MODBUS_MEMORY_BASE_ADDRESS = Number.isFinite(PLC_MODBUS_MEMORY_BASE_ADDRESS)
  ? PLC_MODBUS_MEMORY_BASE_ADDRESS
  : DEFAULT_START_ADDRESS
const DEFAULT_POLL_INTERVAL_MS = Number.isFinite(PLC_POLL_INTERVAL_MS) ? PLC_POLL_INTERVAL_MS : 3000
const DEFAULT_TIMEOUT_MS = Number.isFinite(PLC_TIMEOUT_MS) ? PLC_TIMEOUT_MS : 3000
const PLC_VISIBLE_ERROR_FAILURES = 3
const MODBUS_CONNECT_MAX_ATTEMPTS = 3
const MODBUS_CONNECT_RETRY_DELAY_MS = 250
const MODBUS_RECONNECT_GAP_MS = 500

type PlcConnectionStatus = 'idle' | 'connecting' | 'connected' | 'partial' | 'error'
type PlcPointStatus = 'success' | 'error' | 'skipped'
type PlcPointDataType = 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32'

interface PlcValues {
  windSpeed: number | null
  temperature: number | null
  humidity: number | null
  illuminance: number | null
}

type PlcValueKey = keyof PlcValues

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
  status: PlcPointStatus
  rawRegisters: number[]
  rawValue: number | null
  value: number | null
  error: string
  readAt: string
  readTimestamp: number
}

interface PlcConnectionConfig {
  host: string
  port: number
  unitId: number
  timeoutMs: number
}

export interface PlcConfigurationInput extends PlcConnectionConfig {
  points: unknown
}

interface PersistedPlcConfiguration extends PlcConnectionConfig {
  version: typeof PLC_CONFIGURATION_VERSION
  points: PlcReadPoint[]
  updatedAt: string
}

export interface PlcTestInput extends Partial<PlcConnectionConfig> {
  points?: unknown
}

export interface PlcTestResult extends PlcConnectionConfig {
  ok: boolean
  protocol: string
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

type PlcWriteStatus = 'success' | 'error'
type PlcWriteValueKind = 'number' | 'time'

interface PlcWritePoint extends PlcReadPoint {
  sourceValue: number | string
  displayValue: number | string
  rawValue: number
  valueKind: PlcWriteValueKind
}

export interface PlcWritePointResult {
  pointId: string
  name: string
  registerArea: string
  dbBlock: number
  offsetAddress: number
  dataType: PlcPointDataType
  unit: string
  status: PlcWriteStatus
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

export interface PlcWeatherWriteResult extends PlcConnectionConfig {
  ok: boolean
  protocol: string
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

export interface PlcState extends PlcConnectionConfig {
  protocol: string
  brand: string
  series: string
  startAddress: number
  illuminanceAddress: number
  registerCount: number
  pollIntervalMs: number
  status: PlcConnectionStatus
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

interface PersistedWorkOrderState extends PlcWorkOrderState {
  version: typeof WORK_ORDER_STATE_VERSION
}

const dataTypes = new Set<PlcPointDataType>(['uint16', 'int16', 'uint32', 'int32', 'float32'])
const valueKeys = new Set<PlcValueKey>(['windSpeed', 'temperature', 'humidity', 'illuminance'])
const s7MemoryAreas = new Map<string, number>([
  ['I', 0x81],
  ['IB', 0x81],
  ['IW', 0x81],
  ['ID', 0x81],
  ['Q', 0x82],
  ['QB', 0x82],
  ['QW', 0x82],
  ['QD', 0x82],
  ['M', 0x83],
  ['MB', 0x83],
  ['MW', 0x83],
  ['MD', 0x83],
  ['DB', 0x84],
  ['DBB', 0x84],
  ['DBW', 0x84],
  ['DBD', 0x84]
])
const modbusByteAddressedAreas = new Set([
  'M',
  'MB',
  'MW',
  'MD',
  'I',
  'IB',
  'IW',
  'ID',
  'Q',
  'QB',
  'QW',
  'QD',
  'DB',
  'DBB',
  'DBW',
  'DBD'
])

const WEATHER_WRITE_DECIMAL_SCALE = 0.1

const createWeatherWritePoint = (
  point: Omit<PlcWritePoint, 'dbBlock' | 'enabled' | 'valueKey'>
): PlcWritePoint => ({
  dbBlock: DEFAULT_DB_BLOCK,
  enabled: true,
  ...point
})

const emptyValues = (): PlcValues => ({
  windSpeed: null,
  temperature: null,
  humidity: null,
  illuminance: null
})

const toFiniteNumber = (value: unknown, fallback: number): number => {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const toInteger = (value: unknown, fallback: number): number => {
  const numeric = Math.trunc(toFiniteNumber(value, fallback))
  return Number.isFinite(numeric) ? numeric : fallback
}

const toNonNegativeInteger = (value: unknown, fallback: number): number => {
  const numeric = toInteger(value, fallback)
  return numeric >= 0 ? numeric : fallback
}

const toPositiveInteger = (value: unknown, fallback: number): number => {
  const numeric = toInteger(value, fallback)
  return numeric > 0 ? numeric : fallback
}

const toText = (value: unknown, fallback: string): string => {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

const clonePoint = (point: PlcReadPoint): PlcReadPoint => ({ ...point })

const cloneReading = (reading: PlcPointReading): PlcPointReading => ({
  ...reading,
  rawRegisters: [...reading.rawRegisters]
})

const getDataType = (value: unknown): PlcPointDataType => {
  return typeof value === 'string' && dataTypes.has(value as PlcPointDataType)
    ? (value as PlcPointDataType)
    : 'uint16'
}

const getValueKey = (value: unknown): PlcValueKey | undefined => {
  return typeof value === 'string' && valueKeys.has(value as PlcValueKey)
    ? (value as PlcValueKey)
    : undefined
}

const createReadPoint = (rawPoint: unknown, index: number): PlcReadPoint | null => {
  if (!rawPoint || typeof rawPoint !== 'object') {
    return null
  }

  const point = rawPoint as Record<string, unknown>
  const fallbackId = `point-${index + 1}`
  const id = toText(point['id'], fallbackId)
  const name = toText(point['name'] ?? point['label'], `点位${index + 1}`)
  const offsetAddress = toNonNegativeInteger(
    point['offsetAddress'] ?? point['offset'] ?? point['address'],
    Number.NaN
  )

  if (!Number.isFinite(offsetAddress)) {
    return null
  }

  return {
    id,
    name,
    registerArea: toText(
      point['registerArea'] ?? point['area'] ?? point['memoryArea'],
      DEFAULT_REGISTER_AREA
    ),
    dbBlock: toNonNegativeInteger(
      point['dbBlock'] ?? point['db'] ?? point['dbNumber'],
      DEFAULT_DB_BLOCK
    ),
    offsetAddress,
    dataType: getDataType(point['dataType'] ?? point['type']),
    scale: toFiniteNumber(point['scale'], 1),
    unit: toText(point['unit'], ''),
    enabled: point['enabled'] !== false,
    valueKey: getValueKey(point['valueKey'])
  }
}

type BuiltInReadPointDefinition = Omit<PlcReadPoint, 'registerArea' | 'dbBlock' | 'enabled'> & {
  registerArea?: string
}

const createBuiltInPoint = (definition: BuiltInReadPointDefinition): PlcReadPoint => ({
  registerArea: DEFAULT_REGISTER_AREA,
  dbBlock: DEFAULT_DB_BLOCK,
  enabled: true,
  ...definition
})

const sanitizeReadPoints = (points: unknown): PlcReadPoint[] => {
  if (!Array.isArray(points)) {
    return []
  }

  const seenIds = new Map<string, number>()
  const nextPoints: PlcReadPoint[] = []

  points.forEach((rawPoint, index) => {
    const point = createReadPoint(rawPoint, index)

    if (!point) {
      return
    }

    const seenCount = seenIds.get(point.id) ?? 0
    seenIds.set(point.id, seenCount + 1)

    nextPoints.push({
      ...point,
      id: seenCount > 0 ? `${point.id}-${seenCount + 1}` : point.id
    })
  })

  return nextPoints
}

const createBuiltInReadPoints = (): PlcReadPoint[] => {
  const definitions: BuiltInReadPointDefinition[] = [
    {
      id: 'windSpeed',
      name: '风速',
      offsetAddress: DEFAULT_START_ADDRESS,
      dataType: 'uint16',
      scale: 0.1,
      unit: 'm/s',
      valueKey: 'windSpeed'
    },
    {
      id: 'temperature',
      name: '传感器温度',
      offsetAddress: DEFAULT_START_ADDRESS + 2,
      dataType: 'uint16',
      scale: 0.1,
      unit: '℃',
      valueKey: 'temperature'
    },
    {
      id: 'humidity',
      name: '传感器湿度',
      offsetAddress: DEFAULT_START_ADDRESS + 4,
      dataType: 'uint16',
      scale: 0.1,
      unit: '%',
      valueKey: 'humidity'
    },
    {
      id: 'illuminance',
      name: '光照度',
      offsetAddress: DEFAULT_ILLUMINANCE_ADDRESS,
      dataType: 'uint16',
      scale: 1,
      unit: 'Lux',
      valueKey: 'illuminance'
    },
    {
      id: 'highTankFlow',
      name: '高位水箱流速',
      offsetAddress: DEFAULT_START_ADDRESS + 8,
      dataType: 'uint16',
      scale: 0.1,
      unit: ''
    },
    {
      id: 'lowTankFlow',
      name: '低位水箱流速',
      offsetAddress: DEFAULT_START_ADDRESS + 10,
      dataType: 'uint16',
      scale: 0.1,
      unit: ''
    },
    {
      id: 'loadPower',
      name: '负载功率',
      offsetAddress: DEFAULT_START_ADDRESS + 12,
      dataType: 'uint16',
      scale: 1,
      unit: 'W'
    },
    {
      id: 'traffic',
      name: '车流量',
      registerArea: 'MW',
      offsetAddress: 618,
      dataType: 'uint16',
      scale: 1,
      unit: 'VPM'
    },
    {
      id: 'highTankLevel',
      name: '高位水箱液位',
      offsetAddress: DEFAULT_START_ADDRESS + 16,
      dataType: 'uint16',
      scale: 1,
      unit: '%'
    },
    {
      id: 'lowTankLevel',
      name: '低位水箱液位',
      offsetAddress: DEFAULT_START_ADDRESS + 18,
      dataType: 'uint16',
      scale: 1,
      unit: '%'
    },
    {
      id: 'remainMinutes',
      name: '可持续时间',
      offsetAddress: DEFAULT_START_ADDRESS + 20,
      dataType: 'uint16',
      scale: 1,
      unit: 'min'
    },
    {
      id: 'pvAngle',
      name: '光伏板角度',
      offsetAddress: DEFAULT_START_ADDRESS + 22,
      dataType: 'uint16',
      scale: 1,
      unit: '°'
    },
    {
      id: 'windMode',
      name: '风力模式',
      offsetAddress: DEFAULT_START_ADDRESS + 24,
      dataType: 'uint16',
      scale: 1,
      unit: ''
    },
    {
      id: 'pvMode',
      name: '光伏模式',
      offsetAddress: DEFAULT_START_ADDRESS + 26,
      dataType: 'uint16',
      scale: 1,
      unit: ''
    },
    {
      id: 'waterSupplyState',
      name: '供水状态',
      offsetAddress: DEFAULT_START_ADDRESS + 28,
      dataType: 'uint16',
      scale: 1,
      unit: ''
    },
    {
      id: 'totalPower',
      name: '系统总功率',
      offsetAddress: DEFAULT_START_ADDRESS + 30,
      dataType: 'uint16',
      scale: 1,
      unit: 'W'
    },
    {
      id: 'gridPowerStateCode',
      name: '市电状态',
      offsetAddress: DEFAULT_START_ADDRESS + 32,
      dataType: 'uint16',
      scale: 1,
      unit: ''
    },
    {
      id: 'soc',
      name: '电池SOC',
      offsetAddress: DEFAULT_START_ADDRESS + 34,
      dataType: 'uint16',
      scale: 0.01,
      unit: '%'
    },
    {
      id: 'waterSoc',
      name: '水位SOC',
      offsetAddress: DEFAULT_START_ADDRESS + 36,
      dataType: 'uint16',
      scale: 1,
      unit: '%'
    },
    {
      id: 'socTotal',
      name: '总SOC值',
      offsetAddress: DEFAULT_START_ADDRESS + 38,
      dataType: 'uint16',
      scale: 1,
      unit: '%'
    },
    {
      id: 'overallEfficiency',
      name: '综合能效',
      offsetAddress: DEFAULT_START_ADDRESS + 40,
      dataType: 'uint16',
      scale: 1,
      unit: '%'
    },
    {
      id: 'selfConsumptionRate',
      name: '自发自用率',
      offsetAddress: DEFAULT_START_ADDRESS + 42,
      dataType: 'uint16',
      scale: 1,
      unit: '%'
    },
    {
      id: 'carbonReduction',
      name: '碳减排量',
      offsetAddress: DEFAULT_START_ADDRESS + 44,
      dataType: 'uint16',
      scale: 1,
      unit: ''
    },
    {
      id: 'socBased',
      name: '当前储能容量/额定储能容量',
      offsetAddress: DEFAULT_START_ADDRESS + 46,
      dataType: 'uint16',
      scale: 1,
      unit: '%'
    },
    {
      id: 'renewableEnergyVoltage',
      name: '新能源电压',
      offsetAddress: DEFAULT_START_ADDRESS + 48,
      dataType: 'uint16',
      scale: 1,
      unit: 'V'
    },
    {
      id: 'phsStatus',
      name: '蓄水储能状态',
      offsetAddress: DEFAULT_START_ADDRESS + 50,
      dataType: 'uint16',
      scale: 1,
      unit: ''
    },
    {
      id: 'bessStatus',
      name: '储能电池状态',
      offsetAddress: DEFAULT_START_ADDRESS + 52,
      dataType: 'uint16',
      scale: 1,
      unit: ''
    }
  ]

  return sanitizeReadPoints(definitions.map(createBuiltInPoint))
}

const createDefaultReadPoints = (): PlcReadPoint[] => {
  if (PLC_READ_POINTS_JSON.trim()) {
    try {
      const configuredPoints = sanitizeReadPoints(JSON.parse(PLC_READ_POINTS_JSON))

      if (configuredPoints.length > 0) {
        return configuredPoints
      }
    } catch (error) {
      console.error(`[PLC] PLC_READ_POINTS 解析失败：${getRawErrorMessage(error)}`)
    }
  }

  return createBuiltInReadPoints()
}

const deriveLegacyAddressState = (
  points: PlcReadPoint[]
): Pick<PlcState, 'startAddress' | 'illuminanceAddress' | 'registerCount'> => {
  const enabledPoints = points.filter((point) => point.enabled)
  const firstPoint = enabledPoints[0]
  const illuminancePoint = enabledPoints.find((point) => point.valueKey === 'illuminance')

  return {
    startAddress: firstPoint?.offsetAddress ?? DEFAULT_START_ADDRESS,
    illuminanceAddress: illuminancePoint?.offsetAddress ?? DEFAULT_ILLUMINANCE_ADDRESS,
    registerCount: enabledPoints.length
  }
}

const initialReadPoints = createDefaultReadPoints()
const initialLegacyAddressState = deriveLegacyAddressState(initialReadPoints)

let pollTimer: NodeJS.Timeout | null = null
let workOrderMonitorTimer: NodeJS.Timeout | null = null
let workOrderCheckInProgress = false
let polling = false
let testingConnection = false
let activePlcWriteCount = 0
let modbusConnectionQueue: Promise<void> = Promise.resolve()
const modbusConnectionReleases = new WeakMap<ModbusRTU, () => void>()

const createIdleWorkOrderState = (): PlcWorkOrderState => ({
  status: 'idle',
  statusText: '暂无进行中的工单',
  workOrderNumber: WORK_ORDER_NUMBER,
  startedAt: '',
  notificationEmailSentAt: '',
  notificationEmailMessageId: '',
  completedAt: '',
  completionEmailSentAt: '',
  completionEmailMessageId: '',
  completionEmailAttemptCount: 0,
  lastCompletionEmailAttemptAt: '',
  lastCheckedAt: '',
  lastValue: null,
  lastError: ''
})

let state: PlcState = {
  protocol: PLC_PROTOCOL,
  brand: PLC_BRAND,
  series: PLC_SERIES,
  host: PLC_HOST,
  port: DEFAULT_PORT,
  unitId: DEFAULT_UNIT_ID,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  ...initialLegacyAddressState,
  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  status: 'idle',
  statusText: '等待连接',
  values: emptyValues(),
  points: initialReadPoints,
  readings: [],
  lastUpdatedAt: '',
  lastUpdatedTimestamp: 0,
  error: '',
  consecutiveFailures: 0,
  workOrder: createIdleWorkOrderState()
}

function getRawErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'PLC 数据读取失败。'
}

const getPointAddressText = (
  point: Pick<PlcReadPoint, 'registerArea' | 'offsetAddress'>
): string => {
  return `${point.registerArea || DEFAULT_REGISTER_AREA}${point.offsetAddress}`
}

const summarizePointAddresses = (
  points: Array<Pick<PlcReadPoint, 'registerArea' | 'offsetAddress'>>
): string => {
  const visibleText = points.slice(0, 6).map(getPointAddressText).join('、')
  return points.length > 6 ? `${visibleText} 等` : visibleText || '当前点位'
}

const summarizeModbusRegisterAddresses = (points: PlcReadPoint[]): string => {
  const visibleText = points
    .slice(0, 6)
    .map((point) => {
      try {
        return `${getPointAddressText(point)}->${getModbusRegisterAddress(point)}`
      } catch {
        return `${getPointAddressText(point)}->?`
      }
    })
    .join('、')

  return points.length > 6 ? `${visibleText} 等` : visibleText || '当前点位'
}

const getPointSummary = (points: PlcReadPoint[]): string => {
  const enabledPoints = points.filter((point) => point.enabled)
  const visiblePoints = enabledPoints.length > 0 ? enabledPoints : points

  return summarizePointAddresses(visiblePoints)
}

const getCurrentConnectionConfig = (): PlcConnectionConfig => ({
  host: state.host,
  port: state.port,
  unitId: state.unitId,
  timeoutMs: state.timeoutMs
})

const getErrorMessage = (
  error: unknown,
  config: PlcConnectionConfig = getCurrentConnectionConfig(),
  points: PlcReadPoint[] = state.points
): string => {
  const message = getRawErrorMessage(error)
  const normalizedMessage = message.toLowerCase()

  if (
    normalizedMessage.includes('econnrefused') ||
    normalizedMessage.includes('port not open') ||
    normalizedMessage.includes('connection refused')
  ) {
    if (state.protocol.toLowerCase().includes('s7')) {
      return `${message}；请确认 S7-1200 的 S7 通信端口 ${config.port} 已开放，电脑与 PLC 在同网段，并允许 PUT/GET 通信。`
    }

    return `${message}；请确认 PLC 已启用 Modbus TCP Server，IP 为 ${config.host}，端口 ${config.port} 已开放。`
  }

  if (
    normalizedMessage.includes('etimedout') ||
    normalizedMessage.includes('timed out') ||
    normalizedMessage.includes('timeout')
  ) {
    if (state.protocol.toLowerCase().includes('s7')) {
      return `${message}；请检查电脑与 PLC 是否同网段、IP 是否正确、防火墙是否放行 ${config.port} 端口，以及 PLC 侧是否允许 S7 通信。`
    }

    return `${message}；请检查电脑与 PLC 是否同网段、IP 是否正确、防火墙是否放行 ${config.port} 端口，以及 PLC 侧 Modbus TCP Server 是否运行。`
  }

  if (
    normalizedMessage.includes('illegal data address') ||
    normalizedMessage.includes('illegal function')
  ) {
    return `${message}；连接已建立但点位地址不匹配，请确认 PLC 映射包含 ${getPointSummary(points)}。`
  }

  if (normalizedMessage.includes('错误类 129') && normalizedMessage.includes('错误码 4')) {
    return `${message}；PLC 已回包但拒绝当前 S7 外部读取请求。若是 S7-1200/1500，请在 TIA Portal 的 CPU 属性里启用允许 PUT/GET 通信，并确认保护等级允许 HMI/外部设备访问；修改后需要下载到 PLC。`
  }

  return message
}

const getPlcState = (): PlcState => ({
  ...state,
  values: { ...state.values },
  points: state.points.map(clonePoint),
  readings: state.readings.map(cloneReading),
  workOrder: { ...state.workOrder }
})

const broadcastPlcState = (): void => {
  const snapshot = getPlcState()

  for (const browserWindow of BrowserWindow.getAllWindows()) {
    if (!browserWindow.isDestroyed()) {
      browserWindow.webContents.send('plc:update', snapshot)
    }
  }
}

const updateState = (nextState: Partial<PlcState>): void => {
  state = {
    ...state,
    ...nextState,
    values: nextState.values ? { ...nextState.values } : state.values,
    points: nextState.points ? nextState.points.map(clonePoint) : state.points,
    readings: nextState.readings ? nextState.readings.map(cloneReading) : state.readings,
    workOrder: nextState.workOrder ? { ...nextState.workOrder } : state.workOrder
  }
  broadcastPlcState()
}

const closeModbusClient = async (activeClient: ModbusRTU | null): Promise<void> => {
  if (!activeClient) {
    return
  }

  const closeStartedAt = Date.now()
  const releaseConnection = modbusConnectionReleases.get(activeClient)
  modbusConnectionReleases.delete(activeClient)

  try {
    await new Promise<void>((resolve) => {
      let settled = false

      function finish(): void {
        if (settled) {
          return
        }

        settled = true

        clearTimeout(fallbackTimer)

        resolve()
      }

      const fallbackTimer = setTimeout(finish, 200)

      try {
        activeClient.close(finish)
      } catch {
        finish()
      }
    })

    console.info(`[PLC] Modbus TCP 连接已关闭：${Date.now() - closeStartedAt}ms`)
  } finally {
    if (releaseConnection) {
      await delay(MODBUS_RECONNECT_GAP_MS)
      console.info(`[PLC] Modbus TCP 重连冷却完成：${MODBUS_RECONNECT_GAP_MS}ms`)
      releaseConnection()
    }
  }
}

const delay = (durationMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, durationMs))

const waitForPollingIdle = async (timeoutMs: number): Promise<void> => {
  const startedAt = Date.now()

  while (polling && Date.now() - startedAt < timeoutMs) {
    await delay(50)
  }
}

const acquireModbusConnectionSlot = async (): Promise<() => void> => {
  const previousOperation = modbusConnectionQueue
  let releaseCurrentOperation = (): void => undefined

  modbusConnectionQueue = new Promise<void>((resolve) => {
    releaseCurrentOperation = resolve
  })

  await previousOperation

  let released = false

  return () => {
    if (!released) {
      released = true
      releaseCurrentOperation()
    }
  }
}

const normalizeConnectionConfig = (input?: Partial<PlcConnectionConfig>): PlcConnectionConfig => ({
  host: toText(input?.host, state.host),
  port: toPositiveInteger(input?.port, state.port),
  unitId: toPositiveInteger(input?.unitId, state.unitId),
  timeoutMs: toPositiveInteger(input?.timeoutMs, state.timeoutMs)
})

const validateConfigurationInput = (
  input: unknown
): { config: PlcConnectionConfig; points: PlcReadPoint[] } => {
  const candidate =
    input && typeof input === 'object' ? (input as Partial<PlcConfigurationInput>) : {}
  const host = typeof candidate.host === 'string' ? candidate.host.trim() : ''
  const port = Number(candidate.port)
  const unitId = Number(candidate.unitId)
  const timeoutMs = Number(candidate.timeoutMs)
  const points = sanitizeReadPoints(candidate.points)

  if (!host) {
    throw new Error('PLC IP 不能为空。')
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PLC 端口必须是 1 到 65535 之间的整数。')
  }

  if (!Number.isInteger(unitId) || unitId < 1 || unitId > 255) {
    throw new Error('PLC 站号必须是 1 到 255 之间的整数。')
  }

  if (!Number.isInteger(timeoutMs) || timeoutMs < 200) {
    throw new Error('PLC 超时时间必须是大于或等于 200ms 的整数。')
  }

  if (points.filter((point) => point.enabled).length === 0) {
    throw new Error('请至少保留一个启用的 PLC 点位。')
  }

  return {
    config: { host, port, unitId, timeoutMs },
    points
  }
}

const getPlcConnectionText = (config: PlcConnectionConfig): string => {
  return `${config.host}:${config.port} unit=${config.unitId} timeout=${config.timeoutMs}ms`
}

const isRetryableModbusConnectError = (error: unknown): boolean => {
  const errorCode =
    error && typeof error === 'object' && 'code' in error ? String(error.code).toUpperCase() : ''
  const message = getRawErrorMessage(error).toUpperCase()

  return errorCode === 'ECONNREFUSED' || message.includes('ECONNREFUSED')
}

const createConfiguredClient = async (config: PlcConnectionConfig): Promise<ModbusRTU> => {
  const releaseConnection = await acquireModbusConnectionSlot()

  try {
    for (let attempt = 1; attempt <= MODBUS_CONNECT_MAX_ATTEMPTS; attempt += 1) {
      const nextClient = new ModbusRTU()
      nextClient.setTimeout(config.timeoutMs)

      try {
        console.info(
          `[PLC] Modbus TCP 连接开始：${getPlcConnectionText(config)}；尝试=${attempt}/${MODBUS_CONNECT_MAX_ATTEMPTS}`
        )
        await nextClient.connectTCP(config.host, { port: config.port, timeout: config.timeoutMs })
        nextClient.setID(config.unitId)
        modbusConnectionReleases.set(nextClient, releaseConnection)
        console.info(`[PLC] Modbus TCP 连接成功：${getPlcConnectionText(config)}`)

        return nextClient
      } catch (error) {
        const shouldRetry =
          attempt < MODBUS_CONNECT_MAX_ATTEMPTS && isRetryableModbusConnectError(error)

        console.error(
          `[PLC] Modbus TCP 连接失败：${getPlcConnectionText(config)}；尝试=${attempt}/${MODBUS_CONNECT_MAX_ATTEMPTS}；${getRawErrorMessage(error)}`
        )
        await closeModbusClient(nextClient)

        if (!shouldRetry) {
          throw error
        }

        const retryDelayMs = MODBUS_CONNECT_RETRY_DELAY_MS * attempt
        console.warn(`[PLC] Modbus TCP 连接被拒绝，${retryDelayMs}ms 后重试。`)
        await delay(retryDelayMs)
      }
    }

    throw new Error('Modbus TCP 连接失败。')
  } catch (error) {
    releaseConnection()
    throw error
  }
}

const normalizeRegisterValue = (value: number | undefined): number => {
  return Number.isFinite(value) ? Number(value) : 0
}

const normalizeRegisterWord = (value: number | undefined): number => {
  const numeric = Math.trunc(normalizeRegisterValue(value))
  return Math.max(0, Math.min(0xffff, numeric))
}

const assertRegisterCount = (registers: number[], expectedCount: number, label: string): void => {
  if (registers.length < expectedCount) {
    throw new Error(
      `${label} 返回寄存器数量不足：期望 ${expectedCount} 个，实际 ${registers.length} 个。`
    )
  }
}

const getRegisterCount = (dataType: PlcPointDataType): number => {
  return dataType === 'uint16' || dataType === 'int16' ? 1 : 2
}

const getDataTypeByteLength = (dataType: PlcPointDataType): number => {
  return getRegisterCount(dataType) * 2
}

const decodeRegisterValue = (registers: number[], dataType: PlcPointDataType): number => {
  if (dataType === 'uint16') {
    return normalizeRegisterWord(registers[0])
  }

  if (dataType === 'int16') {
    const value = normalizeRegisterWord(registers[0])
    return value > 0x7fff ? value - 0x10000 : value
  }

  const buffer = Buffer.alloc(4)
  buffer.writeUInt16BE(normalizeRegisterWord(registers[0]), 0)
  buffer.writeUInt16BE(normalizeRegisterWord(registers[1]), 2)

  if (dataType === 'uint32') {
    return buffer.readUInt32BE(0)
  }

  if (dataType === 'int32') {
    return buffer.readInt32BE(0)
  }

  return buffer.readFloatBE(0)
}

const decodeBufferValue = (buffer: Buffer, dataType: PlcPointDataType): number => {
  if (dataType === 'uint16') {
    return buffer.readUInt16BE(0)
  }

  if (dataType === 'int16') {
    return buffer.readInt16BE(0)
  }

  if (dataType === 'uint32') {
    return buffer.readUInt32BE(0)
  }

  if (dataType === 'int32') {
    return buffer.readInt32BE(0)
  }

  return buffer.readFloatBE(0)
}

const bufferToRegisters = (buffer: Buffer): number[] => {
  const registers: number[] = []

  for (let index = 0; index < buffer.length; index += 2) {
    const nextBuffer = Buffer.alloc(2)
    buffer.copy(nextBuffer, 0, index, Math.min(index + 2, buffer.length))
    registers.push(nextBuffer.readUInt16BE(0))
  }

  return registers
}

const assertIntegerRange = (value: number, min: number, max: number, label: string): void => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} 的写入值必须是 ${min} 到 ${max} 之间的整数。`)
  }
}

const encodeRegisterValue = (
  value: number,
  dataType: PlcPointDataType,
  label: string
): number[] => {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} 的写入值不是有效数字。`)
  }

  if (dataType === 'uint16') {
    assertIntegerRange(value, 0, 0xffff, label)
    return [value]
  }

  if (dataType === 'int16') {
    assertIntegerRange(value, -0x8000, 0x7fff, label)
    return [value < 0 ? value + 0x10000 : value]
  }

  const buffer = Buffer.alloc(4)

  if (dataType === 'uint32') {
    assertIntegerRange(value, 0, 0xffffffff, label)
    buffer.writeUInt32BE(value, 0)
  } else if (dataType === 'int32') {
    assertIntegerRange(value, -0x80000000, 0x7fffffff, label)
    buffer.writeInt32BE(value, 0)
  } else {
    buffer.writeFloatBE(value, 0)
  }

  return bufferToRegisters(buffer)
}

const areRegistersEqual = (left: number[], right: number[]): boolean => {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

const applyScale = (value: number, scale: number): number => {
  const scaledValue = value * scale
  return Number.isInteger(scaledValue) ? scaledValue : Number(scaledValue.toFixed(6))
}

const createPointReading = (
  point: PlcReadPoint,
  status: PlcPointStatus,
  nextReading: Partial<PlcPointReading>
): PlcPointReading => {
  const now = new Date()

  return {
    pointId: point.id,
    name: point.name,
    registerArea: point.registerArea,
    dbBlock: point.dbBlock,
    offsetAddress: point.offsetAddress,
    dataType: point.dataType,
    valueKey: point.valueKey,
    unit: point.unit,
    status,
    rawRegisters: [],
    rawValue: null,
    value: null,
    error: '',
    readAt: now.toISOString(),
    readTimestamp: now.getTime(),
    ...nextReading
  }
}

const getFiniteWriteNumber = (value: unknown, label: string): number => {
  const numeric = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(numeric)) {
    throw new Error(`${label} 不是有效数字。`)
  }

  return numeric
}

const getIntegerWriteNumber = (value: unknown, label: string): number => {
  const numeric = getFiniteWriteNumber(value, label)

  if (!Number.isInteger(numeric)) {
    throw new Error(`${label} 必须是整数。`)
  }

  return numeric
}

const getScaledRawWriteValue = (value: unknown, scale: number, label: string): number => {
  const numeric = getFiniteWriteNumber(value, label)
  const rawValue = numeric / scale

  return Math.round(rawValue)
}

const parsePlcTimeMilliseconds = (value: unknown, label: string): number => {
  const text = String(value ?? '').trim()
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(text)

  if (timeMatch) {
    const hours = Number(timeMatch[1])
    const minutes = Number(timeMatch[2])

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return (hours * 60 + minutes) * 60 * 1000
    }
  }

  const literalMatch = /^T#(?:(\d+)h)?(?:(\d+)m)?$/i.exec(text)

  if (literalMatch && (literalMatch[1] || literalMatch[2])) {
    const hours = Number(literalMatch[1] ?? 0)
    const minutes = Number(literalMatch[2] ?? 0)

    if (hours >= 0 && minutes >= 0 && minutes <= 59) {
      return (hours * 60 + minutes) * 60 * 1000
    }
  }

  throw new Error(`${label} 必须是 HH:mm 或 T#NhNm 格式。`)
}

const formatPlcTimeLiteral = (milliseconds: number): string => {
  const totalMinutes = Math.round(milliseconds / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return `T#${hours}h${minutes}m`
}

const formatWritePointValue = (point: PlcWritePoint, rawValue: number): number | string => {
  if (point.valueKind === 'time') {
    return formatPlcTimeLiteral(rawValue)
  }

  return applyScale(rawValue, point.scale)
}

const createWeatherWritePoints = (input: PlcWeatherWriteInput): PlcWritePoint[] => {
  const dateIndex = getIntegerWriteNumber(input.dateIndex, '日期索引')
  const weatherCode = getIntegerWriteNumber(input.weatherCode, '天气编码')
  const rainfall = getFiniteWriteNumber(input.rainfall, '降水量')
  const temperature = getFiniteWriteNumber(input.temperature, '温度')
  const humidity = getFiniteWriteNumber(input.humidity, '湿度')
  const sunriseMs = parsePlcTimeMilliseconds(input.sunrise, '日出时间')
  const sunsetMs = parsePlcTimeMilliseconds(input.sunset, '日落时间')

  return [
    createWeatherWritePoint({
      id: 'DateIndex1',
      name: '日期索引',
      registerArea: 'MW',
      offsetAddress: 600,
      dataType: 'uint16',
      scale: 1,
      unit: '',
      sourceValue: dateIndex,
      displayValue: dateIndex,
      rawValue: dateIndex,
      valueKind: 'number'
    }),
    createWeatherWritePoint({
      id: 'Weather',
      name: '天气',
      registerArea: 'MW',
      offsetAddress: 602,
      dataType: 'uint16',
      scale: 1,
      unit: '',
      sourceValue: weatherCode,
      displayValue: weatherCode,
      rawValue: weatherCode,
      valueKind: 'number'
    }),
    createWeatherWritePoint({
      id: 'Rainfall',
      name: '降水量',
      registerArea: 'MW',
      offsetAddress: 604,
      dataType: 'uint16',
      scale: WEATHER_WRITE_DECIMAL_SCALE,
      unit: 'mm',
      sourceValue: rainfall,
      displayValue: rainfall,
      rawValue: getScaledRawWriteValue(rainfall, WEATHER_WRITE_DECIMAL_SCALE, '降水量'),
      valueKind: 'number'
    }),
    createWeatherWritePoint({
      id: 'Temperature',
      name: '温度',
      registerArea: 'MW',
      offsetAddress: 606,
      dataType: 'int16',
      scale: WEATHER_WRITE_DECIMAL_SCALE,
      unit: '℃',
      sourceValue: temperature,
      displayValue: temperature,
      rawValue: getScaledRawWriteValue(temperature, WEATHER_WRITE_DECIMAL_SCALE, '温度'),
      valueKind: 'number'
    }),
    createWeatherWritePoint({
      id: 'Humidity',
      name: '湿度',
      registerArea: 'MW',
      offsetAddress: 608,
      dataType: 'uint16',
      scale: WEATHER_WRITE_DECIMAL_SCALE,
      unit: '%',
      sourceValue: humidity,
      displayValue: humidity,
      rawValue: getScaledRawWriteValue(humidity, WEATHER_WRITE_DECIMAL_SCALE, '湿度'),
      valueKind: 'number'
    }),
    createWeatherWritePoint({
      id: 'SunriseTime',
      name: '日出时间',
      registerArea: 'MD',
      offsetAddress: 610,
      dataType: 'int32',
      scale: 1,
      unit: 'ms',
      sourceValue: input.sunrise,
      displayValue: formatPlcTimeLiteral(sunriseMs),
      rawValue: sunriseMs,
      valueKind: 'time'
    }),
    createWeatherWritePoint({
      id: 'SunsetTime',
      name: '日落时间',
      registerArea: 'MD',
      offsetAddress: 614,
      dataType: 'int32',
      scale: 1,
      unit: 'ms',
      sourceValue: input.sunset,
      displayValue: formatPlcTimeLiteral(sunsetMs),
      rawValue: sunsetMs,
      valueKind: 'time'
    })
  ]
}

const createTrafficWritePoint = (input: unknown): PlcWritePoint => {
  const traffic = getIntegerWriteNumber(input, '车流量')

  return createWeatherWritePoint({
    id: 'traffic',
    name: '车流量',
    registerArea: 'MW',
    offsetAddress: 618,
    dataType: 'uint16',
    scale: 1,
    unit: 'VPM',
    sourceValue: traffic,
    displayValue: traffic,
    rawValue: traffic,
    valueKind: 'number'
  })
}

const createDashboardDateWritePoint = (input: unknown): PlcWritePoint => {
  const dateCode = getIntegerWriteNumber(input, '仪表盘日期编码')

  if (dateCode < 0 || dateCode > 2) {
    throw new Error('仪表盘日期编码必须是 0、1 或 2。')
  }

  return createWeatherWritePoint({
    id: 'dashboardDate',
    name: '仪表盘日期',
    registerArea: 'MW',
    offsetAddress: 620,
    dataType: 'uint16',
    scale: 1,
    unit: '',
    sourceValue: dateCode,
    displayValue: dateCode,
    rawValue: dateCode,
    valueKind: 'number'
  })
}

const createWorkOrderTriggerWritePoint = (): PlcWritePoint => {
  return createWeatherWritePoint({
    id: 'workOrderTrigger',
    name: '工单提示',
    registerArea: 'MW',
    offsetAddress: 680,
    dataType: 'uint16',
    scale: 1,
    unit: '',
    sourceValue: 1,
    displayValue: 'true',
    rawValue: 1,
    valueKind: 'number'
  })
}

const createWorkOrderMonitorReadPoint = (): PlcReadPoint => ({
  id: 'workOrderMonitor',
  name: '工单状态',
  registerArea: 'MW',
  dbBlock: DEFAULT_DB_BLOCK,
  offsetAddress: 680,
  dataType: 'uint16',
  scale: 1,
  unit: '',
  enabled: true
})

const createPointWriteResult = (
  point: PlcWritePoint,
  status: PlcWriteStatus,
  nextResult: Partial<PlcWritePointResult>
): PlcWritePointResult => {
  const now = new Date()

  return {
    pointId: point.id,
    name: point.name,
    registerArea: point.registerArea,
    dbBlock: point.dbBlock,
    offsetAddress: point.offsetAddress,
    dataType: point.dataType,
    unit: point.unit,
    status,
    modbusRegisterAddress: null,
    sourceValue: point.sourceValue,
    displayValue: point.displayValue,
    rawValue: point.rawValue,
    rawRegisters: [],
    verifyRegisters: [],
    verifyValue: null,
    verified: false,
    error: '',
    writtenAt: now.toISOString(),
    writtenTimestamp: now.getTime(),
    ...nextResult
  }
}

const isS7Protocol = (): boolean => {
  return state.protocol.toLowerCase().includes('s7')
}

const getS7RemoteTsap = (): number => {
  return 0x0100 + DEFAULT_RACK * 0x20 + DEFAULT_SLOT
}

const buildCotpConnectRequest = (): Buffer => {
  const remoteTsap = getS7RemoteTsap()
  const sourceTsap = 0x0100

  return Buffer.from([
    0x03,
    0x00,
    0x00,
    0x16,
    0x11,
    0xe0,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0xc0,
    0x01,
    0x0a,
    0xc1,
    0x02,
    (sourceTsap >> 8) & 0xff,
    sourceTsap & 0xff,
    0xc2,
    0x02,
    (remoteTsap >> 8) & 0xff,
    remoteTsap & 0xff
  ])
}

const buildS7SetupRequest = (pduReference: number): Buffer => {
  return Buffer.from([
    0x03,
    0x00,
    0x00,
    0x19,
    0x02,
    0xf0,
    0x80,
    0x32,
    0x01,
    0x00,
    0x00,
    (pduReference >> 8) & 0xff,
    pduReference & 0xff,
    0x00,
    0x08,
    0x00,
    0x00,
    0xf0,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x03,
    0xc0
  ])
}

const getS7AreaCode = (point: PlcReadPoint): number => {
  const registerArea = point.registerArea.trim().toUpperCase()
  const areaCode = s7MemoryAreas.get(registerArea)

  if (!areaCode) {
    throw new Error(`${point.name} 的地址区 ${point.registerArea} 暂不支持 S7 原生读取。`)
  }

  return areaCode
}

const buildS7ReadRequest = (point: PlcReadPoint, pduReference: number): Buffer => {
  const byteLength = getDataTypeByteLength(point.dataType)
  const areaCode = getS7AreaCode(point)
  const dbBlock = areaCode === 0x84 ? point.dbBlock : 0
  const bitAddress = point.offsetAddress * 8
  const parameterLength = 14
  const packetLength = 4 + 3 + 10 + parameterLength
  const packet = Buffer.alloc(packetLength)

  packet.writeUInt8(0x03, 0)
  packet.writeUInt8(0x00, 1)
  packet.writeUInt16BE(packetLength, 2)
  packet.writeUInt8(0x02, 4)
  packet.writeUInt8(0xf0, 5)
  packet.writeUInt8(0x80, 6)
  packet.writeUInt8(0x32, 7)
  packet.writeUInt8(0x01, 8)
  packet.writeUInt16BE(0x0000, 9)
  packet.writeUInt16BE(pduReference, 11)
  packet.writeUInt16BE(parameterLength, 13)
  packet.writeUInt16BE(0, 15)
  packet.writeUInt8(0x04, 17)
  packet.writeUInt8(0x01, 18)
  packet.writeUInt8(0x12, 19)
  packet.writeUInt8(0x0a, 20)
  packet.writeUInt8(0x10, 21)
  packet.writeUInt8(0x02, 22)
  packet.writeUInt16BE(byteLength, 23)
  packet.writeUInt16BE(dbBlock, 25)
  packet.writeUInt8(areaCode, 27)
  packet.writeUInt8((bitAddress >> 16) & 0xff, 28)
  packet.writeUInt8((bitAddress >> 8) & 0xff, 29)
  packet.writeUInt8(bitAddress & 0xff, 30)

  return packet
}

const connectS7Socket = (config: PlcConnectionConfig): Promise<Socket> => {
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    let settled = false

    const finish = (error?: Error): void => {
      if (settled) {
        return
      }

      settled = true
      socket.removeAllListeners('connect')
      socket.removeAllListeners('timeout')
      socket.removeAllListeners('error')

      if (error) {
        socket.destroy()
        reject(error)
        return
      }

      socket.setTimeout(0)
      socket.setNoDelay(true)
      socket.on('error', () => undefined)
      resolve(socket)
    }

    socket.setTimeout(config.timeoutMs)
    socket.once('connect', () => finish())
    socket.once('timeout', () => finish(new Error('S7 TCP 连接超时。')))
    socket.once('error', (error) => finish(error))
    socket.connect(config.port, config.host)
  })
}

const closeS7Socket = async (socket: Socket | null): Promise<void> => {
  if (!socket) {
    return
  }

  await new Promise<void>((resolve) => {
    socket.once('close', () => resolve())
    socket.end()
    setTimeout(() => {
      if (!socket.destroyed) {
        socket.destroy()
      }
      resolve()
    }, 50)
  })
}

const sendS7Packet = (socket: Socket, packet: Buffer, timeoutMs: number): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let expectedLength = 0
    let settled = false

    const cleanup = (): void => {
      clearTimeout(timeout)
      socket.removeListener('data', handleData)
      socket.removeListener('error', handleError)
    }

    const finish = (error?: Error, response?: Buffer): void => {
      if (settled) {
        return
      }

      settled = true
      cleanup()

      if (error) {
        reject(error)
        return
      }

      resolve(response ?? Buffer.alloc(0))
    }

    const timeout = setTimeout(() => {
      finish(new Error('S7 请求超时。'))
    }, timeoutMs)

    const handleError = (error: Error): void => {
      finish(error)
    }

    const handleData = (chunk: Buffer): void => {
      chunks.push(chunk)
      const response = Buffer.concat(chunks)

      if (response.length >= 4 && expectedLength === 0) {
        expectedLength = response.readUInt16BE(2)
      }

      if (expectedLength > 0 && response.length >= expectedLength) {
        finish(undefined, response.subarray(0, expectedLength))
      }
    }

    socket.on('data', handleData)
    socket.once('error', handleError)
    socket.write(packet)
  })
}

const assertS7Response = (response: Buffer, label: string): void => {
  if (response.length < 7 || response[0] !== 0x03) {
    throw new Error(`${label} 返回报文无效。`)
  }
}

const getS7ProtocolErrorMessage = (errorClass: number, errorCode: number): string => {
  const baseMessage = `S7读取失败：错误类 ${errorClass}，错误码 ${errorCode}。`

  if (errorClass === 129 && errorCode === 4) {
    return `${baseMessage}PLC 拒绝当前 S7 外部读取请求，请检查 CPU 是否允许 PUT/GET 通信、保护等级是否允许外部访问，以及 TSAP/Rack/Slot 配置是否匹配。`
  }

  return baseMessage
}

const parseS7ReadResponse = (response: Buffer, point: PlcReadPoint): Buffer => {
  assertS7Response(response, point.name)

  const s7Start = 7

  if (response.length < s7Start + 12) {
    throw new Error(`${point.name} 返回报文过短。`)
  }

  const parameterLength = response.readUInt16BE(s7Start + 6)
  const errorClass = response[s7Start + 10]
  const errorCode = response[s7Start + 11]

  if (errorClass || errorCode) {
    throw new Error(getS7ProtocolErrorMessage(errorClass, errorCode))
  }

  const dataStart = s7Start + 12 + parameterLength

  if (response.length < dataStart + 4) {
    throw new Error(`${point.name} 未返回读取数据。`)
  }

  const returnCode = response[dataStart]
  const bitLength = response.readUInt16BE(dataStart + 2)

  if (returnCode !== 0xff) {
    throw new Error(`${point.name} S7读取失败：返回码 0x${returnCode.toString(16)}。`)
  }

  const byteLength = Math.ceil(bitLength / 8)
  const valueStart = dataStart + 4
  const valueEnd = valueStart + byteLength

  if (response.length < valueEnd) {
    throw new Error(`${point.name} 返回数据长度不足。`)
  }

  return response.subarray(valueStart, valueEnd)
}

const readS7Point = async (
  socket: Socket,
  point: PlcReadPoint,
  pduReference: number,
  timeoutMs: number
): Promise<PlcPointReading> => {
  if (!point.enabled) {
    return createPointReading(point, 'skipped', { error: '点位已停用。' })
  }

  try {
    const response = await sendS7Packet(socket, buildS7ReadRequest(point, pduReference), timeoutMs)
    const valueBuffer = parseS7ReadResponse(response, point)
    const expectedByteLength = getDataTypeByteLength(point.dataType)

    if (valueBuffer.length < expectedByteLength) {
      throw new Error(
        `${point.name} 返回数据长度不足：期望 ${expectedByteLength} 字节，实际 ${valueBuffer.length} 字节。`
      )
    }

    const rawValue = decodeBufferValue(valueBuffer.subarray(0, expectedByteLength), point.dataType)

    return createPointReading(point, 'success', {
      rawRegisters: bufferToRegisters(valueBuffer.subarray(0, expectedByteLength)),
      rawValue,
      value: applyScale(rawValue, point.scale)
    })
  } catch (error) {
    return createPointReading(point, 'error', {
      error: getRawErrorMessage(error)
    })
  }
}

const readS7PointList = async (
  config: PlcConnectionConfig,
  points: PlcReadPoint[]
): Promise<PlcPointReading[]> => {
  let socket: Socket | null = null
  const readStartedAt = Date.now()

  console.info(
    `[PLC] S7 读取开始：${getPlcConnectionText(config)}；点位=${points.length}；地址=${summarizePointAddresses(points)}`
  )

  try {
    socket = await connectS7Socket(config)
    const cotpResponse = await sendS7Packet(socket, buildCotpConnectRequest(), config.timeoutMs)
    assertS7Response(cotpResponse, 'S7连接')
    const setupResponse = await sendS7Packet(socket, buildS7SetupRequest(1), config.timeoutMs)
    assertS7Response(setupResponse, 'S7通信协商')

    const readings: PlcPointReading[] = []

    for (const [index, point] of points.entries()) {
      readings.push(await readS7Point(socket, point, index + 2, config.timeoutMs))
    }

    const successCount = readings.filter((reading) => reading.status === 'success').length
    const failureCount = readings.filter((reading) => reading.status === 'error').length
    const failedReadMessage = getFailedReadMessage(readings)

    console.info(
      `[PLC] S7 读取完成：${getPlcConnectionText(config)}；成功=${successCount}；失败=${failureCount}；耗时=${Date.now() - readStartedAt}ms${failedReadMessage ? `；错误=${failedReadMessage}` : ''}`
    )

    return readings
  } catch (error) {
    console.error(
      `[PLC] S7 读取异常：${getPlcConnectionText(config)}；耗时=${Date.now() - readStartedAt}ms；${getRawErrorMessage(error)}`
    )
    throw error
  } finally {
    await closeS7Socket(socket)
  }
}

const getModbusRegisterAddress = (point: PlcReadPoint): number => {
  const registerArea = point.registerArea.trim().toUpperCase()

  if (modbusByteAddressedAreas.has(registerArea)) {
    const relativeByteAddress = point.offsetAddress - DEFAULT_MODBUS_MEMORY_BASE_ADDRESS

    if (relativeByteAddress < 0) {
      throw new Error(
        `${getPointAddressText(point)} 低于 Modbus 映射起始地址 MW${DEFAULT_MODBUS_MEMORY_BASE_ADDRESS}。`
      )
    }

    if (relativeByteAddress % 2 !== 0) {
      throw new Error(`${getPointAddressText(point)} 不是偶数字地址，不能按 WORD 读取。`)
    }

    return relativeByteAddress / 2
  }

  return point.offsetAddress
}

const readModbusPoint = async (
  activeClient: ModbusRTU,
  point: PlcReadPoint
): Promise<PlcPointReading> => {
  if (!point.enabled) {
    return createPointReading(point, 'skipped', { error: '点位已停用。' })
  }

  try {
    const registerCount = getRegisterCount(point.dataType)
    const response = await activeClient.readHoldingRegisters(
      getModbusRegisterAddress(point),
      registerCount
    )
    const rawRegisters = response.data.map(normalizeRegisterWord)

    assertRegisterCount(rawRegisters, registerCount, point.name)

    const rawValue = decodeRegisterValue(rawRegisters, point.dataType)

    return createPointReading(point, 'success', {
      rawRegisters,
      rawValue,
      value: applyScale(rawValue, point.scale)
    })
  } catch (error) {
    return createPointReading(point, 'error', {
      error: getRawErrorMessage(error)
    })
  }
}

const readModbusPointList = async (
  activeClient: ModbusRTU,
  points: PlcReadPoint[]
): Promise<PlcPointReading[]> => {
  const readings: PlcPointReading[] = []

  for (const point of points) {
    readings.push(await readModbusPoint(activeClient, point))
  }

  return readings
}

const readModbusPointListWithConnection = async (
  config: PlcConnectionConfig,
  points: PlcReadPoint[]
): Promise<PlcPointReading[]> => {
  let activeClient: ModbusRTU | null = null
  const readStartedAt = Date.now()

  console.info(
    `[PLC] Modbus TCP 读取开始：${getPlcConnectionText(config)}；点位=${points.length}；地址=${summarizePointAddresses(points)}；请求寄存器=${summarizeModbusRegisterAddresses(points)}`
  )

  try {
    if (state.lastUpdatedTimestamp === 0 && state.status !== 'error') {
      updateState({
        status: 'connecting',
        statusText: 'PLC连接中',
        error: ''
      })
    }

    activeClient = await createConfiguredClient(config)
    const readings = await readModbusPointList(activeClient, points)
    const successCount = readings.filter((reading) => reading.status === 'success').length
    const failureCount = readings.filter((reading) => reading.status === 'error').length
    const failedReadMessage = getFailedReadMessage(readings)

    console.info(
      `[PLC] Modbus TCP 读取完成：${getPlcConnectionText(config)}；成功=${successCount}；失败=${failureCount}；耗时=${Date.now() - readStartedAt}ms${failedReadMessage ? `；错误=${failedReadMessage}` : ''}`
    )

    return readings
  } catch (error) {
    console.error(
      `[PLC] Modbus TCP 读取异常：${getPlcConnectionText(config)}；耗时=${Date.now() - readStartedAt}ms；${getRawErrorMessage(error)}`
    )
    throw error
  } finally {
    await closeModbusClient(activeClient)
  }
}

const writeModbusPoint = async (
  activeClient: ModbusRTU,
  point: PlcWritePoint
): Promise<PlcWritePointResult> => {
  let modbusRegisterAddress: number | null = null
  let rawRegisters: number[] = []
  let verifyRegisters: number[] = []

  try {
    modbusRegisterAddress = getModbusRegisterAddress(point)
    rawRegisters = encodeRegisterValue(point.rawValue, point.dataType, point.name)
    await activeClient.writeRegisters(modbusRegisterAddress, rawRegisters)

    const response = await activeClient.readHoldingRegisters(
      modbusRegisterAddress,
      rawRegisters.length
    )
    verifyRegisters = response.data.map(normalizeRegisterWord)
    assertRegisterCount(verifyRegisters, rawRegisters.length, `${point.name} 写入校验`)

    const verifyRawValue = decodeRegisterValue(verifyRegisters, point.dataType)
    const verified = areRegistersEqual(rawRegisters, verifyRegisters)
    const verifyValue = formatWritePointValue(point, verifyRawValue)

    if (!verified) {
      return createPointWriteResult(point, 'error', {
        modbusRegisterAddress,
        rawRegisters,
        verifyRegisters,
        verifyValue,
        error: `${point.name} 写入后回读不一致。`
      })
    }

    return createPointWriteResult(point, 'success', {
      modbusRegisterAddress,
      rawRegisters,
      verifyRegisters,
      verifyValue,
      verified: true
    })
  } catch (error) {
    return createPointWriteResult(point, 'error', {
      modbusRegisterAddress,
      rawRegisters,
      verifyRegisters,
      error: getRawErrorMessage(error)
    })
  }
}

const writeModbusPointList = async (
  activeClient: ModbusRTU,
  points: PlcWritePoint[]
): Promise<PlcWritePointResult[]> => {
  const writes: PlcWritePointResult[] = []

  for (const point of points) {
    writes.push(await writeModbusPoint(activeClient, point))
  }

  return writes
}

const writeModbusPointListWithConnection = async (
  config: PlcConnectionConfig,
  points: PlcWritePoint[]
): Promise<PlcWritePointResult[]> => {
  let activeClient: ModbusRTU | null = null
  const writeStartedAt = Date.now()

  console.info(
    `[PLC] Modbus TCP 写入开始：${getPlcConnectionText(config)}；点位=${points.length}；地址=${summarizePointAddresses(points)}；请求寄存器=${summarizeModbusRegisterAddresses(points)}`
  )

  try {
    activeClient = await createConfiguredClient(config)
    const writes = await writeModbusPointList(activeClient, points)
    const successCount = writes.filter((write) => write.status === 'success').length
    const failureCount = writes.filter((write) => write.status === 'error').length
    const failedWriteMessage = getFailedWriteMessage(writes)

    console.info(
      `[PLC] Modbus TCP 写入完成：${getPlcConnectionText(config)}；成功=${successCount}；失败=${failureCount}；耗时=${Date.now() - writeStartedAt}ms${failedWriteMessage ? `；错误=${failedWriteMessage}` : ''}`
    )

    return writes
  } catch (error) {
    console.error(
      `[PLC] Modbus TCP 写入异常：${getPlcConnectionText(config)}；耗时=${Date.now() - writeStartedAt}ms；${getRawErrorMessage(error)}`
    )
    throw error
  } finally {
    await closeModbusClient(activeClient)
  }
}

const parsePlcValues = (readings: PlcPointReading[]): PlcValues => {
  const values = emptyValues()

  for (const reading of readings) {
    if (reading.status === 'success' && reading.valueKey && typeof reading.value === 'number') {
      values[reading.valueKey] = reading.value
    }
  }

  return values
}

const logPlcError = (message: string, failureCount: number): void => {
  if (failureCount === 1 || failureCount % 10 === 0) {
    console.error(`[PLC] 读取失败（连续 ${failureCount} 次）：${message}`)
  }
}

const getFailedReadMessage = (readings: PlcPointReading[]): string => {
  const failedReadings = readings.filter((reading) => reading.status === 'error')
  const failuresByError = new Map<string, PlcPointReading[]>()

  for (const reading of failedReadings) {
    const error = reading.error || 'PLC 点位读取失败。'
    failuresByError.set(error, [...(failuresByError.get(error) ?? []), reading])
  }

  return [...failuresByError.entries()]
    .map(([error, sameErrorReadings]) => {
      if (sameErrorReadings.length === 1) {
        const reading = sameErrorReadings[0]
        return `${reading.name}(${getPointAddressText(reading)}): ${error}`
      }

      return `${sameErrorReadings.length} 个点位读取失败（${summarizePointAddresses(sameErrorReadings)}）：${error}`
    })
    .join('；')
}

const getFailedWriteMessage = (writes: PlcWritePointResult[]): string => {
  const failedWrites = writes.filter((write) => write.status === 'error')
  const failuresByError = new Map<string, PlcWritePointResult[]>()

  for (const write of failedWrites) {
    const error = write.error || 'PLC 点位写入失败。'
    failuresByError.set(error, [...(failuresByError.get(error) ?? []), write])
  }

  return [...failuresByError.entries()]
    .map(([error, sameErrorWrites]) => {
      if (sameErrorWrites.length === 1) {
        const write = sameErrorWrites[0]
        return `${write.name}(${getPointAddressText(write)}): ${error}`
      }

      return `${sameErrorWrites.length} 个点位写入失败（${summarizePointAddresses(sameErrorWrites)}）：${error}`
    })
    .join('；')
}

const readPlcOnce = async (): Promise<void> => {
  if (polling || testingConnection || activePlcWriteCount > 0) {
    return
  }

  polling = true
  const lastStableStatus = state.status

  try {
    const activePoints = sanitizeReadPoints(state.points).filter((point) => point.enabled)

    if (activePoints.length === 0) {
      throw new Error('PLC 点位为空，请至少配置一个读取点位。')
    }

    const readings = isS7Protocol()
      ? await readS7PointList(getCurrentConnectionConfig(), activePoints)
      : await readModbusPointListWithConnection(getCurrentConnectionConfig(), activePoints)
    const successCount = readings.filter((reading) => reading.status === 'success').length
    const failureCount = readings.filter((reading) => reading.status === 'error').length
    const failedReadMessage = getFailedReadMessage(readings)

    if (successCount === 0) {
      throw new Error(failedReadMessage || '所有 PLC 点位读取失败。')
    }

    const now = new Date()

    updateState({
      status: failureCount > 0 ? 'partial' : 'connected',
      statusText: failureCount > 0 ? 'PLC部分点位异常' : 'PLC连接正常',
      values: parsePlcValues(readings),
      readings,
      lastUpdatedAt: now.toISOString(),
      lastUpdatedTimestamp: now.getTime(),
      error: failedReadMessage,
      consecutiveFailures: 0
    })
  } catch (error) {
    const message = getErrorMessage(error)
    const consecutiveFailures = state.consecutiveFailures + 1
    const shouldKeepLastSuccessfulData =
      state.lastUpdatedTimestamp > 0 && consecutiveFailures < PLC_VISIBLE_ERROR_FAILURES

    logPlcError(message, consecutiveFailures)

    if (shouldKeepLastSuccessfulData) {
      updateState({
        status: lastStableStatus === 'partial' ? 'partial' : 'connected',
        statusText: 'PLC数据保持',
        error: message,
        consecutiveFailures
      })
      return
    }

    updateState({
      status: 'error',
      statusText: 'PLC连接异常',
      values: emptyValues(),
      readings: [],
      error: message,
      consecutiveFailures
    })
  } finally {
    polling = false
  }
}

const applyPlcConfiguration = (
  config: PlcConnectionConfig,
  nextPoints: PlcReadPoint[]
): PlcState => {
  updateState({
    ...config,
    points: nextPoints,
    status: 'idle',
    statusText: '等待连接',
    readings: [],
    values: emptyValues(),
    lastUpdatedAt: '',
    lastUpdatedTimestamp: 0,
    error: '',
    consecutiveFailures: 0,
    ...deriveLegacyAddressState(nextPoints)
  })

  if (pollTimer) {
    void readPlcOnce()
  }

  return getPlcState()
}

const savePlcConfiguration = (input: PlcConfigurationInput): PlcState => {
  const { config, points } = validateConfigurationInput(input)
  const persistedConfiguration: PersistedPlcConfiguration = {
    version: PLC_CONFIGURATION_VERSION,
    ...config,
    points: points.map(clonePoint),
    updatedAt: new Date().toISOString()
  }

  setAppMetadataValue(PLC_CONFIGURATION_KEY, JSON.stringify(persistedConfiguration))
  return applyPlcConfiguration(config, points)
}

const updatePlcPoints = (points: unknown): PlcState => {
  return savePlcConfiguration({ ...getCurrentConnectionConfig(), points })
}

const loadPersistedPlcConfiguration = (): void => {
  try {
    const storedValue = getAppMetadataValue(PLC_CONFIGURATION_KEY)

    if (!storedValue) {
      return
    }

    const parsed = JSON.parse(storedValue) as Partial<PersistedPlcConfiguration>

    if (parsed.version !== PLC_CONFIGURATION_VERSION) {
      throw new Error(`不支持的配置版本：${String(parsed.version ?? '')}`)
    }

    const { config, points } = validateConfigurationInput(parsed)
    applyPlcConfiguration(config, points)
  } catch (error) {
    console.error(`[PLC] 持久化配置加载失败：${getRawErrorMessage(error)}`)
  }
}

const resetPlcConfiguration = (): PlcState => {
  const defaults: PlcConfigurationInput = {
    host: toText(PLC_HOST, '192.168.0.1'),
    port: DEFAULT_PORT,
    unitId: DEFAULT_UNIT_ID,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    points: createDefaultReadPoints()
  }
  const { config, points } = validateConfigurationInput(defaults)

  removeAppMetadataValue(PLC_CONFIGURATION_KEY)
  return applyPlcConfiguration(config, points)
}

const workOrderStatuses = new Set<PlcWorkOrderStatus>([
  'idle',
  'monitoring',
  'completion-email-pending',
  'completed'
])

const getOptionalText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const normalizeWorkOrderState = (value: unknown): PlcWorkOrderState => {
  if (!value || typeof value !== 'object') {
    return createIdleWorkOrderState()
  }

  const candidate = value as Partial<PlcWorkOrderState>
  const status = workOrderStatuses.has(candidate.status as PlcWorkOrderStatus)
    ? (candidate.status as PlcWorkOrderStatus)
    : 'idle'
  const lastValue =
    candidate.lastValue === null || candidate.lastValue === undefined
      ? Number.NaN
      : Number(candidate.lastValue)

  return {
    status,
    statusText: getOptionalText(candidate.statusText) || createIdleWorkOrderState().statusText,
    workOrderNumber: getOptionalText(candidate.workOrderNumber) || WORK_ORDER_NUMBER,
    startedAt: getOptionalText(candidate.startedAt),
    notificationEmailSentAt: getOptionalText(candidate.notificationEmailSentAt),
    notificationEmailMessageId: getOptionalText(candidate.notificationEmailMessageId),
    completedAt: getOptionalText(candidate.completedAt),
    completionEmailSentAt: getOptionalText(candidate.completionEmailSentAt),
    completionEmailMessageId: getOptionalText(candidate.completionEmailMessageId),
    completionEmailAttemptCount: toNonNegativeInteger(candidate.completionEmailAttemptCount, 0),
    lastCompletionEmailAttemptAt: getOptionalText(candidate.lastCompletionEmailAttemptAt),
    lastCheckedAt: getOptionalText(candidate.lastCheckedAt),
    lastValue: Number.isFinite(lastValue) ? lastValue : null,
    lastError: getOptionalText(candidate.lastError)
  }
}

const persistWorkOrderState = (workOrder: PlcWorkOrderState): void => {
  const persistedState: PersistedWorkOrderState = {
    version: WORK_ORDER_STATE_VERSION,
    ...workOrder
  }

  setAppMetadataValue(WORK_ORDER_STATE_KEY, JSON.stringify(persistedState))
}

const updateWorkOrderState = (nextState: Partial<PlcWorkOrderState>): PlcWorkOrderState => {
  const workOrder = normalizeWorkOrderState({ ...state.workOrder, ...nextState })
  persistWorkOrderState(workOrder)
  updateState({ workOrder })
  return { ...workOrder }
}

const isWorkOrderActive = (workOrder: PlcWorkOrderState = state.workOrder): boolean =>
  workOrder.status === 'monitoring' || workOrder.status === 'completion-email-pending'

const getWorkOrderState = (): PlcWorkOrderState => ({ ...state.workOrder })

export const stopWorkOrderMonitoring = (): void => {
  if (workOrderMonitorTimer) {
    clearTimeout(workOrderMonitorTimer)
    workOrderMonitorTimer = null
  }
}

const scheduleWorkOrderMonitoring = (delayMs = state.pollIntervalMs): void => {
  if (!isWorkOrderActive() || workOrderMonitorTimer) {
    return
  }

  workOrderMonitorTimer = setTimeout(
    () => {
      workOrderMonitorTimer = null
      void monitorWorkOrderOnce()
    },
    Math.max(250, delayMs)
  )
}

const startWorkOrderMonitoring = (): void => {
  if (!isWorkOrderActive()) {
    return
  }

  scheduleWorkOrderMonitoring(0)
}

const sendPendingWorkOrderCompletionEmail = async (force = false): Promise<void> => {
  const workOrder = getWorkOrderState()

  if (workOrder.status !== 'completion-email-pending' || !workOrder.completedAt) {
    return
  }

  const previousAttemptTimestamp = Date.parse(workOrder.lastCompletionEmailAttemptAt)
  const elapsedSincePreviousAttempt = Date.now() - previousAttemptTimestamp

  if (
    !force &&
    Number.isFinite(previousAttemptTimestamp) &&
    elapsedSincePreviousAttempt < WORK_ORDER_COMPLETION_EMAIL_RETRY_MS
  ) {
    return
  }

  const attemptStartedAt = new Date().toISOString()
  updateWorkOrderState({
    statusText: '已检测到 MW680=0，正在发送工单完成邮件',
    completionEmailAttemptCount: workOrder.completionEmailAttemptCount + 1,
    lastCompletionEmailAttemptAt: attemptStartedAt,
    lastError: ''
  })

  const email = await sendWorkOrderCompletionNotification(workOrder.completedAt)

  if (email.ok) {
    updateWorkOrderState({
      status: 'completed',
      statusText: '工单已完成，完成邮件已发送',
      completionEmailSentAt: email.sentAt,
      completionEmailMessageId: email.messageId,
      lastError: ''
    })
    stopWorkOrderMonitoring()
    return
  }

  updateWorkOrderState({
    status: 'completion-email-pending',
    statusText: '工单已完成，完成邮件发送失败，后台将自动重试',
    lastError: email.error || '工单完成邮件发送失败。'
  })
}

const monitorWorkOrderOnce = async (): Promise<void> => {
  if (workOrderCheckInProgress || !isWorkOrderActive()) {
    return
  }

  workOrderCheckInProgress = true

  try {
    if (state.workOrder.status === 'completion-email-pending') {
      await sendPendingWorkOrderCompletionEmail()
      return
    }

    if (isS7Protocol()) {
      throw new Error('当前 S7 原生协议暂不支持 MW680 工单状态监测。')
    }

    const point = createWorkOrderMonitorReadPoint()
    const readings = await readModbusPointListWithConnection(getCurrentConnectionConfig(), [point])
    const reading = readings[0]

    if (!reading || reading.status !== 'success' || reading.rawValue === null) {
      throw new Error(reading?.error || 'MW680 点位读取失败。')
    }

    const checkedAt = new Date().toISOString()

    if (reading.rawValue === 0) {
      updateWorkOrderState({
        status: 'completion-email-pending',
        statusText: '已检测到 MW680=0，等待发送工单完成邮件',
        completedAt: checkedAt,
        lastCheckedAt: checkedAt,
        lastValue: 0,
        lastError: ''
      })
      await sendPendingWorkOrderCompletionEmail(true)
      return
    }

    updateWorkOrderState({
      status: 'monitoring',
      statusText: `工单处理中，正在监测 MW680（当前值：${reading.rawValue}）`,
      lastCheckedAt: checkedAt,
      lastValue: reading.rawValue,
      lastError: ''
    })
  } catch (error) {
    const message = getErrorMessage(error)
    console.error(`[PLC] 工单状态监测失败：${message}`)
    updateWorkOrderState({
      statusText: '工单处理中，MW680 状态读取失败，后台将继续监测',
      lastCheckedAt: new Date().toISOString(),
      lastError: message
    })
  } finally {
    workOrderCheckInProgress = false
    scheduleWorkOrderMonitoring()
  }
}

const activateWorkOrderMonitoring = (email: EmailSendResult): PlcWorkOrderState => {
  const startedAt = new Date().toISOString()
  const workOrder = updateWorkOrderState({
    status: 'monitoring',
    statusText: '提醒邮件已发送，正在监测 MW680',
    workOrderNumber: WORK_ORDER_NUMBER,
    startedAt,
    notificationEmailSentAt: email.sentAt || startedAt,
    notificationEmailMessageId: email.messageId,
    completedAt: '',
    completionEmailSentAt: '',
    completionEmailMessageId: '',
    completionEmailAttemptCount: 0,
    lastCompletionEmailAttemptAt: '',
    lastCheckedAt: startedAt,
    lastValue: 1,
    lastError: ''
  })

  startWorkOrderMonitoring()
  return workOrder
}

const loadPersistedWorkOrderState = (): void => {
  try {
    const storedValue = getAppMetadataValue(WORK_ORDER_STATE_KEY)

    if (!storedValue) {
      return
    }

    const parsed = JSON.parse(storedValue) as Partial<PersistedWorkOrderState>

    if (parsed.version !== WORK_ORDER_STATE_VERSION) {
      throw new Error(`不支持的工单状态版本：${String(parsed.version ?? '')}`)
    }

    updateState({ workOrder: normalizeWorkOrderState(parsed) })
    startWorkOrderMonitoring()
  } catch (error) {
    console.error(`[PLC] 持久化工单状态加载失败：${getRawErrorMessage(error)}`)
  }
}

const testPlcConnection = async (input: PlcTestInput = {}): Promise<PlcTestResult> => {
  const startedAt = new Date()
  const config = normalizeConnectionConfig(input)
  const points = sanitizeReadPoints(input.points ?? state.points).filter((point) => point.enabled)
  let readings: PlcPointReading[] = []
  let ok = false
  let statusText = 'PLC连接异常'
  let error = ''
  testingConnection = true

  try {
    if (points.length === 0) {
      throw new Error('请至少配置一个启用的 PLC 点位。')
    }

    if (state.protocol.toLowerCase().includes('s7')) {
      readings = await readS7PointList(config, points)
    } else {
      await waitForPollingIdle(config.timeoutMs + 500)
      readings = await readModbusPointListWithConnection(config, points)
    }

    const successCount = readings.filter((reading) => reading.status === 'success').length
    const failureCount = readings.filter((reading) => reading.status === 'error').length
    error = getFailedReadMessage(readings)
    ok = successCount > 0 && failureCount === 0
    statusText = ok ? 'PLC读取正常' : successCount > 0 ? 'PLC部分点位异常' : 'PLC读取失败'
  } catch (readError) {
    error = getErrorMessage(readError, config, points)
  } finally {
    testingConnection = false
  }

  const completedAt = new Date()

  return {
    ok,
    protocol: PLC_PROTOCOL,
    ...config,
    statusText,
    readings,
    error,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime()
  }
}

const writeWeatherToPlc = async (input: PlcWeatherWriteInput): Promise<PlcWeatherWriteResult> => {
  const startedAt = new Date()
  const config = getCurrentConnectionConfig()
  let points: PlcWritePoint[] = []
  let writes: PlcWritePointResult[] = []
  let ok = false
  let statusText = 'PLC写入失败'
  let error = ''

  activePlcWriteCount += 1

  try {
    if (!input || typeof input !== 'object') {
      throw new Error('天气 PLC 写入数据为空。')
    }

    points = createWeatherWritePoints(input)

    if (isS7Protocol()) {
      throw new Error('当前 S7 原生协议暂不支持天气数据写入，请切换到 Modbus TCP 写入。')
    }

    await waitForPollingIdle(config.timeoutMs + 500)
    writes = await writeModbusPointListWithConnection(config, points)

    const successCount = writes.filter((write) => write.status === 'success').length
    const failureCount = writes.filter((write) => write.status === 'error').length
    error = getFailedWriteMessage(writes)
    ok = successCount === points.length && failureCount === 0
    statusText = ok ? 'PLC写入校验成功' : successCount > 0 ? 'PLC部分点位写入失败' : 'PLC写入失败'

    updateState({
      status: ok ? 'connected' : successCount > 0 ? 'partial' : 'error',
      statusText: ok ? 'PLC写入成功' : statusText,
      error,
      consecutiveFailures: ok ? 0 : state.consecutiveFailures + 1
    })
  } catch (writeError) {
    error = getErrorMessage(writeError, config, points.length > 0 ? points : state.points)
    console.error(`[PLC] 天气数据写入失败：${error}`)
    updateState({
      status: 'error',
      statusText,
      error,
      consecutiveFailures: state.consecutiveFailures + 1
    })
  } finally {
    activePlcWriteCount = Math.max(0, activePlcWriteCount - 1)
  }

  const completedAt = new Date()

  return {
    ok,
    protocol: PLC_PROTOCOL,
    ...config,
    statusText,
    writes,
    error,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime()
  }
}

const writeTrafficToPlc = async (input: unknown): Promise<PlcTrafficWriteResult> => {
  const startedAt = new Date()
  const config = getCurrentConnectionConfig()
  let points: PlcWritePoint[] = []
  let writes: PlcWritePointResult[] = []
  let ok = false
  let statusText = 'PLC写入失败'
  let error = ''

  activePlcWriteCount += 1

  try {
    points = [createTrafficWritePoint(input)]

    if (isS7Protocol()) {
      throw new Error('当前 S7 原生协议暂不支持车流量写入，请切换到 Modbus TCP 写入。')
    }

    await waitForPollingIdle(config.timeoutMs + 500)
    writes = await writeModbusPointListWithConnection(config, points)

    const successCount = writes.filter((write) => write.status === 'success').length
    const failureCount = writes.filter((write) => write.status === 'error').length
    error = getFailedWriteMessage(writes)
    ok = successCount === points.length && failureCount === 0
    statusText = ok ? 'PLC写入校验成功' : 'PLC写入失败'

    updateState({
      status: ok ? 'connected' : 'error',
      statusText: ok ? '车流量写入成功' : statusText,
      error,
      consecutiveFailures: ok ? 0 : state.consecutiveFailures + 1
    })
  } catch (writeError) {
    error = getErrorMessage(writeError, config, points.length > 0 ? points : state.points)
    console.error(`[PLC] 车流量写入失败：${error}`)
    updateState({
      status: 'error',
      statusText,
      error,
      consecutiveFailures: state.consecutiveFailures + 1
    })
  } finally {
    activePlcWriteCount = Math.max(0, activePlcWriteCount - 1)
  }

  if (ok) {
    void readPlcOnce()
  }

  const completedAt = new Date()

  return {
    ok,
    protocol: PLC_PROTOCOL,
    ...config,
    statusText,
    writes,
    error,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime()
  }
}

const writeDashboardDateToPlc = async (input: unknown): Promise<PlcDashboardDateWriteResult> => {
  const startedAt = new Date()
  const config = getCurrentConnectionConfig()
  let points: PlcWritePoint[] = []
  let writes: PlcWritePointResult[] = []
  let ok = false
  let statusText = 'PLC写入失败'
  let error = ''

  activePlcWriteCount += 1

  try {
    points = [createDashboardDateWritePoint(input)]

    if (isS7Protocol()) {
      throw new Error('当前 S7 原生协议暂不支持仪表盘日期写入，请切换到 Modbus TCP 写入。')
    }

    await waitForPollingIdle(config.timeoutMs + 500)
    writes = await writeModbusPointListWithConnection(config, points)

    const successCount = writes.filter((write) => write.status === 'success').length
    const failureCount = writes.filter((write) => write.status === 'error').length
    error = getFailedWriteMessage(writes)
    ok = successCount === points.length && failureCount === 0
    statusText = ok ? 'PLC写入校验成功' : 'PLC写入失败'

    updateState({
      status: ok ? 'connected' : 'error',
      statusText: ok ? '仪表盘日期写入成功' : statusText,
      error,
      consecutiveFailures: ok ? 0 : state.consecutiveFailures + 1
    })
  } catch (writeError) {
    error = getErrorMessage(writeError, config, points.length > 0 ? points : state.points)
    console.error(`[PLC] 仪表盘日期写入失败：${error}`)
    updateState({
      status: 'error',
      statusText,
      error,
      consecutiveFailures: state.consecutiveFailures + 1
    })
  } finally {
    activePlcWriteCount = Math.max(0, activePlcWriteCount - 1)
  }

  const completedAt = new Date()

  return {
    ok,
    protocol: PLC_PROTOCOL,
    ...config,
    statusText,
    writes,
    error,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime()
  }
}

const writeWorkOrderTriggerToPlc = async (): Promise<PlcWorkOrderTriggerWriteResult> => {
  const startedAt = new Date()
  const config = getCurrentConnectionConfig()
  let points: PlcWritePoint[] = []
  let writes: PlcWritePointResult[] = []
  let ok = false
  let statusText = 'PLC写入失败'
  let error = ''
  let email = createSkippedEmailResult('MW680 尚未写入成功。')

  if (isWorkOrderActive()) {
    const blockedAt = new Date()
    const activeWorkOrder = getWorkOrderState()

    return {
      ok: false,
      protocol: PLC_PROTOCOL,
      ...config,
      statusText: '已有工单正在处理中',
      writes: [],
      error: '请等待当前工单完成后再发送新的工单提示。',
      email: createSkippedEmailResult('已有工单正在处理中。'),
      workOrder: activeWorkOrder,
      startedAt: startedAt.toISOString(),
      completedAt: blockedAt.toISOString(),
      durationMs: blockedAt.getTime() - startedAt.getTime()
    }
  }

  activePlcWriteCount += 1

  try {
    points = [createWorkOrderTriggerWritePoint()]

    if (isS7Protocol()) {
      throw new Error('当前 S7 原生协议暂不支持工单提示写入，请切换到 Modbus TCP 写入。')
    }

    await waitForPollingIdle(config.timeoutMs + 500)
    writes = await writeModbusPointListWithConnection(config, points)

    const successCount = writes.filter((write) => write.status === 'success').length
    const failureCount = writes.filter((write) => write.status === 'error').length
    error = getFailedWriteMessage(writes)
    ok = successCount === points.length && failureCount === 0
    statusText = ok ? 'PLC写入校验成功' : 'PLC写入失败'

    updateState({
      status: ok ? 'connected' : 'error',
      statusText: ok ? '工单提示写入成功' : statusText,
      error,
      consecutiveFailures: ok ? 0 : state.consecutiveFailures + 1
    })
  } catch (writeError) {
    error = getErrorMessage(writeError, config, points.length > 0 ? points : state.points)
    console.error(`[PLC] 工单提示写入失败：${error}`)
    updateState({
      status: 'error',
      statusText,
      error,
      consecutiveFailures: state.consecutiveFailures + 1
    })
  } finally {
    activePlcWriteCount = Math.max(0, activePlcWriteCount - 1)
  }

  if (ok) {
    email = await sendWorkOrderNotification()

    if (email.ok) {
      activateWorkOrderMonitoring(email)
    }
  }

  const completedAt = new Date()

  return {
    ok,
    protocol: PLC_PROTOCOL,
    ...config,
    statusText,
    writes,
    error,
    email,
    workOrder: getWorkOrderState(),
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime()
  }
}

export const startPlcPolling = (): void => {
  if (pollTimer) {
    return
  }

  void readPlcOnce()
  pollTimer = setInterval(() => {
    void readPlcOnce()
  }, state.pollIntervalMs)
}

export const stopPlcPolling = (): void => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

export const registerPlcIpc = (): void => {
  loadPersistedPlcConfiguration()
  loadPersistedWorkOrderState()
  ipcMain.handle('plc:get-state', () => getPlcState())
  ipcMain.handle('plc:start-polling', () => {
    startPlcPolling()
    return getPlcState()
  })
  ipcMain.handle('plc:stop-polling', () => {
    stopPlcPolling()
    return getPlcState()
  })
  ipcMain.handle('plc:update-points', (_event, points: unknown) => updatePlcPoints(points))
  ipcMain.handle('plc:save-config', (_event, input: PlcConfigurationInput) =>
    savePlcConfiguration(input)
  )
  ipcMain.handle('plc:reset-config', () => resetPlcConfiguration())
  ipcMain.handle('plc:test-connection', (_event, input?: PlcTestInput) => testPlcConnection(input))
  ipcMain.handle('plc:write-weather', (_event, input: PlcWeatherWriteInput) =>
    writeWeatherToPlc(input)
  )
  ipcMain.handle('plc:write-traffic', (_event, input: unknown) => writeTrafficToPlc(input))
  ipcMain.handle('plc:write-dashboard-date', (_event, input: unknown) =>
    writeDashboardDateToPlc(input)
  )
  ipcMain.handle('plc:write-work-order-trigger', () => writeWorkOrderTriggerToPlc())
}
