import { Schema } from 'koishi'
import type {
  KeyboardConfig,
  KeyboardConfigSource,
  RenderedKeyboardRow,
  TemplateVariables,
} from './types'
import { findUnknownPlaceholders, renderActionTemplate } from './template'

export const EMPTY_KEYBOARD_JSON = JSON.stringify({ rows: [] }, null, 2)


export const keyboardSchema = Schema.string()
  .role('textarea', { rows: [12, 12] })
  .collapse()
  .default(EMPTY_KEYBOARD_JSON)
  .description('QQ 原生按钮键盘 JSON')

export interface NormalizeKeyboardOptions {
  debug?: (message: string) => void
  warn?: (message: string) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseKeyboardConfig(
  keyboard: KeyboardConfigSource | undefined,
  options: NormalizeKeyboardOptions,
): KeyboardConfig | undefined {
  if (keyboard === undefined) return
  if (typeof keyboard !== 'string') {
    if (isRecord(keyboard)) return keyboard as KeyboardConfig
    (options.warn ?? options.debug)?.('按钮配置不是 JSON 字符串或对象，已忽略该键盘。')
    return
  }

  const source = keyboard.trim()
  if (!source) return

  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    (options.warn ?? options.debug)?.(`按钮配置 JSON 解析失败，已忽略该键盘：${error instanceof Error ? error.message : String(error)}`)
    return
  }

  if (!isRecord(parsed)) {
    (options.warn ?? options.debug)?.('按钮配置 JSON 顶层必须是对象，已忽略该键盘。')
    return
  }
  return parsed as KeyboardConfig
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) return
  return [...value]
}

function normalizeButton(
  value: unknown,
  variables: TemplateVariables,
  options: NormalizeKeyboardOptions,
  fallbackId: string,
): RenderedKeyboardRow['buttons'][number] | undefined {
  if (!isRecord(value) || !isRecord(value.render_data) || !isRecord(value.action)) {
    options.debug?.('已忽略结构不完整的按钮。')
    return
  }

  const renderData = value.render_data
  const action = value.action
  const permission = isRecord(action.permission) ? action.permission : {}
  const label = typeof renderData.label === 'string' ? renderData.label : ''
  const data = typeof action.data === 'string' ? action.data : ''
  if (!label.trim() || !data.trim()) {
    options.debug?.('已忽略 label 或 action.data 为空的按钮。')
    return
  }

  if (/(?<!\$)\{at\}/.test(data)) {
    options.debug?.('按钮 action.data 中的 {at} 不会被替换，请改用 {userId}。')
  }
  const unknown = findUnknownPlaceholders(data)
  if (unknown.length) {
    options.debug?.(`按钮 action.data 包含未识别占位符：${unknown.map(name => `{${name}}`).join(', ')}。`)
  }

  const rendered: RenderedKeyboardRow['buttons'][number] = {
    render_data: {
      label,
      style: readFiniteNumber(renderData.style, 2),
    },
    action: {
      type: readFiniteNumber(action.type, 2),
      permission: {
        type: readFiniteNumber(permission.type, 2),
      },
      data: renderActionTemplate(data, variables),
      enter: typeof action.enter === 'boolean' ? action.enter : true,
      reply: typeof action.reply === 'boolean' ? action.reply : false,
    },
  }

  rendered.id = typeof value.id === 'string' && value.id.trim() ? value.id : fallbackId
  if (typeof renderData.visited_label === 'string') {
    rendered.render_data.visited_label = renderData.visited_label
  }

  const specifyUserIds = readStringArray(permission.specify_user_ids)
  if (specifyUserIds) rendered.action.permission.specify_user_ids = specifyUserIds
  const specifyRoleIds = readStringArray(permission.specify_role_ids)
  if (specifyRoleIds) rendered.action.permission.specify_role_ids = specifyRoleIds

  if (typeof action.anchor === 'number' && Number.isFinite(action.anchor)) {
    rendered.action.anchor = action.anchor
  }
  if (typeof action.click_limit === 'number' && Number.isFinite(action.click_limit)) {
    rendered.action.click_limit = action.click_limit
  }
  if (typeof action.at_bot_show_channel_list === 'boolean') {
    rendered.action.at_bot_show_channel_list = action.at_bot_show_channel_list
  }
  if (typeof action.unsupport_tips === 'string') {
    rendered.action.unsupport_tips = action.unsupport_tips
  }

  return rendered
}

export function normalizeKeyboard(
  keyboard: KeyboardConfigSource | undefined,
  variables: TemplateVariables,
  options: NormalizeKeyboardOptions = {},
): RenderedKeyboardRow[] {
  const parsed = parseKeyboardConfig(keyboard, options)
  if (!parsed) return []

  const rawRows = Array.isArray(parsed.rows) ? parsed.rows : []
  if (!Array.isArray(parsed.rows)) {
    (options.warn ?? options.debug)?.('按钮键盘 rows 不是数组，已忽略该键盘。')
  }

  const rows: RenderedKeyboardRow[] = []
  for (const [rowIndex, row] of rawRows.entries()) {
    if (!isRecord(row) || !Array.isArray(row.buttons)) {
      options.debug?.('已忽略 buttons 不是数组的按钮行。')
      continue
    }
    const buttons = row.buttons
      .map((button, buttonIndex) => normalizeButton(button, variables, options, `${rowIndex}-${buttonIndex}`))
      .filter((button): button is RenderedKeyboardRow['buttons'][number] => Boolean(button))
    if (buttons.length) rows.push({ buttons })
  }
  return rows
}