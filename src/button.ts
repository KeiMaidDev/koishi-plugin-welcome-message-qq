import { Schema } from 'koishi'
import type {
  KeyboardConfig,
  KeyboardConfigSource,
  RenderedKeyboardRow,
  TemplateVariables,
} from './types'
import { findUnknownPlaceholders, renderActionTemplate } from './template'

export const EMPTY_KEYBOARD_JSON = JSON.stringify({ rows: [] }, null, 2)

const keyboardFormatDescription = [
  '直接填写 QQ 原生键盘 JSON，结构为 rows → buttons。',
  '每个按钮支持 render_data.label/style 与 action.data/enter/reply；action.type 和 permission.type 运行时固定为 2。',
  '群级配置留空表示继承全局配置，填写 { "rows": [] } 表示不显示按钮。',
].join('\n')

export interface KeyboardTextSchemaOptions {
  defaultValue?: string
}

export function createKeyboardTextSchema(
  description = 'QQ 原生按钮键盘 JSON',
  options: KeyboardTextSchemaOptions = {},
): Schema<string> {
  let schema = Schema.string()
    .role('textarea', { rows: [12, 12] })
    .collapse()
    .description(`${description}\n${keyboardFormatDescription}`)
  if (options.defaultValue !== undefined) schema = schema.default(options.defaultValue)
  return schema
}

export const keyboardSchema = createKeyboardTextSchema('QQ 原生按钮键盘 JSON', {
  defaultValue: EMPTY_KEYBOARD_JSON,
})

export interface NormalizeKeyboardOptions {
  debug?: (message: string) => void
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
    options.debug?.('按钮配置不是 JSON 字符串或对象，已忽略该键盘。')
    return
  }

  const source = keyboard.trim()
  if (!source) return

  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    options.debug?.(`按钮配置 JSON 解析失败，已忽略该键盘：${error instanceof Error ? error.message : String(error)}`)
    return
  }

  if (!isRecord(parsed)) {
    options.debug?.('按钮配置 JSON 顶层必须是对象，已忽略该键盘。')
    return
  }
  return parsed as KeyboardConfig
}

function normalizeButton(
  value: unknown,
  variables: TemplateVariables,
  options: NormalizeKeyboardOptions,
): RenderedKeyboardRow['buttons'][number] | undefined {
  if (!isRecord(value) || !isRecord(value.render_data) || !isRecord(value.action)) {
    options.debug?.('已忽略结构不完整的按钮。')
    return
  }

  const renderData = value.render_data
  const action = value.action
  const permission = isRecord(action.permission) ? action.permission : undefined
  const label = typeof renderData.label === 'string' ? renderData.label.trim() : ''
  const data = typeof action.data === 'string' ? action.data.trim() : ''
  if (!label || !data) {
    options.debug?.('已忽略 label 或 action.data 为空的按钮。')
    return
  }

  if (action.type !== undefined && action.type !== 2) {
    options.debug?.(`已忽略 action.type=${String(action.type)} 的按钮，仅支持 type=2。`)
    return
  }
  if (permission?.type !== undefined && permission.type !== 2) {
    options.debug?.(`已忽略 permission.type=${String(permission.type)} 的按钮，仅支持 type=2。`)
    return
  }

  if (/(?<!\$)\{at\}/.test(data)) {
    options.debug?.('按钮 action.data 中的 {at} 不会被替换，请改用 {userId}。')
  }
  const unknown = findUnknownPlaceholders(data)
  if (unknown.length) {
    options.debug?.(`按钮 action.data 包含未识别占位符：${unknown.map(name => `{${name}}`).join(', ')}。`)
  }

  return {
    render_data: {
      label,
      style: typeof renderData.style === 'number' && Number.isFinite(renderData.style) ? renderData.style : 2,
    },
    action: {
      type: 2,
      permission: { type: 2 },
      data: renderActionTemplate(data, variables),
      enter: typeof action.enter === 'boolean' ? action.enter : true,
      reply: typeof action.reply === 'boolean' ? action.reply : false,
    },
  }
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
    options.debug?.('按钮键盘 rows 不是数组，已忽略该键盘。')
  }

  const rows: RenderedKeyboardRow[] = []
  for (const row of rawRows) {
    if (!isRecord(row) || !Array.isArray(row.buttons)) {
      options.debug?.('已忽略 buttons 不是数组的按钮行。')
      continue
    }
    const buttons = row.buttons
      .map(button => normalizeButton(button, variables, options))
      .filter((button): button is RenderedKeyboardRow['buttons'][number] => Boolean(button))
    if (buttons.length) rows.push({ buttons })
  }
  return rows
}