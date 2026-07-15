<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheck,
  Connection,
  Delete,
  DocumentChecked,
  Plus,
  Refresh,
  RefreshLeft,
  Warning
} from '@element-plus/icons-vue'

type PlcState = Awaited<ReturnType<typeof window.api.plc.getState>>
type PlcReadPoint = PlcState['points'][number]
type PlcPointReading = PlcState['readings'][number]
type PlcPointDataType = PlcReadPoint['dataType']
type PlcValueKey = NonNullable<PlcReadPoint['valueKey']>
type PlcTestResult = Awaited<ReturnType<typeof window.api.plc.testConnection>>
type TagType = 'success' | 'warning' | 'info' | 'danger' | 'primary'

interface PlcPointForm {
  uid: string
  id: string
  name: string
  registerArea: string
  offsetAddress: number
  dataType: PlcPointDataType
  scale: number
  unit: string
  enabled: boolean
  valueKey: PlcValueKey | ''
}

const dataTypeOptions: Array<{ label: string; value: PlcPointDataType }> = [
  { label: 'UINT16', value: 'uint16' },
  { label: 'INT16', value: 'int16' },
  { label: 'UINT32', value: 'uint32' },
  { label: 'INT32', value: 'int32' },
  { label: 'FLOAT32', value: 'float32' }
]

const valueKeyOptions: Array<{ label: string; value: PlcValueKey | '' }> = [
  { label: '不绑定', value: '' },
  { label: '风速', value: 'windSpeed' },
  { label: '温度', value: 'temperature' },
  { label: '湿度', value: 'humidity' },
  { label: '光照度', value: 'illuminance' }
]

const registerAreaOptions = ['MW', 'DB', 'M', 'I', 'Q', 'D', 'R', 'W']

const loading = ref(false)
const testing = ref(false)
const applying = ref(false)
const resetting = ref(false)
const currentState = ref<PlcState | null>(null)
const testResult = ref<PlcTestResult | null>(null)
const rows = ref<PlcPointForm[]>([])

const connectionForm = reactive({
  host: '',
  port: 503,
  unitId: 1,
  timeoutMs: 3000
})

const enabledRows = computed(() => rows.value.filter((row) => row.enabled))
const readingByPointId = computed(() => {
  const readings = new Map<string, PlcPointReading>()

  for (const reading of testResult.value?.readings ?? []) {
    readings.set(reading.pointId, reading)
  }

  return readings
})
const successCount = computed(
  () => testResult.value?.readings.filter((reading) => reading.status === 'success').length ?? 0
)
const failureCount = computed(
  () => testResult.value?.readings.filter((reading) => reading.status === 'error').length ?? 0
)
const currentStatusType = computed<TagType>(() => {
  if (currentState.value?.status === 'connected') return 'success'
  if (currentState.value?.status === 'partial') return 'warning'
  if (currentState.value?.status === 'connecting') return 'primary'
  if (currentState.value?.status === 'error') return 'danger'
  return 'info'
})
const resultStatusType = computed<TagType>(() => {
  if (!testResult.value) return 'info'
  if (testResult.value.ok) return 'success'
  if (successCount.value > 0) return 'warning'
  return 'danger'
})
const activePointText = computed(() => `${enabledRows.value.length}/${rows.value.length}`)
const pointRangeText = computed(() => {
  const activeRows = enabledRows.value

  if (activeRows.length === 0) {
    return '--'
  }

  const areas = [...new Set(activeRows.map((row) => row.registerArea.trim().toUpperCase() || 'MW'))]

  if (areas.length > 1) {
    return `${areas.length} 个寄存器区`
  }

  const area = areas[0]
  const addresses = activeRows
    .map((row) => Number(row.offsetAddress))
    .filter((address) => Number.isFinite(address))
    .sort((a, b) => a - b)

  if (addresses.length === 0) {
    return `${area}--`
  }

  const firstAddress = addresses[0]
  const lastAddress = addresses.at(-1) ?? firstAddress

  return firstAddress === lastAddress
    ? `${area}${firstAddress}`
    : `${area}${firstAddress}-${lastAddress}`
})
const currentStatusLabel = computed(() => currentState.value?.statusText ?? '未加载')
const resultStatusLabel = computed(() => testResult.value?.statusText ?? '未测试')
const currentStatusBadgeClass = computed(() => getStatusBadgeClass(currentStatusType.value))
const resultStatusBadgeClass = computed(() => getStatusBadgeClass(resultStatusType.value))

onMounted(() => {
  void loadState()
})

async function loadState(): Promise<void> {
  loading.value = true

  try {
    const state = await window.api.plc.getState()
    applyStateToForm(state)

    if (rows.value.length === 0) {
      addPoint()
    }
  } catch (error) {
    ElMessage.error(getErrorMessage(error, 'PLC状态加载失败'))
  } finally {
    loading.value = false
  }
}

function applyStateToForm(state: PlcState): void {
  currentState.value = state
  connectionForm.host = state.host
  connectionForm.port = state.port
  connectionForm.unitId = state.unitId
  connectionForm.timeoutMs = state.timeoutMs
  rows.value = state.points.map(toPointRow)
}

function toPointRow(point: PlcReadPoint): PlcPointForm {
  return {
    uid: createUid(),
    id: point.id,
    name: point.name,
    registerArea: point.registerArea || 'MW',
    offsetAddress: point.offsetAddress,
    dataType: point.dataType,
    scale: point.scale,
    unit: point.unit,
    enabled: point.enabled,
    valueKey: point.valueKey ?? ''
  }
}

function addPoint(): void {
  const previous = rows.value.at(-1)
  const nextIndex = rows.value.length + 1

  rows.value.push({
    uid: createUid(),
    id: `point-${nextIndex}`,
    name: `点位${nextIndex}`,
    registerArea: previous?.registerArea || 'MW',
    offsetAddress: previous ? Number(previous.offsetAddress) + 1 : 0,
    dataType: 'uint16',
    scale: 1,
    unit: '',
    enabled: true,
    valueKey: ''
  })
}

function removePoint(row: PlcPointForm): void {
  rows.value = rows.value.filter((item) => item.uid !== row.uid)
}

async function testConnection(): Promise<void> {
  if (!validateConfiguration()) {
    return
  }

  testing.value = true

  try {
    testResult.value = await window.api.plc.testConnection({
      ...getConnectionPayload(),
      points: getApiPoints()
    })

    if (testResult.value.ok) {
      ElMessage.success('PLC读取正常')
    } else if (successCount.value > 0) {
      ElMessage.warning('PLC部分点位异常')
    } else {
      ElMessage.error('PLC读取失败')
    }
  } catch (error) {
    ElMessage.error(getErrorMessage(error, 'PLC测试失败'))
  } finally {
    testing.value = false
  }
}

async function saveConfiguration(): Promise<void> {
  if (!validateConfiguration()) {
    return
  }

  applying.value = true

  try {
    const state = await window.api.plc.saveConfig({
      ...getConnectionPayload(),
      points: getApiPoints()
    })
    applyStateToForm(state)
    ElMessage.success('PLC配置已保存并应用')
  } catch (error) {
    ElMessage.error(getErrorMessage(error, 'PLC配置保存失败'))
  } finally {
    applying.value = false
  }
}

async function resetConfiguration(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '将删除已保存的 PLC 连接参数和点位，并恢复环境变量或内置默认值。是否继续？',
      '恢复默认配置',
      {
        confirmButtonText: '恢复默认',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  resetting.value = true

  try {
    const state = await window.api.plc.resetConfig()
    applyStateToForm(state)
    testResult.value = null
    ElMessage.success('PLC配置已恢复默认')
  } catch (error) {
    ElMessage.error(getErrorMessage(error, 'PLC配置恢复失败'))
  } finally {
    resetting.value = false
  }
}

function validateConfiguration(): boolean {
  if (!connectionForm.host.trim()) {
    ElMessage.warning('请输入 PLC IP')
    return false
  }

  const port = Number(connectionForm.port)
  const unitId = Number(connectionForm.unitId)
  const timeoutMs = Number(connectionForm.timeoutMs)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    ElMessage.warning('PLC 端口必须是 1 到 65535 之间的整数')
    return false
  }

  if (!Number.isInteger(unitId) || unitId < 1 || unitId > 255) {
    ElMessage.warning('PLC 站号必须是 1 到 255 之间的整数')
    return false
  }

  if (!Number.isInteger(timeoutMs) || timeoutMs < 200) {
    ElMessage.warning('PLC 超时时间必须是大于或等于 200ms 的整数')
    return false
  }

  return validateRows()
}

function validateRows(): boolean {
  if (rows.value.length === 0) {
    ElMessage.warning('请先新增 PLC 点位')
    return false
  }

  if (enabledRows.value.length === 0) {
    ElMessage.warning('请至少启用一个 PLC 点位')
    return false
  }

  const invalidRow = rows.value.find((row) => {
    return (
      row.enabled &&
      (!row.registerArea.trim() ||
        !Number.isFinite(Number(row.offsetAddress)) ||
        Number(row.offsetAddress) < 0)
    )
  })

  if (invalidRow) {
    ElMessage.warning(`${invalidRow.name || invalidRow.id} 的寄存器区或地址无效`)
    return false
  }

  const ids = enabledRows.value.map(getPointId)
  const duplicateId = ids.find((id, index) => ids.indexOf(id) !== index)

  if (duplicateId) {
    ElMessage.warning(`点位ID重复：${duplicateId}`)
    return false
  }

  return true
}

function getConnectionPayload(): { host: string; port: number; unitId: number; timeoutMs: number } {
  return {
    host: connectionForm.host.trim(),
    port: toPositiveInteger(connectionForm.port, 503),
    unitId: toPositiveInteger(connectionForm.unitId, 1),
    timeoutMs: toPositiveInteger(connectionForm.timeoutMs, 3000)
  }
}

function getApiPoints(): PlcReadPoint[] {
  return rows.value.map((row) => {
    const point: PlcReadPoint = {
      id: getPointId(row),
      name: row.name.trim() || getPointId(row),
      registerArea: row.registerArea.trim().toUpperCase(),
      dbBlock: 0,
      offsetAddress: toNonNegativeInteger(row.offsetAddress, 0),
      dataType: row.dataType,
      scale: toFiniteNumber(row.scale, 1),
      unit: row.unit.trim(),
      enabled: row.enabled
    }

    if (row.valueKey) {
      point.valueKey = row.valueKey
    }

    return point
  })
}

function getPointId(row: PlcPointForm): string {
  return row.id.trim() || row.uid
}

function getReading(row: PlcPointForm): PlcPointReading | undefined {
  return readingByPointId.value.get(getPointId(row))
}

function getReadingTagType(reading?: PlcPointReading): TagType {
  if (!reading) return 'info'
  if (reading.status === 'success') return 'success'
  if (reading.status === 'skipped') return 'info'
  return 'danger'
}

function getReadingText(reading?: PlcPointReading): string {
  if (!reading) return '未测试'
  if (reading.status === 'success') return '读取成功'
  if (reading.status === 'skipped') return '已停用'
  return '读取失败'
}

function getStatusBadgeClass(type: TagType): string {
  if (type === 'success') return 'status-pill status-pill--success'
  if (type === 'warning') return 'status-pill status-pill--warning'
  if (type === 'danger') return 'status-pill status-pill--danger'
  if (type === 'primary') return 'status-pill status-pill--primary'
  return 'status-pill'
}

function formatPointAddress(
  point: Pick<PlcPointForm | PlcPointReading, 'registerArea' | 'offsetAddress'>
): string {
  return `${point.registerArea || 'MW'}${point.offsetAddress}`
}

function formatReadingValue(reading?: PlcPointReading): string {
  if (!reading || reading.status !== 'success' || typeof reading.value !== 'number') {
    return '--'
  }

  const valueText = Number.isInteger(reading.value)
    ? String(reading.value)
    : reading.value.toFixed(3)
  return `${valueText}${reading.unit ? ` ${reading.unit}` : ''}`
}

function formatRawRegisters(reading?: PlcPointReading): string {
  if (!reading || reading.rawRegisters.length === 0) {
    return '--'
  }

  return reading.rawRegisters.join(', ')
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function toNonNegativeInteger(value: unknown, fallback: number): number {
  return Math.max(0, Math.trunc(toFiniteNumber(value, fallback)))
}

function toPositiveInteger(value: unknown, fallback: number): number {
  return Math.max(1, Math.trunc(toFiniteNumber(value, fallback)))
}

function createUid(): string {
  return `plc-point-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
</script>

<template>
  <div class="plc-test-page">
    <div class="plc-top-grid">
      <el-card v-loading="loading" shadow="never" class="admin-card plc-panel plc-config-panel">
        <template #header>
          <div class="plc-panel-header">
            <div>
              <p class="plc-eyebrow">Connection</p>
              <h2 class="plc-panel-title">连接参数</h2>
            </div>
            <div class="plc-toolbar">
              <el-button :icon="RefreshLeft" :loading="resetting" @click="resetConfiguration">
                恢复默认
              </el-button>
              <el-button :icon="Refresh" :loading="loading" @click="loadState">刷新</el-button>
            </div>
          </div>
        </template>

        <div class="plc-config-body">
          <div class="plc-protocol-summary">
            <span class="plc-protocol-dot" />
            <div>
              <strong>{{ currentState?.protocol ?? 'Modbus TCP' }}</strong>
              <p>{{ currentState?.brand ?? '西门子' }} · {{ currentState?.series ?? 'S7-1200' }}</p>
            </div>
          </div>

          <div class="plc-config-editor">
            <el-form label-position="top" class="plc-config-grid">
              <el-form-item label="PLC IP">
                <el-input v-model="connectionForm.host" placeholder="192.168.0.1" />
              </el-form-item>
              <el-form-item label="端口">
                <el-input-number
                  v-model="connectionForm.port"
                  :min="1"
                  :max="65535"
                  :step="1"
                  controls-position="right"
                  class="w-full!"
                />
              </el-form-item>
              <el-form-item label="站号">
                <el-input-number
                  v-model="connectionForm.unitId"
                  :min="1"
                  :max="255"
                  :step="1"
                  controls-position="right"
                  class="w-full!"
                />
              </el-form-item>
              <el-form-item label="超时">
                <el-input-number
                  v-model="connectionForm.timeoutMs"
                  :min="200"
                  :step="100"
                  controls-position="right"
                  class="w-full!"
                />
              </el-form-item>
            </el-form>
            <p class="plc-config-note">测试读取不会保存参数；点击“保存并应用”后重启仍然生效。</p>
          </div>
        </div>
      </el-card>

      <el-card shadow="never" class="admin-card plc-panel plc-status-panel">
        <template #header>
          <div class="plc-panel-header">
            <div>
              <p class="plc-eyebrow">Runtime</p>
              <h2 class="plc-panel-title">当前状态</h2>
            </div>
            <span :class="currentStatusBadgeClass">{{ currentStatusLabel }}</span>
          </div>
        </template>

        <div class="plc-status-grid">
          <div class="plc-metric">
            <span>启用点位</span>
            <strong>{{ activePointText }}</strong>
          </div>
          <div class="plc-metric">
            <span>地址范围</span>
            <strong>{{ pointRangeText }}</strong>
          </div>
          <div class="plc-metric">
            <span>测试耗时</span>
            <strong>{{ testResult ? `${testResult.durationMs}ms` : '--' }}</strong>
          </div>
          <div class="plc-metric">
            <span>测试结果</span>
            <strong>{{ resultStatusLabel }}</strong>
          </div>
        </div>
      </el-card>
    </div>

    <el-card shadow="never" class="admin-card plc-panel">
      <template #header>
        <div class="plc-panel-header plc-workspace-header">
          <div>
            <p class="plc-eyebrow">Points</p>
            <h2 class="plc-panel-title">PLC连接测试</h2>
          </div>
          <div class="plc-toolbar">
            <span :class="resultStatusBadgeClass">{{ resultStatusLabel }}</span>
            <el-button :icon="Plus" @click="addPoint">新增点位</el-button>
            <el-button type="primary" :icon="Connection" :loading="testing" @click="testConnection">
              测试读取
            </el-button>
            <el-button :icon="DocumentChecked" :loading="applying" @click="saveConfiguration">
              保存并应用
            </el-button>
          </div>
        </div>
      </template>

      <div class="plc-table-shell">
        <el-table :data="rows" row-key="uid" class="plc-point-table">
          <el-table-column label="启用" width="72" fixed="left" align="center">
            <template #default="{ row }">
              <el-switch v-model="row.enabled" />
            </template>
          </el-table-column>
          <el-table-column label="点位名称" min-width="142">
            <template #default="{ row }">
              <el-input v-model="row.name" placeholder="点位名称" />
            </template>
          </el-table-column>
          <el-table-column label="点位ID" min-width="140">
            <template #default="{ row }">
              <el-input v-model="row.id" placeholder="point-id" />
            </template>
          </el-table-column>
          <el-table-column label="寄存器区" width="116">
            <template #default="{ row }">
              <el-select v-model="row.registerArea" filterable allow-create default-first-option>
                <el-option
                  v-for="item in registerAreaOptions"
                  :key="item"
                  :label="item"
                  :value="item"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="地址" width="124">
            <template #default="{ row }">
              <el-input-number
                v-model="row.offsetAddress"
                :min="0"
                :step="1"
                controls-position="right"
                class="w-full!"
              />
            </template>
          </el-table-column>
          <el-table-column label="数据类型" width="124">
            <template #default="{ row }">
              <el-select v-model="row.dataType">
                <el-option
                  v-for="item in dataTypeOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="缩放" width="116">
            <template #default="{ row }">
              <el-input-number
                v-model="row.scale"
                :step="0.1"
                controls-position="right"
                class="w-full!"
              />
            </template>
          </el-table-column>
          <el-table-column label="单位" width="102">
            <template #default="{ row }">
              <el-input v-model="row.unit" placeholder="单位" />
            </template>
          </el-table-column>
          <el-table-column label="绑定值" width="126">
            <template #default="{ row }">
              <el-select v-model="row.valueKey">
                <el-option
                  v-for="item in valueKeyOptions"
                  :key="item.value || 'empty'"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="112">
            <template #default="{ row }">
              <el-tag :type="getReadingTagType(getReading(row))" effect="plain">
                {{ getReadingText(getReading(row)) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="读取值" min-width="118">
            <template #default="{ row }">
              <span class="plc-reading-value">{{ formatReadingValue(getReading(row)) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="78" fixed="right" align="center">
            <template #default="{ row }">
              <el-button circle :icon="Delete" aria-label="删除点位" @click="removePoint(row)" />
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

    <el-card v-if="testResult" shadow="never" class="admin-card plc-panel plc-result-panel">
      <template #header>
        <div class="plc-panel-header">
          <div>
            <p class="plc-eyebrow">Result</p>
            <h2 class="plc-panel-title">测试明细</h2>
          </div>
          <div class="plc-result-counts">
            <el-tag type="success" effect="plain">
              <el-icon><CircleCheck /></el-icon>
              成功 {{ successCount }}
            </el-tag>
            <el-tag type="danger" effect="plain">
              <el-icon><Warning /></el-icon>
              异常 {{ failureCount }}
            </el-tag>
          </div>
        </div>
      </template>

      <el-alert
        v-if="testResult.error"
        :title="testResult.error"
        type="warning"
        show-icon
        :closable="false"
        class="plc-result-alert"
      />

      <el-table :data="testResult.readings" row-key="pointId" class="plc-result-table">
        <el-table-column label="点位" min-width="150">
          <template #default="{ row }">{{ row.name }}</template>
        </el-table-column>
        <el-table-column label="地址" min-width="120">
          <template #default="{ row }">{{ formatPointAddress(row) }}</template>
        </el-table-column>
        <el-table-column label="原始寄存器" min-width="150">
          <template #default="{ row }">{{ formatRawRegisters(row) }}</template>
        </el-table-column>
        <el-table-column label="换算值" min-width="130">
          <template #default="{ row }">{{ formatReadingValue(row) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="116">
          <template #default="{ row }">
            <el-tag :type="getReadingTagType(row)" effect="plain">{{ getReadingText(row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="错误" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ row.error || '--' }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.plc-test-page {
  display: grid;
  gap: 16px;
  color: #0f172a;
}

.plc-top-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
  gap: 16px;
}

.plc-panel {
  overflow: hidden;
  border-color: #dbe3ef;
  background: #ffffff;
}

.plc-panel :deep(.el-card__header) {
  padding: 0;
  background: #fbfdff;
  border-bottom-color: #e6edf6;
}

.plc-panel :deep(.el-card__body) {
  padding: 0;
}

.plc-panel-header {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px;
}

.plc-eyebrow {
  margin: 0 0 2px;
  color: #8a96a8;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
}

.plc-panel-title {
  margin: 0;
  color: #111827;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.35;
}

.plc-config-body {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  min-height: 126px;
}

.plc-protocol-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 22px 20px;
  border-right: 1px solid #e6edf6;
  background: #f8fbff;
}

.plc-protocol-summary strong {
  display: block;
  color: #0f172a;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.25;
}

.plc-protocol-summary p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.3;
}

.plc-protocol-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #0891b2;
  box-shadow: 0 0 0 5px #cffafe;
}

.plc-config-grid {
  display: grid;
  align-content: center;
  gap: 14px;
  grid-template-columns: repeat(4, minmax(130px, 1fr));
}

.plc-config-editor {
  align-self: center;
  padding: 18px 20px;
}

.plc-config-note {
  margin: 10px 0 0;
  color: #7c8a9e;
  font-size: 12px;
  line-height: 1.4;
}

.plc-config-grid :deep(.el-form-item) {
  margin-bottom: 0;
}

.plc-config-grid :deep(.el-form-item__label) {
  margin-bottom: 6px;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
}

.plc-status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.plc-metric {
  min-height: 74px;
  padding: 14px 18px;
  border-top: 1px solid #eef2f7;
}

.plc-metric:nth-child(odd) {
  border-right: 1px solid #eef2f7;
}

.plc-metric span {
  display: block;
  margin-bottom: 6px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.2;
}

.plc-metric strong {
  display: block;
  overflow: hidden;
  color: #0f172a;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-pill {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  justify-content: center;
  padding: 3px 10px;
  border: 1px solid #d6dee9;
  border-radius: 999px;
  background: #f8fafc;
  color: #64748b;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.2;
  white-space: nowrap;
}

.status-pill--success {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #15803d;
}

.status-pill--warning {
  border-color: #fde68a;
  background: #fffbeb;
  color: #b45309;
}

.status-pill--danger {
  border-color: #fecaca;
  background: #fff1f2;
  color: #be123c;
}

.status-pill--primary {
  border-color: #bae6fd;
  background: #f0f9ff;
  color: #0369a1;
}

.plc-workspace-header {
  align-items: flex-start;
}

.plc-toolbar,
.plc-result-counts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.plc-table-shell {
  padding: 0 20px 18px;
}

.plc-point-table,
.plc-result-table {
  width: 100%;
}

.plc-point-table :deep(.el-table__header th),
.plc-result-table :deep(.el-table__header th) {
  height: 42px;
  background: #f8fafc;
  color: #64748b;
  font-size: 12px;
  font-weight: 650;
}

.plc-point-table :deep(.el-table__row td),
.plc-result-table :deep(.el-table__row td) {
  height: 48px;
  border-bottom-color: #edf2f7;
}

.plc-point-table :deep(.el-input__wrapper),
.plc-point-table :deep(.el-select__wrapper) {
  min-height: 32px;
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 0 0 1px #d5deea inset;
}

.plc-point-table :deep(.el-input__wrapper:hover),
.plc-point-table :deep(.el-select__wrapper:hover) {
  box-shadow: 0 0 0 1px #a7c0dc inset;
}

.plc-point-table :deep(.el-input-number .el-input__wrapper) {
  padding-left: 8px;
}

.plc-point-table :deep(.el-button.is-circle) {
  width: 30px;
  height: 30px;
  border-color: #d8e1ee;
  color: #64748b;
}

.plc-reading-value {
  color: #0f172a;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 13px;
  font-weight: 700;
}

.plc-result-panel :deep(.el-card__body) {
  padding: 0 20px 18px;
}

.plc-result-alert {
  margin: 16px 0;
}

.plc-result-counts :deep(.el-tag) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

@media (max-width: 1280px) {
  .plc-top-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 960px) {
  .plc-config-body {
    grid-template-columns: 1fr;
  }

  .plc-protocol-summary {
    border-right: 0;
    border-bottom: 1px solid #e6edf6;
  }

  .plc-config-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .plc-panel-header,
  .plc-workspace-header {
    align-items: stretch;
    flex-direction: column;
  }

  .plc-toolbar,
  .plc-result-counts {
    justify-content: flex-start;
  }

  .plc-config-grid,
  .plc-status-grid {
    grid-template-columns: 1fr;
  }

  .plc-metric:nth-child(odd) {
    border-right: 0;
  }
}
</style>
