<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Delete, Edit, Lightning, Plus, Refresh, Search, View } from '@element-plus/icons-vue'

type WeatherRecord = Awaited<ReturnType<typeof window.api.weather.list>>[number]
type WeatherRecordInput = Parameters<typeof window.api.weather.create>[0]
type WeatherSeason = WeatherRecordInput['season']
type HourlyEnergyRatio = WeatherRecord['energyRatios'][number]
type HourlyGenerationKwh = WeatherRecord['generationKwh'][number]
type PlcWeatherWriteInput = Parameters<typeof window.api.plc.writeWeather>[0]
type PlcWeatherWriteResult = Awaited<ReturnType<typeof window.api.plc.writeWeather>>

interface EditableEnergyRatio {
  hour: number
  time: string
  ratio: number
}

interface EditableGenerationKwh {
  hour: number
  time: string
  kwh: number
}

type WeatherPlcPointName =
  | 'DateIndex1'
  | 'Weather'
  | 'Rainfall'
  | 'Temperature'
  | 'Humidity'
  | 'SunriseTime'
  | 'SunsetTime'

interface WeatherPlcPointPreview {
  name: WeatherPlcPointName
  address: string
  dataType: 'Word' | 'Time'
  comment: string
  sourceValue: number | string
  plcValue: number | string | null
  note: string
}

interface WeatherPlcPreview {
  values: Record<WeatherPlcPointName, number | string | null>
  points: WeatherPlcPointPreview[]
}

const seasonOptions: WeatherSeason[] = ['春秋', '夏', '冬']
const weatherOptions = ['晴天', '雨天', '雪', '暴雪', '强风']
const weatherPlcCodeByName: Record<string, number> = {
  晴天: 1,
  雨天: 2,
  强风: 3,
  雪: 4,
  暴雪: 5
}
const weatherPlcPointDefinitions: Array<
  Pick<WeatherPlcPointPreview, 'name' | 'address' | 'dataType' | 'comment'>
> = [
  {
    name: 'DateIndex1',
    address: '%MW600',
    dataType: 'Word',
    comment: '日期索引，按全部天气数据连续从 0 开始'
  },
  { name: 'Weather', address: '%MW602', dataType: 'Word', comment: '天气编码' },
  { name: 'Rainfall', address: '%MW604', dataType: 'Word', comment: '降雨量' },
  { name: 'Temperature', address: '%MW606', dataType: 'Word', comment: '温度' },
  { name: 'Humidity', address: '%MW608', dataType: 'Word', comment: '湿度' },
  { name: 'SunriseTime', address: '%MD610', dataType: 'Time', comment: '日出时间' },
  { name: 'SunsetTime', address: '%MD614', dataType: 'Time', comment: '日落时间' }
]

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const keyword = ref('')
const seasonFilter = ref<WeatherSeason | ''>('')
const editingId = ref<number | null>(null)
const records = ref<WeatherRecord[]>([])
const formRef = ref<FormInstance>()
const energyDialogVisible = ref(false)
const energyDialogRecord = ref<WeatherRecord | null>(null)
const editableEnergyRatios = ref<EditableEnergyRatio[]>([])
const savingEnergyRatios = ref(false)
const energySaveError = ref('')
const generationDialogVisible = ref(false)
const generationDialogRecord = ref<WeatherRecord | null>(null)
const editableGenerationKwh = ref<EditableGenerationKwh[]>([])
const savingGenerationKwh = ref(false)
const generationSaveError = ref('')

const form = reactive<WeatherRecordInput>({
  season: '春秋',
  date: '2026-04-01',
  humidity: 0,
  temperature: 0,
  weather: '晴天',
  precipitation: 0,
  sunrise: '06:00',
  sunset: '20:00',
  sunlightMax: '12:30'
})

const formRules: FormRules<WeatherRecordInput> = {
  season: [{ required: true, message: '请选择季节模式', trigger: 'change' }],
  date: [{ required: true, message: '请选择日期', trigger: 'change' }],
  humidity: [{ required: true, message: '请输入平均湿度', trigger: 'blur' }],
  temperature: [{ required: true, message: '请输入平均温度', trigger: 'blur' }],
  weather: [{ required: true, message: '请选择天气', trigger: 'change' }],
  precipitation: [{ required: true, message: '请输入降水量', trigger: 'blur' }],
  sunrise: [{ required: true, message: '请选择日出时间', trigger: 'change' }],
  sunset: [{ required: true, message: '请选择日落时间', trigger: 'change' }],
  sunlightMax: [{ required: true, message: '请选择当日光照 Max', trigger: 'change' }]
}

const dialogTitle = computed(() => (editingId.value ? '编辑天气数据' : '新增天气数据'))
const energyDialogTitle = computed(() => {
  const record = energyDialogRecord.value

  return record ? `${record.season} ${record.monthDay} 能耗占比` : '能耗占比'
})
const editableEnergyTotal = computed(() => {
  const total = editableEnergyRatios.value.reduce((sum, item) => sum + Number(item.ratio || 0), 0)

  return Math.round(total * 1000) / 1000
})
const editableEnergyAverage = computed(() => {
  if (editableEnergyRatios.value.length === 0) {
    return 0
  }

  return editableEnergyTotal.value / editableEnergyRatios.value.length
})
const editableEnergyPeak = computed(() => {
  return editableEnergyRatios.value.reduce<EditableEnergyRatio | null>(
    (peak, item) => (!peak || item.ratio > peak.ratio ? item : peak),
    null
  )
})
const generationDialogTitle = computed(() => {
  const record = generationDialogRecord.value

  return record ? `${record.season} ${record.monthDay} 24小时发电量` : '24小时发电量'
})
const editableGenerationTotal = computed(() => {
  const total = editableGenerationKwh.value.reduce((sum, item) => sum + Number(item.kwh || 0), 0)

  return Math.round(total * 1000) / 1000
})
const editableGenerationAverage = computed(() => {
  if (editableGenerationKwh.value.length === 0) {
    return 0
  }

  return editableGenerationTotal.value / editableGenerationKwh.value.length
})
const editableGenerationPeak = computed(() => {
  return editableGenerationKwh.value.reduce<EditableGenerationKwh | null>(
    (peak, item) => (!peak || item.kwh > peak.kwh ? item : peak),
    null
  )
})

onMounted(() => {
  loadRecords()
})

async function loadRecords(): Promise<void> {
  loading.value = true

  try {
    records.value = await window.api.weather.list({
      keyword: keyword.value.trim() || undefined,
      season: seasonFilter.value || undefined
    })
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
    season: row.season,
    date: row.date,
    humidity: row.humidity,
    temperature: row.temperature,
    weather: row.weather,
    precipitation: row.precipitation,
    sunrise: row.sunrise,
    sunset: row.sunset,
    sunlightMax: row.sunlightMax
  })
  dialogVisible.value = true
}

async function submitForm(): Promise<void> {
  if (!formRef.value) return

  await formRef.value.validate()
  saving.value = true

  try {
    let savedRecord: WeatherRecord
    const actionText = editingId.value ? '更新' : '新增'

    if (editingId.value) {
      savedRecord = await window.api.weather.update(editingId.value, { ...form })
    } else {
      savedRecord = await window.api.weather.create({ ...form })
    }

    const allRecords = await window.api.weather.list()
    const plcPreview = createWeatherPlcPreview(savedRecord, allRecords)
    logWeatherPlcPreview(savedRecord, plcPreview)

    try {
      const plcResult = await window.api.plc.writeWeather(
        createWeatherPlcWriteInput(savedRecord, plcPreview)
      )
      logWeatherPlcWriteResult(plcResult)

      if (plcResult.ok) {
        ElMessage.success(`天气数据已${actionText}，PLC传输成功`)
      } else {
        ElMessage.warning(`天气数据已${actionText}，${plcResult.error || plcResult.statusText}`)
      }
    } catch (plcError) {
      console.error('[天气模型] PLC 传输失败', plcError)
      ElMessage.warning(
        `天气数据已${actionText}，PLC传输失败：${getErrorMessage(plcError, '未知错误')}`
      )
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
    await ElMessageBox.confirm(
      `确认删除 ${row.season} ${row.monthDay} 的天气数据吗？`,
      '删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    await window.api.weather.remove(row.id)
    ElMessage.success('天气数据已删除')
    await loadRecords()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(getErrorMessage(error, '天气数据删除失败'))
    }
  }
}

function openEnergyDialog(row: WeatherRecord): void {
  energyDialogRecord.value = row
  editableEnergyRatios.value = cloneEnergyRatios(row.energyRatios)
  energySaveError.value = ''
  energyDialogVisible.value = true
}

async function saveEnergyRatios(): Promise<void> {
  const record = energyDialogRecord.value

  if (!record) {
    return
  }

  savingEnergyRatios.value = true
  energySaveError.value = ''

  try {
    const updatedRecord = await window.api.weather.updateEnergyRatios(
      record.date,
      editableEnergyRatios.value.map((item) => ({
        hour: item.hour,
        time: item.time,
        ratio: item.ratio
      }))
    )

    records.value = records.value.map((item) =>
      item.date === updatedRecord.date ? updatedRecord : item
    )
    energyDialogRecord.value = updatedRecord
    editableEnergyRatios.value = cloneEnergyRatios(updatedRecord.energyRatios)
    energyDialogVisible.value = false
    ElMessage.success('能耗占比已保存')
  } catch (error) {
    energySaveError.value = getErrorMessage(error, '能耗占比保存失败')
  } finally {
    savingEnergyRatios.value = false
  }
}

function openGenerationDialog(row: WeatherRecord): void {
  generationDialogRecord.value = row
  editableGenerationKwh.value = cloneGenerationKwh(row.generationKwh)
  generationSaveError.value = ''
  generationDialogVisible.value = true
}

async function saveGenerationKwh(): Promise<void> {
  const record = generationDialogRecord.value

  if (!record) {
    return
  }

  const validationError = validateGenerationKwh(editableGenerationKwh.value)

  if (validationError) {
    generationSaveError.value = validationError
    return
  }

  savingGenerationKwh.value = true
  generationSaveError.value = ''

  try {
    const updatedRecord = await window.api.weather.updateGenerationKwh(
      record.date,
      editableGenerationKwh.value.map((item) => ({
        hour: item.hour,
        time: item.time,
        kwh: Math.round(Number(item.kwh) * 1000) / 1000
      }))
    )

    records.value = records.value.map((item) =>
      item.date === updatedRecord.date ? updatedRecord : item
    )
    generationDialogRecord.value = updatedRecord
    editableGenerationKwh.value = cloneGenerationKwh(updatedRecord.generationKwh)
    generationDialogVisible.value = false
    ElMessage.success('24小时发电量已保存')
  } catch (error) {
    generationSaveError.value = getErrorMessage(error, '发电量保存失败')
  } finally {
    savingGenerationKwh.value = false
  }
}

function resetForm(): void {
  const season = seasonFilter.value || '春秋'

  Object.assign(form, {
    season,
    date: getNextDateForSeason(season),
    humidity: 50,
    temperature: 8,
    weather: '晴天',
    precipitation: 0,
    sunrise: '06:00',
    sunset: '20:00',
    sunlightMax: '12:30'
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

function getSeasonTagClass(season: WeatherSeason): string {
  if (season === '夏') return 'season-tag season-tag--summer'
  if (season === '冬') return 'season-tag season-tag--winter'
  return 'season-tag season-tag--spring-autumn'
}

function cloneEnergyRatios(ratios: HourlyEnergyRatio[] = []): EditableEnergyRatio[] {
  const ratioByHour = new Map(ratios.map((item) => [item.hour, item.ratio]))

  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    time: `${String(hour).padStart(2, '0')}:00`,
    ratio: ratioByHour.get(hour) ?? 0
  }))
}

function cloneGenerationKwh(values: HourlyGenerationKwh[] = []): EditableGenerationKwh[] {
  const kwhByHour = new Map(values.map((item) => [item.hour, item.kwh]))

  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    time: `${String(hour).padStart(2, '0')}:00`,
    kwh: kwhByHour.get(hour) ?? 0
  }))
}

function validateGenerationKwh(values: EditableGenerationKwh[]): string {
  if (values.length !== 24) {
    return '发电量必须包含 24 个小时段'
  }

  const seenHours = new Set<number>()

  for (const item of values) {
    if (!Number.isInteger(item.hour) || item.hour < 0 || item.hour > 23) {
      return '发电量小时必须是 0 到 23 之间的整数'
    }

    if (seenHours.has(item.hour)) {
      return '发电量小时不能重复'
    }

    if (!Number.isFinite(Number(item.kwh)) || Number(item.kwh) < 0) {
      return `${item.time} 的发电量必须大于或等于 0 kWh`
    }

    seenHours.add(item.hour)
  }

  return ''
}

function formatEnergyRatio(value?: number | null, digits = 3): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '暂无'
}

function formatGenerationKwh(value?: number | null, digits = 3): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '暂无'
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function createWeatherPlcPreview(
  savedRecord: WeatherRecord,
  allRecords: WeatherRecord[]
): WeatherPlcPreview {
  const dateIndex = getWeatherDateIndex(savedRecord, allRecords)
  const values: Record<WeatherPlcPointName, number | string | null> = {
    DateIndex1: dateIndex,
    Weather: weatherPlcCodeByName[savedRecord.weather] ?? null,
    Rainfall: savedRecord.precipitation,
    Temperature: savedRecord.temperature,
    Humidity: savedRecord.humidity,
    SunriseTime: timeToPlcTimeLiteral(savedRecord.sunrise),
    SunsetTime: timeToPlcTimeLiteral(savedRecord.sunset)
  }
  const sourceValues: Record<WeatherPlcPointName, number | string> = {
    DateIndex1: savedRecord.date,
    Weather: savedRecord.weather,
    Rainfall: savedRecord.precipitation,
    Temperature: savedRecord.temperature,
    Humidity: savedRecord.humidity,
    SunriseTime: savedRecord.sunrise,
    SunsetTime: savedRecord.sunset
  }
  const notes: Record<WeatherPlcPointName, string> = {
    DateIndex1:
      dateIndex === null
        ? '未在全部天气数据中找到该记录'
        : `全部天气数据第 ${dateIndex + 1} 条，PLC 从 0 开始传 ${dateIndex}`,
    Weather:
      values.Weather === null
        ? `未配置天气“${savedRecord.weather}”的 PLC 编码`
        : '晴天=1，雨天=2，强风=3，雪=4，暴雪=5',
    Rainfall: '保存值，写入 PLC 时按 0.1 缩放为整数',
    Temperature: '保存值，写入 PLC 时按 0.1 缩放为有符号整数',
    Humidity: '保存值，写入 PLC 时按 0.1 缩放为整数',
    SunriseTime: 'HH:mm 转为 PLC Time 字面量，例如 T#7h40m',
    SunsetTime: 'HH:mm 转为 PLC Time 字面量，例如 T#17h41m'
  }
  const points: WeatherPlcPointPreview[] = weatherPlcPointDefinitions.map((definition) => ({
    ...definition,
    sourceValue: sourceValues[definition.name],
    plcValue: values[definition.name],
    note: notes[definition.name]
  }))

  return { values, points }
}

function logWeatherPlcPreview(savedRecord: WeatherRecord, preview: WeatherPlcPreview): void {
  console.group('[天气模型] PLC 保存数据预览')
  console.log('保存后的天气记录', savedRecord)
  console.log('PLC 值对象', preview.values)
  console.table(preview.points)
  console.groupEnd()
}

function createWeatherPlcWriteInput(
  savedRecord: WeatherRecord,
  preview: WeatherPlcPreview
): PlcWeatherWriteInput {
  return {
    dateIndex: getRequiredPlcNumber(preview.values.DateIndex1, '日期索引'),
    weatherCode: getRequiredPlcNumber(preview.values.Weather, `天气“${savedRecord.weather}”编码`),
    rainfall: savedRecord.precipitation,
    temperature: savedRecord.temperature,
    humidity: savedRecord.humidity,
    sunrise: savedRecord.sunrise,
    sunset: savedRecord.sunset
  }
}

function getRequiredPlcNumber(value: number | string | null, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} 无效，无法传输到 PLC`)
  }

  return value
}

function logWeatherPlcWriteResult(result: PlcWeatherWriteResult): void {
  console.group('[天气模型] PLC 传输结果')
  console.log('整体结果', result)
  console.table(
    result.writes.map((item) => ({
      name: item.name,
      address: `%${item.registerArea}${item.offsetAddress}`,
      modbusRegisterAddress: item.modbusRegisterAddress,
      status: item.status,
      displayValue: item.displayValue,
      rawValue: item.rawValue,
      rawRegisters: item.rawRegisters.join(','),
      verifyRegisters: item.verifyRegisters.join(','),
      verifyValue: item.verifyValue,
      verified: item.verified,
      error: item.error
    }))
  )
  console.groupEnd()
}

function getWeatherDateIndex(
  savedRecord: WeatherRecord,
  allRecords: WeatherRecord[]
): number | null {
  const index = allRecords.findIndex((record) => record.id === savedRecord.id)

  if (index >= 0) {
    return index
  }

  const fallbackIndex = allRecords.findIndex(
    (record) => record.season === savedRecord.season && record.date === savedRecord.date
  )

  return fallbackIndex >= 0 ? fallbackIndex : null
}

function timeToPlcTimeLiteral(value: string): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)

  if (!match) {
    return null
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null
  }

  return `T#${hours}h${minutes}m`
}

function getNextDateForSeason(season: WeatherSeason): string {
  const seasonRecords = records.value
    .filter((item) => item.season === season)
    .sort((a, b) => a.date.localeCompare(b.date))
  const latestDate = seasonRecords.at(-1)?.date

  if (latestDate) {
    const date = new Date(`${latestDate}T00:00:00`)
    date.setDate(date.getDate() + 1)
    return formatDateInput(date)
  }

  if (season === '夏') {
    return '2026-08-01'
  }

  if (season === '冬') {
    return '2026-01-01'
  }

  return '2026-04-01'
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
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
      <el-select
        v-model="seasonFilter"
        clearable
        class="w-full sm:w-40"
        placeholder="季节模式"
        @change="loadRecords"
        @clear="loadRecords"
      >
        <el-option v-for="item in seasonOptions" :key="item" :label="item" :value="item" />
      </el-select>
      <el-input
        v-model="keyword"
        clearable
        class="max-w-md"
        placeholder="搜索日期、天气或季节"
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
      <el-table-column label="季节" min-width="90">
        <template #default="{ row }">
          <el-tag effect="plain" :class="getSeasonTagClass(row.season)">{{ row.season }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="日期">
        <template #default="{ row }">{{ row.monthDay }}</template>
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
      <el-table-column prop="sunlightMax" label="当日光照 Max" min-width="130" />
      <!-- <el-table-column label="更新时间">
        <template #default="{ row }">{{ formatUpdatedAt(row.updatedAt) }}</template>
      </el-table-column> -->
      <el-table-column label="操作" fixed="right" min-width="260">
        <template #default="{ row }">
          <el-button link type="success" :icon="View" @click="openEnergyDialog(row)"
            >能耗</el-button
          >
          <el-button link type="warning" :icon="Lightning" @click="openGenerationDialog(row)"
            >发电量</el-button
          >
          <el-button link type="primary" :icon="Edit" @click="openEditDialog(row)">编辑</el-button>
          <el-button link type="danger" :icon="Delete" @click="removeRecord(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>

  <el-dialog v-model="dialogVisible" :title="dialogTitle" width="min(720px, 92vw)">
    <el-form ref="formRef" :model="form" :rules="formRules" label-position="top">
      <div class="grid gap-x-4 sm:grid-cols-2">
        <el-form-item label="季节模式" prop="season">
          <el-select v-model="form.season" class="w-full" placeholder="请选择季节模式">
            <el-option v-for="item in seasonOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期" prop="date">
          <el-date-picker
            v-model="form.date"
            type="date"
            value-format="YYYY-MM-DD"
            format="MM月DD日"
            class="w-full!"
            placeholder="选择日期"
          />
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
        <el-form-item label="当日光照 Max" prop="sunlightMax">
          <el-time-picker
            v-model="form.sunlightMax"
            value-format="HH:mm"
            format="HH:mm"
            class="w-full!"
            placeholder="选择当日光照 Max"
          />
        </el-form-item>
      </div>
    </el-form>

    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="energyDialogVisible"
    :title="energyDialogTitle"
    width="min(920px, 94vw)"
    :close-on-click-modal="!savingEnergyRatios"
  >
    <div class="energy-ratio-dialog-body">
      <div class="energy-ratio-summary">
        <div>
          <span>全天合计</span>
          <strong>{{ formatEnergyRatio(editableEnergyTotal, 1) }}%</strong>
        </div>
        <div>
          <span>峰值时段</span>
          <strong>{{ editableEnergyPeak?.time ?? '暂无' }}</strong>
        </div>
        <div>
          <span>峰值占比</span>
          <strong>{{ formatEnergyRatio(editableEnergyPeak?.ratio, 3) }}%</strong>
        </div>
        <div>
          <span>平均占比</span>
          <strong>{{ formatEnergyRatio(editableEnergyAverage, 2) }}%</strong>
        </div>
      </div>

      <el-alert
        v-if="energySaveError"
        :title="energySaveError"
        type="error"
        show-icon
        :closable="false"
      />

      <div class="energy-ratio-editor-grid">
        <label v-for="item in editableEnergyRatios" :key="item.hour" class="energy-ratio-field">
          <span>{{ item.time }}</span>
          <el-input-number
            v-model="item.ratio"
            :min="0"
            :max="100"
            :step="0.001"
            :precision="3"
            controls-position="right"
            size="small"
          />
        </label>
      </div>
    </div>

    <template #footer>
      <el-button :disabled="savingEnergyRatios" @click="energyDialogVisible = false"
        >取消</el-button
      >
      <el-button type="primary" :loading="savingEnergyRatios" @click="saveEnergyRatios">
        保存能耗占比
      </el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="generationDialogVisible"
    :title="generationDialogTitle"
    width="min(920px, 94vw)"
    :close-on-click-modal="!savingGenerationKwh"
  >
    <div class="energy-ratio-dialog-body">
      <div class="energy-ratio-summary">
        <div>
          <span>全天发电量</span>
          <strong>{{ formatGenerationKwh(editableGenerationTotal) }} kWh</strong>
        </div>
        <div>
          <span>峰值时段</span>
          <strong>{{ editableGenerationPeak?.time ?? '暂无' }}</strong>
        </div>
        <div>
          <span>峰值发电量</span>
          <strong>{{ formatGenerationKwh(editableGenerationPeak?.kwh) }} kWh</strong>
        </div>
        <div>
          <span>小时平均发电量</span>
          <strong>{{ formatGenerationKwh(editableGenerationAverage) }} kWh</strong>
        </div>
      </div>

      <el-alert
        v-if="generationSaveError"
        :title="generationSaveError"
        type="error"
        show-icon
        :closable="false"
      />

      <div class="energy-ratio-editor-grid">
        <label v-for="item in editableGenerationKwh" :key="item.hour" class="energy-ratio-field">
          <span>{{ item.time }}</span>
          <el-input-number
            v-model="item.kwh"
            :min="0"
            :step="0.001"
            :precision="3"
            controls-position="right"
            size="small"
          />
        </label>
      </div>
    </div>

    <template #footer>
      <el-button :disabled="savingGenerationKwh" @click="generationDialogVisible = false"
        >取消</el-button
      >
      <el-button type="primary" :loading="savingGenerationKwh" @click="saveGenerationKwh">
        保存24小时发电量
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.season-tag {
  min-width: 48px;
  justify-content: center;
  border: 0;
  font-weight: 700;
}

.season-tag--spring-autumn {
  color: #047857;
  background: #d1fae5;
}

.season-tag--summer {
  color: #b45309;
  background: #fef3c7;
}

.season-tag--winter {
  color: #0369a1;
  background: #dbeafe;
}

.energy-ratio-dialog-body {
  display: grid;
  gap: 16px;
}

.energy-ratio-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.energy-ratio-summary > div {
  display: grid;
  min-width: 0;
  gap: 6px;
  padding: 14px 16px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: linear-gradient(180deg, #f8fafc, #eff6ff);
}

.energy-ratio-summary span {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.energy-ratio-summary strong {
  overflow: hidden;
  color: #0f172a;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.1;
  text-overflow: clip;
  white-space: nowrap;
}

.energy-ratio-editor-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}

.energy-ratio-field {
  display: grid;
  min-width: 0;
  gap: 6px;
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}

.energy-ratio-field > span {
  color: #0369a1;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
}

.energy-ratio-field :deep(.el-input-number) {
  width: 100%;
}

@media (max-width: 900px) {
  .energy-ratio-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .energy-ratio-editor-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .energy-ratio-summary,
  .energy-ratio-editor-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
