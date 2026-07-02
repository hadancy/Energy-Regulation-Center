import { createRouter, createWebHashHistory } from 'vue-router'
import AdminLayout from '@renderer/layouts/AdminLayout.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/dashboard'
    },
    {
      path: '/dashboard',
      name: 'Dashboard',
      component: () => import('@renderer/views/dashboard/index.vue'),
      meta: { title: '能源调控中心', fullscreen: true }
    },
    {
      path: '/',
      component: AdminLayout,
      children: [
        {
          path: 'prediction',
          name: 'Prediction',
          component: () => import('@renderer/views/prediction/index.vue'),
          meta: { title: '天气模型' }
        },
        {
          path: 'datasets',
          name: 'Datasets',
          component: () => import('@renderer/views/datasets/index.vue'),
          meta: { title: '能源模型' }
        },
        {
          path: 'settings',
          name: 'Settings',
          component: () => import('@renderer/views/settings/index.vue'),
          meta: { title: '系统设置' }
        }
      ]
    }
  ]
})

export default router
