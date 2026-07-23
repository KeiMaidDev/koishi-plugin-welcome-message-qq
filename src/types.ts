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

export interface Config {
  welcomeEnabled: boolean
  welcomeMessage: string
  leaveEnabled: boolean
  leaveMessage: string
  messageFormat: MessageFormat
  scope: NotificationScope
  ignoreBots: boolean
  timeZone: string
  closeCommandAuthority: number
  commandResponseFormat: MessageFormat
  closeResponseMessage: string
  closeResponseKeyboard?: string
  enableResponseMessage: string
  enableResponseKeyboard?: string
  welcomeKeyboard?: string
  leaveKeyboard?: string
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
