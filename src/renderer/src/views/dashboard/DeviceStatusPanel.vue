<script setup lang="ts">
import type { Component } from 'vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElNotification } from 'element-plus'
import { Cpu, DataAnalysis, Lightning, SwitchButton, Watermelon } from '@element-plus/icons-vue'

type DeviceStatus = '正常' | '关注' | '预警'
type DeviceTone = 'success' | 'warning' | 'danger'
type PlcState = Awaited<ReturnType<typeof window.api.plc.getState>>

interface DevicePrediction {
  name: string
  code: string
  valueText: string
  meterValue: number
  unit: string
  thresholdText: string
  lowThresholdText: string
  status: DeviceStatus
  tone: DeviceTone
  icon: Component
}

const plcState = ref<PlcState | null>(null)
const SOC_WARNING_THRESHOLD = 45
const SOC_DANGER_THRESHOLD = 30

let unsubscribePlcUpdate: (() => void) | null = null
let socLowNotification: ReturnType<typeof ElNotification.warning> | null = null
let socAlertLevel: 'warning' | 'danger' | null = null

const clampPercent = (value: number): number => Math.min(100, Math.max(0, value))

const formatInteger = (value: number | null): string => {
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value)) : '暂无'
}

const getReadingValue = (pointId: string, pointName: string): number | null => {
  const reading = plcState.value?.readings.find((item) => {
    return item.status === 'success' && (item.pointId === pointId || item.name === pointName)
  })

  return typeof reading?.value === 'number' && Number.isFinite(reading.value)
    ? Math.round(reading.value)
    : null
}

const getNumericStatus = (
  value: number | null,
  normalThreshold: number,
  warningThreshold: number
): DeviceStatus => {
  if (value === null) {
    return '关注'
  }

  if (value >= normalThreshold) {
    return '正常'
  }

  return value >= warningThreshold ? '关注' : '预警'
}

const getBatteryStatus = (value: number | null): DeviceStatus => {
  if (value === null) {
    return '关注'
  }

  if (value >= 100) {
    return '正常'
  }

  return value > 75 ? '关注' : '预警'
}

const getSocStatus = (value: number | null): DeviceStatus => {
  if (value === null) {
    return '关注'
  }

  if (value > SOC_WARNING_THRESHOLD) {
    return '正常'
  }

  return value >= SOC_DANGER_THRESHOLD ? '关注' : '预警'
}

const getTone = (status: DeviceStatus): DeviceTone => {
  if (status === '正常') {
    return 'success'
  }

  return status === '关注' ? 'warning' : 'danger'
}

const totalSoc = computed(() => getReadingValue('socTotal', '总SOC值'))

const devicePredictions = computed<DevicePrediction[]>(() => {
  const socTotal = totalSoc.value
  const renewableVoltage = getReadingValue('renewableEnergyVoltage', '新能源电压')
  const phsStatusValue = getReadingValue('phsStatus', '蓄水储能状态')
  const bessStatusValue = getReadingValue('bessStatus', '储能电池状态')
  const socStatus = getSocStatus(socTotal)
  const voltageStatus = getNumericStatus(renewableVoltage, 95, 90)
  const phsStatus = getNumericStatus(phsStatusValue, 75, 50)
  const bessStatus = getBatteryStatus(bessStatusValue)

  return [
    {
      name: '总SOC值',
      code: 'PLC SOC Total',
      valueText: formatInteger(socTotal),
      meterValue: socTotal === null ? 0 : clampPercent(socTotal),
      unit: '%',
      thresholdText: `${SOC_WARNING_THRESHOLD}%`,
      lowThresholdText: `${SOC_DANGER_THRESHOLD}%`,
      status: socStatus,
      tone: getTone(socStatus),
      icon: DataAnalysis
    },
    {
      name: '新能源电压',
      code: 'Renewable Energy Voltage',
      valueText: formatInteger(renewableVoltage),
      meterValue: renewableVoltage === null ? 0 : clampPercent(renewableVoltage),
      unit: '%',
      thresholdText: '95%',
      lowThresholdText: '90%',
      status: voltageStatus,
      tone: getTone(voltageStatus),
      icon: Lightning
    },
    {
      name: '蓄水储能状态',
      code: 'PHS Status Code',
      valueText: formatInteger(phsStatusValue),
      meterValue: phsStatusValue === null ? 0 : clampPercent(phsStatusValue),
      unit: '%',
      thresholdText: '75%',
      lowThresholdText: '50%',
      status: phsStatus,
      tone: getTone(phsStatus),
      icon: Watermelon
    },
    {
      name: '储能电池',
      code: 'BESS Status Code',
      valueText: formatInteger(bessStatusValue),
      meterValue: bessStatusValue === null ? 0 : clampPercent(bessStatusValue),
      unit: '%',
      thresholdText: '100%',
      lowThresholdText: '75%',
      status: bessStatus,
      tone: getTone(bessStatus),
      icon: SwitchButton
    }
  ]
})

const activeIssueCount = computed(
  () => devicePredictions.value.filter((device) => device.status !== '正常').length
)

watch(totalSoc, (value) => {
  if (value === null) {
    return
  }

  if (value > SOC_WARNING_THRESHOLD) {
    socLowNotification?.close()
    socLowNotification = null
    socAlertLevel = null
    return
  }

  const nextAlertLevel = value < SOC_DANGER_THRESHOLD ? 'danger' : 'warning'
  if (socLowNotification && socAlertLevel === nextAlertLevel) {
    return
  }

  socLowNotification?.close()
  socAlertLevel = nextAlertLevel
  socLowNotification = ElNotification({
    title: 'SOC不足',
    message:
      nextAlertLevel === 'danger'
        ? `当前总SOC值为 ${value}%，低于 ${SOC_DANGER_THRESHOLD}%红色警戒线`
        : `当前总SOC值为 ${value}%，已达到或低于 ${SOC_WARNING_THRESHOLD}%黄色提醒线`,
    type: nextAlertLevel === 'danger' ? 'error' : 'warning',
    position: 'top-right',
    duration: 0,
    showClose: true,
    customClass: 'app-no-drag'
  })
})

const loadPlcState = async (): Promise<void> => {
  try {
    plcState.value = await window.api.plc.getState()
  } catch (error) {
    console.error(error)
  }
}

const statusBadgeClass = (status: DeviceStatus): string => {
  if (status === '正常') {
    return 'border-emerald-300/70 bg-emerald-400/10 text-emerald-200 shadow-[0_0_1rem_rgba(52,211,153,0.28)]'
  }

  if (status === '关注') {
    return 'border-amber-300/70 bg-amber-400/10 text-amber-200 shadow-[0_0_1rem_rgba(251,191,36,0.22)]'
  }

  return 'border-rose-300/80 bg-rose-500/10 text-rose-200 shadow-[0_0_1rem_rgba(251,113,133,0.28)]'
}

const toneClass = (tone: DeviceTone): string => {
  if (tone === 'success') {
    return 'device-card--success'
  }

  if (tone === 'warning') {
    return 'device-card--warning'
  }

  return 'device-card--danger'
}

onMounted(() => {
  unsubscribePlcUpdate = window.api.plc.onUpdate((state) => {
    plcState.value = state
  })
  void loadPlcState()
})

onBeforeUnmount(() => {
  unsubscribePlcUpdate?.()
  unsubscribePlcUpdate = null
  socLowNotification?.close()
  socLowNotification = null
  socAlertLevel = null
})
</script>

<template>
  <section class="tech-panel min-h-0">
    <header class="panel-heading">
      <span class="panel-heading__icon">
        <el-icon>
          <Cpu />
        </el-icon>
      </span>
      <h2>AI设备状态预测</h2>
      <div class="prediction-heading-meta">
        <span>PLC实时值</span>
        <strong>{{ activeIssueCount }}</strong>
        <span>项异常</span>
      </div>
    </header>

    <div class="panel-body device-prediction-panel min-h-0 overflow-hidden">
      <div class="prediction-device-grid">
        <article
          v-for="device in devicePredictions"
          :key="device.code"
          class="prediction-device-card"
          :class="toneClass(device.tone)"
        >
          <div class="prediction-device-card__top">
            <span class="device-icon">
              <el-icon>
                <component :is="device.icon" />
              </el-icon>
            </span>
            <div class="min-w-0">
              <p>{{ device.name }}</p>
            </div>
            <span class="prediction-status" :class="statusBadgeClass(device.status)">
              {{ device.status }}
            </span>
          </div>

          <div class="prediction-device-card__metric">
            <span>当前状态</span>
            <strong
              >{{ device.valueText }}<small>{{ device.unit }}</small></strong
            >
          </div>

          <div class="threshold-meter" aria-hidden="true">
            <div class="threshold-meter__track">
              <span class="threshold-meter__fill" :style="{ width: `${device.meterValue}%` }" />
              <span class="threshold-meter__mark threshold-meter__mark--low" />
              <span class="threshold-meter__mark threshold-meter__mark--high" />
            </div>
            <div class="threshold-meter__labels">
              <span>低 {{ device.lowThresholdText }}</span>
              <span>阈 {{ device.thresholdText }}</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.prediction-heading-meta {
  position: relative;
  z-index: 1;
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 0.28rem;
  margin-left: auto;
  padding: 0.28rem 0.52rem;
  border: 1px solid rgba(34, 211, 238, 0.22);
  border-radius: 0.26rem;
  color: rgba(203, 213, 225, 0.72);
  font-size: clamp(0.62rem, 0.64vw, 0.78rem);
  font-weight: 700;
  line-height: 1;
  background: rgba(2, 8, 23, 0.42);
}

.prediction-heading-meta strong {
  color: #facc15;
  font-size: clamp(0.82rem, 0.86vw, 1rem);
  line-height: 1;
}

.device-prediction-panel {
  display: grid;
  grid-template-rows: 1fr;
}

.prediction-device-grid {
  display: grid;
  min-height: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: clamp(0.38rem, 0.58vw, 0.68rem);
}

.prediction-device-card {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-rows: auto auto auto 1fr;
  gap: clamp(0.14rem, 0.34vh, 0.3rem);
  overflow: hidden;
  padding: clamp(0.42rem, 0.62vh, 0.66rem) clamp(0.5rem, 0.68vw, 0.78rem);
  border: 1px solid rgba(34, 211, 238, 0.18);
  border-radius: 0.35rem;
  background:
    linear-gradient(135deg, rgba(8, 47, 73, 0.7), rgba(2, 8, 23, 0.68)), rgba(3, 28, 51, 0.55);
  box-shadow: inset 0 0 0.95rem rgba(14, 165, 233, 0.08);
}

.prediction-device-card::before {
  position: absolute;
  inset: 0;
  content: '';
  pointer-events: none;
  background: linear-gradient(90deg, var(--device-accent), transparent 42%);
  opacity: 0.12;
}

.device-card--success {
  --device-accent: #34d399;
}

.device-card--warning {
  --device-accent: #facc15;
}

.device-card--danger {
  --device-accent: #fb7185;
}

.prediction-device-card__top,
.prediction-device-card__metric,
.threshold-meter {
  position: relative;
  z-index: 1;
}

.prediction-device-card__top {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.42rem;
}

.prediction-device-card__top p {
  margin: 0;
  overflow: hidden;
  color: #f8fafc;
  font-size: clamp(0.82rem, 0.88vw, 1rem);
  font-weight: 850;
  line-height: 1.08;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prediction-status {
  display: inline-flex;
  min-width: 2.2rem;
  height: clamp(1.45rem, 2.5vh, 1.8rem);
  align-items: center;
  justify-content: center;
  border-width: 1px;
  border-style: solid;
  border-radius: 0.25rem;
  font-size: clamp(0.62rem, 0.64vw, 0.76rem);
  font-weight: 850;
  line-height: 1;
  white-space: nowrap;
}

.prediction-device-card__metric {
  display: flex;
  min-width: 0;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.55rem;
}

.prediction-device-card__metric span {
  color: rgba(226, 232, 240, 0.7);
  font-size: clamp(0.64rem, 0.68vw, 0.8rem);
  font-weight: 700;
}

.prediction-device-card__metric strong {
  color: #f8fafc;
  font-size: clamp(1.35rem, 1.55vw, 2rem);
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 0 0.58rem color-mix(in srgb, var(--device-accent) 68%, transparent);
}

.prediction-device-card__metric small {
  margin-left: 0.12rem;
  color: rgba(226, 232, 240, 0.74);
  font-size: clamp(0.72rem, 0.74vw, 0.86rem);
  font-weight: 750;
}

.threshold-meter {
  display: grid;
  gap: 0.2rem;
}

.threshold-meter__track {
  position: relative;
  height: clamp(0.35rem, 0.62vh, 0.5rem);
  overflow: hidden;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.74);
}

.threshold-meter__fill {
  position: absolute;
  inset: 0 auto 0 0;
  max-width: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #22d3ee, var(--device-accent));
  box-shadow: 0 0 0.62rem color-mix(in srgb, var(--device-accent) 38%, transparent);
}

.threshold-meter__mark {
  position: absolute;
  top: -0.1rem;
  bottom: -0.1rem;
  width: 1px;
  background: rgba(248, 250, 252, 0.72);
}

.threshold-meter__mark--low {
  left: 50%;
}

.threshold-meter__mark--high {
  left: 75%;
}

.threshold-meter__labels {
  display: flex;
  justify-content: space-between;
  color: rgba(203, 213, 225, 0.62);
  font-size: clamp(0.56rem, 0.58vw, 0.68rem);
  font-weight: 700;
  line-height: 1;
}
</style>
