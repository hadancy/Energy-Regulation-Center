<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Delete, Edit, Plus, Refresh, Search } from '@element-plus/icons-vue'

type WeatherRecord = Awaited<ReturnType<typeof window.api.weather.list>>[number]
type WeatherRecordInput = Parameters<typeof window.api.weather.create>[0]

const weatherOptions = ['晴天', '雨天', '雪', '暴雪', '强风']

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const keyword = ref('')
const editingId = ref<number | null>(null)
const records = ref<WeatherRecord[]>([])
const formRef = ref<FormInstance>()

const form = reactive<WeatherRecordInput>({
  day: 1,
  humidity: 0,
  temperature: 0,
  weather: '晴天',
  precipitation: 0,
  sunrise: '06:00',
  sunset: '20:00'
})

const formRules: FormRules<WeatherRecordInput> = {
  day: [{ required: true, message: '请输入日期', trigger: 'blur' }],
  humidity: [{ required: true, message: '请输入平均湿度', trigger: 'blur' }],
  temperature: [{ required: true, message: '请输入平均温度', trigger: 'blur' }],
  weather: [{ required: true, message: '请选择天气', trigger: 'change' }],
  precipitation: [{ required: true, message: '请输入降水量', trigger: 'blur' }],
  sunrise: [{ required: true, message: '请选择日出时间', trigger: 'change' }],
  sunset: [{ required: true, message: '请选择日落时间', trigger: 'change' }]
}

const dialogTitle = computed(() => (editingId.value ? '编辑天气数据' : '新增天气数据'))

onMounted(() => {
  loadRecords()
})

async function loadRecords(): Promise<void> {
  loading.value = true

  try {
    records.value = await window.api.weather.list({ keyword: keyword.value.trim() || undefined })
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '天气数据加载失败'))
  } finally {
    loading.value = false
  }
}

function openCreateDialog(): void {
  editingId.value = null
  resetForm()
  dialogVisible.value = true
}

function openEditDialog(row: WeatherRecord): void {
  editingId.value = row.id
  Object.assign(form, {
    day: row.day,
    humidity: row.humidity,
    temperature: row.temperature,
    weather: row.weather,
    precipitation: row.precipitation,
    sunrise: row.sunrise,
    sunset: row.sunset
  })
  dialogVisible.value = true
}

async function submitForm(): Promise<void> {
  if (!formRef.value) return

  await formRef.value.validate()
  saving.value = true

  try {
    if (editingId.value) {
      await window.api.weather.update(editingId.value, { ...form })
      ElMessage.success('天气数据已更新')
    } else {
      await window.api.weather.create({ ...form })
      ElMessage.success('天气数据已新增')
    }

    dialogVisible.value = false
    await loadRecords()
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '天气数据保存失败'))
  } finally {
    saving.value = false
  }
}

async function removeRecord(row: WeatherRecord): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认删除第 ${row.day} 天的天气数据吗？`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await window.api.weather.remove(row.id)
    ElMessage.success('天气数据已删除')
    await loadRecords()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(getErrorMessage(error, '天气数据删除失败'))
    }
  }
}

function resetForm(): void {
  const nextDay = Math.max(0, ...records.value.map((item) => item.day)) + 1

  Object.assign(form, {
    day: nextDay,
    humidity: 50,
    temperature: 8,
    weather: '晴天',
    precipitation: 0,
    sunrise: '06:00',
    sunset: '20:00'
  })
  formRef.value?.clearValidate()
}

function getWeatherTagType(weather: string): 'success' | 'warning' | 'info' | 'danger' | 'primary' {
  if (weather === '晴天') return 'success'
  if (weather === '雨天') return 'primary'
  if (weather === '强风') return 'warning'
  if (weather === '暴雪') return 'danger'
  return 'info'
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
</script>

<template>
  <el-card shadow="never" class="admin-card">
    <template #header>
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <span class="font-semibold text-slate-900">天气数据管理</span>
          <!-- <p class="mt-1 text-sm text-slate-500">SQLite 本地数据库 · 箱梁项目 31 天数据</p> -->
        </div>
        <div class="flex flex-wrap gap-2">
          <el-button :icon="Refresh" :loading="loading" @click="loadRecords">刷新</el-button>
          <el-button type="primary" :icon="Plus" @click="openCreateDialog">新增天气</el-button>
        </div>
      </div>
    </template>

    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <el-input
        v-model="keyword"
        clearable
        class="max-w-md"
        placeholder="搜索天气或第 N 天"
        @clear="loadRecords"
        @keyup.enter="loadRecords"
      >
        <template #prefix>
          <el-icon>
            <Search />
          </el-icon>
        </template>
      </el-input>
      <el-button :icon="Search" @click="loadRecords">查询</el-button>
    </div>

    <el-table v-loading="loading" :data="records" class="w-full" row-key="id">
      <el-table-column label="日期">
        <template #default="{ row }">第 {{ row.day }} 天</template>
      </el-table-column>
      <el-table-column label="平均湿度">
        <template #default="{ row }">{{ row.humidity.toFixed(1) }}%</template>
      </el-table-column>
      <el-table-column label="平均温度">
        <template #default="{ row }">{{ row.temperature.toFixed(1) }} °C</template>
      </el-table-column>
      <el-table-column label="天气">
        <template #default="{ row }">
          <el-tag :type="getWeatherTagType(row.weather)" effect="light">{{ row.weather }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="降水量">
        <template #default="{ row }">{{ row.precipitation.toFixed(1) }} mm</template>
      </el-table-column>
      <el-table-column prop="sunrise" label="日出时间" />
      <el-table-column prop="sunset" label="日落时间" />
      <!-- <el-table-column label="更新时间">
        <template #default="{ row }">{{ formatUpdatedAt(row.updatedAt) }}</template>
      </el-table-column> -->
      <el-table-column label="操作" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" :icon="Edit" @click="openEditDialog(row)">编辑</el-button>
          <el-button link type="danger" :icon="Delete" @click="removeRecord(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>

  <el-dialog v-model="dialogVisible" :title="dialogTitle" width="min(720px, 92vw)">
    <el-form ref="formRef" :model="form" :rules="formRules" label-position="top">
      <div class="grid gap-x-4 sm:grid-cols-2">
        <el-form-item label="日期" prop="day">
          <el-input-number v-model="form.day" :min="1" :max="366" :step="1" class="w-full!" />
        </el-form-item>
        <el-form-item label="天气" prop="weather">
          <el-select
            v-model="form.weather"
            allow-create
            default-first-option
            filterable
            class="w-full"
            placeholder="请选择天气"
          >
            <el-option v-for="item in weatherOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="平均湿度（%）" prop="humidity">
          <el-input-number
            v-model="form.humidity"
            :min="0"
            :max="100"
            :precision="1"
            :step="0.1"
            class="w-full!"
          />
        </el-form-item>
        <el-form-item label="平均温度（°C）" prop="temperature">
          <el-input-number
            v-model="form.temperature"
            :min="-80"
            :max="80"
            :precision="1"
            :step="0.1"
            class="w-full!"
          />
        </el-form-item>
        <el-form-item label="降水量（mm）" prop="precipitation">
          <el-input-number
            v-model="form.precipitation"
            :min="0"
            :precision="1"
            :step="0.1"
            class="w-full!"
          />
        </el-form-item>
        <el-form-item label="日出时间" prop="sunrise">
          <el-time-picker
            v-model="form.sunrise"
            value-format="HH:mm"
            format="HH:mm"
            class="w-full!"
            placeholder="选择日出时间"
          />
        </el-form-item>
        <el-form-item label="日落时间" prop="sunset">
          <el-time-picker
            v-model="form.sunset"
            value-format="HH:mm"
            format="HH:mm"
            class="w-full!"
            placeholder="选择日落时间"
          />
        </el-form-item>
      </div>
    </el-form>

    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
    </template>
  </el-dialog>
</template>
