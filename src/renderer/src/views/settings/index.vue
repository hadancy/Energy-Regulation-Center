<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Check,
  CircleCheckFilled,
  Connection,
  Delete,
  FolderOpened,
  Lock,
  Message,
  Monitor,
  Plus,
  RefreshRight
} from '@element-plus/icons-vue'

const form = reactive({ path: '', name: '' })
const savedSettings = ref({ path: '', name: '' })
const isChoosing = ref(false)
const isSaving = ref(false)
const isTesting = ref(false)
type EmailSettings = Awaited<ReturnType<typeof window.api.email.getSettings>>
type EmailRecipient = EmailSettings['recipients'][number]

const emailForm = reactive({
  smtpHost: 'smtp.163.com',
  smtpPort: 465,
  secure: true,
  user: 'ruiyacenter@163.com',
  authorizationCode: '',
  senderName: '能源调控中心',
  recipients: [] as EmailRecipient[]
})
const hasAuthorizationCode = ref(false)
const isEmailSaving = ref(false)
const isEmailTesting = ref(false)
type SettingsSection = 'email' | 'external'
const activeSettingsSection = ref<SettingsSection>('email')

const isExternalAppConfigured = computed(() => Boolean(form.path))
const isEmailConfigured = computed(
  () => hasAuthorizationCode.value && emailForm.recipients.length > 0
)

const applySettings = (settings: { path: string; name: string }): void => {
  form.path = settings.path
  form.name = settings.name
  savedSettings.value = { ...settings }
}

const applyEmailSettings = (settings: EmailSettings): void => {
  emailForm.smtpHost = settings.smtpHost
  emailForm.smtpPort = settings.smtpPort
  emailForm.secure = settings.secure
  emailForm.user = settings.user
  emailForm.authorizationCode = ''
  emailForm.senderName = settings.senderName
  emailForm.recipients = settings.recipients.map((recipient) => ({ ...recipient }))
  hasAuthorizationCode.value = settings.hasAuthorizationCode
}

const addEmailRecipient = (): void => {
  emailForm.recipients.push({
    id: crypto.randomUUID(),
    name: '',
    email: ''
  })
}

const removeEmailRecipient = (index: number): void => {
  emailForm.recipients.splice(index, 1)
}

const isEmailAddress = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const validateEmailForm = (requireRecipients: boolean): boolean => {
  if (!emailForm.smtpHost.trim()) {
    ElMessage.warning('请输入 SMTP 服务器')
    return false
  }

  if (!isEmailAddress(emailForm.user.trim())) {
    ElMessage.warning('请输入正确的发件邮箱')
    return false
  }

  if (!hasAuthorizationCode.value && !emailForm.authorizationCode.trim()) {
    ElMessage.warning('请输入邮箱 SMTP 授权码')
    return false
  }

  if (requireRecipients && emailForm.recipients.length === 0) {
    ElMessage.warning('请至少添加一个工单提醒邮箱')
    return false
  }

  const invalidIndex = emailForm.recipients.findIndex(
    (recipient) => !isEmailAddress(recipient.email.trim())
  )

  if (invalidIndex >= 0) {
    ElMessage.warning(`第 ${invalidIndex + 1} 个收件邮箱格式不正确`)
    return false
  }

  const normalizedEmails = emailForm.recipients.map((recipient) =>
    recipient.email.trim().toLowerCase()
  )

  if (new Set(normalizedEmails).size !== normalizedEmails.length) {
    ElMessage.warning('收件邮箱不能重复')
    return false
  }

  return true
}

const saveEmailSettings = async (
  showSuccess = true,
  requireRecipients = false
): Promise<boolean> => {
  if (!validateEmailForm(requireRecipients)) {
    return false
  }

  isEmailSaving.value = true

  try {
    const settings = await window.api.email.saveSettings({
      smtpHost: emailForm.smtpHost.trim(),
      smtpPort: emailForm.smtpPort,
      secure: emailForm.secure,
      user: emailForm.user.trim(),
      authorizationCode: emailForm.authorizationCode.trim() || undefined,
      senderName: emailForm.senderName.trim() || '能源调控中心',
      recipients: emailForm.recipients.map((recipient) => ({
        id: recipient.id,
        name: recipient.name.trim(),
        email: recipient.email.trim()
      }))
    })

    applyEmailSettings(settings)

    if (showSuccess) {
      ElMessage.success('邮件提醒设置已保存')
    }

    return true
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '邮件提醒设置保存失败'))
    return false
  } finally {
    isEmailSaving.value = false
  }
}

const testEmailSettings = async (): Promise<void> => {
  const saved = await saveEmailSettings(false, true)

  if (!saved) {
    return
  }

  isEmailTesting.value = true

  try {
    const result = await window.api.email.test()

    if (!result.ok) {
      ElMessage.error(result.error || result.statusText || '测试邮件发送失败')
      return
    }

    ElMessage.success(`测试邮件发送成功，共 ${result.accepted.length} 个邮箱已被服务器接收`)
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '测试邮件发送失败'))
  } finally {
    isEmailTesting.value = false
  }
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

  try {
    applyEmailSettings(await window.api.email.getSettings())
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '读取邮件提醒设置失败'))
  }
})
</script>

<template>
  <div class="settings-page mx-auto max-w-7xl">
    <div class="settings-layout">
      <aside class="settings-sidebar">
        <div class="settings-sidebar__intro">
          <p class="settings-sidebar__eyebrow">SETTING CENTER</p>
          <h2>配置中心</h2>
          <p>集中管理大屏联动和工单通知服务。</p>
        </div>

        <nav class="settings-nav" aria-label="设置分类">
          <button
            type="button"
            class="settings-nav__item"
            :class="{ 'is-active': activeSettingsSection === 'email' }"
            @click="activeSettingsSection = 'email'"
          >
            <span class="settings-nav__icon"
              ><el-icon><Message /></el-icon
            ></span>
            <span class="settings-nav__copy">
              <strong>邮件提醒</strong>
              <small>SMTP 与通知对象</small>
            </span>
            <span
              class="settings-nav__status"
              :class="isEmailConfigured ? 'is-ready' : 'is-pending'"
            >
              {{ isEmailConfigured ? '已启用' : '待完善' }}
            </span>
          </button>

          <button
            type="button"
            class="settings-nav__item"
            :class="{ 'is-active': activeSettingsSection === 'external' }"
            @click="activeSettingsSection = 'external'"
          >
            <span class="settings-nav__icon"
              ><el-icon><Monitor /></el-icon
            ></span>
            <span class="settings-nav__copy">
              <strong>外部软件</strong>
              <small>大屏快捷跳转</small>
            </span>
            <span
              class="settings-nav__status"
              :class="isExternalAppConfigured ? 'is-ready' : 'is-pending'"
            >
              {{ isExternalAppConfigured ? '已配置' : '未配置' }}
            </span>
          </button>
        </nav>

        <div class="settings-sidebar__note">
          <el-icon><Lock /></el-icon>
          <p>敏感配置加密后保存在本机，不会在页面中回显。</p>
        </div>
      </aside>

      <section class="min-w-0">
        <el-card
          v-if="activeSettingsSection === 'email'"
          shadow="never"
          class="admin-card settings-card"
        >
          <template #header>
            <div class="settings-card__header">
              <div class="settings-card__title">
                <span class="stat-icon stat-icon--cyan h-11 w-11 shrink-0">
                  <el-icon :size="22"><Message /></el-icon>
                </span>
                <div>
                  <h2>工单邮件提醒</h2>
                  <p>配置发件服务，并维护需要接收工单提醒的目标用户。</p>
                </div>
              </div>
              <el-tag :type="isEmailConfigured ? 'success' : 'warning'" effect="light" round>
                {{ isEmailConfigured ? '服务已启用' : '配置待完善' }}
              </el-tag>
            </div>
          </template>

          <el-form label-position="top" class="settings-form" @submit.prevent="saveEmailSettings()">
            <div class="settings-section">
              <div class="settings-section__heading">
                <span class="settings-section__number">01</span>
                <div>
                  <h3>发件服务</h3>
                  <p>用于连接 163 邮箱 SMTP 服务并标识邮件发件人。</p>
                </div>
              </div>

              <div class="settings-form-grid">
                <el-form-item label="发件邮箱">
                  <el-input v-model="emailForm.user" placeholder="例如：alarm@example.com" />
                </el-form-item>

                <el-form-item label="发件人名称">
                  <el-input v-model="emailForm.senderName" maxlength="32" show-word-limit />
                </el-form-item>

                <el-form-item label="SMTP 服务器">
                  <el-input v-model="emailForm.smtpHost" placeholder="smtp.163.com">
                    <template #prefix
                      ><el-icon><Connection /></el-icon
                    ></template>
                  </el-input>
                </el-form-item>

                <el-form-item label="端口与加密方式">
                  <div class="smtp-control">
                    <el-input-number
                      v-model="emailForm.smtpPort"
                      class="smtp-control__port"
                      :min="1"
                      :max="65535"
                      :controls="false"
                    />
                    <div class="smtp-control__secure">
                      <span>{{ emailForm.secure ? 'TLS 加密' : 'STARTTLS' }}</span>
                      <el-switch v-model="emailForm.secure" />
                    </div>
                  </div>
                </el-form-item>
              </div>
            </div>

            <div class="settings-section">
              <div class="settings-section__heading settings-section__heading--credential">
                <span class="settings-section__number">02</span>
                <div>
                  <h3>身份凭据</h3>
                  <p>授权码使用系统安全存储加密，保存后仅显示配置状态。</p>
                </div>
                <span class="credential-state" :class="{ 'is-ready': hasAuthorizationCode }">
                  <el-icon
                    ><CircleCheckFilled v-if="hasAuthorizationCode" /><Lock v-else
                  /></el-icon>
                  {{ hasAuthorizationCode ? '授权码已安全保存' : '尚未保存授权码' }}
                </span>
              </div>

              <el-form-item label="SMTP 授权码" class="settings-credential-field">
                <el-input
                  v-model="emailForm.authorizationCode"
                  type="password"
                  show-password
                  autocomplete="new-password"
                  :placeholder="
                    hasAuthorizationCode ? '已安全保存，留空表示不修改' : '请输入邮箱授权码'
                  "
                >
                  <template #prefix
                    ><el-icon><Lock /></el-icon
                  ></template>
                </el-input>
              </el-form-item>
            </div>

            <div class="settings-section settings-section--recipients">
              <div class="settings-section__heading settings-section__heading--action">
                <span class="settings-section__number">03</span>
                <div>
                  <h3>工单提醒对象</h3>
                  <p>MW680 写入成功后，系统会同时通知以下用户。</p>
                </div>
                <el-button type="primary" plain :icon="Plus" @click="addEmailRecipient">
                  添加邮箱
                </el-button>
              </div>

              <el-empty
                v-if="emailForm.recipients.length === 0"
                class="recipient-empty"
                :image-size="72"
                description="暂未添加提醒邮箱"
              >
                <el-button type="primary" plain :icon="Plus" @click="addEmailRecipient">
                  添加第一个邮箱
                </el-button>
              </el-empty>

              <div v-else class="recipient-table">
                <div class="recipient-table__head" aria-hidden="true">
                  <span>序号</span>
                  <span>用户名称</span>
                  <span>收件邮箱</span>
                  <span />
                </div>
                <div
                  v-for="(recipient, index) in emailForm.recipients"
                  :key="recipient.id"
                  class="recipient-table__row"
                >
                  <span class="recipient-index">{{ String(index + 1).padStart(2, '0') }}</span>
                  <el-input
                    v-model="recipient.name"
                    class="recipient-name"
                    aria-label="用户名称"
                    placeholder="值班工程师"
                  />
                  <el-input
                    v-model="recipient.email"
                    class="recipient-email"
                    aria-label="收件邮箱"
                    placeholder="engineer@example.com"
                  />
                  <el-button
                    class="recipient-delete"
                    type="danger"
                    text
                    circle
                    :icon="Delete"
                    aria-label="删除收件邮箱"
                    @click="removeEmailRecipient(index)"
                  />
                </div>
              </div>
            </div>

            <div class="settings-action-bar">
              <p>
                <el-icon><CircleCheckFilled /></el-icon>
                当前已配置 {{ emailForm.recipients.length }} 位提醒对象
              </p>
              <div class="flex flex-wrap justify-end gap-3">
                <el-button
                  :icon="RefreshRight"
                  :loading="isEmailTesting"
                  :disabled="isEmailSaving"
                  @click="testEmailSettings"
                >
                  发送测试邮件
                </el-button>
                <el-button
                  native-type="submit"
                  type="primary"
                  :icon="Check"
                  :loading="isEmailSaving"
                  :disabled="isEmailTesting"
                >
                  保存邮件设置
                </el-button>
              </div>
            </div>
          </el-form>
        </el-card>

        <el-card v-else shadow="never" class="admin-card settings-card">
          <template #header>
            <div class="settings-card__header">
              <div class="settings-card__title">
                <span class="stat-icon stat-icon--cyan h-11 w-11 shrink-0">
                  <el-icon :size="22"><Monitor /></el-icon>
                </span>
                <div>
                  <h2>外部软件跳转</h2>
                  <p>设置监控大屏顶部快捷按钮需要打开的软件。</p>
                </div>
              </div>
              <el-tag :type="isExternalAppConfigured ? 'success' : 'info'" effect="light" round>
                {{ isExternalAppConfigured ? '已配置' : '尚未配置' }}
              </el-tag>
            </div>
          </template>

          <el-form label-position="top" class="settings-form" @submit.prevent="saveSettings">
            <div class="settings-section">
              <div class="settings-section__heading">
                <span class="settings-section__number">01</span>
                <div>
                  <h3>软件位置</h3>
                  <p>选择本机软件或快捷方式，保存后即可从监控大屏快速打开。</p>
                </div>
              </div>

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
                <p class="field-help">
                  Windows 支持 .exe、.lnk、.bat 或 .cmd 文件，建议优先选择程序快捷方式。
                </p>
              </el-form-item>

              <el-form-item label="大屏按钮名称" class="settings-external-name">
                <el-input
                  v-model="form.name"
                  maxlength="16"
                  show-word-limit
                  placeholder="例如：生产管理系统"
                />
              </el-form-item>
            </div>

            <div class="settings-action-bar">
              <p>保存后将立即更新监控大屏右上角按钮。</p>
              <div class="flex flex-wrap justify-end gap-3">
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
            </div>
          </el-form>
        </el-card>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-layout {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  gap: 1.25rem;
  align-items: start;
}

.settings-sidebar {
  position: sticky;
  top: 1.5rem;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
}

.settings-sidebar__intro {
  padding: 1.35rem 1.25rem 1.15rem;
  border-bottom: 1px solid #eef2f7;
}

.settings-sidebar__eyebrow {
  margin-bottom: 0.3rem;
  color: #0891b2;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.settings-sidebar__intro h2 {
  color: #0f172a;
  font-size: 1rem;
  font-weight: 700;
}

.settings-sidebar__intro p:last-child {
  margin-top: 0.35rem;
  color: #64748b;
  font-size: 0.76rem;
  line-height: 1.65;
}

.settings-nav {
  display: grid;
  gap: 0.4rem;
  padding: 0.75rem;
}

.settings-nav__item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: 0.65rem;
  align-items: center;
  width: 100%;
  min-height: 62px;
  padding: 0.65rem 0.7rem;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #475569;
  text-align: left;
  cursor: pointer;
  background: transparent;
  transition: 0.18s ease;
}

.settings-nav__item:hover {
  background: #f8fafc;
}

.settings-nav__item.is-active {
  border-color: #bae6fd;
  color: #0e7490;
  background: #ecfeff;
  box-shadow: inset 3px 0 #06b6d4;
}

.settings-nav__icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 8px;
  color: #64748b;
  background: #f1f5f9;
}

.settings-nav__item.is-active .settings-nav__icon {
  color: #0e7490;
  background: #cffafe;
}

.settings-nav__copy {
  display: grid;
  min-width: 0;
}

.settings-nav__copy strong {
  font-size: 0.84rem;
  font-weight: 700;
}

.settings-nav__copy small {
  overflow: hidden;
  color: #94a3b8;
  font-size: 0.68rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-nav__status {
  padding: 0.12rem 0.38rem;
  border-radius: 999px;
  font-size: 0.62rem;
  font-weight: 700;
  white-space: nowrap;
}

.settings-nav__status.is-ready {
  color: #047857;
  background: #d1fae5;
}

.settings-nav__status.is-pending {
  color: #b45309;
  background: #fef3c7;
}

.settings-sidebar__note {
  display: flex;
  gap: 0.55rem;
  align-items: flex-start;
  margin: 0 0.75rem 0.75rem;
  padding: 0.75rem;
  border-radius: 8px;
  color: #64748b;
  background: #f8fafc;
}

.settings-sidebar__note .el-icon {
  flex: 0 0 auto;
  margin-top: 0.1rem;
  color: #0891b2;
}

.settings-sidebar__note p {
  font-size: 0.69rem;
  line-height: 1.55;
}

.settings-card {
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
}

.settings-card :deep(.el-card__header) {
  padding: 1.05rem 1.25rem;
}

.settings-card :deep(.el-card__body) {
  padding: 0;
}

.settings-card__header,
.settings-card__title {
  display: flex;
  align-items: center;
}

.settings-card__header {
  justify-content: space-between;
  gap: 1rem;
}

.settings-card__title {
  min-width: 0;
  gap: 0.8rem;
}

.settings-card__title h2 {
  color: #0f172a;
  font-size: 1rem;
  font-weight: 700;
}

.settings-card__title p {
  margin-top: 0.15rem;
  color: #64748b;
  font-size: 0.75rem;
}

.settings-section {
  padding: 1.25rem;
}

.settings-section + .settings-section {
  border-top: 1px solid #eef2f7;
}

.settings-section__heading {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 1.1rem;
}

.settings-section__heading--credential,
.settings-section__heading--action {
  grid-template-columns: 34px minmax(0, 1fr) auto;
}

.settings-section__number {
  display: grid;
  width: 34px;
  height: 28px;
  place-items: center;
  border-radius: 7px;
  color: #0e7490;
  font-size: 0.7rem;
  font-weight: 800;
  background: #ecfeff;
}

.settings-section__heading h3 {
  color: #1e293b;
  font-size: 0.88rem;
  font-weight: 700;
}

.settings-section__heading p {
  margin-top: 0.12rem;
  color: #94a3b8;
  font-size: 0.7rem;
}

.settings-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 1rem;
}

.settings-form :deep(.el-form-item) {
  margin-bottom: 1rem;
}

.settings-form :deep(.el-form-item__label) {
  color: #475569;
  font-size: 0.76rem;
  font-weight: 600;
}

.smtp-control {
  display: grid;
  grid-template-columns: minmax(90px, 0.7fr) minmax(145px, 1fr);
  gap: 0.55rem;
  width: 100%;
}

.smtp-control__port {
  width: 100%;
}

.smtp-control__secure {
  display: flex;
  min-height: 32px;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0 0.7rem;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  color: #64748b;
  font-size: 0.72rem;
  background: #ffffff;
}

.credential-state {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.55rem;
  border-radius: 999px;
  color: #b45309;
  font-size: 0.68rem;
  font-weight: 700;
  background: #fef3c7;
}

.credential-state.is-ready {
  color: #047857;
  background: #d1fae5;
}

.settings-credential-field {
  max-width: 34rem;
  margin-bottom: 0 !important;
}

.recipient-table {
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 9px;
}

.recipient-table__head,
.recipient-table__row {
  display: grid;
  grid-template-columns: 48px minmax(130px, 0.7fr) minmax(220px, 1.3fr) 36px;
  gap: 0.75rem;
  align-items: center;
}

.recipient-table__head {
  min-height: 38px;
  padding: 0 0.8rem;
  color: #64748b;
  font-size: 0.67rem;
  font-weight: 700;
  background: #f8fafc;
}

.recipient-table__row {
  min-height: 52px;
  padding: 0.55rem 0.8rem;
  border-top: 1px solid #eef2f7;
  background: #ffffff;
  transition: background 0.16s ease;
}

.recipient-table__row:hover {
  background: #fafeff;
}

.recipient-index {
  color: #0891b2;
  font-size: 0.69rem;
  font-weight: 800;
}

.recipient-delete {
  justify-self: end;
}

.recipient-empty {
  min-height: 210px;
  border: 1px dashed #cbd5e1;
  border-radius: 9px;
  background: #f8fafc;
}

.settings-action-bar {
  display: flex;
  min-height: 70px;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1.25rem;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}

.settings-action-bar > p {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: #64748b;
  font-size: 0.7rem;
}

.settings-action-bar > p .el-icon {
  color: #10b981;
}

.field-help {
  margin-top: 0.5rem;
  color: #64748b;
  font-size: 0.7rem;
  line-height: 1.6;
}

.settings-external-name {
  max-width: 34rem;
}

@media (max-width: 1023px) {
  .settings-layout {
    grid-template-columns: 1fr;
  }

  .settings-sidebar {
    position: static;
  }

  .settings-sidebar__intro,
  .settings-sidebar__note {
    display: none;
  }

  .settings-nav {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .settings-card__header,
  .settings-action-bar {
    align-items: flex-start;
    flex-direction: column;
  }

  .settings-form-grid {
    grid-template-columns: 1fr;
  }

  .settings-section__heading--credential,
  .settings-section__heading--action {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .settings-section__heading--credential .credential-state,
  .settings-section__heading--action .el-button {
    grid-column: 2;
    justify-self: start;
  }

  .recipient-table__head {
    display: none;
  }

  .recipient-table__row {
    grid-template-columns: 36px minmax(0, 1fr) 32px;
  }

  .recipient-index {
    grid-row: 1 / span 2;
  }

  .recipient-name,
  .recipient-email {
    grid-column: 2;
  }

  .recipient-delete {
    grid-column: 3;
    grid-row: 1 / span 2;
  }

  .settings-action-bar > div,
  .settings-action-bar .el-button {
    width: 100%;
  }
}

@media (max-width: 520px) {
  .settings-nav {
    grid-template-columns: 1fr;
  }

  .settings-nav__copy small,
  .settings-card__title p {
    display: none;
  }

  .smtp-control {
    grid-template-columns: 1fr;
  }
}
</style>
