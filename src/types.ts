export type MessageFormat = 'text' | 'markdown'
export type NotificationScope = 'all' | 'configured'
export type NotificationEventType = 'join' | 'leave'

export interface KeyboardPermissionConfig {
  type?: 2
}

export interface KeyboardActionConfig {
  type?: 2
  permission?: KeyboardPermissionConfig
  data: string
  enter?: boolean
  reply?: boolean
}

export interface KeyboardRenderDataConfig {
  label: string
  style?: number
}

export interface KeyboardButtonConfig {
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
  eventType: NotificationEventType
  botId: string
}

export interface ResolvedNotificationConfig {
  enabled: boolean
  message: string
  messageFormat: MessageFormat
  keyboard?: KeyboardConfigSource
}

export interface RenderedKeyboardButton {
  render_data: {
    label: string
    style: number
  }
  action: {
    type: 2
    permission: {
      type: 2
    }
    data: string
    enter: boolean
    reply: boolean
  }
}

export interface RenderedKeyboardRow {
  buttons: RenderedKeyboardButton[]
}
