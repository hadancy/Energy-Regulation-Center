<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Component } from 'vue'
import * as echarts from 'echarts'
import {
  Histogram,
  Lightning,
  RefreshRight,
  SwitchButton,
  Tools,
  TrendCharts,
  WindPower
} from '@element-plus/icons-vue'

interface EnergyMetric {
  label: string
  value: string
  unit: string
  sub: string
  icon: Component
  tone: string
  important?: boolean
  maintenance?: boolean
}

interface HourlyForecastChartInput {
  hours: string[]
  values: number[]
  seriesName: string
  color: string
  areaColor: string
}

type WeatherRecord = Awaited<ReturnType<typeof window.api.weather.forecast>>[number]
type PlcState = Awaited<ReturnType<typeof window.api.plc.getState>>
type PlcPointReading = PlcState['readings'][number]

const props = defineProps<{
  selectedWeatherRecord: WeatherRecord | null
}>()

const generationChartRef = ref<HTMLDivElement | null>(null)
const loadChartRef = ref<HTMLDivElement | null>(null)
const plcState = ref<PlcState | null>(null)

let chartResizeTimer: number | null = null
let chartResizeFrame: number | null = null
let maintenanceTimer: number | null = null
let generationChart: ReturnType<typeof echarts.init> | null = null
let loadChart: ReturnType<typeof echarts.init> | null = null
let chartResizeObserver: ResizeObserver | null = null
let unsubscribePlcUpdate: (() => void) | null = null

const maintenanceStorageKey = 'energy-dashboard:last-maintenance-date'

const fallbackHourlyHours = Array.from({ length: 24 }, (_, hour) => {
  return `${String(hour).padStart(2, '0')}:00`
})

const getSuccessfulReading = (pointId: string, pointName: string): PlcPointReading | null => {
  const reading = plcState.value?.readings.find((item) => {
    return item.status === 'success' && (item.pointId === pointId || item.name === pointName)
  })

  return typeof reading?.value === 'number' && Number.isFinite(reading.value) ? reading : null
}

const getSuccessfulReadingValue = (pointId: string, pointName: string): number | null =>
  getSuccessfulReading(pointId, pointName)?.value ?? null

const formatPlcValue = (value: number | null, fractionDigits = 1): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '暂无'
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(fractionDigits)
}

const normalizePowerToKilowatts = (reading: PlcPointReading | null): number => {
  if (!reading || typeof reading.value !== 'number' || !Number.isFinite(reading.value)) {
    return 0
  }

  const power = Math.max(0, reading.value)
  const unit = reading.unit.trim().toLowerCase()

  if (unit === 'w' || unit === '瓦' || unit === '瓦特') {
    return power / 1000
  }

  if (unit === 'mw') {
    return power * 1000
  }

  return power
}

const roundEnergyKwh = (value: number): number => Math.round(value * 1000) / 1000

const getDateKey = (date = new Date()): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const parseDateKey = (dateKey: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)

  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(year, month - 1, day)

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() + 1 !== month ||
    parsed.getDate() !== day
  ) {
    return null
  }

  return parsed
}

const getElapsedMaintenanceDays = (dateKey: string, now: Date): number => {
  const maintenanceDate = parseDateKey(dateKey)

  if (!maintenanceDate) {
    return 180
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const elapsedMs = today.getTime() - maintenanceDate.getTime()

  return Math.max(0, Math.floor(elapsedMs / 86400000))
}

const getEnergyYAxisMax = (maxValue: number): number => {
  if (maxValue <= 0) {
    return 1
  }

  const paddedMax = maxValue * 1.15

  if (paddedMax < 1) {
    return Math.max(0.1, Math.ceil(paddedMax * 10) / 10)
  }

  return Math.ceil(paddedMax)
}

const hourlyGenerationKwh = computed(() => props.selectedWeatherRecord?.generationKwh ?? [])
const hourlyEnergyRatios = computed(() => props.selectedWeatherRecord?.energyRatios ?? [])
const lastMaintenanceDate = ref('')
const maintenanceNow = ref(new Date())
const generationHours = computed(() => {
  return hourlyGenerationKwh.value.length > 0
    ? hourlyGenerationKwh.value.map((item) => item.time)
    : fallbackHourlyHours
})
const generationForecastValues = computed(() => {
  if (hourlyGenerationKwh.value.length === 0) {
    return fallbackHourlyHours.map(() => 0)
  }

  return hourlyGenerationKwh.value.map((item) => {
    return roundEnergyKwh(Number.isFinite(item.kwh) ? Math.max(0, item.kwh) : 0)
  })
})
const energyRatioHours = computed(() => {
  return hourlyEnergyRatios.value.length > 0
    ? hourlyEnergyRatios.value.map((item) => item.time)
    : fallbackHourlyHours
})
const totalPowerReading = computed(() => getSuccessfulReading('totalPower', '系统总功率'))
const systemTotalPowerKw = computed(() => normalizePowerToKilowatts(totalPowerReading.value))
const loadForecastValues = computed(() => {
  if (hourlyEnergyRatios.value.length === 0) {
    return fallbackHourlyHours.map(() => 0)
  }

  return hourlyEnergyRatios.value.map((item) => {
    const ratio = Number.isFinite(item.ratio) ? Math.max(0, item.ratio) : 0

    return roundEnergyKwh(systemTotalPowerKw.value * (ratio / 100))
  })
})
const maintenanceElapsedDays = computed(() =>
  getElapsedMaintenanceDays(lastMaintenanceDate.value, maintenanceNow.value)
)
const maintenancePercent = computed(() => {
  const percent = (1 - maintenanceElapsedDays.value / 180) * 100

  return Math.max(0, Math.min(100, percent))
})
const maintenanceSubText = computed(() => {
  if (!lastMaintenanceDate.value) {
    return '未记录维保'
  }

  return `距上次 ${maintenanceElapsedDays.value} 天`
})
const energyMetrics = computed<EnergyMetric[]>(() => [
  {
    label: '储能余量',
    value: formatPlcValue(getSuccessfulReadingValue('socBased', '当前储能容量/额定储能容量')),
    unit: '%',
    sub: 'PLC实时值',
    icon: SwitchButton,
    tone: 'text-emerald-300'
  },
  {
    label: '综合能效',
    value: formatPlcValue(getSuccessfulReadingValue('overallEfficiency', '综合能效')),
    unit: '%',
    sub: '核心效率指标',
    icon: Lightning,
    tone: 'text-cyan-200',
    important: true
  },
  {
    label: '自发自用率',
    value: formatPlcValue(getSuccessfulReadingValue('selfConsumptionRate', '自发自用率')),
    unit: '%',
    sub: 'PLC实时值',
    icon: TrendCharts,
    tone: 'text-sky-200'
  },
  {
    label: '碳减排量',
    value: formatPlcValue(getSuccessfulReadingValue('carbonReduction', '碳减排量')),
    unit: 't',
    sub: '重点低碳指标',
    icon: WindPower,
    tone: 'text-lime-200',
    important: true
  },
  {
    label: '设备维保',
    value: maintenancePercent.value.toFixed(2),
    unit: '%',
    sub: maintenanceSubText.value,
    icon: Tools,
    tone: 'text-amber-200',
    maintenance: true
  }
])

const buildHourlyForecastChartOption = ({
  hours,
  values,
  seriesName,
  color,
  areaColor
}: HourlyForecastChartInput): echarts.EChartsOption => {
  const maxForecast = values.length > 0 ? Math.max(...values) : 0

  return {
    backgroundColor: 'transparent',
    animationDuration: 700,
    color: [color],
    grid: {
      left: 36,
      right: 12,
      top: 30,
      bottom: 24
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(2, 12, 28, 0.92)',
      borderColor: 'rgba(34, 211, 238, 0.45)',
      textStyle: {
        color: '#dff7ff'
      },
      valueFormatter: (value) => `${Number(value).toFixed(3)} kWh`
    },
    legend: {
      top: 0,
      right: 4,
      itemWidth: 16,
      itemHeight: 8,
      textStyle: {
        color: '#9eb9ca',
        fontSize: 10
      },
      data: [seriesName]
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: hours,
      axisLine: {
        lineStyle: {
          color: 'rgba(125, 211, 252, 0.26)'
        }
      },
      axisTick: {
        show: false
      },
      axisLabel: {
        interval: 1,
        color: '#8fb1c7',
        fontSize: 10
      }
    },
    yAxis: {
      type: 'value',
      name: 'kWh',
      min: 0,
      max: getEnergyYAxisMax(maxForecast),
      splitNumber: 4,
      nameTextStyle: {
        color: '#22d3ee',
        fontSize: 10,
        align: 'left'
      },
      axisLabel: {
        color: '#a6c3d3',
        fontSize: 10
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(56, 189, 248, 0.14)',
          type: 'dashed'
        }
      }
    },
    series: [
      {
        name: seriesName,
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: values,
        lineStyle: {
          width: 2,
          color
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: areaColor },
            { offset: 1, color: 'rgba(14, 165, 233, 0.03)' }
          ])
        }
      }
    ],
    media: [
      {
        query: {
          maxWidth: 480
        },
        option: {
          grid: {
            left: 32,
            right: 8,
            top: 27,
            bottom: 22
          },
          legend: {
            right: 0,
            itemWidth: 12,
            textStyle: {
              fontSize: 9
            }
          },
          xAxis: {
            axisLabel: {
              interval: 2,
              fontSize: 9
            }
          },
          yAxis: {
            nameTextStyle: {
              fontSize: 9
            },
            axisLabel: {
              fontSize: 9
            }
          }
        }
      },
      {
        query: {
          maxWidth: 320
        },
        option: {
          xAxis: {
            axisLabel: {
              interval: 3
            }
          }
        }
      }
    ]
  }
}

const updateGenerationForecastChart = (): void => {
  generationChart?.setOption(
    buildHourlyForecastChartOption({
      hours: generationHours.value,
      values: generationForecastValues.value,
      seriesName: '预测发电量',
      color: '#22d3ee',
      areaColor: 'rgba(34, 211, 238, 0.38)'
    }),
    true
  )
}

const updateLoadForecastChart = (): void => {
  loadChart?.setOption(
    buildHourlyForecastChartOption({
      hours: energyRatioHours.value,
      values: loadForecastValues.value,
      seriesName: '预测用电量',
      color: '#38bdf8',
      areaColor: 'rgba(56, 189, 248, 0.38)'
    }),
    true
  )
}

const initCharts = (): void => {
  if (generationChartRef.value) {
    generationChart?.dispose()
    generationChart = echarts.init(generationChartRef.value, undefined, { renderer: 'canvas' })
    updateGenerationForecastChart()
  }

  if (loadChartRef.value) {
    loadChart?.dispose()
    loadChart = echarts.init(loadChartRef.value, undefined, { renderer: 'canvas' })
    updateLoadForecastChart()
  }
}

watch([generationHours, generationForecastValues], () => {
  updateGenerationForecastChart()
})

watch([energyRatioHours, loadForecastValues], () => {
  updateLoadForecastChart()
})

const loadPlcState = async (): Promise<void> => {
  try {
    plcState.value = await window.api.plc.getState()
  } catch (error) {
    console.error(error)
  }
}

const loadMaintenanceState = (): void => {
  lastMaintenanceDate.value = window.localStorage.getItem(maintenanceStorageKey) ?? ''
  maintenanceNow.value = new Date()
}

const handleMaintenanceDone = (): void => {
  const today = getDateKey()

  window.localStorage.setItem(maintenanceStorageKey, today)
  lastMaintenanceDate.value = today
  maintenanceNow.value = new Date()
}

const resizeCharts = (): void => {
  generationChart?.resize()
  loadChart?.resize()
}

const scheduleChartResize = (): void => {
  if (chartResizeFrame !== null) {
    window.cancelAnimationFrame(chartResizeFrame)
  }

  chartResizeFrame = window.requestAnimationFrame(() => {
    chartResizeFrame = null
    resizeCharts()
  })
}

const observeChartContainers = (): void => {
  chartResizeObserver?.disconnect()
  chartResizeObserver = new ResizeObserver(() => {
    scheduleChartResize()
  })

  if (generationChartRef.value) {
    chartResizeObserver.observe(generationChartRef.value)
  }

  if (loadChartRef.value) {
    chartResizeObserver.observe(loadChartRef.value)
  }
}

const handleWindowResize = (): void => {
  if (chartResizeTimer) {
    window.clearTimeout(chartResizeTimer)
  }

  chartResizeTimer = window.setTimeout(() => {
    scheduleChartResize()
  }, 120)
}

const disposeCharts = (): void => {
  generationChart?.dispose()
  loadChart?.dispose()
  generationChart = null
  loadChart = null
}

onMounted(() => {
  unsubscribePlcUpdate = window.api.plc.onUpdate((state) => {
    plcState.value = state
  })
  void loadPlcState()
  loadMaintenanceState()
  maintenanceTimer = window.setInterval(() => {
    maintenanceNow.value = new Date()
  }, 60000)

  void nextTick(() => {
    initCharts()
    observeChartContainers()
    scheduleChartResize()
    window.addEventListener('resize', handleWindowResize)
  })
})

onBeforeUnmount(() => {
  if (chartResizeTimer) {
    window.clearTimeout(chartResizeTimer)
    chartResizeTimer = null
  }

  if (chartResizeFrame !== null) {
    window.cancelAnimationFrame(chartResizeFrame)
    chartResizeFrame = null
  }

  chartResizeObserver?.disconnect()
  chartResizeObserver = null

  if (maintenanceTimer) {
    window.clearInterval(maintenanceTimer)
    maintenanceTimer = null
  }

  window.removeEventListener('resize', handleWindowResize)
  unsubscribePlcUpdate?.()
  unsubscribePlcUpdate = null
  disposeCharts()
})
</script>

<template>
  <section class="tech-panel energy-prediction-panel min-h-0">
    <header class="panel-heading">
      <span class="panel-heading__icon">
        <el-icon>
          <Histogram />
        </el-icon>
      </span>
      <h2>AI能源预测</h2>
    </header>

    <div
      class="panel-body energy-prediction-panel__body grid min-h-0 grid-rows-[minmax(0,0.72fr)_minmax(0,0.72fr)_minmax(6.2rem,1fr)] gap-[0.65vh]"
    >
      <div class="energy-chart-block min-h-0">
        <div class="flex h-full min-h-0 gap-[0.6vw]">
          <div class="flex h-full min-w-0 flex-1 flex-col">
            <h3>24小时发电量预测（kWh）</h3>
            <div ref="generationChartRef" class="min-h-0 flex-1 w-full" />
          </div>
        </div>
      </div>

      <div class="energy-chart-block min-h-0">
        <div class="flex h-full min-h-0 gap-[0.6vw]">
          <div class="flex h-full min-w-0 flex-1 flex-col">
            <h3>24小时用电量预测（kWh）</h3>
            <div ref="loadChartRef" class="min-h-0 flex-1 w-full" />
          </div>
        </div>
      </div>

      <div class="energy-metric-grid">
        <article
          v-for="item in energyMetrics"
          :key="item.label"
          class="kpi-tile energy-metric-tile"
          :class="{
            'energy-metric-tile--important': item.important,
            'energy-metric-tile--maintenance': item.maintenance
          }"
        >
          <el-icon class="energy-metric-tile__icon" :class="item.tone">
            <component :is="item.icon" />
          </el-icon>
          <div class="energy-metric-tile__content">
            <p>{{ item.label }}</p>
            <strong
              >{{ item.value }}<span>{{ item.unit }}</span></strong
            >
            <em>{{ item.sub }}</em>
          </div>
          <button
            v-if="item.maintenance"
            class="maintenance-reset-button"
            type="button"
            @click="handleMaintenanceDone"
          >
            <el-icon>
              <RefreshRight />
            </el-icon>
            <span>已维保</span>
          </button>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.energy-prediction-panel {
  width: 100%;
  min-width: 0;
  container-name: energy-prediction;
  container-type: inline-size;
}

.energy-prediction-panel__body {
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.energy-metric-grid {
  display: grid;
  width: 100%;
  min-height: 0;
  min-width: 0;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 0.45vw;
  overflow: hidden;
}

.energy-metric-tile {
  position: relative;
  min-height: 0;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: clamp(0.12rem, 0.28vh, 0.24rem);
  overflow: hidden;
  padding: clamp(0.42rem, 0.76vh, 0.72rem) clamp(0.42rem, 0.56vw, 0.72rem);
}

.energy-metric-tile::before {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: '';
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.1), transparent 54%);
  opacity: 0.45;
}

.energy-metric-tile--important {
  grid-column: span 2;
  flex-direction: row;
  align-items: center;
  gap: clamp(0.5rem, 0.65vw, 0.85rem);
  border-color: rgba(103, 232, 249, 0.28);
  background: linear-gradient(135deg, rgba(8, 47, 73, 0.78), rgba(3, 28, 51, 0.58));
  box-shadow:
    inset 0 0 1.15rem rgba(34, 211, 238, 0.11),
    0 0 1rem rgba(14, 165, 233, 0.12);
}

.energy-metric-tile--maintenance {
  grid-column: span 2;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: clamp(0.45rem, 0.62vw, 0.85rem);
}

.energy-metric-tile__icon {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  font-size: clamp(1.1rem, 1.25vw, 1.55rem);
  filter: drop-shadow(0 0 0.35rem rgba(34, 211, 238, 0.34));
}

.energy-metric-tile--important .energy-metric-tile__icon {
  font-size: clamp(1.65rem, 1.85vw, 2.25rem);
}

.energy-metric-tile__content {
  position: relative;
  z-index: 1;
  min-width: 0;
}

.energy-metric-tile--maintenance .energy-metric-tile__content {
  flex: 1 1 auto;
  min-width: 0;
}

.energy-metric-tile p,
.energy-metric-tile strong,
.energy-metric-tile em {
  max-width: 100%;
  white-space: nowrap;
}

.energy-metric-tile p {
  overflow: hidden;
  text-overflow: ellipsis;
}

.energy-metric-tile strong {
  font-size: clamp(1.05rem, 1.15vw, 1.32rem);
}

.energy-metric-tile strong span {
  font-size: clamp(0.58rem, 0.62vw, 0.72rem);
}

.energy-metric-tile em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.energy-metric-tile--important strong {
  font-size: clamp(1.32rem, 1.45vw, 1.78rem);
}

.maintenance-reset-button {
  position: relative;
  z-index: 1;
  display: inline-flex;
  width: clamp(4.2rem, 4.8vw, 5.4rem);
  height: clamp(1.65rem, 2.45vh, 2.05rem);
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  border: 1px solid rgba(251, 191, 36, 0.35);
  border-radius: 0.28rem;
  color: #fde68a;
  background: rgba(245, 158, 11, 0.1);
  font-size: 0.74rem;
  font-weight: 800;
  line-height: 1;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.maintenance-reset-button:hover {
  border-color: rgba(251, 191, 36, 0.65);
  color: #fef3c7;
  background: rgba(245, 158, 11, 0.18);
}

.maintenance-reset-button .el-icon {
  font-size: 0.88rem;
}

@container energy-prediction (max-width: 460px) {
  .energy-prediction-panel__body {
    grid-template-rows: minmax(0, 0.68fr) minmax(0, 0.68fr) minmax(9.25rem, 1.5fr);
  }

  .energy-metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(3, minmax(0, 1fr));
    gap: clamp(0.25rem, 1.5cqw, 0.42rem);
  }

  .energy-metric-tile,
  .energy-metric-tile--important {
    grid-column: span 1;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: clamp(0.28rem, 1.5cqw, 0.5rem);
    padding: clamp(0.3rem, 1.5cqw, 0.5rem);
  }

  .energy-metric-tile--maintenance {
    grid-column: 1 / -1;
    justify-content: space-between;
  }

  .energy-metric-tile__icon,
  .energy-metric-tile--important .energy-metric-tile__icon {
    font-size: clamp(1.05rem, 6cqw, 1.45rem);
  }

  .energy-metric-tile strong,
  .energy-metric-tile--important strong {
    font-size: clamp(1rem, 5.6cqw, 1.3rem);
  }

  .energy-metric-tile p,
  .energy-metric-tile em {
    font-size: clamp(0.62rem, 3.3cqw, 0.72rem);
  }

  .energy-chart-block {
    padding: clamp(0.22rem, 1.2cqw, 0.4rem);
  }

  .energy-chart-block h3 {
    overflow: hidden;
    font-size: clamp(0.72rem, 4cqw, 0.86rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@container energy-prediction (max-width: 270px) {
  .maintenance-reset-button {
    width: 2rem;
    padding: 0;
  }

  .maintenance-reset-button span {
    display: none;
  }
}
</style>
