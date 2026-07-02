<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Component } from 'vue'
import {
  Aim,
  Compass,
  DataLine,
  Odometer,
  Opportunity,
  Pouring,
  Sunny,
  WindPower
} from '@element-plus/icons-vue'

type PlcState = Awaited<ReturnType<typeof window.api.plc.getState>>

interface EnvironmentMetric {
  label: string
  value: string
  unit: string
  icon: Component
  tone: string
}

defineProps<{
  formattedTime: string
}>()

const plcState = ref<PlcState | null>(null)
const plcLoadError = ref('')

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
const plcStatusText = computed(() => {
  if (plcLoadError.value) {
    return 'PLC连接异常'
  }

  return plcState.value?.statusText ?? 'PLC连接中'
})
const plcStatusTone = computed(() => {
  if (plcState.value?.status === 'connected') {
    return 'border-emerald-300/45 bg-emerald-400/12 text-emerald-200'
  }

  if (plcState.value?.status === 'connecting') {
    return 'border-sky-300/45 bg-sky-400/12 text-sky-100'
  }

  return 'border-rose-300/45 bg-rose-400/12 text-rose-100'
})
const latestUpdateText = computed(() => formatTimestamp(plcState.value?.lastUpdatedTimestamp))
const temperatureText = computed(() => formatDecimal(plcValues.value?.temperature))
const humidityText = computed(() => formatDecimal(plcValues.value?.humidity))
const windSpeedText = computed(() => formatDecimal(plcValues.value?.windSpeed))
const illuminanceText = computed(() => formatInteger(plcValues.value?.illuminance))

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
  { label: '空气质量', value: '暂无', unit: 'AQI', icon: Opportunity, tone: 'text-emerald-300' },
  { label: 'PM2.5', value: '暂无', unit: 'μg/m³', icon: DataLine, tone: 'text-cyan-200' },
  { label: '风向', value: '暂无', unit: '°', icon: Compass, tone: 'text-sky-200' },
  { label: '紫外线指数', value: '暂无', unit: '', icon: Aim, tone: 'text-amber-200' }
])

const loadPlcState = async (): Promise<void> => {
  try {
    plcState.value = await window.api.plc.getState()
    plcLoadError.value = ''
  } catch (error) {
    plcLoadError.value = error instanceof Error ? error.message : 'PLC连接异常'
  }
}

onMounted(() => {
  unsubscribePlcUpdate = window.api.plc.onUpdate((state) => {
    plcState.value = state
    plcLoadError.value = ''
  })
  void loadPlcState()
})

onBeforeUnmount(() => {
  unsubscribePlcUpdate?.()
  unsubscribePlcUpdate = null
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
        <span
          class="inline-flex max-w-[7.4rem] items-center justify-center truncate rounded-sm border px-2 py-1 font-semibold"
          :class="plcStatusTone"
          >{{ plcStatusText }}</span
        >
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
            <p>传感器温度</p>
          </div>
        </div>
        <div class="highlight-metric">
          <el-icon class="highlight-metric__icon text-cyan-300">
            <Pouring />
          </el-icon>
          <div class="highlight-metric__content">
            <strong>{{ humidityText }}<span v-if="humidityText !== '暂无'">%</span></strong>
            <p>传感器湿度</p>
          </div>
        </div>
      </div>

      <div class="grid min-h-0 grid-cols-3 grid-rows-2 gap-[0.6vw]">
        <div v-for="metric in environmentMetrics" :key="metric.label" class="metric-tile">
          <div class="metric-tile__top">
            <el-icon class="metric-tile__icon" :class="metric.tone">
              <component :is="metric.icon" />
            </el-icon>
            <div class="metric-tile__label">{{ metric.label }}</div>
          </div>
          <strong :class="metric.tone">{{ metric.value }}</strong>
          <span>{{ metric.unit }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
