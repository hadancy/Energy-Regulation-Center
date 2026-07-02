<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import {
  // Bell,
  Fold,
  House,
  MagicStick,
  Menu as MenuIcon,
  // Search,
  // Setting,
  Tickets
  // UserFilled
} from '@element-plus/icons-vue'
import appIcon from '../assets/app-icon.svg'

const route = useRoute()
const isCollapse = ref(false)
const mobileMenuVisible = ref(false)

const activeMenu = computed(() => route.path)
const pageTitle = computed(() => String(route.meta.title ?? '后台管理'))

const menuItems = [
  { path: '/dashboard', title: '监控总览', icon: House },
  { path: '/prediction', title: '天气模型', icon: MagicStick },
  { path: '/datasets', title: '能源模型', icon: Tickets }
  // 能源预测
  // { path: '/settings', title: '能源预测', icon: Setting }
]

const toggleCollapse = (): void => {
  isCollapse.value = !isCollapse.value
}

const handleMenuButton = (): void => {
  if (window.matchMedia('(max-width: 767px)').matches) {
    mobileMenuVisible.value = true
    return
  }

  toggleCollapse()
}

const closeMobileMenu = (): void => {
  mobileMenuVisible.value = false
}
</script>

<template>
  <el-container class="app-shell min-h-screen bg-[#f5f7fb] text-[#1f2937]">
    <el-aside
      :width="isCollapse ? '84px' : '248px'"
      class="app-drag-region sticky top-0 hidden h-screen border-r border-slate-200 bg-white/95 transition-all duration-300 md:flex md:flex-col"
    >
      <div class="flex h-24 items-end gap-3 border-b border-slate-100 px-5 pb-4">
        <div class="h-10 w-10 overflow-hidden rounded-lg shadow-sm ring-1 ring-cyan-100/70">
          <img class="h-full w-full object-cover" :src="appIcon" alt="" draggable="false" />
        </div>
        <div v-show="!isCollapse" class="leading-tight">
          <p class="text-sm font-semibold text-slate-950">能源调控中心</p>
          <p class="text-xs text-slate-500">Energy Center</p>
        </div>
      </div>

      <el-menu
        :default-active="activeMenu"
        :collapse="isCollapse"
        router
        class="admin-menu app-no-drag flex-1 overflow-y-auto border-0 px-3 py-4"
      >
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
          <el-icon>
            <component :is="item.icon" />
          </el-icon>
          <span>{{ item.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-drawer v-model="mobileMenuVisible" title="后台菜单" direction="ltr" size="260px">
      <el-menu
        :default-active="activeMenu"
        router
        class="admin-menu border-0"
        @select="closeMobileMenu"
      >
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
          <el-icon>
            <component :is="item.icon" />
          </el-icon>
          <span>{{ item.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-drawer>

    <el-container>
      <el-header
        class="app-drag-region h-16 border-b border-slate-200 bg-white/80 px-4 backdrop-blur md:px-6"
      >
        <div class="flex h-full items-center justify-between gap-4">
          <div class="flex min-w-0 items-center gap-3">
            <el-button
              class="app-no-drag shrink-0"
              circle
              aria-label="切换菜单"
              @click="handleMenuButton"
            >
              <el-icon>
                <MenuIcon class="md:hidden" />
                <Fold v-if="!isCollapse" class="hidden md:inline" />
                <MenuIcon v-else class="hidden md:inline" />
              </el-icon>
            </el-button>
            <div class="min-w-0">
              <el-breadcrumb separator="/">
                <el-breadcrumb-item>后台管理</el-breadcrumb-item>
                <el-breadcrumb-item>{{ pageTitle }}</el-breadcrumb-item>
              </el-breadcrumb>
              <h1 class="truncate text-lg font-semibold text-slate-950">{{ pageTitle }}</h1>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <!-- <el-input class="hidden w-56 lg:block" placeholder="搜索模型、数据集" clearable>
              <template #prefix>
                <el-icon>
                  <Search />
                </el-icon>
              </template>
            </el-input> -->
            <!-- <el-button circle aria-label="通知">
              <el-icon>
                <Bell />
              </el-icon>
            </el-button> -->
            <!-- <el-dropdown class="app-no-drag">
              <button
                class="flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100"
              >
                <el-avatar :size="32" class="bg-cyan-600">
                  <el-icon>
                    <UserFilled />
                  </el-icon>
                </el-avatar>
                <span class="hidden whitespace-nowrap text-sm font-medium text-slate-700 xl:inline">
                  管理员
                </span>
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item>个人资料</el-dropdown-item>
                  <el-dropdown-item>安全设置</el-dropdown-item>
                  <el-dropdown-item divided>退出登录</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown> -->
          </div>
        </div>
      </el-header>

      <el-main class="p-4 md:p-6">
        <RouterView />
      </el-main>
    </el-container>
  </el-container>
</template>
