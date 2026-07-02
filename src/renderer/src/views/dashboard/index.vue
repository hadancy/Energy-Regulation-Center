<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Back,
  Calendar
  // PartlyCloudy
} from '@element-plus/icons-vue'
import dashboardTopFrame from '@renderer/assets/dashboard-top-frame.svg'
import DeviceStatusPanel from './DeviceStatusPanel.vue'
import EnergyPredictionPanel from './EnergyPredictionPanel.vue'
import EnvironmentPanel from './EnvironmentPanel.vue'
import MonitorPanels from './MonitorPanels.vue'
import WeatherForecastPanel from './WeatherForecastPanel.vue'

const router = useRouter()
const currentMonthDate = new Date()
const selectedDate = ref(new Date())
const clockNow = ref(new Date())

let clockTimer: number | null = null

const selectedDay = computed(() => selectedDate.value.getDate())

const formattedWeek = computed(() => {
  const weekNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

  return weekNames[selectedDate.value.getDay()]
})

const formattedTime = computed(() => {
  const date = clockNow.value
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')

  return `${hour}:${minute}:${second}`
})

const returnToAdmin = (): void => {
  router.push('/prediction')
}

const disableNonCurrentMonthDate = (date: Date): boolean =>
  date.getFullYear() !== currentMonthDate.getFullYear() ||
  date.getMonth() !== currentMonthDate.getMonth()

onMounted(() => {
  selectedDate.value = new Date()
  clockNow.value = new Date()
  clockTimer = window.setInterval(() => {
    clockNow.value = new Date()
  }, 1000)
})

onBeforeUnmount(() => {
  if (clockTimer) {
    window.clearInterval(clockTimer)
    clockTimer = null
  }
})
</script>

<template>
  <main class="energy-dashboard fixed inset-0 h-screen w-screen overflow-hidden text-slate-100">
    <div class="dashboard-background" />
    <div class="dashboard-scanline" />

    <div
      class="app-drag-region relative z-10 flex h-full w-full flex-col p-[clamp(0.55rem,1vw,1.1rem)]"
    >
      <header
        class="dashboard-topbar app-drag-region grid h-[8vh] min-h-19 max-h-23 grid-cols-[1fr_1.15fr_1fr] items-center gap-[1vw] px-[1vw]"
      >
        <img class="dashboard-topbar__frame" :src="dashboardTopFrame" alt="" aria-hidden="true" />

        <div class="topbar-side topbar-side--left">
          <el-date-picker
            v-model="selectedDate"
            type="date"
            format="YYYY年MM月DD日"
            :clearable="false"
            :editable="false"
            :prefix-icon="Calendar"
            :disabled-date="disableNonCurrentMonthDate"
            class="dashboard-date-picker app-no-drag"
            popper-class="dashboard-date-popper"
          />
          <span class="whitespace-nowrap text-cyan-100/75">{{ formattedWeek }}</span>
          <span class="whitespace-nowrap font-semibold text-white">{{ formattedTime }}</span>
          <!-- <span
            class="inline-flex items-center gap-2 whitespace-nowrap border-l border-cyan-300/25 pl-[0.8vw]"
          >
            <el-icon class="text-sky-100">
              <PartlyCloudy />
            </el-icon>
            30.4°C 晴
          </span> -->
        </div>

        <div class="title-console min-w-0 text-center">
          <h1 class="text-[1.9rem] font-black leading-none text-cyan-50">能源调控中心</h1>
          <p class="mt-1.5 text-xs font-semibold text-cyan-200/70">
            ENERGY DISPATCH COMMAND CENTER
          </p>
        </div>

        <div class="topbar-side topbar-side--right">
          <button class="dashboard-back-button app-no-drag" type="button" @click="returnToAdmin">
            <el-icon>
              <Back />
            </el-icon>
            <span>返回后台</span>
          </button>
        </div>
      </header>

      <section
        class="app-no-drag mt-[0.8vh] grid min-h-0 flex-1 grid-cols-[27fr_46fr_27fr] gap-[0.8vw]"
      >
        <aside class="grid min-h-0 grid-rows-[45fr_55fr] gap-[0.8vh]">
          <WeatherForecastPanel :selected-date="selectedDate" :start-day="selectedDay" />
          <EnvironmentPanel :formatted-time="formattedTime" />
        </aside>

        <MonitorPanels />

        <aside class="grid min-h-0 grid-rows-[44fr_56fr] gap-[0.8vh]">
          <DeviceStatusPanel />
          <EnergyPredictionPanel />
        </aside>
      </section>
    </div>
  </main>
</template>

<style>
.energy-dashboard {
  background: #020713;
  font-family: Inter, 'Segoe UI', 'Microsoft YaHei', sans-serif;
}

.dashboard-background {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 50% 0%, rgba(14, 165, 233, 0.28), transparent 28%),
    radial-gradient(circle at 12% 24%, rgba(34, 211, 238, 0.14), transparent 24%),
    radial-gradient(circle at 84% 48%, rgba(59, 130, 246, 0.16), transparent 28%),
    linear-gradient(180deg, #031225 0%, #020713 52%, #01040c 100%);
}

.dashboard-background::before {
  position: absolute;
  inset: 0;
  content: '';
  background-image:
    linear-gradient(rgba(56, 189, 248, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(56, 189, 248, 0.08) 1px, transparent 1px);
  background-size: 3.6vw 3.6vw;
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.86), rgba(0, 0, 0, 0.28));
}

.dashboard-background::after {
  position: absolute;
  inset: 0;
  content: '';
  background:
    linear-gradient(90deg, transparent 0 48%, rgba(56, 189, 248, 0.18) 49%, transparent 50%),
    linear-gradient(180deg, rgba(3, 7, 18, 0.1), rgba(3, 7, 18, 0.45));
  opacity: 0.35;
}

.dashboard-scanline {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    transparent 0,
    rgba(125, 211, 252, 0.055) 50%,
    transparent 100%
  );
  background-size: 100% 0.5rem;
  opacity: 0.58;
}

.dashboard-topbar,
.tech-panel {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(34, 211, 238, 0.48);
  border-radius: 0.45rem;
  background:
    linear-gradient(180deg, rgba(8, 47, 73, 0.52), rgba(2, 13, 31, 0.72)), rgba(2, 8, 23, 0.78);
  box-shadow:
    inset 0 0 1.2rem rgba(34, 211, 238, 0.12),
    0 0 1.2rem rgba(14, 165, 233, 0.12);
}

.dashboard-topbar {
  border: 0;
  border-radius: 0.2rem;
  background:
    linear-gradient(180deg, rgba(2, 8, 23, 0.92), rgba(2, 13, 31, 0.42)), rgba(2, 6, 23, 0.68);
  box-shadow: none;
  user-select: none;
}

.dashboard-topbar__frame {
  position: absolute;
  inset: -0.8rem 0 -0.25rem;
  z-index: 1;
  width: 100%;
  height: calc(100% + 1.05rem);
  object-fit: fill;
  pointer-events: none;
  user-select: none;
  filter: drop-shadow(0 0 0.55rem rgba(14, 165, 233, 0.72));
}

.dashboard-topbar::before,
.dashboard-topbar::after,
.tech-panel::before,
.tech-panel::after {
  position: absolute;
  z-index: 1;
  width: 3.2rem;
  height: 1.4rem;
  content: '';
  border-color: rgba(34, 211, 238, 0.92);
  pointer-events: none;
}

.dashboard-topbar::before,
.dashboard-topbar::after {
  display: none;
}

.dashboard-topbar::before,
.tech-panel::before {
  top: -1px;
  left: -1px;
  border-top: 2px solid;
  border-left: 2px solid;
}

.dashboard-topbar::after,
.tech-panel::after {
  right: -1px;
  bottom: -1px;
  border-right: 2px solid;
  border-bottom: 2px solid;
}

.title-console {
  position: relative;
  z-index: 2;
  justify-self: center;
  width: min(32vw, 36rem);
  padding: 0.15rem 2.4vw 0.25rem;
  color: #ecfeff;
  text-shadow:
    0 0 0.5rem rgba(34, 211, 238, 0.9),
    0 0 1.4rem rgba(59, 130, 246, 0.9);
}

.topbar-side {
  position: relative;
  z-index: 2;
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.9vw;
  width: fit-content;
  max-width: 100%;
  padding: 0.2rem 0.7vw;
  color: rgba(236, 254, 255, 0.9);
  background: linear-gradient(
    90deg,
    rgba(2, 8, 23, 0.9),
    rgba(2, 13, 31, 0.76),
    rgba(2, 8, 23, 0.7)
  );
  border-radius: 999px;
}

.topbar-side--right {
  justify-self: end;
  gap: 1vw;
}

.dashboard-date-picker.el-date-editor.el-input {
  width: clamp(10.6rem, 12vw, 13.5rem);
}

.dashboard-date-picker .el-input__wrapper {
  min-height: clamp(2rem, 3.5vh, 2.55rem);
  padding: 0 clamp(0.64rem, 0.78vw, 0.9rem);
  border: 1px solid rgba(34, 211, 238, 0.42);
  border-radius: 999px;
  background: rgba(2, 8, 23, 0.55);
  box-shadow: inset 0 0 0.75rem rgba(34, 211, 238, 0.12);
}

.dashboard-date-picker .el-input__wrapper:hover,
.dashboard-date-picker .el-input__wrapper.is-focus {
  border-color: rgba(125, 211, 252, 0.82);
  box-shadow:
    inset 0 0 0.75rem rgba(34, 211, 238, 0.18),
    0 0 0.65rem rgba(14, 165, 233, 0.18);
}

.dashboard-date-picker .el-input__inner {
  color: #ecfeff;
  font-size: 0.9rem;
  font-weight: 800;
  -webkit-text-fill-color: #ecfeff;
}

.dashboard-date-picker .el-input__prefix {
  color: #67e8f9;
}

.dashboard-back-button {
  display: inline-flex;
  height: clamp(2rem, 3.5vh, 2.55rem);
  align-items: center;
  justify-content: center;
  gap: 0.42rem;
  padding: 0 clamp(0.8rem, 1vw, 1.15rem);
  border: 1px solid rgba(34, 211, 238, 0.58);
  border-radius: 0.35rem;
  color: #dffbff;
  font-size: 0.88rem;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  background: linear-gradient(180deg, rgba(8, 145, 178, 0.28), rgba(3, 28, 51, 0.72));
  box-shadow:
    inset 0 0 0.85rem rgba(34, 211, 238, 0.16),
    0 0 0.85rem rgba(14, 165, 233, 0.14);
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease;
}

.dashboard-back-button:hover {
  border-color: rgba(125, 211, 252, 0.86);
  background: linear-gradient(180deg, rgba(8, 145, 178, 0.38), rgba(3, 28, 51, 0.78));
  transform: translateY(-1px);
}

.dashboard-back-button:active {
  transform: translateY(0);
}

.dashboard-back-button .el-icon {
  font-size: 1rem;
}

.panel-heading {
  position: relative;
  z-index: 2;
  display: flex;
  height: clamp(2.3rem, 4.5vh, 3.15rem);
  min-height: 0;
  align-items: center;
  gap: 0.55rem;
  padding: 0.55vh 0.8vw 0;
  border-bottom: 1px solid rgba(34, 211, 238, 0.16);
}

.panel-heading::after {
  position: absolute;
  right: 0.8vw;
  bottom: -1px;
  width: 34%;
  height: 1px;
  content: '';
  background: linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.8), transparent);
}

.panel-heading h2 {
  margin: 0;
  color: #22d3ee;
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1;
  text-shadow: 0 0 0.75rem rgba(34, 211, 238, 0.7);
}

.panel-heading__icon {
  display: grid;
  width: 1.7rem;
  height: 1.7rem;
  place-items: center;
  border: 1px solid rgba(34, 211, 238, 0.7);
  border-radius: 0.35rem;
  color: #22d3ee;
  background: rgba(8, 145, 178, 0.16);
  box-shadow: inset 0 0 0.8rem rgba(34, 211, 238, 0.18);
}

.environment-heading__icon {
  width: clamp(1.9rem, 2vw, 2.25rem);
  height: clamp(1.9rem, 2vw, 2.25rem);
  font-size: 1.12rem;
  box-shadow:
    inset 0 0 0.85rem rgba(34, 211, 238, 0.24),
    0 0 0.8rem rgba(34, 211, 238, 0.24);
}

.panel-body {
  position: relative;
  z-index: 2;
  height: calc(100% - clamp(2.3rem, 4.5vh, 3.15rem));
  padding: 0.8vh 0.8vw;
}

.weather-list,
.metric-tile,
.summary-card,
.energy-chart-block,
.kpi-tile {
  border: 1px solid rgba(34, 211, 238, 0.16);
  border-radius: 0.35rem;
  background: rgba(3, 28, 51, 0.62);
  box-shadow: inset 0 0 1rem rgba(14, 165, 233, 0.08);
}

.environment-highlight-grid {
  min-height: clamp(4.4rem, 9.3vh, 6.2rem);
  padding-bottom: 1vh;
  border-bottom: 1px solid rgba(34, 211, 238, 0.15);
}

.highlight-metric {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: clamp(0.65rem, 1.05vw, 1.4rem);
  padding: 0.35vh clamp(0.45rem, 0.7vw, 0.95rem);
  border-right: 1px solid rgba(34, 211, 238, 0.18);
}

.highlight-metric:last-child {
  border-right: 0;
}

.highlight-metric__icon {
  flex: 0 0 auto;
  font-size: clamp(3.05rem, 3.45vw, 4.45rem);
  filter: drop-shadow(0 0 0.45rem rgba(34, 211, 238, 0.7));
}

.highlight-metric__content {
  min-width: 0;
}

.highlight-metric strong {
  display: block;
  color: #f8fafc;
  font-size: clamp(2.15rem, 2.35vw, 3.15rem);
  font-weight: 850;
  line-height: 1;
}

.highlight-metric strong span {
  margin-left: 0.2rem;
  color: #cbd5e1;
  font-size: 1.1rem;
  font-weight: 700;
}

.highlight-metric p {
  margin: 0.42rem 0 0;
  color: rgba(203, 213, 225, 0.72);
  font-size: 0.86rem;
  font-weight: 650;
}

.metric-tile {
  position: relative;
  display: grid;
  min-width: 0;
  align-content: center;
  justify-items: center;
  gap: clamp(0.34rem, 0.74vh, 0.7rem);
  padding: clamp(0.68rem, 1vh, 1rem) clamp(0.5rem, 0.72vw, 0.95rem);
  overflow: hidden;
}

.metric-tile__top {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: clamp(0.38rem, 0.58vw, 0.7rem);
}

.metric-tile__icon {
  flex: 0 0 auto;
  font-size: clamp(1.85rem, 1.95vw, 2.55rem);
  opacity: 0.96;
  filter: drop-shadow(0 0 0.38rem rgba(34, 211, 238, 0.48));
}

.metric-tile__label {
  overflow: hidden;
  color: rgba(203, 213, 225, 0.76);
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-tile strong {
  display: block;
  max-width: 100%;
  overflow: visible;
  font-size: clamp(1.72rem, 1.78vw, 2.35rem);
  font-weight: 850;
  line-height: 1.05;
  text-align: center;
  white-space: nowrap;
}

.metric-tile span {
  color: rgba(226, 232, 240, 0.72);
  font-size: 0.84rem;
  line-height: 1.1;
  text-align: center;
}

.monitor-frame {
  position: relative;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(125, 211, 252, 0.55);
  border-radius: 0.35rem;
  background: radial-gradient(circle at 50% 45%, rgba(8, 145, 178, 0.2), transparent 35%), #020617;
  box-shadow:
    inset 0 0 1.4rem rgba(14, 165, 233, 0.16),
    0 0 1rem rgba(14, 165, 233, 0.12);
}

.monitor-frame--thermal {
  background:
    radial-gradient(circle at 50% 50%, rgba(34, 211, 238, 0.14), transparent 34%),
    linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(2, 6, 23, 0.95));
}

.monitor-frame__image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.monitor-frame__image--thermal {
  filter: saturate(1.45) contrast(1.08);
}

.monitor-empty {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 0.65rem;
  padding: 1.2rem;
  color: #e2e8f0;
  text-align: center;
  background:
    radial-gradient(circle at 50% 38%, rgba(14, 165, 233, 0.2), transparent 30%),
    rgba(2, 6, 23, 0.82);
}

.monitor-empty p {
  max-width: 36rem;
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.5;
}

.monitor-empty span {
  max-width: 34rem;
  color: rgba(203, 213, 225, 0.68);
  font-size: 0.82rem;
  word-break: break-word;
}

.device-list {
  height: calc(100% - 1.8rem);
}

.device-icon {
  display: grid;
  width: 1.85rem;
  height: 1.85rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(125, 211, 252, 0.24);
  border-radius: 0.32rem;
  color: #bae6fd;
  background: rgba(148, 163, 184, 0.12);
}

.energy-chart-block {
  padding: 0.55vh 0.55vw;
}

.energy-chart-block h3 {
  margin: 0;
  color: #22d3ee;
  font-size: 0.88rem;
  font-weight: 800;
}

.summary-card {
  display: grid;
  width: clamp(7.8rem, 7.5vw, 10rem);
  min-width: 7.8rem;
  align-content: center;
  gap: 0.28rem;
  padding: 0.7vh 0.7vw;
}

.summary-card span {
  color: #9de8ff;
  font-size: 0.78rem;
  font-weight: 700;
}

.summary-card strong {
  color: #67e8f9;
  font-size: 1.55rem;
  font-weight: 850;
  line-height: 1;
}

.summary-card small {
  margin-left: 0.2rem;
  color: #e2e8f0;
  font-size: 0.75rem;
  font-weight: 700;
}

.summary-card p {
  margin: 0;
  color: rgba(226, 232, 240, 0.76);
  font-size: 0.78rem;
  line-height: 1.35;
}

.kpi-tile {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.45vw;
  padding: 0.65vh 0.55vw;
}

.kpi-tile p {
  margin: 0 0 0.15rem;
  color: rgba(226, 232, 240, 0.72);
  font-size: 0.76rem;
}

.kpi-tile strong {
  display: block;
  color: #f8fafc;
  font-size: 1.28rem;
  font-weight: 850;
  line-height: 1;
}

.kpi-tile strong span {
  margin-left: 0.1rem;
  color: #cbd5e1;
  font-size: 0.74rem;
  font-weight: 700;
}

.kpi-tile em {
  display: block;
  margin-top: 0.25rem;
  overflow: hidden;
  color: rgba(203, 213, 225, 0.75);
  font-size: 0.72rem;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.energy-dashboard .is-loading {
  animation: dashboard-spin 1s linear infinite;
}

@keyframes dashboard-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (min-width: 2400px) {
  .panel-heading h2 {
    font-size: 1.3rem;
  }

  .title-console h1 {
    font-size: 2.35rem;
  }
}
</style>
