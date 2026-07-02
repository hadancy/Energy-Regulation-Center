<script setup lang="ts">
import type { Component } from 'vue'
import { Cpu, DataAnalysis, Odometer, SwitchButton, WindPower } from '@element-plus/icons-vue'

type DeviceStatus = '正常' | '关注' | '预警'
type RiskLevel = '低风险' | '中风险' | '高风险'

interface DevicePrediction {
  name: string
  code: string
  status: DeviceStatus
  health: number
  life: string
  risk: RiskLevel
  icon: Component
}

const devicePredictions: DevicePrediction[] = [
  {
    name: '逆变器 #1',
    code: 'INV-01',
    status: '正常',
    health: 96,
    life: '6.2年',
    risk: '低风险',
    icon: Cpu
  },
  {
    name: '逆变器 #2',
    code: 'INV-02',
    status: '关注',
    health: 78,
    life: '2.1年',
    risk: '中风险',
    icon: Cpu
  },
  {
    name: '储能电池组',
    code: 'BESS-01',
    status: '关注',
    health: 74,
    life: '1.8年',
    risk: '中风险',
    icon: SwitchButton
  },
  {
    name: '汇流箱 #3',
    code: 'SCB-03',
    status: '正常',
    health: 92,
    life: '5.1年',
    risk: '低风险',
    icon: DataAnalysis
  },
  {
    name: '环境传感器',
    code: 'SEN-01',
    status: '正常',
    health: 88,
    life: '3.6年',
    risk: '低风险',
    icon: Odometer
  },
  {
    name: '冷却系统',
    code: 'COOL-01',
    status: '预警',
    health: 58,
    life: '0.9年',
    risk: '高风险',
    icon: WindPower
  }
]

const statusBadgeClass = (status: DeviceStatus): string => {
  if (status === '正常') {
    return 'border-emerald-300/70 bg-emerald-400/10 text-emerald-200 shadow-[0_0_1rem_rgba(52,211,153,0.28)]'
  }

  if (status === '关注') {
    return 'border-amber-300/70 bg-amber-400/10 text-amber-200 shadow-[0_0_1rem_rgba(251,191,36,0.22)]'
  }

  return 'border-rose-300/80 bg-rose-500/10 text-rose-200 shadow-[0_0_1rem_rgba(251,113,133,0.28)]'
}

const riskBadgeClass = (risk: RiskLevel): string => {
  if (risk === '低风险') {
    return 'border-emerald-300/50 bg-emerald-400/10 text-emerald-200'
  }

  if (risk === '中风险') {
    return 'border-amber-300/50 bg-amber-400/10 text-amber-200'
  }

  return 'border-rose-300/60 bg-rose-500/10 text-rose-200'
}

const healthBarClass = (status: DeviceStatus): string => {
  if (status === '正常') {
    return 'from-emerald-300 to-cyan-300'
  }

  if (status === '关注') {
    return 'from-amber-300 to-emerald-300'
  }

  return 'from-rose-400 to-amber-300'
}
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
    </header>

    <div class="panel-body min-h-0 overflow-hidden">
      <div
        class="grid grid-cols-[1.4fr_0.8fr_1.1fr_0.8fr_0.9fr] border-b border-cyan-300/15 px-[0.7vw] pb-[0.6vh] text-xs text-slate-300/70"
      >
        <span>设备名称</span>
        <span>运行状态</span>
        <span>健康度</span>
        <span>剩余寿命</span>
        <span>风险等级</span>
      </div>

      <div class="device-list min-h-0 overflow-hidden">
        <div
          v-for="device in devicePredictions"
          :key="device.code"
          class="grid grid-cols-[1.4fr_0.8fr_1.1fr_0.8fr_0.9fr] items-center gap-[0.45vw] border-b border-cyan-300/10 px-[0.7vw] py-[0.72vh] last:border-b-0"
        >
          <div class="flex min-w-0 items-center gap-2">
            <span class="device-icon">
              <el-icon>
                <component :is="device.icon" />
              </el-icon>
            </span>
            <div class="min-w-0 leading-tight">
              <p class="truncate text-sm font-semibold text-slate-100">{{ device.name }}</p>
              <span class="text-xs text-slate-400">{{ device.code }}</span>
            </div>
          </div>

          <span
            class="inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold"
            :class="statusBadgeClass(device.status)"
          >
            {{ device.status }}
          </span>

          <div class="min-w-0">
            <div class="mb-1 flex items-center justify-between text-xs text-slate-200">
              <span>{{ device.health }}%</span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-slate-700/70">
              <div
                class="h-full rounded-full bg-gradient-to-r"
                :class="healthBarClass(device.status)"
                :style="{ width: `${device.health}%` }"
              />
            </div>
          </div>

          <span class="text-sm font-semibold text-slate-100">{{ device.life }}</span>
          <span
            class="rounded-[0.3rem] border px-2 py-1 text-center text-xs font-semibold"
            :class="riskBadgeClass(device.risk)"
          >
            {{ device.risk }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
