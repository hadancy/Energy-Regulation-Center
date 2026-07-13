#!/usr/bin/env node
import { Socket } from 'node:net'
import process from 'node:process'

const host = process.env.PLC_HOST || process.argv[2] || '192.168.0.1'
const timeoutMs = Number.parseInt(process.env.PLC_TIMEOUT_MS || '3000', 10)
const unitId = Number.parseInt(process.env.PLC_UNIT_ID || '1', 10)
const rack = Number.parseInt(process.env.PLC_RACK || '0', 10)
const address = Number.parseInt(process.env.PLC_ADDRESS || '400', 10)
const ports = parseNumberList(process.env.PLC_PROBE_PORTS || '102,502')
const slots = parseNumberList(process.env.PLC_PROBE_SLOTS || '1,2')
const modbusFunctions = parseNumberList(process.env.PLC_PROBE_MODBUS_FUNCTIONS || '3,4')
const modbusAddresses = parseNumberList(
  process.env.PLC_PROBE_MODBUS_ADDRESSES ||
    [
      address,
      Math.max(0, address - 1),
      Math.floor(address / 2),
      Math.max(0, Math.floor(address / 2) - 1),
      address + 1,
      0,
      1
    ].join(',')
)

const results = []

console.log('PLC protocol probe')
console.log(`Target: ${host}`)
console.log(`Timeout: ${timeoutMs}ms`)
console.log(`Probe address: MW${address} / holding register ${address}`)
console.log('')

for (const port of ports) {
  await record(`TCP port ${port}`, () => testTcp(port))
}

for (const port of ports) {
  for (const slot of slots) {
    await record(`S7 port ${port} rack ${rack} slot ${slot} read M${address}`, () =>
      testS7Read(port, slot)
    )
  }
}

for (const port of ports) {
  for (const functionCode of modbusFunctions) {
    for (const modbusAddress of modbusAddresses) {
      await record(
        `Modbus TCP port ${port} unit ${unitId} fc ${functionCode} address ${modbusAddress}`,
        () => testModbusRead(port, modbusAddress, functionCode)
      )
    }
  }
}

console.log('')
const successes = results.filter((result) => result.ok && result.value !== undefined)

if (successes.length > 0) {
  console.log('Likely working read path:')
  for (const result of successes) {
    console.log(`  - ${result.name}: value=${result.value}, raw=${result.raw}`)
  }
} else {
  console.log('No protocol read succeeded. Compare the Python code import/connect/read calls.')
}

function parseNumberList(value) {
  return value
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item))
}

async function record(name, test) {
  try {
    const detail = await test()
    results.push({ name, ok: true, ...detail })
    console.log(`[PASS] ${name}: ${formatDetail(detail)}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    results.push({ name, ok: false, error: message })
    console.log(`[FAIL] ${name}: ${message}`)
  } finally {
    await delay(150)
  }
}

function formatDetail(detail) {
  const parts = []

  if (detail.elapsedMs !== undefined) {
    parts.push(`${detail.elapsedMs}ms`)
  }

  if (detail.value !== undefined) {
    parts.push(`value=${detail.value}`)
  }

  if (detail.raw !== undefined) {
    parts.push(`raw=${detail.raw}`)
  }

  if (detail.response) {
    parts.push(`response=${detail.response}`)
  }

  return parts.join(', ') || 'ok'
}

async function testTcp(port) {
  const startedAt = Date.now()
  const socket = await connectSocket(port)
  closeSocket(socket)
  return { elapsedMs: Date.now() - startedAt }
}

async function testS7Read(port, slot) {
  const socket = await connectSocket(port)

  try {
    const cotpResponse = await sendPacket(
      socket,
      buildCotpConnectRequest(slot),
      getTpktExpectedLength
    )

    if (cotpResponse.length < 7 || cotpResponse[5] !== 0xd0) {
      throw new Error(`COTP connect rejected: ${toHex(cotpResponse)}`)
    }

    const setupResponse = await sendPacket(socket, buildS7SetupRequest(1), getTpktExpectedLength)

    if (setupResponse.length < 19 || setupResponse[7] !== 0x32) {
      throw new Error(`S7 setup failed: ${toHex(setupResponse)}`)
    }

    const readResponse = await sendPacket(
      socket,
      buildS7ReadRequest(address, 2, 2),
      getTpktExpectedLength
    )
    const parsed = parseS7ReadResponse(readResponse)

    return {
      value: parsed.value,
      raw: parsed.raw,
      response: toHex(readResponse)
    }
  } finally {
    closeSocket(socket)
  }
}

async function testModbusRead(port, registerAddress, functionCode) {
  const socket = await connectSocket(port)

  try {
    const transactionId = Math.floor(Math.random() * 0xffff)
    const response = await sendPacket(
      socket,
      buildModbusReadRequest(transactionId, registerAddress, functionCode),
      getModbusExpectedLength
    )
    const parsed = parseModbusReadResponse(response, transactionId, functionCode)

    return {
      value: parsed.value,
      raw: parsed.raw,
      response: toHex(response)
    }
  } finally {
    closeSocket(socket)
  }
}

function connectSocket(port) {
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    let settled = false

    const finish = (error) => {
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

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish())
    socket.once('timeout', () => finish(new Error('TCP connect timeout')))
    socket.once('error', (error) => finish(error))
    socket.connect(port, host)
  })
}

function closeSocket(socket) {
  socket.end()
  setTimeout(() => {
    if (!socket.destroyed) {
      socket.destroy()
    }
  }, 50).unref()
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sendPacket(socket, packet, getExpectedLength) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let expectedLength = 0
    let settled = false

    const cleanup = () => {
      clearTimeout(timer)
      socket.removeListener('data', handleData)
      socket.removeListener('error', handleError)
      socket.removeListener('close', handleClose)
    }

    const finish = (error, response) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()

      if (error) {
        reject(error)
        return
      }

      resolve(response)
    }

    const timer = setTimeout(() => {
      finish(new Error('response timeout'))
    }, timeoutMs)

    const handleError = (error) => finish(error)
    const handleClose = () => finish(new Error('socket closed before response'))

    const handleData = (chunk) => {
      chunks.push(chunk)
      const response = Buffer.concat(chunks)

      if (expectedLength === 0) {
        expectedLength = getExpectedLength(response)
      }

      if (expectedLength > 0 && response.length >= expectedLength) {
        finish(undefined, response.subarray(0, expectedLength))
      }
    }

    socket.on('data', handleData)
    socket.once('error', handleError)
    socket.once('close', handleClose)
    socket.write(packet)
  })
}

function getTpktExpectedLength(response) {
  return response.length >= 4 ? response.readUInt16BE(2) : 0
}

function getModbusExpectedLength(response) {
  return response.length >= 6 ? 6 + response.readUInt16BE(4) : 0
}

function buildCotpConnectRequest(slot) {
  const remoteTsap = 0x0100 + rack * 0x20 + slot
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

function buildS7SetupRequest(pduReference) {
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

function buildS7ReadRequest(byteAddress, byteLength, pduReference) {
  const bitAddress = byteAddress * 8
  const packetLength = 31
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
  packet.writeUInt16BE(14, 13)
  packet.writeUInt16BE(0, 15)
  packet.writeUInt8(0x04, 17)
  packet.writeUInt8(0x01, 18)
  packet.writeUInt8(0x12, 19)
  packet.writeUInt8(0x0a, 20)
  packet.writeUInt8(0x10, 21)
  packet.writeUInt8(0x02, 22)
  packet.writeUInt16BE(byteLength, 23)
  packet.writeUInt16BE(0, 25)
  packet.writeUInt8(0x83, 27)
  packet.writeUInt8((bitAddress >> 16) & 0xff, 28)
  packet.writeUInt8((bitAddress >> 8) & 0xff, 29)
  packet.writeUInt8(bitAddress & 0xff, 30)

  return packet
}

function parseS7ReadResponse(response) {
  if (response.length < 19 || response[0] !== 0x03 || response[7] !== 0x32) {
    throw new Error(`invalid S7 response: ${toHex(response)}`)
  }

  const s7Start = 7
  const parameterLength = response.readUInt16BE(s7Start + 6)
  const errorClass = response[s7Start + 10]
  const errorCode = response[s7Start + 11]

  if (errorClass || errorCode) {
    throw new Error(`S7 error class=${errorClass} code=${errorCode} response=${toHex(response)}`)
  }

  const dataStart = s7Start + 12 + parameterLength

  if (response.length < dataStart + 6) {
    throw new Error(`S7 response too short: ${toHex(response)}`)
  }

  const returnCode = response[dataStart]
  const bitLength = response.readUInt16BE(dataStart + 2)

  if (returnCode !== 0xff) {
    throw new Error(`S7 item return code=0x${returnCode.toString(16)} response=${toHex(response)}`)
  }

  const byteLength = Math.ceil(bitLength / 8)
  const valueStart = dataStart + 4

  if (byteLength < 2 || response.length < valueStart + 2) {
    throw new Error(`S7 value missing: ${toHex(response)}`)
  }

  const raw = response.readUInt16BE(valueStart)
  const value = response.readInt16BE(valueStart)
  return { raw, value }
}

function buildModbusReadRequest(transactionId, registerAddress, functionCode) {
  const packet = Buffer.alloc(12)

  packet.writeUInt16BE(transactionId, 0)
  packet.writeUInt16BE(0, 2)
  packet.writeUInt16BE(6, 4)
  packet.writeUInt8(unitId, 6)
  packet.writeUInt8(functionCode, 7)
  packet.writeUInt16BE(registerAddress, 8)
  packet.writeUInt16BE(1, 10)

  return packet
}

function parseModbusReadResponse(response, transactionId, expectedFunctionCode) {
  if (response.length < 9) {
    throw new Error(`short Modbus response: ${toHex(response)}`)
  }

  const responseTransactionId = response.readUInt16BE(0)
  const protocolId = response.readUInt16BE(2)
  const functionCode = response[7]

  if (responseTransactionId !== transactionId || protocolId !== 0) {
    throw new Error(`invalid Modbus MBAP response: ${toHex(response)}`)
  }

  if (functionCode & 0x80) {
    throw new Error(`Modbus exception code=${response[8]} response=${toHex(response)}`)
  }

  if (functionCode !== expectedFunctionCode) {
    throw new Error(`unexpected Modbus function=${functionCode} response=${toHex(response)}`)
  }

  const byteCount = response[8]

  if (byteCount < 2 || response.length < 11) {
    throw new Error(`Modbus value missing: ${toHex(response)}`)
  }

  const raw = response.readUInt16BE(9)
  const value = raw > 0x7fff ? raw - 0x10000 : raw
  return { raw, value }
}

function toHex(buffer, maxLength = 96) {
  const text =
    buffer
      .subarray(0, maxLength)
      .toString('hex')
      .match(/.{1,2}/g)
      ?.join(' ') || ''
  return buffer.length > maxLength ? `${text} ...` : text
}
