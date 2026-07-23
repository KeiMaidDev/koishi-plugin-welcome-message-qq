import type { Session } from 'koishi'
import type { TemplateEventType, TemplateVariables } from './types'

export type TemplateRenderMode = 'text' | 'markdown' | 'markdown-text'

const KNOWN_PLACEHOLDER_NAMES = new Set([
  'at',
  'userId',
  'username',
  'guildId',
  'guildName',
  'time',
  'date',
  'clock',
  'timestamp',
  'event',
  'eventType',
  'botId',
])

const MESSAGE_PLACEHOLDER_PATTERN = /(?<!\$)\{(at|userId|username|guildId|guildName|time|date|clock|timestamp|event|eventType|botId)\}/g
const ACTION_PLACEHOLDER_PATTERN = /(?<!\$)\{(userId|username|guildId|guildName|time|date|clock|timestamp|event|eventType|botId)\}/g
const PLACEHOLDER_PATTERN = /(?<!\$)\{([A-Za-z][A-Za-z0-9]*)\}/g

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone?.trim()) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timeZone.trim() }).format(0)
    return true
  } catch {
    return false
  }
}

export function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}\[\]()<>#+\-.!|>~])/g, '\\$1')
}

function dateTimeParts(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestamp)

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    clock: `${values.hour}:${values.minute}:${values.second}`,
  }
}

export interface ExtractTemplateVariablesOptions {
  eventType: TemplateEventType
  timeZone: string
  now?: () => number
  debug?: (message: string) => void
  warn?: (message: string) => void
}

export function extractTemplateVariables(
  session: Session,
  options: ExtractTemplateVariablesOptions,
): TemplateVariables {
  const userId = session.userId || ''
  const guildId = session.guildId || ''
  const username = session.event.user?.name
    || session.event.member?.nick
    || session.username
    || userId
  const guildName = session.event.guild?.name || guildId
  const botId = session.selfId || ''

  if (!botId) options.debug?.('事件会话缺少 selfId，{botId} 将替换为空字符串。')

  let timestamp = session.timestamp
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    timestamp = (options.now || Date.now)()
    options.warn?.('事件时间戳缺失或非法，已回退到 Date.now()。')
  }

  const { date, clock } = dateTimeParts(timestamp, options.timeZone)
  return {
    at: `<@${userId}>`,
    userId,
    username,
    guildId,
    guildName,
    time: `${date} ${clock}`,
    date,
    clock,
    timestamp: String(Math.floor(timestamp / 1000)),
    event: {
      join: '加入群聊',
      leave: '离开群聊',
      close: '关闭通知',
      enable: '开启通知',
    }[options.eventType],
    eventType: options.eventType,
    botId,
  }
}

function renderValue(value: string, mode: TemplateRenderMode) {
  return mode === 'text' ? value : escapeMarkdown(value)
}

export function renderMessageTemplate(
  template: string,
  variables: TemplateVariables,
  mode: TemplateRenderMode,
): string {
  let cursor = 0
  let output = ''

  template.replace(MESSAGE_PLACEHOLDER_PATTERN, (match, name: keyof TemplateVariables, offset: number) => {
    const literal = template.slice(cursor, offset)
    output += mode === 'markdown-text' ? escapeMarkdown(literal) : literal
    output += name === 'at' ? variables.at : renderValue(String(variables[name]), mode)
    cursor = offset + match.length
    return match
  })

  const tail = template.slice(cursor)
  output += mode === 'markdown-text' ? escapeMarkdown(tail) : tail
  return output
}

export function renderActionTemplate(template: string, variables: TemplateVariables): string {
  return template.replace(ACTION_PLACEHOLDER_PATTERN, (_, name: keyof TemplateVariables) => String(variables[name]))
}

export function findUnknownPlaceholders(template: string): string[] {
  const unknown = new Set<string>()
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    if (!KNOWN_PLACEHOLDER_NAMES.has(match[1])) unknown.add(match[1])
  }
  return [...unknown]
}

export function containsAtPlaceholder(template: string): boolean {
  return /(?<!\$)\{at\}/.test(template)
}
