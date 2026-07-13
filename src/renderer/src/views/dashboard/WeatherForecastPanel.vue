<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { DataAnalysis } from '@element-plus/icons-vue'

type WeatherSeason = Parameters<typeof window.api.weather.forecast>[0]['season']
type WeatherRecord = Awaited<ReturnType<typeof window.api.weather.forecast>>[number]

const props = defineProps<{
  season: WeatherSeason
  selectedDay: number
  predictionToken: number
}>()
const emit = defineEmits<{
  (event: 'selected-record-change', record: WeatherRecord | null): void
}>()

const loading = ref(false)
const predicting = ref(false)
const errorMessage = ref('')
const weatherForecasts = ref<WeatherRecord[]>([])
const selectedWeatherRecord = computed(() => {
  return (
    weatherForecasts.value.find(
      (item) => item.season === props.season && item.day === props.selectedDay
    ) ?? null
  )
})

let forecastRequestId = 0

watch(
  selectedWeatherRecord,
  (record) => {
    emit('selected-record-change', record)
  },
  { immediate: true }
)

watch(
  () => [props.season, props.selectedDay, props.predictionToken] as const,
  ([, , predictionToken], oldValue) => {
    const previousPredictionToken = oldValue?.[2] ?? predictionToken
    loadForecasts(predictionToken > 0 && predictionToken !== previousPredictionToken)
  },
  { immediate: true }
)

async function loadForecasts(showPredictionLoading = false): Promise<void> {
  const requestId = ++forecastRequestId
  loading.value = true
  predicting.value = showPredictionLoading
  errorMessage.value = ''

  try {
    const [records] = await Promise.all([
      window.api.weather.forecast({
        season: props.season,
        startDay: 1,
        count: 31
      }),
      showPredictionLoading ? wait(3000) : Promise.resolve()
    ])

    if (requestId !== forecastRequestId) {
      return
    }

    weatherForecasts.value = records
  } catch (error) {
    if (requestId !== forecastRequestId) {
      return
    }

    errorMessage.value = getErrorMessage(error, '天气预测数据加载失败')
  } finally {
    if (requestId === forecastRequestId) {
      loading.value = false
      predicting.value = false
    }
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
</script>

<template>
  <section class="tech-panel min-h-0">
    <header class="panel-heading">
      <span class="panel-heading__icon">
        <el-icon>
          <DataAnalysis />
        </el-icon>
      </span>
      <h2>AI天气预测模块</h2>
    </header>

    <div class="panel-body weather-forecast-body min-h-0">
      <div class="weather-list h-full min-h-0 overflow-hidden">
        <div class="weather-forecast-table flex h-full min-w-0 flex-col">
          <div
            class="weather-forecast-grid weather-forecast-row weather-forecast-row--head border-b border-cyan-300/20 font-semibold text-cyan-200"
          >
            <span>日期</span>
            <span>平均湿度</span>
            <span>平均温度</span>
            <span>天气</span>
            <span>降水量</span>
            <span>日出时间</span>
            <span>日落时间</span>
            <span>光照Max</span>
          </div>

          <div
            v-if="loading"
            class="weather-predicting min-h-0 flex-1"
            :class="{ 'weather-predicting--active': predicting }"
          >
            <div class="weather-predicting__core" aria-hidden="true">
              <span class="weather-predicting__ring weather-predicting__ring--outer" />
              <span class="weather-predicting__ring weather-predicting__ring--inner" />
              <el-icon class="weather-predicting__icon">
                <DataAnalysis />
              </el-icon>
            </div>
            <div class="weather-predicting__content">
              <strong>{{ predicting ? 'AI天气预测中' : '天气数据加载中' }}</strong>
              <span>{{ predicting ? '正在匹配季节样本并生成趋势结果' : '正在读取天气样本' }}</span>
              <div class="weather-predicting__bars" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>
          <div
            v-else-if="errorMessage"
            class="grid min-h-0 flex-1 place-items-center px-2 text-center text-sm font-semibold text-rose-200"
          >
            {{ errorMessage }}
          </div>
          <div
            v-else-if="weatherForecasts.length === 0"
            class="grid min-h-0 flex-1 place-items-center text-sm font-semibold text-cyan-100/70"
          >
            暂无天气数据
          </div>

          <template v-else>
            <div
              v-for="item in weatherForecasts"
              :key="`${item.season}-${item.monthDay}`"
              class="weather-forecast-grid weather-forecast-row border-b border-cyan-300/10 font-medium text-slate-100/90 last:border-b-0"
              :class="{ 'weather-forecast-row--active': item.day === selectedDay }"
            >
              <span class="text-cyan-50">{{ item.monthDay }}</span>
              <span>{{ item.humidity.toFixed(1) }}%</span>
              <span>{{ item.temperature.toFixed(1) }}°C</span>
              <span class="text-slate-50">{{ item.weather }}</span>
              <span>{{ item.precipitation.toFixed(1) }}mm</span>
              <span>{{ item.sunrise }}</span>
              <span>{{ item.sunset }}</span>
              <span>{{ item.sunlightMax }}</span>
            </div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.weather-forecast-body {
  padding: 0;
}

.weather-forecast-grid {
  display: grid;
  grid-template-columns:
    minmax(0, 0.74fr) minmax(0, 0.96fr) minmax(0, 0.96fr) minmax(0, 0.7fr)
    minmax(0, 0.86fr) minmax(0, 0.86fr) minmax(0, 0.86fr) minmax(0, 0.86fr);
  column-gap: clamp(0.16rem, 0.28vw, 0.38rem);
  align-items: center;
  min-height: 0;
  padding: 0.42vh clamp(0.28rem, 0.45vw, 0.55rem);
  font-size: clamp(0.62rem, 0.66vw, 0.76rem);
}

.weather-forecast-grid > span {
  min-width: 0;
  overflow: hidden;
  line-height: 1.25;
  text-overflow: clip;
  white-space: nowrap;
}

.weather-forecast-row {
  flex: 1 1 0;
}

.weather-forecast-row--active {
  color: #f8fafc;
  background:
    linear-gradient(90deg, rgba(250, 204, 21, 0.22), rgba(34, 211, 238, 0.1)),
    rgba(14, 165, 233, 0.12);
  box-shadow:
    inset 3px 0 0 rgba(250, 204, 21, 0.88),
    inset 0 0 0.9rem rgba(250, 204, 21, 0.12);
}

.weather-forecast-row--active > span:first-child {
  color: #fde68a;
  font-weight: 800;
}

.weather-forecast-row--head {
  flex: 0 0 clamp(1.35rem, 2.2vh, 1.7rem);
  font-size: clamp(0.6rem, 0.64vw, 0.72rem);
}

.weather-predicting {
  position: relative;
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: clamp(0.75rem, 1vw, 1.1rem);
  overflow: hidden;
  padding: clamp(0.7rem, 1.1vh, 1rem);
  color: #dffbff;
  background:
    linear-gradient(180deg, rgba(8, 47, 73, 0.28), rgba(2, 8, 23, 0.08)),
    radial-gradient(circle at 48% 48%, rgba(34, 211, 238, 0.12), transparent 42%);
}

.weather-predicting::before,
.weather-predicting::after {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: '';
}

.weather-predicting::before {
  background: linear-gradient(180deg, transparent, rgba(103, 232, 249, 0.18), transparent);
  animation: weather-scan 1.6s ease-in-out infinite;
  transform: translateY(-100%);
}

.weather-predicting::after {
  background-image:
    linear-gradient(rgba(125, 211, 252, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(125, 211, 252, 0.08) 1px, transparent 1px);
  background-size: 1.4rem 1.4rem;
  mask-image: radial-gradient(circle at center, #000, transparent 72%);
  opacity: 0.55;
}

.weather-predicting__core {
  position: relative;
  z-index: 1;
  display: grid;
  flex: 0 0 clamp(3.35rem, 5.2vw, 4.4rem);
  width: clamp(3.35rem, 5.2vw, 4.4rem);
  aspect-ratio: 1;
  place-items: center;
}

.weather-predicting__ring {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: conic-gradient(
    from 0deg,
    transparent,
    rgba(34, 211, 238, 0.28),
    #67e8f9,
    transparent 68%
  );
  filter: drop-shadow(0 0 0.65rem rgba(34, 211, 238, 0.42));
  animation: weather-spin 1.15s linear infinite;
}

.weather-predicting__ring::after {
  position: absolute;
  inset: 2px;
  border-radius: inherit;
  background: rgba(2, 8, 23, 0.88);
  content: '';
}

.weather-predicting__ring--inner {
  inset: 0.72rem;
  animation-direction: reverse;
  animation-duration: 1.8s;
  opacity: 0.72;
}

.weather-predicting__icon {
  position: relative;
  z-index: 2;
  color: #a5f3fc;
  font-size: clamp(1.25rem, 1.65vw, 1.65rem);
  filter: drop-shadow(0 0 0.6rem rgba(103, 232, 249, 0.68));
}

.weather-predicting__content {
  position: relative;
  z-index: 1;
  display: grid;
  min-width: min(10rem, 100%);
  gap: 0.32rem;
}

.weather-predicting__content strong {
  color: #f8fafc;
  font-size: clamp(0.86rem, 0.9vw, 1rem);
  font-weight: 850;
  letter-spacing: 0;
  text-shadow: 0 0 0.8rem rgba(103, 232, 249, 0.58);
}

.weather-predicting__content span {
  color: rgba(207, 250, 254, 0.72);
  font-size: clamp(0.66rem, 0.68vw, 0.78rem);
  font-weight: 650;
  letter-spacing: 0;
}

.weather-predicting__bars {
  display: grid;
  width: min(12rem, 100%);
  grid-template-columns: repeat(4, 1fr);
  gap: 0.26rem;
  margin-top: 0.1rem;
}

.weather-predicting__bars i {
  display: block;
  height: 0.18rem;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(8, 47, 73, 0.9);
}

.weather-predicting__bars i::before {
  display: block;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, #22d3ee, #facc15, transparent);
  content: '';
  animation: weather-bar 1.1s ease-in-out infinite;
  transform: translateX(-105%);
}

.weather-predicting__bars i:nth-child(2)::before {
  animation-delay: 0.12s;
}

.weather-predicting__bars i:nth-child(3)::before {
  animation-delay: 0.24s;
}

.weather-predicting__bars i:nth-child(4)::before {
  animation-delay: 0.36s;
}

.weather-predicting--active .weather-predicting__core {
  animation: weather-pulse 1.2s ease-in-out infinite;
}

@keyframes weather-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes weather-pulse {
  50% {
    transform: scale(1.05);
  }
}

@keyframes weather-scan {
  to {
    transform: translateY(100%);
  }
}

@keyframes weather-bar {
  to {
    transform: translateX(105%);
  }
}
</style>
