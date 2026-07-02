<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { DataAnalysis } from '@element-plus/icons-vue'

const props = defineProps<{
  selectedDate: Date
  startDay: number
}>()

type WeatherRecord = Awaited<ReturnType<typeof window.api.weather.forecast>>[number]

interface ForecastRow extends WeatherRecord {
  displayDate: string
}

const loading = ref(false)
const errorMessage = ref('')
const weatherForecasts = ref<WeatherRecord[]>([])

const forecastRows = computed<ForecastRow[]>(() =>
  weatherForecasts.value.map((record, index) => ({
    ...record,
    displayDate: formatForecastDate(props.selectedDate, index)
  }))
)

watch(
  () => props.startDay,
  () => {
    loadForecasts()
  },
  { immediate: true }
)

async function loadForecasts(): Promise<void> {
  loading.value = true
  errorMessage.value = ''

  try {
    weatherForecasts.value = await window.api.weather.forecast({
      startDay: props.startDay,
      count: 10
    })
  } catch (error) {
    errorMessage.value = getErrorMessage(error, '天气预测数据加载失败')
  } finally {
    loading.value = false
  }
}

function formatForecastDate(baseDate: Date, offset: number): string {
  const date = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + offset)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${month}/${day}`
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
          </div>

          <div
            v-if="loading"
            class="grid min-h-0 flex-1 place-items-center text-sm font-semibold text-cyan-100/70"
          >
            数据加载中
          </div>
          <div
            v-else-if="errorMessage"
            class="grid min-h-0 flex-1 place-items-center px-2 text-center text-sm font-semibold text-rose-200"
          >
            {{ errorMessage }}
          </div>
          <div
            v-else-if="forecastRows.length === 0"
            class="grid min-h-0 flex-1 place-items-center text-sm font-semibold text-cyan-100/70"
          >
            暂无天气数据
          </div>

          <template v-else>
            <div
              v-for="item in forecastRows"
              :key="`${item.displayDate}-${item.day}`"
              class="weather-forecast-grid weather-forecast-row border-b border-cyan-300/10 font-medium text-slate-100/90 last:border-b-0"
            >
              <span class="text-cyan-50">{{ item.displayDate }}</span>
              <span>{{ item.humidity.toFixed(1) }}%</span>
              <span>{{ item.temperature.toFixed(1) }}°C</span>
              <span class="text-slate-50">{{ item.weather }}</span>
              <span>{{ item.precipitation.toFixed(1) }}mm</span>
              <span>{{ item.sunrise }}</span>
              <span>{{ item.sunset }}</span>
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
    minmax(0, 0.88fr) minmax(0, 0.88fr) minmax(0, 0.88fr);
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

.weather-forecast-row--head {
  flex: 0 0 clamp(1.35rem, 2.2vh, 1.7rem);
  font-size: clamp(0.6rem, 0.64vw, 0.72rem);
}
</style>
