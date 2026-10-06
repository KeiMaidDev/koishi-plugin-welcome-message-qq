import { Context, h, Schema, Session } from 'koishi'
import { normalizeKeyboard } from './button'
import {
  CALLBACK_COMMAND_PREFIX,
  CALLBACK_REPLY_PREFIX,
  DEFAULT_CLOSE_RESPONSE_KEYBOARD,
  DEFAULT_CLOSE_RESPONSE_MESSAGE,
  DEFAULT_ENABLE_RESPONSE_KEYBOARD,
  DEFAULT_ENABLE_RESPONSE_MESSAGE,
  DEFAULT_LEAVE_KEYBOARD,
  DEFAULT_LEAVE_MESSAGE,
  DEFAULT_TIME_ZONE,
  DEFAULT_WELCOME_KEYBOARD,
  DEFAULT_WELCOME_MESSAGE,
} from './defaults'
import { extendGroupTable } from './model'
import { setupConsole } from './console'
import {
  ensureGlobalRow,
  isGuildEnabled,
  loadGroupRows,
  resolveNotificationConfig,
  resolveResponseConfig,
  setGroupEnabled,
  type GroupRowSet,
} from './store'
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
  ResolvedResponseConfig,
} from './types'
import { errorMessage, escapeRegExp } from './utils'

export * from './types'
export * from './store'
export {
  CALLBACK_COMMAND_PREFIX,
  CALLBACK_REPLY_PREFIX,
  DEFAULT_CLOSE_RESPONSE_KEYBOARD,
  DEFAULT_CLOSE_RESPONSE_MESSAGE,
  DEFAULT_ENABLE_RESPONSE_KEYBOARD,
  DEFAULT_ENABLE_RESPONSE_MESSAGE,
  DEFAULT_LEAVE_KEYBOARD,
  DEFAULT_LEAVE_MESSAGE,
  DEFAULT_TIME_ZONE,
  DEFAULT_WELCOME_KEYBOARD,
  DEFAULT_WELCOME_MESSAGE,
}
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
export { GROUP_TABLE, GLOBAL_ROW_ID } from './model'

export const name = 'welcome-messge-qq'

/** 群级状态保存在数据库里，缺少数据库插件时插件不加载。 */
export const inject = ['database']

export const usage = `

本插件需配合 [adapter-qq-crack](/market?keyword=adapter-qq-crack) 使用，并需要宿主已安装数据库插件（例如 koishi-plugin-database-sqlite）。缺少数据库插件时本插件不会加载。

## 群级状态保存在数据库

群的开与关、每个群的消息正文和按钮都保存在数据库表 <code>welcome_message_group</code> 中，插件不会改写 Koishi 配置文件。
表里主键为 <code>*</code> 的一行是全局默认行，其余每一行是一个 QQ 群 OpenID 的覆盖：

- 群覆盖行 → 全局默认行 → 内置默认值，逐字段生效。
- 某字段留空（NULL）表示继承，显式空白表示“这一项就是空的”（不发送正文或不显示按钮）。
- 安装控制台插件后可以在“入群欢迎管理”页按群 OpenID 搜索、逐字段覆盖/置空、删除覆盖行，并把旧配置里的 <code>groups</code> 一次性迁移进数据库。该页面需要 Koishi 权限等级 <code>4</code>。

## 默认内容

- 入群正文：<code>欢迎 {at} 加入群聊！</code>，并显示“关闭欢迎”按钮。
- 离群正文：<code>{at} 已离开群聊。</code>，并显示“关闭欢迎”和“帮助菜单”按钮。
- 关闭成功后显示“重新开启”按钮；开启成功后显示“再次关闭”按钮。
- 开启/关闭指令默认权限等级为 <code>1</code>，成功后会在回执里带上当前群的 OpenID。

## 模板变量

- {at}：@用户
- {username}：用户名
- {guildName}：群组名称
- {guildId}：群 OpenID
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
- 键盘配置填写 <code>keyboard.content</code> 内部的对象，即以 <code> { &quot;rows&quot;: [...] } </code> 开始的 JSON。

`

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

const formatSchema = Schema.union([
  Schema.const('text').description('普通消息（推荐）：直接按普通文字发送；需要 @ 成员或显示按钮时，插件会自动切换为 QQ Markdown。'),
  Schema.const('markdown').description('Markdown 消息：把模板按 QQ Markdown 排版发送，适合标题、引用、加粗等样式。'),
]).role('radio').default('text')

const legacyGroupSchema: Schema<GroupConfig> = Schema.object({
  guildId: Schema.string().required().description('QQ 群 OpenID（不是普通 QQ 群号），作为唯一匹配键。'),
  enabled: Schema.boolean().description('是否在此群启用成员变动通知；未填写时迁移不会改动数据库里已有的开关，新建的行默认开启。'),
  welcomeEnabled: Schema.boolean().description('已弃用：群级状态改由数据库保存，迁移时忽略该项。'),
  welcomeMessage: Schema.string().role('textarea').description('入群欢迎模板。'),
  welcomeKeyboard: Schema.string().role('textarea', { rows: [12, 12] }).collapse().description('入群按钮 JSON。'),
  leaveEnabled: Schema.boolean().description('已弃用：群级状态改由数据库保存，迁移时忽略该项。'),
  leaveMessage: Schema.string().role('textarea').description('离群消息模板。'),
  leaveKeyboard: Schema.string().role('textarea', { rows: [12, 12] }).collapse().description('离群按钮 JSON。'),
  messageFormat: Schema.union([
    Schema.const('text').description('普通消息。'),
    Schema.const('markdown').description('Markdown 消息。'),
  ]).role('radio').description('消息显示方式。'),
}).description('已弃用：旧配置迁移通道会读取这里的内容，配置页已不再显示本分组')

export const Config: Schema<PluginConfig> = Schema.object({
  scope: Schema.union([
    Schema.const('all').description('全部 QQ 群（推荐）：机器人所在的群都启用；数据库里显式关闭的群除外。'),
    Schema.const('configured').description('仅已配置的 QQ 群：只有数据库里已经有覆盖行的群发送消息。'),
  ]).role('radio').default('all').description('选择入群欢迎和离群通知要在哪些 QQ 群生效。'),
  ignoreBots: Schema.boolean().default(true).description('忽略机器人自身以及标记为机器人的成员事件。'),
  timeZone: timeZoneSchema.description('模板里 {date}、{clock}、{time} 使用的时区。'),
  closeCommandAuthority: Schema.number().step(1).min(0).max(5).default(1).description('开启/关闭当前群通知指令所需的 Koishi 权限等级。'),
  // 以下字段只用于把旧配置的内容灌进全局默认行，之后不再读取；在控制台里已隐藏。
  welcomeEnabled: Schema.boolean().hidden().default(true),
  welcomeMessage: Schema.string().role('textarea').hidden().default(DEFAULT_WELCOME_MESSAGE),
  leaveEnabled: Schema.boolean().hidden().default(true),
  leaveMessage: Schema.string().role('textarea').hidden().default(DEFAULT_LEAVE_MESSAGE),
  messageFormat: formatSchema.hidden(),
  welcomeKeyboard: Schema.string().role('textarea').hidden().default(DEFAULT_WELCOME_KEYBOARD),
  leaveKeyboard: Schema.string().role('textarea').hidden().default(DEFAULT_LEAVE_KEYBOARD),
  commandResponseFormat: formatSchema.hidden(),
  closeResponseMessage: Schema.string().role('textarea').hidden().default(DEFAULT_CLOSE_RESPONSE_MESSAGE),
  closeResponseKeyboard: Schema.string().role('textarea').hidden().default(DEFAULT_CLOSE_RESPONSE_KEYBOARD),
  enableResponseMessage: Schema.string().role('textarea').hidden().default(DEFAULT_ENABLE_RESPONSE_MESSAGE),
  enableResponseKeyboard: Schema.string().role('textarea').hidden().default(DEFAULT_ENABLE_RESPONSE_KEYBOARD),
  groups: Schema.array(legacyGroupSchema).default([]).hidden().description('已弃用：群级状态已迁入数据库，仍可被「迁移旧配置」读取；本字段将在 0.2.0 移除。'),
})

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

/** 回执里带上群 OpenID，方便管理员确认改的是哪个群；模板已经写了 {guildId} 时不重复追加。 */
export function ensureGuildIdLine(template: string): string {
  if (template.includes('{guildId}')) return template
  return `${template}\n\n群 OpenID：{guildId}`
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

/** 开关指令回执；显式置空正文时不回执。 */
export function buildCommandResponse(
  session: Session,
  enabled: boolean,
  resolved: ResolvedResponseConfig,
  timeZone: string,
  options: BuildNotificationOptions = {},
): string | h | undefined {
  const responseType = enabled ? 'enable' : 'close'
  const template = typeof resolved.message === 'string' ? resolved.message : ''
  if (!template.trim()) {
    options.debug?.(`${responseType} response template is blank; skipped.`)
    return
  }

  const fullTemplate = ensureGuildIdLine(template)
  const variables = extractTemplateVariables(session, {
    eventType: responseType,
    timeZone,
    debug: options.debug,
    warn: options.warn,
  })
  const rows = normalizeKeyboard(resolved.keyboard, variables, {
    debug: options.debug,
    warn: options.warn,
  })
  const hasButtons = rows.length > 0
  const format = resolved.messageFormat
  const needsMarkdown = format === 'markdown' || hasButtons || containsAtPlaceholder(fullTemplate)
  const renderMode: TemplateRenderMode = format === 'markdown'
    ? 'markdown'
    : needsMarkdown
      ? 'markdown-text'
      : 'text'
  const rendered = renderMessageTemplate(fullTemplate, variables, renderMode)
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

function renderPlainReceipt(
  session: Session,
  enabled: boolean,
  template: string,
  timeZone: string,
  options: BuildNotificationOptions = {},
): string {
  const variables = extractTemplateVariables(session, {
    eventType: enabled ? 'enable' : 'close',
    timeZone,
    debug: options.debug,
    warn: options.warn,
  })
  return renderMessageTemplate(ensureGuildIdLine(template), variables, 'text')
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

const MAX_RECENT_MEMBER_EVENTS = 512

function resolveMemberEventKey(session: Session, eventType: NotificationEventType) {
  const eventId = (session as Session & { qq?: { id?: unknown } }).qq?.id
  if (typeof eventId !== 'string' || !eventId.trim()) return
  return `${eventType}:${eventId.trim()}`
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
  const timeZone = normalizeTimeZone(config.timeZone, message => logger.warn(message))
  const scope = config.scope ?? 'all'
  const ignoreBots = config.ignoreBots ?? true
  const recentMemberEvents = new Set<string>()
  const recentMemberEventOrder: string[] = []

  extendGroupTable(ctx)

  // 启动时创建全局默认行；失败只记日志，事件链与指令都不因此中断。
  const globalRowReady = ensureGlobalRow(ctx.database, config).then((created) => {
    if (created) logger.info('已按旧全局配置创建全局默认行，之后不再从配置文件读取群级状态。')
  }, (error) => {
    logger.warn('创建全局默认行失败，本次运行将使用内置默认值：%s', errorMessage(error))
  })

  const buildOptions = (session: Session): BuildNotificationOptions => ({
    debug: value => logger.debug('%s guildId=%s userId=%s', value, session.guildId, session.userId),
    warn: value => logger.warn('%s guildId=%s userId=%s', value, session.guildId, session.userId),
  })

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
    if (isBotEvent(session, ignoreBots)) {
      logger.debug('忽略 QQ 机器人成员事件：guildId=%s userId=%s event=%s', session.guildId, session.userId, eventType)
      return
    }

    await globalRowReady

    let rows: GroupRowSet
    try {
      rows = await loadGroupRows(ctx.database, session.guildId)
    } catch (error) {
      logger.warn(
        '读取 QQ 群通知状态失败，已跳过本次通知：guildId=%s userId=%s event=%s error=%s',
        session.guildId,
        session.userId,
        eventType,
        errorMessage(error),
      )
      return
    }

    const resolved = resolveNotificationConfig(rows, scope, eventType)
    if (!resolved || !resolved.enabled) return

    try {
      const message = buildNotification(session, eventType, resolved, timeZone, buildOptions(session))
      if (!message) return

      const eventKey = resolveMemberEventKey(session, eventType)
      if (eventKey && recentMemberEvents.has(eventKey)) {
        logger.debug('忽略重复的 QQ 成员事件：eventId=%s', eventKey)
        return
      }
      if (eventKey) {
        recentMemberEvents.add(eventKey)
        recentMemberEventOrder.push(eventKey)
        if (recentMemberEventOrder.length > MAX_RECENT_MEMBER_EVENTS) {
          recentMemberEvents.delete(recentMemberEventOrder.shift()!)
        }
      }

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
        errorMessage(error),
      )
    }
  }

  if (typeof ctx.command === 'function') {
    const setNotificationsEnabled = async (session: Session, enabled: boolean) => {
      if (session.platform !== 'qq' || !session.guildId) {
        return '请在 QQ 群聊中使用此指令。'
      }

      await globalRowReady

      let rows: GroupRowSet
      try {
        rows = await loadGroupRows(ctx.database, session.guildId)
      } catch (error) {
        logger.warn(
          '读取 QQ 群通知状态失败：guildId=%s userId=%s error=%s',
          session.guildId,
          session.userId,
          errorMessage(error),
        )
        return renderPlainReceipt(session, enabled, '无法读取本群的通知状态，请稍后重试。', timeZone, buildOptions(session))
      }

      const action = enabled ? '开启' : '关闭'
      if (isGuildEnabled(rows, scope) === enabled) {
        return renderPlainReceipt(
          session,
          enabled,
          enabled
            ? '本群的入群与退群消息已经处于开启状态。'
            : '本群的入群与退群消息已经处于关闭状态。',
          timeZone,
          buildOptions(session),
        )
      }

      try {
        // 单行写入：只改 enabled，不动这个群已有的正文、按钮等覆盖字段。
        await setGroupEnabled(ctx.database, session.guildId, enabled)
      } catch (error) {
        logger.warn(
          '保存 QQ 群通知状态失败：guildId=%s userId=%s enabled=%s error=%s',
          session.guildId,
          session.userId,
          enabled,
          errorMessage(error),
        )
        return renderPlainReceipt(
          session,
          enabled,
          `保存失败：未能${action}本群的入群与退群消息，请稍后重试。`,
          timeZone,
          buildOptions(session),
        )
      }

      logger.info('已通过%s指令更新 QQ 群成员通知：guildId=%s userId=%s', action, session.guildId, session.userId)
      return buildCommandResponse(session, enabled, resolveResponseConfig(rows, enabled), timeZone, buildOptions(session))
    }

    ctx.command(CLOSE_COMMAND_NAME, '关闭当前 QQ 群的入群与退群消息', {
      authority: config.closeCommandAuthority ?? 1,
    })
      .alias(...CLOSE_COMMAND_ALIASES)
      .action(({ session }) => setNotificationsEnabled(session, false))

    ctx.command(ENABLE_COMMAND_NAME, '开启当前 QQ 群的入群与退群消息', {
      authority: config.closeCommandAuthority ?? 1,
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

  ctx.plugin(setupConsole, { config })
}
