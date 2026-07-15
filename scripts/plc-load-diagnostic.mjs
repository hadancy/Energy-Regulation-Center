#!/usr/bin/env node
import ModbusRTU from 'modbus-serial'
import process from 'node:process'

const host = process.env.PLC_HOST || '192.168.0.1'
const port = Number.parseInt(process.env.PLC_PORT || '503', 10)
const unitId = Number.parseInt(process.env.PLC_UNIT_ID || '1', 10)
const timeoutMs = Number.parseInt(process.env.PLC_TIMEOUT_MS || '3000', 10)
const cycles = Number.parseInt(process.env.PLC_DIAGNOSTIC_CYCLES || '6', 10)
const dateRegister = 60
const pollRegisters = [0, 1, 2, 3, 4, 5, 6, 59, ...Array.from({ length: 19 }, (_, index) => index + 8)]

const stages = []

console.log('PLC load/scheduling diagnostic')
console.log(`Target: ${host}:${port}, unit=${unitId}, timeout=${timeoutMs}ms`)
console.log(`Cycles: ${cycles}, date register=60 (MW620), poll requests=${pollRegisters.length}`)
console.log('All write tests write the value read immediately beforehand.')

await runStage('baseline: fresh connection + FC03 MW620', cycles, readDateWithFreshConnection)
await runStage('FC16: fresh connection + read/write-same/read', cycles, () =>
  writeSameValueWithFreshConnection('fc16')
)
await runStage('FC06: fresh connection + read/write-same/read', cycles, () =>
  writeSameValueWithFreshConnection('fc06')
)
await runStage('single connection: 27-point poll then FC16 date operation', cycles, () =>
  withClient(async (client, connectedAt) => {
    const pollStartedAt = Date.now()
    await pollOnClient(client, pollStartedAt)
    const pollElapsedMs = Date.now() - pollStartedAt
    const dateWrite = await writeSameValue(client, 'fc16', connectedAt)
    return {
      elapsedMs: Date.now() - connectedAt,
      detail: `poll=${pollElapsedMs}ms, value=${dateWrite.value}`
    }
  })
)
await runStage('serialized: 27-point poll then FC16 date operation', cycles, async () => {
  const poll = await runPhase('poll', pollOnce)
  const dateWrite = await runPhase('date', () => writeSameValueWithFreshConnection('fc16'))
  return {
    elapsedMs: poll.elapsedMs + dateWrite.elapsedMs,
    detail: `poll=${poll.elapsedMs}ms, date=${dateWrite.elapsedMs}ms, value=${dateWrite.value}`
  }
})
await runStage('serialized + 500ms reconnect gap', cycles, async () => {
  const poll = await runPhase('poll', pollOnce)
  await delay(500)
  const dateWrite = await runPhase('date', () => writeSameValueWithFreshConnection('fc16'))
  return {
    elapsedMs: poll.elapsedMs + 500 + dateWrite.elapsedMs,
    detail: `poll=${poll.elapsedMs}ms, gap=500ms, date=${dateWrite.elapsedMs}ms`
  }
})
await runStage('concurrent: 27-point poll alongside FC16 date operation', cycles, async () => {
  const startedAt = Date.now()
  const [poll, dateWrite] = await Promise.all([
    runPhase('poll', pollOnce),
    runPhase('date', () => writeSameValueWithFreshConnection('fc16'))
  ])
  return {
    elapsedMs: Date.now() - startedAt,
    detail: `poll=${poll.elapsedMs}ms, date=${dateWrite.elapsedMs}ms, value=${dateWrite.value}`
  }
})

console.log('\nSummary')
for (const stage of stages) {
  console.log(
    `${stage.name}: pass=${stage.pass}/${stage.total}, fail=${stage.fail}/${stage.total}, ` +
      `p50=${stage.p50Ms ?? '-'}ms, p95=${stage.p95Ms ?? '-'}ms, max=${stage.maxMs ?? '-'}ms`
  )
}

if (stages.every((stage) => stage.fail === 0)) {
  console.log('\nRESULT: No PLC load or connection-scheduling failure reproduced.')
} else {
  console.log('\nRESULT: At least one load/scheduling mode reproduced a failure.')
  process.exitCode = 2
}

async function runStage(name, count, operation) {
  const samples = []
  let failures = 0

  console.log(`\n${name}`)
  for (let index = 1; index <= count; index += 1) {
    try {
      const result = await operation()
      samples.push(result.elapsedMs)
      console.log(`  [PASS ${index}/${count}] ${result.elapsedMs}ms${result.detail ? `; ${result.detail}` : ''}`)
    } catch (error) {
      failures += 1
      console.log(`  [FAIL ${index}/${count}] ${formatError(error)}`)
    }
    await delay(50)
  }

  const sorted = [...samples].sort((left, right) => left - right)
  stages.push({
    name,
    total: count,
    pass: samples.length,
    fail: failures,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1)
  })
}

async function readDateWithFreshConnection() {
  return withClient(async (client, connectedAt) => {
    const response = await client.readHoldingRegisters(dateRegister, 1)
    return {
      elapsedMs: Date.now() - connectedAt,
      detail: `value=${response.data[0]}`
    }
  })
}

async function writeSameValueWithFreshConnection(functionCode) {
  return withClient((client, connectedAt) => writeSameValue(client, functionCode, connectedAt))
}

async function writeSameValue(client, functionCode, startedAt = Date.now()) {
  const before = await client.readHoldingRegisters(dateRegister, 1)
  const value = before.data[0]

  if (functionCode === 'fc06') {
    await client.writeRegister(dateRegister, value)
  } else {
    await client.writeRegisters(dateRegister, [value])
  }

  const after = await client.readHoldingRegisters(dateRegister, 1)
  if (after.data[0] !== value) {
    throw new Error(`verification mismatch: expected=${value}, actual=${after.data[0]}`)
  }

  return {
    elapsedMs: Date.now() - startedAt,
    value,
    detail: `value=${value}`
  }
}

async function pollOnce() {
  return withClient(async (client, connectedAt) => {
    await pollOnClient(client, connectedAt)
    return { elapsedMs: Date.now() - connectedAt }
  })
}

async function pollOnClient(client, startedAt) {
  for (const [index, register] of pollRegisters.entries()) {
    try {
      await client.readHoldingRegisters(register, 1)
    } catch (error) {
      throw new Error(
        `poll request ${index + 1}/${pollRegisters.length}, register=${register}, ` +
          `elapsed=${Date.now() - startedAt}ms: ${formatError(error)}`
      )
    }
  }
}

async function runPhase(name, operation) {
  try {
    return await operation()
  } catch (error) {
    throw new Error(`${name} phase: ${formatError(error)}`)
  }
}

async function withClient(operation) {
  const client = new ModbusRTU()
  client.setTimeout(timeoutMs)
  const startedAt = Date.now()

  try {
    await client.connectTCP(host, { port, timeout: timeoutMs })
    client.setID(unitId)
    return await operation(client, startedAt)
  } finally {
    await closeClient(client)
  }
}

async function closeClient(client) {
  await new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve()
      }
    }
    const timer = setTimeout(finish, 250)

    try {
      client.close(finish)
    } catch {
      finish()
    }
  })
}

function formatError(error) {
  if (error && typeof error === 'object') {
    const message = 'message' in error ? String(error.message) : String(error)
    const code = 'errno' in error ? String(error.errno) : 'code' in error ? String(error.code) : ''
    return code ? `${message} (${code})` : message
  }

  return String(error)
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) {
    return undefined
  }

  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
