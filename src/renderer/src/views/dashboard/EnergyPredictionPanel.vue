<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Component } from 'vue'
import * as echarts from 'echarts'
import { Histogram, Lightning, SwitchButton, TrendCharts, WindPower } from '@element-plus/icons-vue'

interface EnergyKpi {
  label: string
  value: string
  unit: string
  sub: string
  icon: Component
}

const generationChartRef = ref<HTMLDivElement | null>(null)
const loadChartRef = ref<HTMLDivElement | null>(null)

let chartResizeTimer: number | null = null
let generationChart: ReturnType<typeof echarts.init> | null = null
let loadChart: ReturnType<typeof echarts.init> | null = null

const energyKpis: EnergyKpi[] = [
  { label: '储能余量', value: '68.2', unit: '%', sub: '2,731 kWh', icon: SwitchButton },
  { label: '综合能效', value: '92.6', unit: '%', sub: '较昨日 ↑ 2.1%', icon: Lightning },
  { label: '自发自用率', value: '78.4', unit: '%', sub: '较昨日 ↑ 1.8%', icon: TrendCharts },
  { label: '碳减排量', value: '12.8', unit: '吨', sub: '较昨日 ↑ 9.7%', icon: WindPower }
]

const chartHours = [
  '00:00',
  '02:00',
  '04:00',
  '06:00',
  '08:00',
  '10:00',
  '12:00',
  '14:00',
  '16:00',
  '18:00',
  '20:00',
  '22:00',
  '24:00'
]

const generationHistory = [0, 55, 280, 860, 1710, 2140, 2230, 2060, 1690, 1350, null, null, null]
const generationForecast = [null, null, null, null, null, 2110, 2230, 2180, 1810, 1420, 810, 260, 0]
const loadHistory = [1080, 930, 720, 820, 880, 1240, 1480, 1620, 1580, 1770, null, null, null]
const loadForecast = [null, null, null, null, null, 1310, 1510, 1660, 1610, 1760, 1680, 1500, 1320]

const buildChartOption = (
  title: string,
  historyName: string,
  forecastName: string,
  historyData: Array<number | null>,
  forecastData: Array<number | null>,
  yMax: number,
  color: string
): echarts.EChartsOption => ({
  backgroundColor: 'transparent',
  animationDuration: 900,
  color: [color, '#9de8ff'],
  grid: {
    left: 38,
    right: 12,
    top: 32,
    bottom: 24
  },
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(2, 12, 28, 0.92)',
    borderColor: 'rgba(34, 211, 238, 0.45)',
    textStyle: {
      color: '#dff7ff'
    }
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
    data: [historyName, forecastName]
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: chartHours,
    axisLine: {
      lineStyle: {
        color: 'rgba(125, 211, 252, 0.26)'
      }
    },
    axisTick: {
      show: false
    },
    axisLabel: {
      color: '#8fb1c7',
      fontSize: 10
    }
  },
  yAxis: {
    type: 'value',
    name: title,
    min: 0,
    max: yMax,
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
      name: historyName,
      type: 'line',
      smooth: true,
      showSymbol: false,
      data: historyData,
      lineStyle: {
        width: 2,
        color
      },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: `${color}55` },
          { offset: 1, color: 'rgba(14, 165, 233, 0.03)' }
        ])
      }
    },
    {
      name: forecastName,
      type: 'line',
      smooth: true,
      showSymbol: false,
      data: forecastData,
      lineStyle: {
        width: 2,
        type: 'dashed',
        color: '#9de8ff'
      }
    }
  ]
})

const initCharts = (): void => {
  if (generationChartRef.value) {
    generationChart?.dispose()
    generationChart = echarts.init(generationChartRef.value, undefined, { renderer: 'canvas' })
    generationChart.setOption(
      buildChartOption(
        'kW',
        '历史发电',
        '预测发电',
        generationHistory,
        generationForecast,
        2500,
        '#22d3ee'
      )
    )
  }

  if (loadChartRef.value) {
    loadChart?.dispose()
    loadChart = echarts.init(loadChartRef.value, undefined, { renderer: 'canvas' })
    loadChart.setOption(
      buildChartOption('kW', '历史负荷', '预测负荷', loadHistory, loadForecast, 2000, '#38bdf8')
    )
  }
}

const resizeCharts = (): void => {
  generationChart?.resize()
  loadChart?.resize()
}

const handleWindowResize = (): void => {
  if (chartResizeTimer) {
    window.clearTimeout(chartResizeTimer)
  }

  chartResizeTimer = window.setTimeout(() => {
    resizeCharts()
  }, 120)
}

const disposeCharts = (): void => {
  generationChart?.dispose()
  loadChart?.dispose()
  generationChart = null
  loadChart = null
}

onMounted(() => {
  void nextTick(() => {
    initCharts()
    window.addEventListener('resize', handleWindowResize)
  })
})

onBeforeUnmount(() => {
  if (chartResizeTimer) {
    window.clearTimeout(chartResizeTimer)
    chartResizeTimer = null
  }

  window.removeEventListener('resize', handleWindowResize)
  disposeCharts()
})
</script>

<template>
  <section class="tech-panel min-h-0">
    <header class="panel-heading">
      <span class="panel-heading__icon">
        <el-icon>
          <Histogram />
        </el-icon>
      </span>
      <h2>AI能源预测</h2>
    </header>

    <div class="panel-body grid min-h-0 grid-rows-[1fr_1fr_auto] gap-[0.75vh]">
      <div class="energy-chart-block min-h-0">
        <div class="flex h-full min-h-0 gap-[0.6vw]">
          <div class="min-w-0 flex-1">
            <h3>未来24小时发电量预测 (kW)</h3>
            <div ref="generationChartRef" class="h-[13.6vh] min-h-0 w-full" />
          </div>
          <div class="summary-card">
            <span>预计发电量</span>
            <strong>28,650<small>kWh</small></strong>
            <p>较昨日 <b class="text-rose-300">↑ 8.6%</b></p>
            <p>峰值功率 2,230 kW</p>
            <p>发生时段 12:30</p>
          </div>
        </div>
      </div>

      <div class="energy-chart-block min-h-0">
        <div class="flex h-full min-h-0 gap-[0.6vw]">
          <div class="min-w-0 flex-1">
            <h3>未来24小时负荷预测 (kW)</h3>
            <div ref="loadChartRef" class="h-[13.6vh] min-h-0 w-full" />
          </div>
          <div class="summary-card">
            <span>预计最大负荷</span>
            <strong>1,680<small>kW</small></strong>
            <p>发生时段 19:30</p>
            <p>较昨日 <b class="text-emerald-300">↑ 3.4%</b></p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-4 gap-[0.45vw]">
        <div v-for="item in energyKpis" :key="item.label" class="kpi-tile">
          <el-icon class="text-[1.55rem] text-emerald-300">
            <component :is="item.icon" />
          </el-icon>
          <div class="min-w-0">
            <p>{{ item.label }}</p>
            <strong
              >{{ item.value }}<span>{{ item.unit }}</span></strong
            >
            <em>{{ item.sub }}</em>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
