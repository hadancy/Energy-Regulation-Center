import { BrowserWindow, ipcMain } from 'electron'
import ModbusRTU from 'modbus-serial'

const PLC_BRAND = '三菱'
const PLC_SERIES = 'FX5S'
const PLC_HOST = process.env['PLC_HOST'] ?? '192.168.0.1'
const PLC_PORT = Number.parseInt(process.env['PLC_PORT'] ?? '502', 10)
const PLC_UNIT_ID = Number.parseInt(process.env['PLC_UNIT_ID'] ?? '1', 10)
const PLC_START_ADDRESS = Number.parseInt(process.env['PLC_START_ADDRESS'] ?? '200', 10)
const PLC_REGISTER_COUNT = 4
const PLC_POLL_INTERVAL_MS = Number.parseInt(process.env['PLC_POLL_INTERVAL_MS'] ?? '1000', 10)
const PLC_TIMEOUT_MS = Number.parseInt(process.env['PLC_TIMEOUT_MS'] ?? '3000', 10)

type PlcConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

interface PlcValues {
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
  status: PlcConnectionStatus
  statusText: string
  values: PlcValues
  lastUpdatedAt: string
  lastUpdatedTimestamp: number
  error: string
  consecutiveFailures: number
}

const emptyValues = (): PlcValues => ({
  windSpeed: null,
  temperature: null,
  humidity: null,
  illuminance: null
})

let client: ModbusRTU | null = null
let pollTimer: NodeJS.Timeout | null = null
let polling = false
let stopping = false
let state: PlcState = {
  brand: PLC_BRAND,
  series: PLC_SERIES,
  host: PLC_HOST,
  port: Number.isFinite(PLC_PORT) ? PLC_PORT : 502,
  unitId: Number.isFinite(PLC_UNIT_ID) ? PLC_UNIT_ID : 1,
  startAddress: Number.isFinite(PLC_START_ADDRESS) ? PLC_START_ADDRESS : 200,
  registerCount: PLC_REGISTER_COUNT,
  pollIntervalMs: Number.isFinite(PLC_POLL_INTERVAL_MS) ? PLC_POLL_INTERVAL_MS : 1000,
  timeoutMs: Number.isFinite(PLC_TIMEOUT_MS) ? PLC_TIMEOUT_MS : 3000,
  status: 'idle',
  statusText: '等待连接',
  values: emptyValues(),
  lastUpdatedAt: '',
  lastUpdatedTimestamp: 0,
  error: '',
  consecutiveFailures: 0
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'PLC 数据读取失败。'
}

const getPlcState = (): PlcState => ({
  ...state,
  values: { ...state.values }
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
    values: nextState.values ? { ...nextState.values } : state.values
  }
  broadcastPlcState()
}

const closeClient = async (): Promise<void> => {
  const activeClient = client
  client = null

  await closeModbusClient(activeClient)
}

const closeModbusClient = async (activeClient: ModbusRTU | null): Promise<void> => {
  if (!activeClient) {
    return
  }

  await new Promise<void>((resolve) => {
    try {
      activeClient.close(() => resolve())
    } catch {
      resolve()
    }
  })
}

const createClient = async (): Promise<ModbusRTU> => {
  const nextClient = new ModbusRTU()
  const port = Number.isFinite(state.port) ? state.port : 502
  const timeout = Number.isFinite(state.timeoutMs) ? state.timeoutMs : 3000

  nextClient.setTimeout(timeout)

  try {
    await nextClient.connectTCP(state.host, { port, timeout })
  } catch (error) {
    await closeModbusClient(nextClient)
    throw error
  }

  nextClient.setID(Number.isFinite(state.unitId) ? state.unitId : 1)

  nextClient.on('close', () => {
    if (!stopping && state.status === 'connected') {
      updateState({
        status: 'error',
        statusText: 'PLC连接异常',
        error: 'PLC Modbus TCP 连接已断开。'
      })
    }
  })

  return nextClient
}

const ensureClient = async (): Promise<ModbusRTU> => {
  if (client?.isOpen) {
    return client
  }

  await closeClient()
  updateState({
    status: 'connecting',
    statusText: 'PLC连接中',
    error: ''
  })

  client = await createClient()
  return client
}

const normalizeRegisterValue = (value: number | undefined): number => {
  return Number.isFinite(value) ? Number(value) : 0
}

const parsePlcValues = (registers: number[]): PlcValues => {
  if (registers.length < PLC_REGISTER_COUNT) {
    throw new Error(
      `PLC 返回寄存器数量不足：期望 ${PLC_REGISTER_COUNT} 个，实际 ${registers.length} 个。`
    )
  }

  const windSpeedRaw = normalizeRegisterValue(registers[0])
  const temperatureRaw = normalizeRegisterValue(registers[1])
  const humidityRaw = normalizeRegisterValue(registers[2])
  const illuminanceRaw = normalizeRegisterValue(registers[3])

  return {
    windSpeed: windSpeedRaw / 10,
    temperature: temperatureRaw / 10,
    humidity: humidityRaw / 10,
    illuminance: illuminanceRaw
  }
}

const logPlcError = (message: string, failureCount: number): void => {
  if (failureCount === 1 || failureCount % 10 === 0) {
    console.error(`[PLC] 读取失败（连续 ${failureCount} 次）：${message}`)
  }
}

const readPlcOnce = async (): Promise<void> => {
  if (polling) {
    return
  }

  polling = true

  try {
    const activeClient = await ensureClient()
    const response = await activeClient.readHoldingRegisters(
      state.startAddress,
      state.registerCount
    )
    const values = parsePlcValues(response.data)
    const now = new Date()

    updateState({
      status: 'connected',
      statusText: 'PLC连接正常',
      values,
      lastUpdatedAt: now.toISOString(),
      lastUpdatedTimestamp: now.getTime(),
      error: '',
      consecutiveFailures: 0
    })
  } catch (error) {
    const message = getErrorMessage(error)
    const consecutiveFailures = state.consecutiveFailures + 1

    logPlcError(message, consecutiveFailures)
    await closeClient()
    updateState({
      status: 'error',
      statusText: 'PLC连接异常',
      error: message,
      consecutiveFailures
    })
  } finally {
    polling = false
  }
}

export const startPlcPolling = (): void => {
  if (pollTimer) {
    return
  }

  stopping = false
  void readPlcOnce()
  pollTimer = setInterval(() => {
    void readPlcOnce()
  }, state.pollIntervalMs)
}

export const stopPlcPolling = (): void => {
  stopping = true

  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }

  void closeClient()
}

export const registerPlcIpc = (): void => {
  ipcMain.handle('plc:get-state', () => getPlcState())
}
