<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, FolderOpened, Monitor, RefreshRight } from '@element-plus/icons-vue'

const form = reactive({ path: '', name: '' })
const savedSettings = ref({ path: '', name: '' })
const isChoosing = ref(false)
const isSaving = ref(false)
const isTesting = ref(false)

const applySettings = (settings: { path: string; name: string }): void => {
  form.path = settings.path
  form.name = settings.name
  savedSettings.value = { ...settings }
}

const chooseApp = async (): Promise<void> => {
  isChoosing.value = true

  try {
    const result = await window.api.externalApp.choose()
    if (result.success) {
      applySettings(result.settings)
      ElMessage.success('已选择软件')
    }
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '选择软件失败'))
  } finally {
    isChoosing.value = false
  }
}

const saveSettings = async (): Promise<boolean> => {
  if (!form.path) {
    ElMessage.warning('请先选择软件')
    return false
  }

  isSaving.value = true

  try {
    const settings = await window.api.externalApp.saveSettings({
      path: form.path,
      name: form.name.trim() || '外部软件'
    })
    applySettings(settings)
    ElMessage.success('设置已保存')
    return true
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '保存设置失败'))
    return false
  } finally {
    isSaving.value = false
  }
}

const testLaunch = async (): Promise<void> => {
  if (form.path !== savedSettings.value.path || form.name !== savedSettings.value.name) {
    const saved = await saveSettings()
    if (!saved) return
  }

  if (!form.path) return

  isTesting.value = true

  try {
    const result = await window.api.externalApp.launch()
    if (!result.success) {
      ElMessage.error(result.error || '软件启动失败')
    } else if (result.action === 'activated') {
      ElMessage.success(`已切换到${result.settings.name}`)
    } else if (result.action === 'already-running') {
      ElMessage.warning(`${result.settings.name}已在运行，但未找到可切换的窗口`)
    } else {
      ElMessage.success('已启动软件')
    }
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '软件启动失败'))
  } finally {
    isTesting.value = false
  }
}

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback

onMounted(async () => {
  try {
    applySettings(await window.api.externalApp.getSettings())
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '读取设置失败'))
  }
})
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <el-card shadow="never" class="admin-card overflow-hidden">
      <template #header>
        <div class="flex items-center gap-3">
          <span class="stat-icon stat-icon--cyan h-10 w-10 shrink-0">
            <el-icon :size="22"><Monitor /></el-icon>
          </span>
          <div>
            <h2 class="font-semibold text-slate-950">外部软件跳转</h2>
            <p class="mt-0.5 text-sm text-slate-500">设置监控总览顶部按钮要打开的软件</p>
          </div>
        </div>
      </template>

      <el-form label-position="top" class="max-w-3xl" @submit.prevent="saveSettings">
        <el-form-item label="软件路径">
          <div class="flex w-full flex-col gap-3 sm:flex-row">
            <el-input
              v-model="form.path"
              readonly
              class="min-w-0 flex-1"
              placeholder="尚未选择软件"
            />
            <el-button :icon="FolderOpened" :loading="isChoosing" @click="chooseApp">
              选择软件
            </el-button>
          </div>
          <p class="mt-2 text-xs leading-5 text-slate-500">
            Windows 支持选择 .exe、.lnk、.bat 或 .cmd 文件；建议优先选择程序快捷方式。
          </p>
        </el-form-item>

        <el-form-item label="按钮名称">
          <el-input
            v-model="form.name"
            maxlength="16"
            show-word-limit
            placeholder="例如：生产管理系统"
          />
        </el-form-item>

        <div class="mt-2 flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
          <el-button
            :icon="RefreshRight"
            :loading="isTesting"
            :disabled="!form.path"
            @click="testLaunch"
          >
            测试打开
          </el-button>
          <el-button
            native-type="submit"
            type="primary"
            :icon="Check"
            :loading="isSaving"
            :disabled="!form.path"
          >
            保存设置
          </el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>
