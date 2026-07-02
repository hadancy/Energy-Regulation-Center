<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Monitor, RefreshRight, VideoCamera, WarningFilled } from '@element-plus/icons-vue'

type CameraInfo = Awaited<ReturnType<typeof window.api.camera.getInfo>>
type CameraStreamInfo = CameraInfo['streams'][number]
type TagType = 'success' | 'warning' | 'info' | 'danger'

interface MonitorView {
  stream: CameraStreamInfo
  loaded: boolean
  error: string
  key: number
  frameUrl: string
  streamBuffer: Uint8Array
  streamAbortController: AbortController | null
  streamRequestId: number
  frameUpdatedAt: number
  snapshotDataUrl: string
  snapshotFailureCount: number
  snapshotTimer: number | null
  firstFrameTimer: number | null
  snapshotRequestId: number
  reconnecting: boolean
  reconnectCount: number
  currentTransport: string
  connectionStartedAt: number
}

const emit = defineEmits<{
  statusChange: [status: string]
}>()

const cameraInfo = ref<CameraInfo | null>(null)
const monitors = ref<MonitorView[]>([])
const loading = ref(true)

const normalizeTransport = (transport?: string): string => (transport === 'tcp' ? 'tcp' : 'udp')

const createMonitor = (
  stream: CameraStreamInfo,
  index: number,
  transport: string
): MonitorView => ({
  stream,
  loaded: false,
  error: '',
  key: Date.now() + index,
  frameUrl: '',
  streamBuffer: new Uint8Array(),
  streamAbortController: null,
  streamRequestId: 0,
  frameUpdatedAt: 0,
  snapshotDataUrl: '',
  snapshotFailureCount: 0,
  snapshotTimer: null,
  firstFrameTimer: null,
  snapshotRequestId: 0,
  reconnecting: false,
  reconnectCount: 0,
  currentTransport: normalizeTransport(transport),
  connectionStartedAt: Date.now()
})

const appendStreamParams = (url: string, key: number, transport: string): string => {
  const separator = url.includes('?') ? '&' : '?'

  return `${url}${separator}transport=${encodeURIComponent(transport)}&t=${key}`
}

const getMonitorStreamUrl = (monitor: MonitorView): string => {
  const info = cameraInfo.value

  if (!info?.proxyReady || !monitor.stream.streamUrl) {
    return ''
  }

  if (info.streamMode === 'snapshot') {
    return monitor.snapshotDataUrl
  }

  return monitor.frameUrl
}

const hasMonitorVideoSource = (monitor: MonitorView): boolean => {
  const info = cameraInfo.value

  if (!info?.proxyReady) {
    return false
  }

  if (info.streamMode === 'snapshot') {
    return Boolean(monitor.snapshotDataUrl)
  }

  return Boolean(monitor.stream.streamUrl)
}

const hasMonitorActiveStream = (monitor: MonitorView): boolean =>
  Boolean(getMonitorStreamUrl(monitor) && !loading.value && !monitor.error && monitor.loaded)

const activeMonitorCount = computed(
  () => monitors.value.filter((monitor) => hasMonitorActiveStream(monitor)).length
)

const hasMonitorError = computed(() => monitors.value.some((monitor) => Boolean(monitor.error)))
const hasReconnectingMonitor = computed(() =>
  monitors.value.some((monitor) => monitor.reconnecting && !monitor.loaded && !monitor.error)
)

const statusText = computed(() => {
  if (loading.value) {
    return '连接中'
  }

  if (!cameraInfo.value?.proxyReady) {
    return '代理未启动'
  }

  if (hasMonitorError.value && activeMonitorCount.value > 0) {
    return '部分异常'
  }

  if (hasMonitorError.value) {
    return '连接异常'
  }

  if (hasReconnectingMonitor.value) {
    return '重连中'
  }

  if (monitors.value.length > 0 && activeMonitorCount.value === monitors.value.length) {
    return `${monitors.value.length} 路实时在线`
  }

  if (activeMonitorCount.value > 0) {
    return `${activeMonitorCount.value}/${monitors.value.length} 路在线`
  }

  return '等待画面'
})

watch(
  statusText,
  (status) => {
    emit('statusChange', status)
  },
  { immediate: true }
)

const getMonitorStatusType = (monitor: MonitorView): TagType => {
  if (loading.value) {
    return 'info'
  }

  if (monitor.error) {
    return 'danger'
  }

  if (hasMonitorActiveStream(monitor)) {
    return 'success'
  }

  return 'warning'
}

const getMonitorStatusText = (monitor: MonitorView): string => {
  if (loading.value) {
    return '连接中'
  }

  if (monitor.error) {
    return '连接异常'
  }

  if (monitor.reconnecting) {
    return '重连中'
  }

  if (hasMonitorActiveStream(monitor)) {
    return cameraInfo.value?.streamMode === 'snapshot' ? '快照在线' : '实时在线'
  }

  return '等待画面'
}

const formatCameraStreamError = (diagnostic?: string, stream?: CameraStreamInfo): string => {
  const normalizedDiagnostic = diagnostic?.trim()

  if (!normalizedDiagnostic) {
    return '无法连接摄像头画面，请确认摄像头在线且 RTSP 或 ISAPI 已开启。'
  }

  if (normalizedDiagnostic.includes('Operation timed out')) {
    return `FFmpeg 无法连接 ${cameraInfo.value?.host ?? '摄像头'}:${cameraInfo.value?.rtspPort ?? 554}，${stream?.label ?? '当前通道'} ${stream?.rtspPath ?? ''}，传输方式 ${cameraInfo.value?.rtspTransport?.toUpperCase() ?? 'UDP'}。`
  }

  if (normalizedDiagnostic.includes('401') || normalizedDiagnostic.includes('Unauthorized')) {
    return '摄像头 RTSP 认证失败，请确认账号和密码正确。'
  }

  if (normalizedDiagnostic.includes('404') || normalizedDiagnostic.includes('Not Found')) {
    return `${stream?.label ?? '摄像头'} RTSP 通道不存在，请确认视频通道路径是否正确。`
  }

  return normalizedDiagnostic
}

const getMonitorActiveStreamPath = (monitor: MonitorView): string => {
  if (cameraInfo.value?.streamMode === 'snapshot') {
    return monitor.stream.snapshotPath
  }

  return monitor.stream.rtspPath
}

const clearSnapshotTimer = (monitor: MonitorView): void => {
  if (!monitor.snapshotTimer) {
    return
  }

  window.clearTimeout(monitor.snapshotTimer)
  monitor.snapshotTimer = null
}

const clearFirstFrameTimer = (monitor: MonitorView): void => {
  if (!monitor.firstFrameTimer) {
    return
  }

  window.clearTimeout(monitor.firstFrameTimer)
  monitor.firstFrameTimer = null
}

const clearAllSnapshotTimers = (): void => {
  for (const monitor of monitors.value) {
    clearSnapshotTimer(monitor)
  }
}

const clearAllFirstFrameTimers = (): void => {
  for (const monitor of monitors.value) {
    clearFirstFrameTimer(monitor)
  }
}

const markMonitorLoaded = (monitor: MonitorView): void => {
  clearFirstFrameTimer(monitor)
  monitor.snapshotFailureCount = 0
  monitor.loaded = true
  monitor.error = ''
  monitor.reconnecting = false
}

const revokeMonitorFrame = (monitor: MonitorView): void => {
  if (!monitor.frameUrl) {
    return
  }

  URL.revokeObjectURL(monitor.frameUrl)
  monitor.frameUrl = ''
}

const scheduleFirstFrameWatchdog = (monitor: MonitorView): void => {
  clearFirstFrameTimer(monitor)

  if (cameraInfo.value?.streamMode !== 'rtsp' || monitor.loaded || monitor.error) {
    return
  }

  monitor.firstFrameTimer = window.setTimeout(() => {
    if (cameraInfo.value?.streamMode !== 'rtsp' || monitor.loaded || monitor.error) {
      return
    }

    const waitingTime = Date.now() - monitor.connectionStartedAt

    if (monitor.currentTransport === 'udp' && waitingTime > 8000) {
      restartMonitorRtspStream(monitor, 'tcp')
      return
    }

    if (monitor.currentTransport === 'tcp' && waitingTime > 18000) {
      monitor.error = `${monitor.stream.label} 长时间未收到视频首帧，请检查 RTSP 通道或点击刷新重试。`
      stopMonitorRtspStream(monitor)
      return
    }

    scheduleFirstFrameWatchdog(monitor)
  }, 1000)
}

const appendBytes = (left: Uint8Array, right: Uint8Array): Uint8Array => {
  const merged = new Uint8Array(left.length + right.length)
  merged.set(left)
  merged.set(right, left.length)

  return merged
}

const findJpegStart = (buffer: Uint8Array): number => {
  for (let index = 0; index < buffer.length - 1; index += 1) {
    if (buffer[index] === 0xff && buffer[index + 1] === 0xd8) {
      return index
    }
  }

  return -1
}

const findJpegEnd = (buffer: Uint8Array, start: number): number => {
  for (let index = start; index < buffer.length - 1; index += 1) {
    if (buffer[index] === 0xff && buffer[index + 1] === 0xd9) {
      return index + 1
    }
  }

  return -1
}

const updateMonitorFrame = (monitor: MonitorView, frame: Uint8Array): void => {
  const nowTimestamp = Date.now()

  if (monitor.loaded && nowTimestamp - monitor.frameUpdatedAt < 80) {
    return
  }

  const previousFrameUrl = monitor.frameUrl
  const frameBuffer = frame.buffer.slice(
    frame.byteOffset,
    frame.byteOffset + frame.byteLength
  ) as ArrayBuffer
  const nextFrameUrl = URL.createObjectURL(new Blob([frameBuffer], { type: 'image/jpeg' }))

  monitor.frameUrl = nextFrameUrl
  monitor.frameUpdatedAt = nowTimestamp
  markMonitorLoaded(monitor)

  if (previousFrameUrl) {
    window.setTimeout(() => {
      URL.revokeObjectURL(previousFrameUrl)
    }, 1000)
  }
}

const consumeMjpegChunk = (monitor: MonitorView, chunk: Uint8Array): void => {
  monitor.streamBuffer = appendBytes(monitor.streamBuffer, chunk)

  while (monitor.streamBuffer.length > 0) {
    const start = findJpegStart(monitor.streamBuffer)

    if (start < 0) {
      monitor.streamBuffer = monitor.streamBuffer.slice(-2)
      return
    }

    if (start > 0) {
      monitor.streamBuffer = monitor.streamBuffer.slice(start)
    }

    const end = findJpegEnd(monitor.streamBuffer, 2)

    if (end < 0) {
      if (monitor.streamBuffer.length > 2 * 1024 * 1024) {
        monitor.streamBuffer = monitor.streamBuffer.slice(-4096)
      }
      return
    }

    const frame = monitor.streamBuffer.slice(0, end + 1)
    monitor.streamBuffer = monitor.streamBuffer.slice(end + 1)
    updateMonitorFrame(monitor, frame)
  }
}

const stopMonitorRtspStream = (monitor: MonitorView): void => {
  clearFirstFrameTimer(monitor)
  monitor.streamRequestId += 1
  monitor.streamAbortController?.abort()
  monitor.streamAbortController = null
  monitor.streamBuffer = new Uint8Array()
}

const stopAllRtspStreams = (): void => {
  for (const monitor of monitors.value) {
    stopMonitorRtspStream(monitor)
  }
}

const releaseAllMonitorFrames = (): void => {
  for (const monitor of monitors.value) {
    revokeMonitorFrame(monitor)
  }
}

const restartMonitorRtspStream = (monitor: MonitorView, transport: string): void => {
  stopMonitorRtspStream(monitor)
  monitor.currentTransport = normalizeTransport(transport)
  monitor.reconnecting = true
  monitor.reconnectCount += 1
  monitor.loaded = false
  monitor.error = ''
  monitor.key = Date.now()
  monitor.connectionStartedAt = Date.now()
  void startMonitorRtspStream(monitor)
}

const handleRtspStreamFailure = async (monitor: MonitorView, error?: unknown): Promise<void> => {
  if (monitor.currentTransport === 'udp') {
    restartMonitorRtspStream(monitor, 'tcp')
    return
  }

  try {
    const latestError = await loadLatestCameraDiagnostic(monitor)
    const fallbackError = error instanceof Error ? error.message : ''
    monitor.error =
      latestError || fallbackError
        ? formatCameraStreamError(latestError || fallbackError, monitor.stream)
        : `${monitor.stream.label} 视频流读取中断，请点击刷新重试。`
  } catch {
    monitor.error = `${monitor.stream.label} 视频流读取中断，请点击刷新重试。`
  }
}

const startMonitorRtspStream = async (monitor: MonitorView): Promise<void> => {
  if (cameraInfo.value?.streamMode !== 'rtsp') {
    return
  }

  stopMonitorRtspStream(monitor)
  monitor.loaded = false
  monitor.error = ''
  monitor.reconnecting = monitor.reconnectCount > 0
  monitor.streamBuffer = new Uint8Array()
  monitor.connectionStartedAt = Date.now()

  const requestId = ++monitor.streamRequestId
  const controller = new AbortController()
  monitor.streamAbortController = controller
  scheduleFirstFrameWatchdog(monitor)

  try {
    const response = await fetch(
      appendStreamParams(monitor.stream.streamUrl, monitor.key, monitor.currentTransport),
      {
        cache: 'no-store',
        signal: controller.signal
      }
    )

    if (!response.ok) {
      throw new Error(`视频代理返回 ${response.status}`)
    }

    if (!response.body) {
      throw new Error('视频代理未返回可读取的视频流。')
    }

    const reader = response.body.getReader()

    while (requestId === monitor.streamRequestId) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      if (value) {
        consumeMjpegChunk(monitor, value)
      }
    }

    if (!controller.signal.aborted && requestId === monitor.streamRequestId) {
      throw new Error('视频流连接已结束。')
    }
  } catch (error) {
    if (controller.signal.aborted || requestId !== monitor.streamRequestId) {
      return
    }

    await handleRtspStreamFailure(monitor, error)
  }
}

const scheduleSnapshotRefresh = (monitor: MonitorView): void => {
  clearSnapshotTimer(monitor)

  if (cameraInfo.value?.streamMode !== 'snapshot') {
    return
  }

  monitor.snapshotTimer = window.setTimeout(() => {
    void loadSnapshotFrame(monitor)
  }, 1000)
}

const loadSnapshotFrame = async (monitor: MonitorView): Promise<void> => {
  if (cameraInfo.value?.streamMode !== 'snapshot') {
    return
  }

  const requestId = ++monitor.snapshotRequestId

  try {
    const dataUrl = await window.api.camera.getSnapshot(monitor.stream.channel)

    if (requestId !== monitor.snapshotRequestId) {
      return
    }

    monitor.snapshotDataUrl = dataUrl
    monitor.snapshotFailureCount = 0
    monitor.loaded = true
    monitor.error = ''
    scheduleSnapshotRefresh(monitor)
  } catch {
    if (requestId !== monitor.snapshotRequestId) {
      return
    }

    monitor.snapshotFailureCount += 1

    if (monitor.snapshotFailureCount >= 3) {
      monitor.error = `${monitor.stream.label} 快照暂时读取失败，正在自动重试。`
    }

    scheduleSnapshotRefresh(monitor)
  }
}

const syncMonitorStreams = (info: CameraInfo): void => {
  for (const monitor of monitors.value) {
    const latestStream = info.streams.find((stream) => stream.channel === monitor.stream.channel)

    if (latestStream) {
      monitor.stream = latestStream
    }
  }
}

const loadCameraInfo = async (): Promise<void> => {
  clearAllSnapshotTimers()
  clearAllFirstFrameTimers()
  stopAllRtspStreams()
  releaseAllMonitorFrames()
  loading.value = true

  try {
    const info = await window.api.camera.getInfo()
    cameraInfo.value = info
    monitors.value = info.streams.map((stream, index) =>
      createMonitor(stream, index, info.rtspTransport)
    )

    if (!info.proxyReady) {
      const error = info.proxyError || '本地视频代理未启动。'
      monitors.value.forEach((monitor) => {
        monitor.error = error
      })
      return
    }

    if (info.streamMode === 'snapshot') {
      await Promise.all(monitors.value.map((monitor) => loadSnapshotFrame(monitor)))
      return
    }

    const timestamp = Date.now()
    monitors.value.forEach((monitor, index) => {
      monitor.key = timestamp + index
      monitor.loaded = false
      monitor.error = ''
      monitor.reconnecting = false
      monitor.reconnectCount = 0
      monitor.currentTransport = normalizeTransport(info.rtspTransport)
      monitor.connectionStartedAt = Date.now()
      void startMonitorRtspStream(monitor)
    })
  } catch {
    monitors.value = []
  } finally {
    loading.value = false
  }
}

const refreshStream = async (): Promise<void> => {
  await loadCameraInfo()
}

const handleStreamLoad = (monitor: MonitorView): void => {
  markMonitorLoaded(monitor)
  monitor.reconnectCount = 0
  scheduleSnapshotRefresh(monitor)
}

const wait = (delay: number): Promise<void> => {
  return new Promise((resolve) => window.setTimeout(resolve, delay))
}

const loadLatestCameraDiagnostic = async (monitor: MonitorView): Promise<string> => {
  for (const delay of [150, 500, 1000]) {
    await wait(delay)

    const latestInfo = await window.api.camera.getInfo()
    cameraInfo.value = latestInfo
    syncMonitorStreams(latestInfo)

    const latestStream = latestInfo.streams.find(
      (stream) => stream.channel === monitor.stream.channel
    )

    if (latestStream?.streamError) {
      return latestStream.streamError
    }
  }

  return ''
}

const handleStreamError = async (monitor: MonitorView): Promise<void> => {
  if (cameraInfo.value?.streamMode === 'snapshot') {
    scheduleSnapshotRefresh(monitor)
    return
  }

  revokeMonitorFrame(monitor)
  await handleRtspStreamFailure(monitor, new Error('视频帧解码失败。'))
}

const thermalPattern = /红外|热|thermal|infrared/i

const thermalMonitor = computed(
  () =>
    monitors.value.find(
      (monitor) =>
        thermalPattern.test(monitor.stream.label) ||
        thermalPattern.test(monitor.stream.id) ||
        thermalPattern.test(monitor.stream.channel)
    ) ??
    monitors.value[1] ??
    monitors.value[0] ??
    null
)

const mainMonitor = computed(
  () =>
    monitors.value.find((monitor) => monitor !== thermalMonitor.value) ?? monitors.value[0] ?? null
)

const monitorStatusClass = (monitor: MonitorView): string => {
  const type = getMonitorStatusType(monitor)

  if (type === 'success') {
    return 'border-emerald-400/60 bg-emerald-400/10 text-emerald-200'
  }

  if (type === 'danger') {
    return 'border-rose-400/60 bg-rose-500/10 text-rose-200'
  }

  if (type === 'warning') {
    return 'border-amber-300/60 bg-amber-400/10 text-amber-200'
  }

  return 'border-cyan-300/60 bg-cyan-400/10 text-cyan-100'
}

onMounted(() => {
  void loadCameraInfo()
})

onBeforeUnmount(() => {
  for (const monitor of monitors.value) {
    monitor.snapshotRequestId += 1
  }

  clearAllSnapshotTimers()
  clearAllFirstFrameTimers()
  stopAllRtspStreams()
  releaseAllMonitorFrames()
})
</script>

<template>
  <section class="grid min-h-0 grid-rows-[58fr_42fr] gap-[0.8vh]">
    <section class="tech-panel min-h-0">
      <header class="panel-heading">
        <span class="panel-heading__icon">
          <el-icon>
            <VideoCamera />
          </el-icon>
        </span>
        <h2>实时视频监控</h2>
        <span
          v-if="mainMonitor"
          class="ml-2 rounded-[0.3rem] border px-2 py-1 text-xs font-semibold"
          :class="monitorStatusClass(mainMonitor)"
        >
          {{ getMonitorStatusText(mainMonitor) }}
        </span>
        <button
          class="app-no-drag ml-auto inline-flex h-8 items-center gap-1 rounded-[0.35rem] border border-cyan-300/35 bg-cyan-400/10 px-3 text-xs font-semibold text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/15"
          type="button"
          @click="refreshStream"
        >
          <el-icon :class="{ 'is-loading': loading }">
            <RefreshRight />
          </el-icon>
          刷新
        </button>
      </header>

      <div class="panel-body min-h-0">
        <div class="monitor-frame h-full">
          <template v-if="mainMonitor">
            <img
              v-if="getMonitorStreamUrl(mainMonitor)"
              :key="`${mainMonitor.stream.id}-${mainMonitor.key}`"
              class="monitor-frame__image"
              :src="getMonitorStreamUrl(mainMonitor)"
              :alt="`${mainMonitor.stream.label}实时画面`"
              @load="handleStreamLoad(mainMonitor)"
              @error="handleStreamError(mainMonitor)"
            />

            <div
              v-if="
                loading ||
                (!mainMonitor.loaded && !mainMonitor.error && hasMonitorVideoSource(mainMonitor))
              "
              class="monitor-empty"
            >
              <el-icon class="text-4xl text-cyan-200">
                <Monitor />
              </el-icon>
              <p>
                {{
                  mainMonitor.reconnecting
                    ? `正在重新连接 ${mainMonitor.stream.label}`
                    : `正在连接 ${cameraInfo?.host ?? '本地视频代理'}`
                }}
              </p>
            </div>

            <div
              v-if="mainMonitor.error || !hasMonitorVideoSource(mainMonitor)"
              class="monitor-empty"
            >
              <el-icon class="text-4xl text-amber-200">
                <WarningFilled />
              </el-icon>
              <p>{{ mainMonitor.error || '等待本地视频代理启动。' }}</p>
              <span>{{ getMonitorActiveStreamPath(mainMonitor) }}</span>
            </div>
          </template>

          <div v-else class="monitor-empty">
            <el-icon class="text-4xl text-cyan-200">
              <VideoCamera />
            </el-icon>
            <p>等待视频通道初始化</p>
          </div>
        </div>
      </div>
    </section>

    <section class="tech-panel min-h-0">
      <header class="panel-heading">
        <span class="panel-heading__icon">
          <el-icon>
            <Monitor />
          </el-icon>
        </span>
        <h2>热成像监测</h2>
        <span
          v-if="thermalMonitor"
          class="ml-2 rounded-[0.3rem] border px-2 py-1 text-xs font-semibold"
          :class="monitorStatusClass(thermalMonitor)"
        >
          {{ getMonitorStatusText(thermalMonitor) }}
        </span>
      </header>

      <div class="panel-body min-h-0">
        <div class="monitor-frame monitor-frame--thermal h-full">
          <template v-if="thermalMonitor">
            <img
              v-if="getMonitorStreamUrl(thermalMonitor)"
              :key="`${thermalMonitor.stream.id}-${thermalMonitor.key}`"
              class="monitor-frame__image monitor-frame__image--thermal"
              :src="getMonitorStreamUrl(thermalMonitor)"
              :alt="`${thermalMonitor.stream.label}热成像画面`"
              @load="handleStreamLoad(thermalMonitor)"
              @error="handleStreamError(thermalMonitor)"
            />

            <div
              v-if="
                loading ||
                (!thermalMonitor.loaded &&
                  !thermalMonitor.error &&
                  hasMonitorVideoSource(thermalMonitor))
              "
              class="monitor-empty"
            >
              <el-icon class="text-4xl text-cyan-200">
                <Monitor />
              </el-icon>
              <p>
                {{
                  thermalMonitor.reconnecting
                    ? `正在重新连接 ${thermalMonitor.stream.label}`
                    : `正在连接 ${cameraInfo?.host ?? '本地视频代理'}`
                }}
              </p>
            </div>

            <div
              v-if="thermalMonitor.error || !hasMonitorVideoSource(thermalMonitor)"
              class="monitor-empty"
            >
              <el-icon class="text-4xl text-amber-200">
                <WarningFilled />
              </el-icon>
              <p>{{ thermalMonitor.error || '等待热成像视频代理启动。' }}</p>
              <span>{{ getMonitorActiveStreamPath(thermalMonitor) }}</span>
            </div>
          </template>

          <div v-else class="monitor-empty">
            <el-icon class="text-4xl text-cyan-200">
              <Monitor />
            </el-icon>
            <p>等待热成像通道初始化</p>
          </div>
        </div>
      </div>
    </section>
  </section>
</template>
