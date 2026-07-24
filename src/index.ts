import { Context, h, Schema, Session } from 'koishi'
import { normalizeKeyboard } from './button'
import {
  containsAtPlaceholder,
  extractTemplateVariables,
  findUnknownPlaceholders,
  isValidTimeZone,
  renderMessageTemplate,
  type TemplateRenderMode,
} from './template'
import type {
  Config as PluginConfig,
  GroupConfig,
  MessageFormat,
  NotificationEventType,
  ResolvedNotificationConfig,
} from './types'

export * from './types'
export {
  containsAtPlaceholder,
  escapeMarkdown,
  extractTemplateVariables,
  findUnknownPlaceholders,
  isValidTimeZone,
  renderActionTemplate,
  renderMessageTemplate,
} from './template'
export { normalizeKeyboard } from './button'

export const name = 'welcome-messge-qq'

export const usage = `

本插件需配合 [adapter-qq-crack](/market?keyword=adapter-qq-crack) 使用。

## 默认配置

插件首次启用时会直接使用当前验证过的配置：

- 入群正文：<code>欢迎 {at} 加入群聊！</code>，并显示“关闭欢迎”按钮。
- 离群正文：<code>{at} 已离开群聊。</code>，并显示“关闭欢迎”和“帮助菜单”按钮。
- 关闭成功后显示“重新开启”按钮；开启成功后显示“再次关闭”按钮。
- 开启/关闭指令默认权限等级为 <code>1</code>。

## 模板变量

- {at}：@用户
- {username}：用户名
- {guildName}：群组名称
- {date}：事件日期
- {clock}：事件时间
- {event}：事件名称，固定为“加入群聊”或“离开群聊”
- {botId}：机器人id

## 按钮

- <code>action.type = 1</code> 是回调按钮。本插件只响应以下命名空间：
  - <code>welcome-messge-qq:reply:要回复的文本</code>：点击后发送指定文本。
  - <code>welcome-messge-qq:command:/要执行的指令</code>：点击后执行 Koishi 指令，例如 <code>welcome-messge-qq:command:/开启欢迎</code>。
- <code>action.type = 2</code> 是普通 QQ 指令按钮，<code>action.data</code> 直接填写指令内容，不经过本插件的回调处理。
- 按钮 <code>id</code> 可以省略，插件会按照行列自动生成稳定 ID，例如 <code>0-0</code>。
- 键盘配置填写 <code>keyboard.content</code> 内部的对象，即以 <code>{ &quot;rows&quot;: [...] }</code> 开始的 JSON。

`
export const CALLBACK_REPLY_PREFIX = 'welcome-messge-qq:reply:'
export const CALLBACK_COMMAND_PREFIX = 'welcome-messge-qq:command:'

export type ButtonCallbackAction =
  | { type: 'reply'; content: string }
  | { type: 'command'; command: string }

export function resolveButtonCallbackAction(data: unknown): ButtonCallbackAction | undefined {
  if (typeof data !== 'string') return
  if (data.startsWith(CALLBACK_REPLY_PREFIX)) {
    const content = data.slice(CALLBACK_REPLY_PREFIX.length)
    if (!content.trim()) return
    return { type: 'reply', content }
  }
  if (data.startsWith(CALLBACK_COMMAND_PREFIX)) {
    let command = data.slice(CALLBACK_COMMAND_PREFIX.length).trim()
    if (command.startsWith('/')) command = command.slice(1).trimStart()
    if (!command || /[\r\n]/u.test(command)) return
    return { type: 'command', command }
  }
}

export interface HandleButtonCallbackOptions {
  debug?: (message: string) => void
}

export async function handleButtonCallback(
  session: Session,
  options: HandleButtonCallbackOptions = {},
): Promise<boolean> {
  if (session.platform !== 'qq') return false
  const button = session.event.button as { data?: unknown } | undefined
  const action = resolveButtonCallbackAction(button?.data)
  if (!action) return false

  if (action.type === 'reply') {
    if (typeof session.send !== 'function') throw new Error('Current QQ interaction cannot send a callback reply.')
    await session.send(action.content)
    options.debug?.('Replied to a welcome-messge-qq callback button.')
    return true
  }

  if (typeof session.execute !== 'function') throw new Error('Current QQ interaction cannot execute a callback command.')
  session.content = action.command
  await session.execute(action.command)
  options.debug?.('Executed a welcome-messge-qq callback command.')
  return true
}

const DEFAULT_TIME_ZONE = 'Asia/Shanghai'
const DEFAULT_WELCOME_MESSAGE = '欢迎 {at} 加入群聊！'
const DEFAULT_LEAVE_MESSAGE = '{at} 已离开群聊。'
const DEFAULT_CLOSE_RESPONSE_MESSAGE = '# 已关闭本群入退群通知\n> 点击下方按钮可以重新开启。'
const DEFAULT_ENABLE_RESPONSE_MESSAGE = '# 已开启本群入退群通知\n> 点击下方按钮可以再次关闭。'
const DEFAULT_WELCOME_KEYBOARD = JSON.stringify({
  rows: [{
    buttons: [{
      render_data: { label: '关闭欢迎', style: 1 },
      action: {
        type: 1,
        permission: { type: 1 },
        data: `${CALLBACK_COMMAND_PREFIX}/关闭欢迎`,
        enter: true,
      },
    }],
  }],
}, null, 2)
const DEFAULT_LEAVE_KEYBOARD = JSON.stringify({
  rows: [{
    buttons: [
      {
        render_data: { label: '关闭欢迎', style: 1 },
        action: {
          type: 1,
          permission: { type: 1 },
          data: `${CALLBACK_COMMAND_PREFIX}/关闭欢迎`,
          enter: true,
        },
      },
      {
        render_data: { label: '帮助菜单', style: 1 },
        action: {
          type: 2,
          permission: { type: 2 },
          data: '/帮助菜单',
        },
      },
    ],
  }],
}, null, 2)
const DEFAULT_CLOSE_RESPONSE_KEYBOARD = JSON.stringify({
  rows: [{
    buttons: [{
      render_data: { label: '重新开启', style: 1 },
      action: {
        type: 1,
        permission: { type: 1 },
        data: `${CALLBACK_COMMAND_PREFIX}/开启欢迎`,
      },
    }],
  }],
}, null, 2)
const DEFAULT_ENABLE_RESPONSE_KEYBOARD = JSON.stringify({
  rows: [{
    buttons: [{
      render_data: { label: '再次关闭', style: 1 },
      action: {
        type: 1,
        permission: { type: 1 },
        data: `${CALLBACK_COMMAND_PREFIX}/关闭欢迎`,
      },
    }],
  }],
}, null, 2)

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createTimeZonePattern() {
  const supportedValuesOf = (Intl as typeof Intl & {
    supportedValuesOf?: (key: 'timeZone') => string[]
  }).supportedValuesOf
  if (!supportedValuesOf) return /^[A-Za-z_]+(?:\/[A-Za-z0-9._+-]+)+$/
  const zones = new Set([...supportedValuesOf('timeZone'), DEFAULT_TIME_ZONE, 'UTC', 'Etc/UTC', 'GMT'])
  return new RegExp(`^(?:${[...zones].sort().map(escapeRegExp).join('|')})$`)
}

const timeZoneSchema = Schema.string()
  .pattern(createTimeZonePattern())
  .default(DEFAULT_TIME_ZONE)
  .description('IANA 时区名称，例如 Asia/Shanghai。非法或当前运行时不支持的时区无法保存。')

const messageFormatSchema = Schema.union([
  Schema.const('text').description('普通消息（推荐）：直接按普通文字发送；需要 @ 成员或显示按钮时，插件会自动切换为 QQ Markdown。'),
  Schema.const('markdown').description('Markdown 消息：把模板按 QQ Markdown 排版发送，适合标题、引用、加粗等样式。'),
]).role('radio').default('text')

const groupSchema: Schema<GroupConfig> = Schema.object({
  guildId: Schema.string().required().description('QQ 群 OpenID（不是普通 QQ 群号），作为唯一匹配键。'),
  enabled: Schema.boolean().default(true).description('是否在此群启用成员变动通知。'),
  welcomeEnabled: Schema.boolean().description('可选。是否发送入群欢迎消息；未填写时继承全局配置。'),
  welcomeMessage: Schema.string().role('textarea').description('可选。入群欢迎模板；未填写时继承全局配置，显式空白表示不发送。'),
  welcomeKeyboard: Schema.string().role('textarea', { rows: [12, 12] }).collapse().description('可选。欢迎按钮 JSON；留空时继承全局键盘，显式填写空 rows 表示不显示按钮。'),
  leaveEnabled: Schema.boolean().description('可选。是否发送离群消息；未填写时继承全局配置。'),
  leaveMessage: Schema.string().role('textarea').description('可选。离群消息模板；未填写时继承全局配置，显式空白表示不发送。'),
  leaveKeyboard: Schema.string().role('textarea', { rows: [12, 12] }).collapse().description('可选。离群按钮 JSON；留空时继承全局键盘，显式填写空 rows 表示不显示按钮。'),
  messageFormat: Schema.union([
    Schema.const('text').description('普通消息：直接按普通文字发送；需要 @ 成员或显示按钮时自动转换。'),
    Schema.const('markdown').description('Markdown 消息：使用 QQ Markdown 的标题、引用、加粗等排版。'),
  ]).role('radio').description('可选。选择这个群的消息显示方式；未选择时使用上方的全局设置。'),
}).description('指定 QQ 群的覆盖规则')

export const Config: Schema<PluginConfig> = Schema.object({
  welcomeEnabled: Schema.boolean().default(true).description('是否发送入群欢迎消息。'),
  welcomeMessage: Schema.string().role('textarea').default(DEFAULT_WELCOME_MESSAGE).description('入群欢迎模板，支持多行和固定占位符。'),
  leaveEnabled: Schema.boolean().default(true).description('是否发送离群消息。'),
  leaveMessage: Schema.string().role('textarea').default(DEFAULT_LEAVE_MESSAGE).description('中性的离群消息模板，支持多行和固定占位符。'),
  messageFormat: messageFormatSchema.description('选择欢迎消息和离群消息的显示方式。不确定时保持“普通消息（推荐）”即可。'),
  scope: Schema.union([
    Schema.const('all').description('全部 QQ 群（推荐）：机器人加入的所有群都启用；下方群配置只用于单独关闭或修改某个群。'),
    Schema.const('configured').description('仅指定的 QQ 群：只在下方群配置中已经添加且没有关闭的群发送消息。'),
  ]).role('radio').default('all').description('选择入群欢迎和离群通知要在哪些 QQ 群生效。'),
  ignoreBots: Schema.boolean().default(true).description('忽略机器人自身以及标记为机器人的成员事件。'),
  timeZone: timeZoneSchema,
  closeCommandAuthority: Schema.number().step(1).min(0).max(5).default(1).description('开启/关闭当前群通知指令所需的 Koishi 权限等级。'),
  commandResponseFormat: Schema.union([
    Schema.const('text').description('普通文本；有按钮时自动转为 QQ Markdown。'),
    Schema.const('markdown').description('QQ 原生 Markdown。'),
  ]).default('text').description('开启/关闭指令成功响应的消息格式。'),
  closeResponseMessage: Schema.string().role('textarea').default(DEFAULT_CLOSE_RESPONSE_MESSAGE).description('关闭成功后的自定义响应正文。'),
  closeResponseKeyboard: Schema.string().role('textarea', { rows: [12, 12] }).collapse().default(DEFAULT_CLOSE_RESPONSE_KEYBOARD).description('关闭成功后的自定义按钮 JSON。'),
  enableResponseMessage: Schema.string().role('textarea').default(DEFAULT_ENABLE_RESPONSE_MESSAGE).description('开启成功后的自定义响应正文。'),
  enableResponseKeyboard: Schema.string().role('textarea', { rows: [12, 12] }).collapse().default(DEFAULT_ENABLE_RESPONSE_KEYBOARD).description('开启成功后的自定义按钮 JSON。'),
  welcomeKeyboard: Schema.string().role('textarea', { rows: [12, 12] }).collapse().default(DEFAULT_WELCOME_KEYBOARD).description('全局欢迎消息按钮 JSON。'),
  leaveKeyboard: Schema.string().role('textarea', { rows: [12, 12] }).collapse().default(DEFAULT_LEAVE_KEYBOARD).description('全局离群消息按钮 JSON。'),
  groups: Schema.array(groupSchema).default([]).description('按 QQ 群 OpenID 设置覆盖规则；重复 OpenID 使用最后一项。'),
})

export interface GroupConfigIndex {
  groups: Map<string, GroupConfig>
  duplicates: string[]
}

export function createGroupConfigIndex(groups: readonly GroupConfig[] = []): GroupConfigIndex {
  const index = new Map<string, GroupConfig>()
  const duplicates = new Set<string>()
  const source = Array.isArray(groups) ? groups : []
  for (const group of source) {
    if (!group || typeof group !== 'object') continue
    const guildId = typeof group.guildId === 'string' ? group.guildId.trim() : ''
    if (!guildId) continue
    if (index.has(guildId)) duplicates.add(guildId)
    index.set(guildId, group)
  }
  return { groups: index, duplicates: [...duplicates] }
}

function pickBoolean(override: unknown, global: unknown, fallback: boolean) {
  if (typeof override === 'boolean') return override
  if (typeof global === 'boolean') return global
  return fallback
}

function pickString(override: unknown, global: unknown, fallback: string) {
  if (typeof override === 'string') return override
  if (typeof global === 'string') return global
  return fallback
}

function pickKeyboard<T>(override: T | undefined, global: T | undefined): T | undefined {
  if (typeof override === 'string' && !override.trim()) return global
  return override !== undefined ? override : global
}
function pickMessageFormat(override: unknown, global: unknown): MessageFormat {
  if (override === 'text' || override === 'markdown') return override
  if (global === 'text' || global === 'markdown') return global
  return 'text'
}

export function resolveNotificationConfig(
  config: PluginConfig,
  index: ReadonlyMap<string, GroupConfig>,
  guildId: string,
  eventType: NotificationEventType,
): ResolvedNotificationConfig | undefined {
  const group = index.get(guildId)
  const scope = config.scope ?? 'all'
  if (scope === 'configured' && !group) return
  if (group?.enabled === false) return

  if (eventType === 'join') {
    return {
      enabled: pickBoolean(group?.welcomeEnabled, config.welcomeEnabled, true),
      message: pickString(group?.welcomeMessage, config.welcomeMessage, DEFAULT_WELCOME_MESSAGE),
      messageFormat: pickMessageFormat(group?.messageFormat, config.messageFormat),
      keyboard: pickKeyboard(group?.welcomeKeyboard, config.welcomeKeyboard),
    }
  }

  return {
    enabled: pickBoolean(group?.leaveEnabled, config.leaveEnabled, true),
    message: pickString(group?.leaveMessage, config.leaveMessage, DEFAULT_LEAVE_MESSAGE),
    messageFormat: pickMessageFormat(group?.messageFormat, config.messageFormat),
    keyboard: pickKeyboard(group?.leaveKeyboard, config.leaveKeyboard),
  }
}

export interface BuildNotificationOptions {
  debug?: (message: string) => void
  warn?: (message: string) => void
  now?: () => number
}

export function buildNotification(
  session: Session,
  eventType: NotificationEventType,
  resolved: ResolvedNotificationConfig,
  timeZone: string,
  options: BuildNotificationOptions = {},
): string | h | undefined {
  const template = typeof resolved.message === 'string' ? resolved.message : ''
  if (!template.trim()) {
    options.debug?.(`${eventType} 消息模板为空白，已跳过发送。`)
    return
  }

  const variables = extractTemplateVariables(session, {
    eventType,
    timeZone,
    now: options.now,
    debug: options.debug,
    warn: options.warn,
  })
  const rows = normalizeKeyboard(resolved.keyboard, variables, {
    debug: options.debug,
    warn: options.warn,
  })
  const hasButtons = rows.length > 0
  const needsMarkdown = resolved.messageFormat === 'markdown'
    || hasButtons
    || containsAtPlaceholder(template)
  const renderMode: TemplateRenderMode = resolved.messageFormat === 'markdown'
    ? 'markdown'
    : needsMarkdown
      ? 'markdown-text'
      : 'text'
  const rendered = renderMessageTemplate(template, variables, renderMode)

  const unknown = findUnknownPlaceholders(template)
  if (unknown.length) {
    options.debug?.(`消息模板包含未识别占位符：${unknown.map(value => `{${value}}`).join(', ')}。`)
  }
  if (!rendered.trim()) {
    options.debug?.(`${eventType} 消息渲染后为空白，已跳过发送。`)
    return
  }

  if (hasButtons) {
    return h('qq:rawmarkdown', {
      markdown: { content: rendered },
      keyboard: { content: { rows } },
    })
  }
  if (needsMarkdown) return h('markdown', rendered)
  return rendered
}

function normalizeTimeZone(timeZone: string | undefined, warn: (message: string) => void) {
  const normalized = typeof timeZone === 'string' ? timeZone.trim() : ''
  if (normalized && isValidTimeZone(normalized)) return normalized
  if (timeZone !== undefined && timeZone !== DEFAULT_TIME_ZONE) {
    warn(`配置的时区 ${JSON.stringify(timeZone)} 非法，运行时已回退到 ${DEFAULT_TIME_ZONE}。`)
  }
  return DEFAULT_TIME_ZONE
}

function isBotEvent(session: Session, ignoreBots: boolean) {
  if (session.userId && session.selfId && session.userId === session.selfId) return true
  if (!ignoreBots) return false
  return Boolean(session.event?.user?.isBot || session.event?.member?.user?.isBot)
}

export const CLOSE_COMMAND_NAME = 'welcome-messge-qq.close'
export const CLOSE_COMMAND_ALIASES = ['关闭入退群消息', '关闭欢迎'] as const
export const ENABLE_COMMAND_NAME = 'welcome-messge-qq.enable'
export const ENABLE_COMMAND_ALIASES = ['开启入退群消息', '开启欢迎'] as const

export function setGuildNotificationsEnabled(
  config: PluginConfig,
  guildId: string,
  enabled: boolean,
): PluginConfig {
  const normalizedGuildId = guildId.trim()
  const groups = Array.isArray(config.groups)
    ? config.groups.map(group => ({ ...group }))
    : []
  let matchedIndex = -1
  for (let index = 0; index < groups.length; index++) {
    if (typeof groups[index]?.guildId === 'string' && groups[index].guildId.trim() === normalizedGuildId) {
      matchedIndex = index
    }
  }

  if (matchedIndex >= 0) {
    groups[matchedIndex] = {
      ...groups[matchedIndex],
      guildId: normalizedGuildId,
      enabled,
    }
  } else {
    groups.push({ guildId: normalizedGuildId, enabled })
  }
  return { ...config, groups }
}

export function buildCommandResponse(
  session: Session,
  enabled: boolean,
  config: PluginConfig,
  timeZone: string,
  options: BuildNotificationOptions = {},
): string | h | undefined {
  const responseType = enabled ? 'enable' : 'close'
  const template = enabled
    ? (config.enableResponseMessage ?? DEFAULT_ENABLE_RESPONSE_MESSAGE)
    : (config.closeResponseMessage ?? DEFAULT_CLOSE_RESPONSE_MESSAGE)
  const keyboard = enabled ? config.enableResponseKeyboard : config.closeResponseKeyboard
  if (!template.trim()) {
    options.debug?.(`${responseType} response template is blank; skipped.`)
    return
  }

  const variables = extractTemplateVariables(session, {
    eventType: responseType,
    timeZone,
    debug: options.debug,
    warn: options.warn,
  })
  const rows = normalizeKeyboard(keyboard, variables, {
    debug: options.debug,
    warn: options.warn,
  })
  const hasButtons = rows.length > 0
  const format = config.commandResponseFormat ?? 'text'
  const needsMarkdown = format === 'markdown' || hasButtons || containsAtPlaceholder(template)
  const renderMode: TemplateRenderMode = format === 'markdown'
    ? 'markdown'
    : needsMarkdown
      ? 'markdown-text'
      : 'text'
  const rendered = renderMessageTemplate(template, variables, renderMode)
  if (!rendered.trim()) return

  if (hasButtons) {
    return h('qq:rawmarkdown', {
      markdown: { content: rendered },
      keyboard: { content: { rows } },
    })
  }
  if (needsMarkdown) return h('markdown', rendered)
  return rendered
}

export function disableGuildNotifications(config: PluginConfig, guildId: string): PluginConfig {
  return setGuildNotificationsEnabled(config, guildId, false)
}

export function enableGuildNotifications(config: PluginConfig, guildId: string): PluginConfig {
  return setGuildNotificationsEnabled(config, guildId, true)
}

interface LoaderLike {
  config?: {
    plugins?: Record<string, unknown>
  }
  writeConfig?: (silent?: boolean) => Promise<void>
}

function isConfigRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

interface PluginSourceReference {
  parent: Record<string, unknown>
  key: string
  source: Record<string, unknown>
}

function collectPluginSources(
  plugins: Record<string, unknown>,
  pluginName: string,
  result: PluginSourceReference[] = [],
): PluginSourceReference[] {
  for (const [key, value] of Object.entries(plugins)) {
    const normalizedName = key.replace(/^~/, '').split(':', 1)[0]
    if (normalizedName === pluginName) {
      result.push({
        parent: plugins,
        key,
        source: isConfigRecord(value) ? value : {},
      })
      continue
    }
    if (normalizedName === 'group' && isConfigRecord(value)) {
      collectPluginSources(value, pluginName, result)
    }
  }
  return result
}

function sourceMatchesConfig(source: Record<string, unknown>, config: PluginConfig) {
  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith('$')) continue
    if (!(key in config)) return false
    if (JSON.stringify(config[key as keyof PluginConfig]) !== JSON.stringify(value)) return false
  }
  return true
}

export async function persistGuildConfig(
  ctx: Context,
  groups: GroupConfig[],
  previousConfig?: PluginConfig,
): Promise<boolean> {
  const loader = (ctx as Context & { loader?: LoaderLike }).loader
  const plugins = loader?.config?.plugins
  if (!plugins || typeof loader?.writeConfig !== 'function') return false

  const candidates = collectPluginSources(plugins, name)
  const matches = previousConfig
    ? candidates.filter(candidate => sourceMatchesConfig(candidate.source, previousConfig))
    : candidates
  const target = matches.length === 1
    ? matches[0]
    : candidates.length === 1
      ? candidates[0]
      : undefined
  if (!target) return false

  target.parent[target.key] = { ...target.source, groups }
  await loader.writeConfig()
  return true
}

export async function persistDisabledGuildConfig(
  ctx: Context,
  groups: GroupConfig[],
  previousConfig?: PluginConfig,
): Promise<boolean> {
  return persistGuildConfig(ctx, groups, previousConfig)
}

const PASSIVE_REPLY_REJECTED_CODES = new Set([40034024, 40034027])

function hasPassiveReplyRejectedCode(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const record = value as { code?: unknown; err_code?: unknown }
  const code = record.err_code ?? record.code
  return (typeof code === 'number' || typeof code === 'string')
    && PASSIVE_REPLY_REJECTED_CODES.has(Number(code))
}

function isPassiveReplyRejected(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const record = error as {
      data?: unknown
      response?: { data?: unknown }
      cause?: unknown
      errors?: unknown
    }
    if (
      hasPassiveReplyRejectedCode(record)
      || hasPassiveReplyRejectedCode(record.data)
      || hasPassiveReplyRejectedCode(record.response?.data)
    ) return true
    if (record.cause && isPassiveReplyRejected(record.cause)) return true
    if (Array.isArray(record.errors) && record.errors.some(isPassiveReplyRejected)) return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return /(?:^|\D)(?:40034024|40034027)(?:\D|$)/.test(message)
}

export interface SendMemberNotificationOptions {
  debug?: (message: string) => void
}

export async function sendMemberNotification(
  session: Session,
  message: string | h,
  eventType: NotificationEventType,
  options: SendMemberNotificationOptions = {},
) {
  const bot = session.bot
  const channelId = session.channelId
  const sendActive = bot && typeof bot.sendMessage === 'function' && channelId
    ? () => bot.sendMessage(channelId, message, session.event.referrer)
    : undefined

  if (eventType === 'leave' && sendActive) {
    try {
      // A member-removal event is not consistently replyable through event_id, so leave
      // notifications prefer an ordinary active group message.
      return await sendActive()
    } catch (error) {
      if (typeof session.send !== 'function') throw error
      options.debug?.(`离群事件的主动群消息发送失败，回退为被动回复。`)
      return session.send(message)
    }
  }

  if (typeof session.send === 'function') {
    try {
      // Join notifications prefer the event-scoped passive reply. If QQ rejects that
      // lifecycle reply, retry below as an active group message.
      return await session.send(message)
    } catch (error) {
      if (!isPassiveReplyRejected(error)) throw error
      options.debug?.(`入群事件的被动回复被 QQ 拒绝，回退为主动群消息。`)
    }
  }

  if (sendActive) return sendActive()
  throw new Error('当前 QQ 会话不支持发送群成员通知。')
}

export function apply(ctx: Context, config: PluginConfig) {
  const logger = ctx.logger(name)
  let activeConfig = config
  let groupIndex = createGroupConfigIndex(activeConfig.groups)
  for (const guildId of groupIndex.duplicates) {
    logger.warn('检测到重复的群 OpenID %s，将使用 groups 中最后一项配置。', guildId)
  }
  const timeZone = normalizeTimeZone(activeConfig.timeZone, message => logger.warn(message))

  const handleMemberEvent = async (session: Session, eventType: NotificationEventType) => {
    if (session.platform !== 'qq') return
    if (!session.guildId || !session.channelId || !session.userId) {
      logger.warn(
        '忽略字段不完整的 QQ %s 事件：guildId=%s channelId=%s userId=%s',
        eventType,
        session.guildId || '(missing)',
        session.channelId || '(missing)',
        session.userId || '(missing)',
      )
      return
    }
    if (isBotEvent(session, activeConfig.ignoreBots ?? true)) {
      logger.debug('忽略 QQ 机器人成员事件：guildId=%s userId=%s event=%s', session.guildId, session.userId, eventType)
      return
    }

    const resolved = resolveNotificationConfig(activeConfig, groupIndex.groups, session.guildId, eventType)
    if (!resolved || !resolved.enabled) return

    try {
      const message = buildNotification(session, eventType, resolved, timeZone, {
        debug: value => logger.debug('%s guildId=%s userId=%s', value, session.guildId, session.userId),
        warn: value => logger.warn('%s guildId=%s userId=%s', value, session.guildId, session.userId),
      })
      if (!message) return

      await sendMemberNotification(session, message, eventType, {
        debug: value => logger.debug('%s guildId=%s userId=%s', value, session.guildId, session.userId),
      })
      logger.debug('已发送 QQ 成员通知：guildId=%s userId=%s event=%s', session.guildId, session.userId, eventType)
    } catch (error) {
      logger.warn(
        '处理或发送 QQ 成员通知失败：guildId=%s userId=%s event=%s error=%s',
        session.guildId,
        session.userId,
        eventType,
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  if (typeof ctx.command === 'function') {
    const setNotificationsEnabled = async (session: Session, enabled: boolean) => {
      if (session.platform !== 'qq' || !session.guildId) {
        return '请在 QQ 群聊中使用此指令。'
      }

      const existing = groupIndex.groups.get(session.guildId)
      const isEnabled = existing
        ? existing.enabled !== false
        : (activeConfig.scope ?? 'all') === 'all'
      if (isEnabled === enabled) {
        return enabled
          ? '本群的入群与退群消息已经处于开启状态。'
          : '本群的入群与退群消息已经处于关闭状态。'
      }

      const previousConfig = activeConfig
      activeConfig = setGuildNotificationsEnabled(activeConfig, session.guildId, enabled)
      groupIndex = createGroupConfigIndex(activeConfig.groups)
      const action = enabled ? '开启' : '关闭'

      try {
        const persisted = await persistGuildConfig(ctx, activeConfig.groups, previousConfig)
        if (persisted) {
          logger.info('已通过%s指令更新 QQ 群成员通知：guildId=%s userId=%s', action, session.guildId, session.userId)
          return buildCommandResponse(session, enabled, activeConfig, timeZone, {
            debug: value => logger.debug('%s guildId=%s userId=%s', value, session.guildId, session.userId),
            warn: value => logger.warn('%s guildId=%s userId=%s', value, session.guildId, session.userId),
          })
        }
        logger.warn(
          '已在当前运行期间%s QQ 群成员通知，但未找到可写入的 Koishi 配置加载器：guildId=%s',
          action,
          session.guildId,
        )
        return `已${action}本群的入群与退群消息；当前环境无法写回配置，重启插件后可能需要重新${action}。`
      } catch (error) {
        logger.warn(
          '已在当前运行期间%s QQ 群成员通知，但配置写回失败：guildId=%s error=%s',
          action,
          session.guildId,
          error instanceof Error ? error.message : String(error),
        )
        return `已${action}本群的入群与退群消息，但配置保存失败；重启插件后可能需要重新${action}。`
      }
    }

    ctx.command(CLOSE_COMMAND_NAME, '关闭当前 QQ 群的入群与退群消息', {
      authority: activeConfig.closeCommandAuthority ?? 1,
    })
      .alias(...CLOSE_COMMAND_ALIASES)
      .action(({ session }) => setNotificationsEnabled(session, false))

    ctx.command(ENABLE_COMMAND_NAME, '开启当前 QQ 群的入群与退群消息', {
      authority: activeConfig.closeCommandAuthority ?? 1,
    })
      .alias(...ENABLE_COMMAND_ALIASES)
      .action(({ session }) => setNotificationsEnabled(session, true))
  }

  ctx.on('interaction/button', async session => {
    try {
      await handleButtonCallback(session, {
        debug: value => logger.debug('%s guildId=%s userId=%s', value, session.guildId, session.userId),
      })
    } catch (error) {
      logger.warn(
        'Failed to handle QQ callback button: guildId=%s userId=%s error=%s',
        session.guildId || '(missing)',
        session.userId || '(missing)',
        error instanceof Error ? error.message : String(error),
      )
    }
  })
  ctx.on('guild-member-added', session => handleMemberEvent(session, 'join'))
  ctx.on('guild-member-removed', session => handleMemberEvent(session, 'leave'))
}
