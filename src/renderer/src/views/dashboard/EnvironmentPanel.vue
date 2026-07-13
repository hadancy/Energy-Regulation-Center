<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Component, ComponentPublicInstance } from 'vue'
import { ElMessage } from 'element-plus'
import {
  MostlyCloudy,
  Odometer,
  Opportunity,
  Pouring,
  Sunrise,
  Sunny,
  Van,
  WindPower
} from '@element-plus/icons-vue'

type PlcState = Awaited<ReturnType<typeof window.api.plc.getState>>
type WeatherRecord = Awaited<ReturnType<typeof window.api.weather.forecast>>[number]

interface EnvironmentMetric {
  label: string
  value?: string
  unit?: string
  icon: Component
  tone: string
  variant?: 'sunRange'
  sunrise?: string
  sunset?: string
  editable?: boolean
}

const props = defineProps<{
  formattedTime: string
  selectedWeatherRecord: WeatherRecord | null
}>()

const plcState = ref<PlcState | null>(null)
const trafficInputRef = ref<HTMLInputElement | null>(null)
const trafficInput = ref('')
const isTrafficEditing = ref(false)
const isTrafficWriting = ref(false)
let trafficCommitStarted = false

let unsubscribePlcUpdate: (() => void) | null = null

const formatDecimal = (value?: number | null): string => {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '暂无'
}

const formatInteger = (value?: number | null): string => {
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value)) : '暂无'
}

const formatTimestamp = (timestamp?: number): string => {
  if (!timestamp) {
    return '暂无'
  }

  const date = new Date(timestamp)
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')

  return `${hour}:${minute}:${second}`
}

const plcValues = computed(() => plcState.value?.values)
const latestUpdateText = computed(() => formatTimestamp(plcState.value?.lastUpdatedTimestamp))
const temperatureText = computed(() => formatDecimal(plcValues.value?.temperature))
const humidityText = computed(() => formatDecimal(plcValues.value?.humidity))
const windSpeedText = computed(() => formatDecimal(plcValues.value?.windSpeed))
const illuminanceText = computed(() => formatInteger(plcValues.value?.illuminance))
const trafficText = computed(() => formatInteger(getSuccessfulReadingValue('traffic', '车流量')))
const weatherText = computed(() => props.selectedWeatherRecord?.weather || '暂无')
const sunriseText = computed(() => props.selectedWeatherRecord?.sunrise || '暂无')
const sunsetText = computed(() => props.selectedWeatherRecord?.sunset || '暂无')

function getSuccessfulReadingValue(pointId: string, pointName: string): number | null {
  const reading = plcState.value?.readings.find((item) => {
    return item.status === 'success' && (item.pointId === pointId || item.name === pointName)
  })

  return typeof reading?.value === 'number' && Number.isFinite(reading.value) ? reading.value : null
}

const environmentMetrics = computed<EnvironmentMetric[]>(() => [
  {
    label: '风速',
    value: windSpeedText.value,
    unit: 'm/s',
    icon: WindPower,
    tone: 'text-cyan-200'
  },
  {
    label: '光照度',
    value: illuminanceText.value,
    unit: 'Lux',
    icon: Sunny,
    tone: 'text-amber-200'
  },
  { label: '空气质量', value: '良好', unit: '', icon: Opportunity, tone: 'text-emerald-300' },
  {
    label: '车流量',
    value: trafficText.value,
    unit: 'VPM',
    icon: Van,
    tone: 'text-cyan-200',
    editable: true
  },
  { label: '天气', value: weatherText.value, unit: '', icon: MostlyCloudy, tone: 'text-sky-200' },
  {
    label: '日出日落',
    icon: Sunrise,
    tone: 'text-amber-200',
    variant: 'sunRange',
    sunrise: sunriseText.value,
    sunset: sunsetText.value
  }
])

const getErrorMessage = (error: unknown, fallback: string): string => {
  return error instanceof Error && error.message ? error.message : fallback
}

const startTrafficEdit = async (): Promise<void> => {
  if (isTrafficWriting.value) {
    return
  }

  const currentValue = getSuccessfulReadingValue('traffic', '车流量')
  trafficInput.value = currentValue === null ? '' : String(Math.round(currentValue))
  isTrafficEditing.value = true

  await nextTick()
  trafficInputRef.value?.focus()
  trafficInputRef.value?.select()
}

const handleMetricDoubleClick = (metric: EnvironmentMetric): void => {
  if (metric.editable) {
    void startTrafficEdit()
  }
}

const setTrafficInputRef = (element: Element | ComponentPublicInstance | null): void => {
  trafficInputRef.value = element instanceof HTMLInputElement ? element : null
}

const sanitizeTrafficInput = (event: Event): void => {
  const input = event.target as HTMLInputElement
  const sanitizedValue = input.value.replace(/\D/g, '').slice(0, 5)

  trafficInput.value = sanitizedValue
  input.value = sanitizedValue
}

const submitTrafficValue = async (): Promise<void> => {
  if (!isTrafficEditing.value || trafficCommitStarted || isTrafficWriting.value) {
    return
  }

  trafficCommitStarted = true
  const inputText = trafficInput.value.trim()
  const traffic = Number(inputText)

  if (!/^\d+$/.test(inputText) || !Number.isSafeInteger(traffic) || traffic > 0xffff) {
    isTrafficEditing.value = false
    trafficCommitStarted = false
    ElMessage.warning('车流量必须是 0 到 65535 之间的阿拉伯数字整数')
    return
  }

  isTrafficEditing.value = false
  isTrafficWriting.value = true

  try {
    const result = await window.api.plc.writeTraffic(traffic)

    if (!result.ok) {
      ElMessage.error(result.error || result.statusText || '车流量写入失败')
    }
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '车流量写入失败'))
  } finally {
    isTrafficWriting.value = false
    trafficCommitStarted = false
  }
}

const loadPlcState = async (): Promise<void> => {
  try {
    plcState.value = await window.api.plc.getState()
  } catch (error) {
    console.error(error)
  }
}

onMounted(async () => {
  unsubscribePlcUpdate = window.api.plc.onUpdate((state) => {
    plcState.value = state
  })

  try {
    plcState.value = await window.api.plc.startPolling()
  } catch (error) {
    console.error(error)
    void loadPlcState()
  }
})

onBeforeUnmount(() => {
  unsubscribePlcUpdate?.()
  unsubscribePlcUpdate = null
  void window.api.plc.stopPolling()
})
</script>

<template>
  <section class="tech-panel min-h-0">
    <header class="panel-heading">
      <span class="panel-heading__icon environment-heading__icon">
        <el-icon>
          <Odometer />
        </el-icon>
      </span>
      <h2>当前环境</h2>
      <div class="ml-auto flex min-w-0 items-center gap-2 text-xs">
        <span class="whitespace-nowrap text-slate-300/65">更新时间：{{ latestUpdateText }}</span>
      </div>
    </header>

    <div class="panel-body grid min-h-0 grid-rows-[auto_1fr] gap-[1.2vh]">
      <div class="environment-highlight-grid grid grid-cols-2 gap-[0.7vw]">
        <div class="highlight-metric">
          <el-icon class="highlight-metric__icon text-cyan-300">
            <Odometer />
          </el-icon>
          <div class="highlight-metric__content">
            <strong>{{ temperatureText }}<span v-if="temperatureText !== '暂无'">℃</span></strong>
            <p>实时温度</p>
          </div>
        </div>
        <div class="highlight-metric">
          <el-icon class="highlight-metric__icon text-cyan-300">
            <Pouring />
          </el-icon>
          <div class="highlight-metric__content">
            <strong>{{ humidityText }}<span v-if="humidityText !== '暂无'">%</span></strong>
            <p>实时湿度</p>
          </div>
        </div>
      </div>

      <div class="grid min-h-0 grid-cols-3 grid-rows-2 gap-[0.6vw]">
        <div
          v-for="metric in environmentMetrics"
          :key="metric.label"
          class="metric-tile"
          :class="{
            'metric-tile--sun-range': metric.variant === 'sunRange',
            'metric-tile--editable app-no-drag': metric.editable,
            'metric-tile--writing': metric.editable && isTrafficWriting
          }"
          :title="metric.editable ? '双击修改车流量' : undefined"
          @dblclick.stop.prevent="handleMetricDoubleClick(metric)"
        >
          <div class="metric-tile__top">
            <el-icon class="metric-tile__icon" :class="metric.tone">
              <component :is="metric.icon" />
            </el-icon>
            <div class="metric-tile__label">{{ metric.label }}</div>
          </div>
          <div v-if="metric.editable && isTrafficEditing" class="traffic-editor">
            <input
              :ref="setTrafficInputRef"
              v-model="trafficInput"
              class="traffic-editor__input"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="5"
              autocomplete="off"
              aria-label="车流量"
              @input="sanitizeTrafficInput"
              @keydown.enter.prevent="submitTrafficValue"
              @blur="submitTrafficValue"
            />
            <span>VPM</span>
          </div>
          <div v-if="metric.variant === 'sunRange'" class="sun-range">
            <div class="sun-range__item">
              <span class="sun-range__label">日出</span>
              <strong class="sun-range__time text-amber-200">{{ metric.sunrise }}</strong>
            </div>
            <div class="sun-range__item sun-range__item--sunset">
              <span class="sun-range__label">日落</span>
              <strong class="sun-range__time text-sky-100">{{ metric.sunset }}</strong>
            </div>
          </div>
          <template v-else-if="!metric.editable || !isTrafficEditing">
            <strong :class="metric.tone">{{ metric.value }}</strong>
            <span>{{ metric.editable && isTrafficWriting ? '写入中…' : metric.unit }}</span>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.metric-tile--editable {
  cursor: text;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.metric-tile--editable:hover,
.metric-tile--editable:focus-within {
  border-color: rgba(34, 211, 238, 0.52);
  box-shadow:
    inset 0 0 1rem rgba(14, 165, 233, 0.12),
    0 0 0.65rem rgba(34, 211, 238, 0.12);
}

.metric-tile--writing {
  cursor: wait;
}

.traffic-editor {
  display: flex;
  width: min(100%, 8.8rem);
  align-items: center;
  justify-content: center;
  gap: 0.38rem;
}

.traffic-editor__input {
  width: min(100%, 6.4rem);
  min-width: 0;
  padding: 0.24rem 0.35rem;
  border: 1px solid rgba(34, 211, 238, 0.72);
  border-radius: 0.25rem;
  outline: none;
  color: #a5f3fc;
  background: rgba(2, 8, 23, 0.72);
  box-shadow:
    inset 0 0 0.55rem rgba(14, 165, 233, 0.16),
    0 0 0.45rem rgba(34, 211, 238, 0.2);
  font:
    800 clamp(1.1rem, 1.3vw, 1.65rem) / 1.1 ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;
  text-align: center;
}

.traffic-editor__input:focus {
  border-color: #67e8f9;
  box-shadow:
    inset 0 0 0.6rem rgba(14, 165, 233, 0.2),
    0 0 0.65rem rgba(34, 211, 238, 0.34);
}
</style>
