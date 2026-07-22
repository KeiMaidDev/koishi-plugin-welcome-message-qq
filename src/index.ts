import { Context, h, Schema, Session } from 'koishi'
import { createKeyboardTextSchema, EMPTY_KEYBOARD_JSON, normalizeKeyboard } from './button'
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

const DEFAULT_TIME_ZONE = 'Asia/Shanghai'
const DEFAULT_WELCOME_MESSAGE = '欢迎 {at} 加入群聊！\n入群时间：{time}'
const DEFAULT_LEAVE_MESSAGE = '{username} 已离开群聊。\n离群时间：{time}'

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
  Schema.const('text').description('普通文本；遇到 {at} 或有效按钮时会安全转换为 QQ Markdown。'),
  Schema.const('markdown').description('QQ 原生 Markdown。'),
]).default('text')

const groupSchema: Schema<GroupConfig> = Schema.object({
  guildId: Schema.string().required().description('QQ 群 OpenID（不是普通 QQ 群号），作为唯一匹配键。'),
  enabled: Schema.boolean().default(true).description('是否在此群启用成员变动通知。'),
  welcomeEnabled: Schema.boolean().description('可选。是否发送入群欢迎消息；未填写时继承全局配置。'),
  welcomeMessage: Schema.string().role('textarea').description('可选。入群欢迎模板；未填写时继承全局配置，显式空白表示不发送。'),
  welcomeKeyboard: createKeyboardTextSchema('可选。欢迎按钮 JSON；留空时继承全局键盘，显式填写空 rows 表示不显示按钮。'),
  leaveEnabled: Schema.boolean().description('可选。是否发送离群消息；未填写时继承全局配置。'),
  leaveMessage: Schema.string().role('textarea').description('可选。离群消息模板；未填写时继承全局配置，显式空白表示不发送。'),
  leaveKeyboard: createKeyboardTextSchema('可选。离群按钮 JSON；留空时继承全局键盘，显式填写空 rows 表示不显示按钮。'),
  messageFormat: Schema.union([
    Schema.const('text').description('普通文本。'),
    Schema.const('markdown').description('QQ 原生 Markdown。'),
  ]).description('可选。消息格式；未填写时继承全局配置。'),
}).description('指定 QQ 群的覆盖规则')

export const Config: Schema<PluginConfig> = Schema.object({
  welcomeEnabled: Schema.boolean().default(true).description('是否发送入群欢迎消息。'),
  welcomeMessage: Schema.string().role('textarea').default(DEFAULT_WELCOME_MESSAGE).description('入群欢迎模板，支持多行和固定占位符。'),
  leaveEnabled: Schema.boolean().default(true).description('是否发送离群消息。'),
  leaveMessage: Schema.string().role('textarea').default(DEFAULT_LEAVE_MESSAGE).description('中性的离群消息模板，支持多行和固定占位符。'),
  messageFormat: messageFormatSchema.description('全局消息格式。'),
  scope: Schema.union([
    Schema.const('all').description('所有 QQ 群生效；未配置群使用全局设置。'),
    Schema.const('configured').description('仅 groups 中 enabled !== false 的 QQ 群生效。'),
  ]).default('all').description('插件生效范围。'),
  ignoreBots: Schema.boolean().default(true).description('忽略机器人自身以及标记为机器人的成员事件。'),
  timeZone: timeZoneSchema,
  closeCommandAuthority: Schema.number().step(1).min(0).max(5).default(3).description('开启/关闭当前群通知指令所需的 Koishi 权限等级。'),
  welcomeKeyboard: createKeyboardTextSchema('全局欢迎消息按钮 JSON。', { defaultValue: EMPTY_KEYBOARD_JSON }),
  leaveKeyboard: createKeyboardTextSchema('全局离群消息按钮 JSON。', { defaultValue: EMPTY_KEYBOARD_JSON }),
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
  const rows = normalizeKeyboard(resolved.keyboard, variables, { debug: options.debug })
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

export async function sendMemberNotification(session: Session, message: string | h) {
  if (session.bot && typeof session.bot.sendMessage === 'function' && session.channelId) {
    // QQ group member events are notifications, not replyable message events. Passing the
    // event session makes adapter-qq-crack attach session.qq.id as event_id, which QQ rejects.
    return session.bot.sendMessage(session.channelId, message, session.event.referrer)
  }
  return session.send(message)
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

      await sendMemberNotification(session, message)
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
          return `已${action}本群的入群与退群消息。`
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
      authority: activeConfig.closeCommandAuthority ?? 3,
    })
      .alias(...CLOSE_COMMAND_ALIASES)
      .action(({ session }) => setNotificationsEnabled(session, false))

    ctx.command(ENABLE_COMMAND_NAME, '开启当前 QQ 群的入群与退群消息', {
      authority: activeConfig.closeCommandAuthority ?? 3,
    })
      .alias(...ENABLE_COMMAND_ALIASES)
      .action(({ session }) => setNotificationsEnabled(session, true))
  }

  ctx.on('guild-member-added', session => handleMemberEvent(session, 'join'))
  ctx.on('guild-member-removed', session => handleMemberEvent(session, 'leave'))
}
