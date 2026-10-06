export type MessageFormat = 'text' | 'markdown'
export type NotificationScope = 'all' | 'configured'
export type NotificationEventType = 'join' | 'leave'
export type ControlResponseType = 'close' | 'enable'
export type TemplateEventType = NotificationEventType | ControlResponseType

export interface KeyboardPermissionConfig {
  type?: number
  specify_user_ids?: string[]
  specify_role_ids?: string[]
}

export interface KeyboardActionConfig {
  type?: number
  permission?: KeyboardPermissionConfig
  data: string
  enter?: boolean
  reply?: boolean
  anchor?: number
  click_limit?: number
  at_bot_show_channel_list?: boolean
  unsupport_tips?: string
}

export interface KeyboardRenderDataConfig {
  label: string
  visited_label?: string
  style?: number
}

export interface KeyboardButtonConfig {
  id?: string
  render_data: KeyboardRenderDataConfig
  action: KeyboardActionConfig
}

export interface KeyboardRowConfig {
  buttons?: KeyboardButtonConfig[]
}

export interface KeyboardConfig {
  rows?: KeyboardRowConfig[]
}

export type KeyboardConfigSource = KeyboardConfig | string

/**
 * 旧版配置里的单个群覆盖项。
 * @deprecated 群级状态已迁移到数据库表 `welcome_message_group`，本字段只用于一次性迁移，将在 0.2.0 移除。
 */
export interface GroupConfig {
  guildId: string
  enabled?: boolean
  welcomeEnabled?: boolean
  welcomeMessage?: string
  welcomeKeyboard?: string
  leaveEnabled?: boolean
  leaveMessage?: string
  leaveKeyboard?: string
  messageFormat?: MessageFormat
}

/**
 * 群级通知状态表的一行。
 *
 * `id` 是主键：哨兵行固定为 `*`，其余行是 QQ 群 OpenID。
 * 可空字段是三态的：没有行 / `null` 表示继承（群行继承哨兵行，哨兵行继承内置常量），
 * 空字符串表示显式置空（例如不发送正文、不显示按钮），其它值表示覆盖。
 */
export interface WelcomeMessageGroup {
  id: string
  /** 哨兵行不使用该字段；群行为该群的通知总开关。 */
  enabled: boolean
  /** 全局开入群消息开关，仅哨兵行有意义。 */
  welcomeEnabled?: boolean | null
  /** 全局开离群消息开关，仅哨兵行有意义。 */
  leaveEnabled?: boolean | null
  welcomeMessage?: string | null
  leaveMessage?: string | null
  welcomeKeyboard?: string | null
  leaveKeyboard?: string | null
  messageFormat?: MessageFormat | null
  commandResponseFormat?: MessageFormat | null
  closeResponseMessage?: string | null
  closeResponseKeyboard?: string | null
  enableResponseMessage?: string | null
  enableResponseKeyboard?: string | null
  updatedAt?: Date | null
}

/** 群覆盖行里可逐字段设置三态的内容字段。 */
export const CONTENT_FIELDS = [
  'welcomeMessage',
  'leaveMessage',
  'welcomeKeyboard',
  'leaveKeyboard',
  'messageFormat',
  'commandResponseFormat',
  'closeResponseMessage',
  'closeResponseKeyboard',
  'enableResponseMessage',
  'enableResponseKeyboard',
] as const

export type ContentField = typeof CONTENT_FIELDS[number]

export interface Config {
  scope: NotificationScope
  ignoreBots: boolean
  timeZone: string
  closeCommandAuthority: number
  /**
   * @deprecated 只在哨兵行尚不存在时用于创建哨兵行，之后不再读取。
   */
  welcomeEnabled?: boolean
  /**
   * @deprecated 只在哨兵行尚不存在时用于创建哨兵行，之后不再读取。
   */
  welcomeMessage?: string
  /**
   * @deprecated 只在哨兵行尚不存在时用于创建哨兵行，之后不再读取。
   */
  leaveEnabled?: boolean
  /**
   * @deprecated 只在哨兵行尚不存在时用于创建哨兵行，之后不再读取。
   */
  leaveMessage?: string
  /**
   * @deprecated 只在哨兵行尚不存在时用于创建哨兵行，之后不再读取。
   */
  messageFormat?: MessageFormat
  /**
   * @deprecated 只在哨兵行尚不存在时用于创建哨兵行，之后不再读取。
   */
  commandResponseFormat?: MessageFormat
  /**
   * @deprecated 只在哨兵行尚不存在时用于创建哨兵行，之后不再读取。
   */
  closeResponseMessage?: string
  /**
   * @deprecated 只在哨兵行尚不存在时用于创建哨兵行，之后不再读取。
   */
  closeResponseKeyboard?: string
  /**
   * @deprecated 只在哨兵行尚不存在时用于创建哨兵行，之后不再读取。
   */
  enableResponseMessage?: string
  /**
   * @deprecated 只在哨兵行尚不存在时用于创建哨兵行，之后不再读取。
   */
  enableResponseKeyboard?: string
  /**
   * @deprecated 只在哨兵行尚不存在时用于创建哨兵行，之后不再读取。
   */
  welcomeKeyboard?: string
  /**
   * @deprecated 只在哨兵行尚不存在时用于创建哨兵行，之后不再读取。
   */
  leaveKeyboard?: string
  /**
   * @deprecated 群级状态改由数据库保存；本字段只由旧配置迁移通道读取，插件配置页不再显示，将在 0.2.0 移除。
   */
  groups: GroupConfig[]
}

export interface TemplateVariables {
  at: string
  userId: string
  username: string
  guildId: string
  guildName: string
  time: string
  date: string
  clock: string
  timestamp: string
  event: string
  eventType: TemplateEventType
  botId: string
}

export interface ResolvedNotificationConfig {
  enabled: boolean
  message: string
  messageFormat: MessageFormat
  keyboard?: KeyboardConfigSource
}

export interface ResolvedResponseConfig {
  message: string
  messageFormat: MessageFormat
  keyboard?: KeyboardConfigSource
}

export interface RenderedKeyboardButton {
  id?: string
  render_data: {
    label: string
    visited_label?: string
    style: number
  }
  action: {
    type: number
    permission: {
      type: number
      specify_user_ids?: string[]
      specify_role_ids?: string[]
    }
    data: string
    enter: boolean
    reply: boolean
    anchor?: number
    click_limit?: number
    at_bot_show_channel_list?: boolean
    unsupport_tips?: string
  }
}

export interface RenderedKeyboardRow {
  buttons: RenderedKeyboardButton[]
}
