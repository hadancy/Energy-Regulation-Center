import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { createHash, randomBytes } from 'crypto'
import { app, ipcMain } from 'electron'
import { existsSync } from 'fs'
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'http'
import type { AddressInfo } from 'net'
import { join } from 'path'

const CAMERA_PROXY_HOST = '127.0.0.1'
const CAMERA_PROXY_PORT = Number.parseInt(process.env['CAMERA_PROXY_PORT'] ?? '18064', 10)
const CAMERA_HOST = process.env['CAMERA_HOST'] ?? '192.168.0.64'
const CAMERA_USERNAME = process.env['CAMERA_USERNAME'] ?? 'admin'
const CAMERA_PASSWORD = process.env['CAMERA_PASSWORD'] ?? 'abcd1245'
const CAMERA_PRIMARY_CHANNEL = process.env['CAMERA_CHANNEL'] ?? '101'
const CAMERA_INFRARED_CHANNEL = process.env['CAMERA_INFRARED_CHANNEL'] ?? '201'
const CAMERA_CHANNELS = (
  process.env['CAMERA_CHANNELS'] ?? `${CAMERA_PRIMARY_CHANNEL},${CAMERA_INFRARED_CHANNEL}`
)
  .split(',')
  .map((channel) => channel.trim())
  .filter(Boolean)
const CAMERA_STREAM_LABELS = (process.env['CAMERA_STREAM_LABELS'] ?? '可见光监控,红外热成像')
  .split(',')
  .map((label) => label.trim())
const CAMERA_RTSP_PORT = Number.parseInt(process.env['CAMERA_RTSP_PORT'] ?? '554', 10)
const CAMERA_RTSP_TRANSPORT = process.env['CAMERA_RTSP_TRANSPORT'] ?? 'udp'
const CAMERA_HTTP_PORT = Number.parseInt(process.env['CAMERA_HTTP_PORT'] ?? '80', 10)
const CAMERA_PROXY_FALLBACK_PORT = 0

let cameraProxyServer: Server | null = null
let cameraProxyPort: number | null = null
let cameraProxyError = ''
const lastCameraStreamErrors = new Map<string, string>()
let ffmpegAvailable = false
let ffmpegPath = ''
const activeCameraStreams = new Set<ChildProcess>()

interface CameraStreamConfig {
  id: string
  label: string
  channel: string
  rtspPath: string
  snapshotPath: string
}

interface CameraStreamRuntimeState {
  activeConnections: number
  openedAt: number
  ready: boolean
  firstFrameAt: number
  lastFrameAt: number
  transport: string
}

interface CameraSnapshotResponse {
  body: Buffer
  headers: IncomingHttpHeaders
  statusCode: number
}

interface DigestChallenge {
  algorithm?: string
  nonce?: string
  opaque?: string
  qop?: string
  realm?: string
}

const cameraStreamStates = new Map<string, CameraStreamRuntimeState>()

const normalizeRtspTransport = (transport?: string | null): string => {
  return transport?.toLowerCase() === 'tcp' ? 'tcp' : 'udp'
}

const getCameraStreamState = (stream: CameraStreamConfig): CameraStreamRuntimeState => {
  const state = cameraStreamStates.get(stream.id)

  if (state) {
    return state
  }

  const emptyState: CameraStreamRuntimeState = {
    activeConnections: 0,
    openedAt: 0,
    ready: false,
    firstFrameAt: 0,
    lastFrameAt: 0,
    transport: normalizeRtspTransport(CAMERA_RTSP_TRANSPORT)
  }

  cameraStreamStates.set(stream.id, emptyState)
  return emptyState
}

const uniqueCameraChannels = Array.from(
  new Set(CAMERA_CHANNELS.length ? CAMERA_CHANNELS : ['101', '201'])
)

const CAMERA_STREAMS: CameraStreamConfig[] = uniqueCameraChannels.map((channel, index) => {
  const snapshotPath =
    process.env[`CAMERA_SNAPSHOT_PATH_${channel}`] ??
    (index === 0 ? process.env['CAMERA_SNAPSHOT_PATH'] : undefined) ??
    `/ISAPI/Streaming/channels/${channel}/picture`

  return {
    id: channel,
    label: CAMERA_STREAM_LABELS[index] || `摄像头 ${index + 1}`,
    channel,
    rtspPath: `/Streaming/Channels/${channel}`,
    snapshotPath
  }
})

const defaultCameraStream = (): CameraStreamConfig => CAMERA_STREAMS[0]

const getCameraStream = (channel?: string | null): CameraStreamConfig => {
  return (
    CAMERA_STREAMS.find((stream) => stream.channel === channel || stream.id === channel) ??
    defaultCameraStream()
  )
}

const cameraRtspUrl = (stream: CameraStreamConfig): string => {
  const username = encodeURIComponent(CAMERA_USERNAME)
  const password = encodeURIComponent(CAMERA_PASSWORD)
  const port = Number.isFinite(CAMERA_RTSP_PORT) ? CAMERA_RTSP_PORT : 554

  return `rtsp://${username}:${password}@${CAMERA_HOST}:${port}${stream.rtspPath}`
}

const md5 = (value: string): string => {
  return createHash('md5').update(value).digest('hex')
}

const parseDigestChallenge = (header: string): DigestChallenge => {
  const challenge = header.replace(/^Digest\s+/i, '')
  const result: DigestChallenge = {}
  const pairs = challenge.matchAll(/(\w+)=("([^"]*)"|([^,]*))/g)

  for (const pair of pairs) {
    const key = pair[1] as keyof DigestChallenge
    const value = pair[3] ?? pair[4] ?? ''
    result[key] = value.trim()
  }

  return result
}

const createDigestAuthorization = (
  challengeHeader: string,
  snapshotPath: string
): string | null => {
  const challenge = parseDigestChallenge(challengeHeader)

  if (!challenge.realm || !challenge.nonce) {
    return null
  }

  const method = 'GET'
  const uri = snapshotPath
  const cnonce = randomBytes(8).toString('hex')
  const nc = '00000001'
  const algorithm = challenge.algorithm ?? 'MD5'
  const qop = challenge.qop
    ?.split(',')
    .map((value) => value.trim())
    .includes('auth')
    ? 'auth'
    : undefined
  const baseHa1 = md5(`${CAMERA_USERNAME}:${challenge.realm}:${CAMERA_PASSWORD}`)
  const ha1 =
    algorithm.toLowerCase() === 'md5-sess'
      ? md5(`${baseHa1}:${challenge.nonce}:${cnonce}`)
      : baseHa1
  const ha2 = md5(`${method}:${uri}`)
  const response = qop
    ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`)
  const headerParts = [
    `username="${CAMERA_USERNAME}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
    `algorithm=${algorithm}`
  ]

  if (challenge.opaque) {
    headerParts.push(`opaque="${challenge.opaque}"`)
  }

  if (qop) {
    headerParts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`)
  }

  return `Digest ${headerParts.join(', ')}`
}

const createBasicAuthorization = (): string => {
  const credentials = Buffer.from(`${CAMERA_USERNAME}:${CAMERA_PASSWORD}`).toString('base64')

  return `Basic ${credentials}`
}

const getFfmpegPlatformDir = (): string => {
  if (process.platform === 'win32') {
    return 'win'
  }

  if (process.platform === 'darwin') {
    return 'mac'
  }

  return 'linux'
}

const getFfmpegBinaryName = (): string => {
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

const getBundledFfmpegCandidates = (): string[] => {
  const platformDir = getFfmpegPlatformDir()
  const binaryName = getFfmpegBinaryName()
  const resourceBase = app.isPackaged ? process.resourcesPath : process.cwd()

  return [
    join(resourceBase, 'ffmpeg', platformDir, binaryName),
    join(resourceBase, 'ffmpeg', binaryName),
    join(process.cwd(), 'build', 'ffmpeg', platformDir, binaryName),
    join(process.cwd(), 'build', 'ffmpeg', binaryName)
  ]
}

const resolveFfmpegPath = (): string => {
  const configuredPath = process.env['FFMPEG_PATH']

  if (configuredPath && existsSync(configuredPath)) {
    return configuredPath
  }

  const bundledPath = getBundledFfmpegCandidates().find((candidate) => existsSync(candidate))

  if (bundledPath) {
    return bundledPath
  }

  return 'ffmpeg'
}

const detectFfmpeg = (): boolean => {
  ffmpegPath = resolveFfmpegPath()

  const result = spawnSync(ffmpegPath, ['-version'], { stdio: 'ignore' })

  return !result.error && result.status === 0
}

const getCameraProxyBaseUrl = (): string => {
  if (!cameraProxyPort) {
    return ''
  }

  return `http://${CAMERA_PROXY_HOST}:${cameraProxyPort}`
}

const getCameraInfo = (): Record<string, unknown> => {
  const baseUrl = getCameraProxyBaseUrl()
  const defaultStream = defaultCameraStream()
  const streamMode = ffmpegAvailable ? 'rtsp' : 'snapshot'
  const streams = CAMERA_STREAMS.map((stream) => {
    const channelQuery = `channel=${encodeURIComponent(stream.channel)}`
    const runtimeState = getCameraStreamState(stream)

    return {
      ...stream,
      streamMode,
      streamUrl: baseUrl ? `${baseUrl}/camera/mjpeg?${channelQuery}` : '',
      snapshotUrl: baseUrl ? `${baseUrl}/camera/snapshot.jpg?${channelQuery}` : '',
      streamActive: runtimeState.activeConnections > 0,
      streamReady: runtimeState.ready,
      streamOpenedAt: runtimeState.openedAt,
      streamFirstFrameAt: runtimeState.firstFrameAt,
      streamLastFrameAt: runtimeState.lastFrameAt,
      activeTransport: runtimeState.transport,
      streamError: lastCameraStreamErrors.get(stream.id) ?? ''
    }
  })

  return {
    brand: 'HIKMICRO',
    host: CAMERA_HOST,
    username: CAMERA_USERNAME,
    channel: defaultStream.channel,
    rtspPort: Number.isFinite(CAMERA_RTSP_PORT) ? CAMERA_RTSP_PORT : 554,
    rtspTransport: CAMERA_RTSP_TRANSPORT,
    rtspPath: defaultStream.rtspPath,
    snapshotPath: defaultStream.snapshotPath,
    streamMode,
    streamUrl: streams[0]?.streamUrl ?? '',
    snapshotUrl: streams[0]?.snapshotUrl ?? '',
    healthUrl: baseUrl ? `${baseUrl}/camera/health` : '',
    proxyReady: Boolean(cameraProxyServer && cameraProxyPort),
    proxyError: cameraProxyError,
    streamError: streams[0]?.streamError ?? '',
    streams,
    ffmpegPath: ffmpegAvailable ? ffmpegPath : '',
    ffmpegAvailable
  }
}

const cameraProxyHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cross-Origin-Resource-Policy': 'cross-origin'
}

const writeJson = (
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>
): void => {
  res.writeHead(statusCode, {
    ...cameraProxyHeaders,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  res.end(JSON.stringify(payload))
}

const requestCameraSnapshot = (
  stream: CameraStreamConfig,
  authorization?: string
): Promise<CameraSnapshotResponse> => {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      Accept: 'image/jpeg'
    }

    if (authorization) {
      headers.Authorization = authorization
    }

    const req = httpRequest(
      {
        hostname: CAMERA_HOST,
        port: Number.isFinite(CAMERA_HTTP_PORT) ? CAMERA_HTTP_PORT : 80,
        path: stream.snapshotPath,
        method: 'GET',
        headers,
        timeout: 5000
      },
      (res) => {
        const chunks: Buffer[] = []

        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
        })

        res.on('end', () => {
          resolve({
            body: Buffer.concat(chunks),
            headers: res.headers,
            statusCode: res.statusCode ?? 0
          })
        })
      }
    )

    req.on('timeout', () => {
      req.destroy(new Error('摄像头快照请求超时。'))
    })
    req.on('error', reject)
    req.end()
  })
}

const fetchCameraSnapshot = async (stream: CameraStreamConfig): Promise<Buffer> => {
  const response = await requestCameraSnapshot(stream)

  if (response.statusCode >= 200 && response.statusCode < 300) {
    return response.body
  }

  const authenticateHeader = response.headers['www-authenticate']
  const challenge = Array.isArray(authenticateHeader) ? authenticateHeader[0] : authenticateHeader

  if (!challenge) {
    throw new Error(`摄像头快照请求失败，状态码 ${response.statusCode}。`)
  }

  const authorization = challenge.toLowerCase().startsWith('digest')
    ? createDigestAuthorization(challenge, stream.snapshotPath)
    : createBasicAuthorization()

  if (!authorization) {
    throw new Error('摄像头鉴权信息解析失败。')
  }

  const authenticatedResponse = await requestCameraSnapshot(stream, authorization)

  if (authenticatedResponse.statusCode >= 200 && authenticatedResponse.statusCode < 300) {
    return authenticatedResponse.body
  }

  throw new Error(`摄像头快照鉴权失败，状态码 ${authenticatedResponse.statusCode}。`)
}

const writeMjpegFrame = (res: ServerResponse, frame: Buffer): void => {
  res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`)
  res.write(frame)
  res.write('\r\n')
}

const getFfmpegErrorOutput = (chunks: Buffer[]): string => {
  return Buffer.concat(chunks).toString('utf8').trim()
}

const handleCameraSnapshotMjpeg = (
  _req: IncomingMessage,
  res: ServerResponse,
  stream: CameraStreamConfig
): void => {
  let stopped = false

  res.writeHead(200, {
    ...cameraProxyHeaders,
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    Connection: 'close'
  })

  const stopStream = (): void => {
    stopped = true
  }

  res.on('close', stopStream)

  const sendFrames = async (): Promise<void> => {
    while (!stopped && !res.destroyed) {
      try {
        const frame = await fetchCameraSnapshot(stream)
        writeMjpegFrame(res, frame)
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error) {
        if (!res.destroyed) {
          res.destroy(error instanceof Error ? error : new Error('摄像头快照读取失败。'))
        }
        return
      }
    }
  }

  void sendFrames()
}

const handleCameraSnapshot = async (
  res: ServerResponse,
  stream: CameraStreamConfig
): Promise<void> => {
  try {
    const frame = await fetchCameraSnapshot(stream)

    res.writeHead(200, {
      ...cameraProxyHeaders,
      'Content-Type': 'image/jpeg',
      'Content-Length': frame.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache'
    })
    res.end(frame)
  } catch (error) {
    writeJson(res, 502, {
      error: error instanceof Error ? error.message : '摄像头快照读取失败。'
    })
  }
}

const getCameraSnapshotDataUrl = async (stream: CameraStreamConfig): Promise<string> => {
  const frame = await fetchCameraSnapshot(stream)

  return `data:image/jpeg;base64,${frame.toString('base64')}`
}

const handleCameraRtspMjpeg = (
  _req: IncomingMessage,
  res: ServerResponse,
  stream: CameraStreamConfig,
  transport: string
): void => {
  const stderrChunks: Buffer[] = []
  let clientClosed = false
  let streamStarted = false
  lastCameraStreamErrors.set(stream.id, '')
  const runtimeState = getCameraStreamState(stream)
  runtimeState.activeConnections += 1
  runtimeState.openedAt = Date.now()
  runtimeState.ready = false
  runtimeState.firstFrameAt = 0
  runtimeState.lastFrameAt = 0
  runtimeState.transport = transport

  const ffmpeg = spawn(
    ffmpegPath,
    [
      '-hide_banner',
      '-loglevel',
      'warning',
      '-fflags',
      'nobuffer',
      '-flags',
      'low_delay',
      '-avioflags',
      'direct',
      '-analyzeduration',
      '500000',
      '-probesize',
      '32768',
      '-rtsp_transport',
      transport,
      '-max_delay',
      '0',
      '-reorder_queue_size',
      '0',
      '-stimeout',
      '5000000',
      '-i',
      cameraRtspUrl(stream),
      '-an',
      '-vsync',
      '0',
      '-q:v',
      '8',
      '-flush_packets',
      '1',
      '-f',
      'mpjpeg',
      '-boundary_tag',
      'frame',
      'pipe:1'
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  )

  activeCameraStreams.add(ffmpeg)

  const writeStreamHeaders = (): void => {
    if (res.headersSent || res.destroyed) {
      return
    }

    res.writeHead(200, {
      ...cameraProxyHeaders,
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      Connection: 'close'
    })
  }

  const stopStream = (): void => {
    clientClosed = true
    runtimeState.activeConnections = Math.max(0, runtimeState.activeConnections - 1)
    if (runtimeState.activeConnections === 0) {
      runtimeState.ready = false
    }
    activeCameraStreams.delete(ffmpeg)

    if (!ffmpeg.killed) {
      ffmpeg.kill('SIGTERM')
    }
  }

  res.on('close', stopStream)

  ffmpeg.stderr?.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk)
  })

  ffmpeg.stdout?.on('data', (chunk: Buffer) => {
    if (res.destroyed) {
      return
    }

    streamStarted = true
    const now = Date.now()
    runtimeState.ready = true
    runtimeState.firstFrameAt = runtimeState.firstFrameAt || now
    runtimeState.lastFrameAt = now
    writeStreamHeaders()
    res.write(chunk)
  })

  ffmpeg.on('error', (error) => {
    activeCameraStreams.delete(ffmpeg)
    runtimeState.activeConnections = Math.max(0, runtimeState.activeConnections - 1)
    runtimeState.ready = false
    lastCameraStreamErrors.set(stream.id, error.message)

    if (!res.headersSent) {
      writeJson(res, 502, { error: '本地摄像头视频流启动失败。' })
      return
    }

    if (!res.destroyed) {
      res.destroy(error)
    }
  })

  ffmpeg.on('exit', (code) => {
    activeCameraStreams.delete(ffmpeg)
    runtimeState.activeConnections = Math.max(0, runtimeState.activeConnections - 1)
    runtimeState.ready = false
    const ffmpegError = getFfmpegErrorOutput(stderrChunks)

    if (ffmpegError && !clientClosed) {
      lastCameraStreamErrors.set(stream.id, ffmpegError)
    }

    if (!streamStarted && !clientClosed && !res.headersSent) {
      let lastCameraStreamError = lastCameraStreamErrors.get(stream.id) ?? ''

      if (!lastCameraStreamError) {
        lastCameraStreamError = `FFmpeg 未能读取摄像头视频流${
          typeof code === 'number' ? `，退出码 ${code}` : ''
        }。`
        lastCameraStreamErrors.set(stream.id, lastCameraStreamError)
      }

      writeJson(res, 502, {
        error: lastCameraStreamError
      })
      return
    }

    if (!res.destroyed) {
      res.end()
    }
  })
}

const handleCameraMjpeg = (
  req: IncomingMessage,
  res: ServerResponse,
  stream: CameraStreamConfig,
  transport: string
): void => {
  if (ffmpegAvailable) {
    handleCameraRtspMjpeg(req, res, stream, transport)
    return
  }

  handleCameraSnapshotMjpeg(req, res, stream)
}

const createCameraProxyServer = (): Server => {
  return createServer((req, res) => {
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? CAMERA_PROXY_HOST}`)

    if (req.method === 'OPTIONS') {
      res.writeHead(204, cameraProxyHeaders)
      res.end()
      return
    }

    if (requestUrl.pathname === '/camera/health') {
      writeJson(res, 200, getCameraInfo())
      return
    }

    const stream = getCameraStream(requestUrl.searchParams.get('channel'))
    const transport = normalizeRtspTransport(requestUrl.searchParams.get('transport'))

    if (requestUrl.pathname === '/camera/mjpeg') {
      handleCameraMjpeg(req, res, stream, transport)
      return
    }

    if (requestUrl.pathname === '/camera/snapshot.jpg') {
      void handleCameraSnapshot(res, stream)
      return
    }

    writeJson(res, 404, { error: 'Not Found' })
  })
}

const listenCameraProxy = (server: Server, port: number): Promise<number> => {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, CAMERA_PROXY_HOST, () => {
      server.off('error', reject)

      const address = server.address() as AddressInfo
      resolve(address.port)
    })
  })
}

export const startCameraProxy = async (): Promise<void> => {
  ffmpegAvailable = detectFfmpeg()

  const preferredPort = Number.isFinite(CAMERA_PROXY_PORT) ? CAMERA_PROXY_PORT : 18064
  const ports = preferredPort > 0 ? [preferredPort, CAMERA_PROXY_FALLBACK_PORT] : [18064, 0]

  for (const port of ports) {
    const server = createCameraProxyServer()

    try {
      cameraProxyPort = await listenCameraProxy(server, port)
      cameraProxyServer = server
      cameraProxyError = ''
      return
    } catch (error) {
      cameraProxyError = error instanceof Error ? error.message : '本地视频代理启动失败。'
      server.close()
    }
  }
}

export const stopCameraProxy = (): void => {
  for (const streamProcess of activeCameraStreams) {
    if (!streamProcess.killed) {
      streamProcess.kill('SIGTERM')
    }
  }

  activeCameraStreams.clear()
  cameraProxyServer?.close()
  cameraProxyServer = null
  cameraProxyPort = null
}

export const registerCameraIpc = (): void => {
  ipcMain.handle('camera:get-info', () => getCameraInfo())
  ipcMain.handle('camera:get-snapshot', (_event, channel?: string) =>
    getCameraSnapshotDataUrl(getCameraStream(channel))
  )
}
