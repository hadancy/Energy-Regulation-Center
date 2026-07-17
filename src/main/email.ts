import { ipcMain, safeStorage } from 'electron'
import nodemailer from 'nodemailer'
import { randomUUID } from 'crypto'
import { getAppMetadataValue, setAppMetadataValue } from './database/weatherRepository'
import {
  createWorkOrderCompletionEmail,
  WORK_ORDER_EMAIL_HTML,
  WORK_ORDER_EMAIL_SUBJECT,
  WORK_ORDER_EMAIL_TEXT
} from './workOrderEmailTemplate'

const EMAIL_SETTINGS_KEY = 'email_notification_settings_v1'
const EMAIL_SETTINGS_VERSION = 1
const DEFAULT_SMTP_HOST = 'smtp.163.com'
const DEFAULT_SMTP_PORT = 465
const DEFAULT_SMTP_USER = 'ruiyacenter@163.com'
const DEFAULT_SENDER_NAME = '能源调控中心'

export interface EmailRecipient {
  id: string
  name: string
  email: string
}

export interface EmailSettings {
  smtpHost: string
  smtpPort: number
  secure: boolean
  user: string
  senderName: string
  hasAuthorizationCode: boolean
  recipients: EmailRecipient[]
  updatedAt: string
}

export interface EmailSettingsInput {
  smtpHost: string
  smtpPort: number
  secure: boolean
  user: string
  authorizationCode?: string
  senderName: string
  recipients: EmailRecipient[]
}

export interface EmailSendResult {
  ok: boolean
  skipped: boolean
  statusText: string
  error: string
  accepted: string[]
  rejected: string[]
  messageId: string
  sentAt: string
}

interface PersistedEmailSettings {
  version: typeof EMAIL_SETTINGS_VERSION
  smtpHost: string
  smtpPort: number
  secure: boolean
  user: string
  senderName: string
  encryptedAuthorizationCode: string
  recipients: EmailRecipient[]
  updatedAt: string
}

interface EmailMessage {
  subject: string
  text: string
  html: string
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const createDefaultPersistedSettings = (): PersistedEmailSettings => ({
  version: EMAIL_SETTINGS_VERSION,
  smtpHost: DEFAULT_SMTP_HOST,
  smtpPort: DEFAULT_SMTP_PORT,
  secure: true,
  user: DEFAULT_SMTP_USER,
  senderName: DEFAULT_SENDER_NAME,
  encryptedAuthorizationCode: '',
  recipients: [],
  updatedAt: new Date().toISOString()
})

const normalizeText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const normalizeEmail = (value: unknown, label: string): string => {
  const email = normalizeText(value).toLowerCase()

  if (!emailPattern.test(email)) {
    throw new Error(`${label}格式不正确。`)
  }

  return email
}

const normalizePort = (value: unknown): number => {
  const port = typeof value === 'number' ? value : Number(value)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP端口必须是 1～65535 的整数。')
  }

  return port
}

const normalizeRecipients = (value: unknown): EmailRecipient[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const emails = new Set<string>()

  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`第 ${index + 1} 个提醒对象配置不正确。`)
    }

    const recipient = item as Partial<EmailRecipient>
    const email = normalizeEmail(recipient.email, `第 ${index + 1} 个收件邮箱`)

    if (emails.has(email)) {
      throw new Error(`收件邮箱 ${email} 重复。`)
    }

    emails.add(email)

    return {
      id: normalizeText(recipient.id) || randomUUID(),
      name: normalizeText(recipient.name) || email,
      email
    }
  })
}

const normalizePersistedSettings = (value: unknown): PersistedEmailSettings => {
  if (!value || typeof value !== 'object') {
    return createDefaultPersistedSettings()
  }

  const settings = value as Partial<PersistedEmailSettings>

  return {
    version: EMAIL_SETTINGS_VERSION,
    smtpHost: normalizeText(settings.smtpHost) || DEFAULT_SMTP_HOST,
    smtpPort: normalizePort(settings.smtpPort ?? DEFAULT_SMTP_PORT),
    secure: settings.secure !== false,
    user: normalizeEmail(settings.user ?? DEFAULT_SMTP_USER, '发件邮箱'),
    senderName: normalizeText(settings.senderName) || DEFAULT_SENDER_NAME,
    encryptedAuthorizationCode: normalizeText(settings.encryptedAuthorizationCode),
    recipients: normalizeRecipients(settings.recipients),
    updatedAt: normalizeText(settings.updatedAt) || new Date().toISOString()
  }
}

const persistSettings = (settings: PersistedEmailSettings): void => {
  setAppMetadataValue(EMAIL_SETTINGS_KEY, JSON.stringify(settings))
}

const readPersistedSettings = (): PersistedEmailSettings => {
  const storedValue = getAppMetadataValue(EMAIL_SETTINGS_KEY)

  if (!storedValue) {
    const defaults = createDefaultPersistedSettings()
    persistSettings(defaults)
    return defaults
  }

  try {
    return normalizePersistedSettings(JSON.parse(storedValue))
  } catch (error) {
    console.error(`[邮件] 配置读取失败：${getErrorMessage(error)}`)
    return createDefaultPersistedSettings()
  }
}

const toPublicSettings = (settings: PersistedEmailSettings): EmailSettings => ({
  smtpHost: settings.smtpHost,
  smtpPort: settings.smtpPort,
  secure: settings.secure,
  user: settings.user,
  senderName: settings.senderName,
  hasAuthorizationCode: Boolean(settings.encryptedAuthorizationCode),
  recipients: settings.recipients.map((recipient) => ({ ...recipient })),
  updatedAt: settings.updatedAt
})

export const getEmailSettings = (): EmailSettings => toPublicSettings(readPersistedSettings())

export const saveEmailSettings = (input: EmailSettingsInput): EmailSettings => {
  if (!input || typeof input !== 'object') {
    throw new Error('邮件配置为空。')
  }

  const currentSettings = readPersistedSettings()
  const authorizationCode = normalizeText(input.authorizationCode)
  let encryptedAuthorizationCode = currentSettings.encryptedAuthorizationCode

  if (authorizationCode) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('系统安全加密暂不可用，无法保存邮箱授权码。')
    }

    encryptedAuthorizationCode = safeStorage.encryptString(authorizationCode).toString('base64')
  }

  const settings: PersistedEmailSettings = {
    version: EMAIL_SETTINGS_VERSION,
    smtpHost: normalizeText(input.smtpHost) || DEFAULT_SMTP_HOST,
    smtpPort: normalizePort(input.smtpPort),
    secure: input.secure !== false,
    user: normalizeEmail(input.user, '发件邮箱'),
    senderName: normalizeText(input.senderName) || DEFAULT_SENDER_NAME,
    encryptedAuthorizationCode,
    recipients: normalizeRecipients(input.recipients),
    updatedAt: new Date().toISOString()
  }

  persistSettings(settings)
  return toPublicSettings(settings)
}

const decryptAuthorizationCode = (settings: PersistedEmailSettings): string => {
  if (!settings.encryptedAuthorizationCode) {
    throw new Error('尚未配置邮箱授权码。')
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统安全加密暂不可用，无法读取邮箱授权码。')
  }

  try {
    return safeStorage.decryptString(Buffer.from(settings.encryptedAuthorizationCode, 'base64'))
  } catch {
    throw new Error('邮箱授权码解密失败，请在设置页重新填写并保存。')
  }
}

const normalizeAddressList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item)) : []

const sendEmail = async (message: EmailMessage): Promise<EmailSendResult> => {
  const settings = readPersistedSettings()
  const sentAt = new Date().toISOString()
  let transporter: nodemailer.Transporter | null = null

  try {
    if (settings.recipients.length === 0) {
      throw new Error('尚未添加工单提醒邮箱。')
    }

    const authorizationCode = decryptAuthorizationCode(settings)
    transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.secure,
      auth: {
        user: settings.user,
        pass: authorizationCode
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      disableFileAccess: true,
      disableUrlAccess: true
    })
    const info = await transporter.sendMail({
      from: {
        name: settings.senderName,
        address: settings.user
      },
      to: settings.recipients.map((recipient) => ({
        name: recipient.name,
        address: recipient.email
      })),
      subject: message.subject,
      text: message.text,
      html: message.html
    })

    return {
      ok: true,
      skipped: false,
      statusText: '邮件发送成功',
      error: '',
      accepted: normalizeAddressList(info.accepted),
      rejected: normalizeAddressList(info.rejected),
      messageId: info.messageId,
      sentAt
    }
  } catch (error) {
    const messageText = getErrorMessage(error)
    console.error(`[邮件] 发送失败：${messageText}`)

    return {
      ok: false,
      skipped: false,
      statusText: '邮件发送失败',
      error: messageText,
      accepted: [],
      rejected: [],
      messageId: '',
      sentAt
    }
  } finally {
    transporter?.close()
  }
}

export const createSkippedEmailResult = (reason: string): EmailSendResult => ({
  ok: false,
  skipped: true,
  statusText: '邮件未发送',
  error: reason,
  accepted: [],
  rejected: [],
  messageId: '',
  sentAt: ''
})

export const sendWorkOrderNotification = async (): Promise<EmailSendResult> => {
  return sendEmail({
    subject: WORK_ORDER_EMAIL_SUBJECT,
    text: WORK_ORDER_EMAIL_TEXT,
    html: WORK_ORDER_EMAIL_HTML
  })
}

export const sendWorkOrderCompletionNotification = async (
  completedAt: string
): Promise<EmailSendResult> => {
  const completionTime = new Date(completedAt).toLocaleString('zh-CN', { hour12: false })

  return sendEmail(createWorkOrderCompletionEmail(completionTime))
}

const sendTestEmail = (): Promise<EmailSendResult> => {
  const testedAt = new Date().toLocaleString('zh-CN', { hour12: false })

  return sendEmail({
    subject: '[能源调控中心] 邮件配置测试',
    text: `邮件配置测试成功。\n测试时间：${testedAt}`,
    html: `
      <div style="font-family:Arial,'Microsoft YaHei',sans-serif;color:#1f2937;line-height:1.7">
        <h2 style="color:#0e7490">邮件配置测试成功</h2>
        <p>能源调控中心已成功连接 SMTP 服务并发送此测试邮件。</p>
        <p>测试时间：${testedAt}</p>
      </div>
    `
  })
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : '未知邮件错误。'

export const registerEmailIpc = (): void => {
  ipcMain.handle('email:get-settings', () => getEmailSettings())
  ipcMain.handle('email:save-settings', (_event, input: EmailSettingsInput) =>
    saveEmailSettings(input)
  )
  ipcMain.handle('email:test', () => sendTestEmail())
}
