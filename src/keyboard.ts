import { CALLBACK_COMMAND_PREFIX, CALLBACK_REPLY_PREFIX } from './defaults'

/**
 * 键盘 JSON 的纯逻辑：不依赖 koishi，浏览器端页面与服务端共用同一份解析、序列化与校验规则。
 */

export const EMPTY_KEYBOARD_JSON = JSON.stringify({ rows: [] }, null, 2)

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 结构化键盘文档：把表单可编辑的行 / 按钮抽出来，表单没暴露的键留在各层 `extras` 里，
 * 序列化时原样写回，保证「往返一次不丢内容」。
 *
 * - `undefined` 表示可选字段未填写：序列化时省略该键，也不会凭空补默认值。
 * - `extras` 既含未知字段，也含类型不匹配、表单无法表示的已知字段，一并保留。
 */
export interface KeyboardDocument {
  /** 顶层除 `rows` 外的字段。 */
  extras: Record<string, unknown>
  rows: KeyboardRowDocument[]
}

export interface KeyboardRowDocument {
  /** 行除 `buttons` 外的字段。 */
  extras: Record<string, unknown>
  buttons: KeyboardButtonDocument[]
}

export interface KeyboardRenderDataDocument {
  /** `render_data` 里除已知字段外的键。 */
  extras: Record<string, unknown>
  label: string | undefined
  visitedLabel: string
  style: number | undefined
}

export interface KeyboardPermissionDocument {
  /** `permission` 里除已知字段外的键。 */
  extras: Record<string, unknown>
  type: number | undefined
  /** 指定用户 OpenID，编辑态按行分隔；空串表示未填写。 */
  specifyUserIds: string
  specifyRoleIds: string
}

export interface KeyboardActionDocument {
  /** `action` 里除已知字段外的键。 */
  extras: Record<string, unknown>
  type: number | undefined
  data: string | undefined
  enter: boolean | undefined
  reply: boolean | undefined
  anchor: number | undefined
  clickLimit: number | undefined
  atBotShowChannelList: boolean | undefined
  unsupportTips: string
  permission: KeyboardPermissionDocument
}

export interface KeyboardButtonDocument {
  /** 按钮除 `id` / `render_data` / `action` 外的键。 */
  extras: Record<string, unknown>
  id: string
  renderData: KeyboardRenderDataDocument
  action: KeyboardActionDocument
}

/** 解析结果：要么得到结构化文档，要么给出可读错误（此时保留原文由调用方决定）。 */
export type KeyboardParseResult =
  | { ok: true; document: KeyboardDocument }
  | { ok: false; error: string }

export function emptyKeyboardDocument(): KeyboardDocument {
  return { extras: {}, rows: [] }
}

export function emptyKeyboardButton(): KeyboardButtonDocument {
  return {
    extras: {},
    id: '',
    renderData: { extras: {}, label: undefined, visitedLabel: '', style: undefined },
    action: {
      extras: {},
      type: undefined,
      data: undefined,
      enter: undefined,
      reply: undefined,
      anchor: undefined,
      clickLimit: undefined,
      atBotShowChannelList: undefined,
      unsupportTips: '',
      permission: { extras: {}, type: undefined, specifyUserIds: '', specifyRoleIds: '' },
    },
  }
}

export function emptyKeyboardRow(): KeyboardRowDocument {
  return { extras: {}, buttons: [] }
}

/** 键盘是否为空：没有任何按钮（空 `rows` 也属于空）。空键盘渲染成「不显示按钮」。 */
export function keyboardDocumentIsEmpty(document: KeyboardDocument): boolean {
  return !document.rows.some(row => row.buttons.length > 0)
}

/** 把整行文本按行拆成 OpenID 数组，忽略空白行；用于 `specify_user_ids` / `specify_role_ids`。 */
export function parseIdList(text: string): string[] {
  return text
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
}

/** 消费 record 里类型匹配的已知字段：命中则从 record 删除并返回，未命中留作 extras。 */
function takeNumber(target: Record<string, unknown>, key: string): number | undefined {
  const value = target[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    delete target[key]
    return value
  }
  return undefined
}

function takeBoolean(target: Record<string, unknown>, key: string): boolean | undefined {
  const value = target[key]
  if (typeof value === 'boolean') {
    delete target[key]
    return value
  }
  return undefined
}

function takeString(target: Record<string, unknown>, key: string): string | undefined {
  const value = target[key]
  if (typeof value === 'string') {
    delete target[key]
    return value
  }
  return undefined
}

function takeStringList(target: Record<string, unknown>, key: string): string[] | undefined {
  const value = target[key]
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
    delete target[key]
    return [...value] as string[]
  }
  return undefined
}

function readPermission(value: unknown, where: string): KeyboardPermissionDocument {
  if (value === undefined) {
    return { extras: {}, type: undefined, specifyUserIds: '', specifyRoleIds: '' }
  }
  if (!isRecord(value)) throw new Error(`${where}的 action.permission 必须是对象。`)
  const extras = { ...value }
  const type = takeNumber(extras, 'type')
  const specifyUserIds = takeStringList(extras, 'specify_user_ids') ?? []
  const specifyRoleIds = takeStringList(extras, 'specify_role_ids') ?? []
  return { extras, type, specifyUserIds: specifyUserIds.join('\n'), specifyRoleIds: specifyRoleIds.join('\n') }
}

function readAction(value: unknown, where: string): KeyboardActionDocument {
  if (value === undefined) {
    return {
      extras: {},
      type: undefined,
      data: undefined,
      enter: undefined,
      reply: undefined,
      anchor: undefined,
      clickLimit: undefined,
      atBotShowChannelList: undefined,
      unsupportTips: '',
      permission: readPermission(undefined, where),
    }
  }
  if (!isRecord(value)) throw new Error(`${where}的 action 必须是对象。`)
  const extras = { ...value }
  const permission = readPermission(extras.permission, where)
  delete extras.permission
  return {
    extras,
    type: takeNumber(extras, 'type'),
    data: takeString(extras, 'data'),
    enter: takeBoolean(extras, 'enter'),
    reply: takeBoolean(extras, 'reply'),
    anchor: takeNumber(extras, 'anchor'),
    clickLimit: takeNumber(extras, 'click_limit'),
    atBotShowChannelList: takeBoolean(extras, 'at_bot_show_channel_list'),
    unsupportTips: takeString(extras, 'unsupport_tips') ?? '',
    permission,
  }
}

function readRenderData(value: unknown, where: string): KeyboardRenderDataDocument {
  if (value === undefined) return { extras: {}, label: undefined, visitedLabel: '', style: undefined }
  if (!isRecord(value)) throw new Error(`${where}的 render_data 必须是对象。`)
  const extras = { ...value }
  return {
    extras,
    label: takeString(extras, 'label'),
    visitedLabel: takeString(extras, 'visited_label') ?? '',
    style: takeNumber(extras, 'style'),
  }
}

function readButton(value: unknown, rowIndex: number, buttonIndex: number): KeyboardButtonDocument {
  const where = `第 ${rowIndex + 1} 行第 ${buttonIndex + 1} 个按钮`
  if (!isRecord(value)) throw new Error(`${where}必须是对象。`)
  const extras = { ...value }
  const id = takeString(extras, 'id') ?? ''
  const renderData = readRenderData(extras.render_data, where)
  delete extras.render_data
  const action = readAction(extras.action, where)
  delete extras.action
  return { extras, id, renderData, action }
}

function readRow(value: unknown, rowIndex: number): KeyboardRowDocument {
  if (!isRecord(value)) throw new Error(`第 ${rowIndex + 1} 行必须是对象。`)
  const extras = { ...value }
  const rawButtons = extras.buttons
  delete extras.buttons
  const buttons: KeyboardButtonDocument[] = []
  if (rawButtons !== undefined) {
    if (!Array.isArray(rawButtons)) throw new Error(`第 ${rowIndex + 1} 行的 buttons 必须是数组。`)
    rawButtons.forEach((button, buttonIndex) => buttons.push(readButton(button, rowIndex, buttonIndex)))
  }
  return { extras, buttons }
}

/** 从已解析的顶层对象构造文档；rows / buttons 结构非法时抛出可读错误。 */
export function keyboardDocumentFromValue(value: unknown): KeyboardDocument {
  if (!isRecord(value)) throw new Error('顶层必须是对象，例如 { "rows": [] }。')
  const extras = { ...value }
  const rawRows = extras.rows
  delete extras.rows
  const rows: KeyboardRowDocument[] = []
  if (rawRows !== undefined) {
    if (!Array.isArray(rawRows)) throw new Error('rows 必须是数组。')
    rawRows.forEach((row, rowIndex) => rows.push(readRow(row, rowIndex)))
  }
  return { extras, rows }
}

/**
 * 解析键盘 JSON 文本为结构化文档。
 * 空白文本按「没有按钮」处理（等价于 `{ "rows": [] }`）；JSON 或 rows / buttons 结构非法时返回错误。
 */
export function parseKeyboardDocument(text: string): KeyboardParseResult {
  const source = text.trim()
  if (!source) return { ok: true, document: emptyKeyboardDocument() }
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    return { ok: false, error: `JSON 解析失败：${error instanceof Error ? error.message : String(error)}` }
  }
  try {
    return { ok: true, document: keyboardDocumentFromValue(parsed) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function serializePermission(permission: KeyboardPermissionDocument): Record<string, unknown> {
  const value: Record<string, unknown> = { ...permission.extras }
  if (permission.type !== undefined) value.type = permission.type
  const userIds = parseIdList(permission.specifyUserIds)
  if (userIds.length) value.specify_user_ids = userIds
  const roleIds = parseIdList(permission.specifyRoleIds)
  if (roleIds.length) value.specify_role_ids = roleIds
  return value
}

function serializeAction(action: KeyboardActionDocument): Record<string, unknown> {
  const value: Record<string, unknown> = { ...action.extras }
  if (action.type !== undefined) value.type = action.type
  value.permission = serializePermission(action.permission)
  if (action.data !== undefined) value.data = action.data
  else if (!('data' in action.extras)) value.data = ''
  if (action.enter !== undefined) value.enter = action.enter
  if (action.reply !== undefined) value.reply = action.reply
  if (action.anchor !== undefined) value.anchor = action.anchor
  if (action.clickLimit !== undefined) value.click_limit = action.clickLimit
  if (action.atBotShowChannelList !== undefined) value.at_bot_show_channel_list = action.atBotShowChannelList
  if (action.unsupportTips.trim()) value.unsupport_tips = action.unsupportTips
  return value
}

function serializeRenderData(renderData: KeyboardRenderDataDocument): Record<string, unknown> {
  const value: Record<string, unknown> = { ...renderData.extras }
  if (renderData.label !== undefined) value.label = renderData.label
  else if (!('label' in renderData.extras)) value.label = ''
  if (renderData.visitedLabel.trim()) value.visited_label = renderData.visitedLabel
  if (renderData.style !== undefined) value.style = renderData.style
  return value
}

function serializeButton(
  button: KeyboardButtonDocument,
  rowIndex: number,
  buttonIndex: number,
): Record<string, unknown> {
  const value: Record<string, unknown> = { ...button.extras }
  // id 留空时按「行号-列号」生成，避免 QQ 因缺少按钮 ID 拒绝或忽略键盘。
  value.id = button.id.trim() || `${rowIndex}-${buttonIndex}`
  value.render_data = serializeRenderData(button.renderData)
  value.action = serializeAction(button.action)
  return value
}

/** 结构化文档序列化为 JSON 文本；`id` 留空的按钮在此按「行号-列号」补齐。 */
export function serializeKeyboardDocument(document: KeyboardDocument): string {
  const value: Record<string, unknown> = { ...document.extras }
  value.rows = document.rows.map((row, rowIndex) => {
    const serializedRow: Record<string, unknown> = { ...row.extras }
    serializedRow.buttons = row.buttons.map((button, buttonIndex) => serializeButton(button, rowIndex, buttonIndex))
    return serializedRow
  })
  return JSON.stringify(value, null, 2)
}

/** 画布给按钮的三档类型，直接对应 QQ 的 action.type。 */
export type KeyboardButtonKind = 'command' | 'link' | 'callback'

/** 回调按钮 action.data 的三种填写方式。 */
export type CallbackDataMode = 'reply' | 'command' | 'raw'

/** action.type 缺失时按运行时默认值 2（指令）归类，便于画布稳定选中一档。 */
export function keyboardButtonKind(type: number | undefined): KeyboardButtonKind {
  if (type === 0) return 'link'
  if (type === 1) return 'callback'
  return 'command'
}

/** 画布三档类型对应的 QQ action.type。 */
export function keyboardActionType(kind: KeyboardButtonKind): number {
  if (kind === 'link') return 0
  if (kind === 'callback') return 1
  return 2
}

/** 从回调 data 判断它用的是回复前缀、指令前缀，还是原样数据。 */
export function callbackDataMode(data: string): CallbackDataMode {
  if (data.startsWith(CALLBACK_REPLY_PREFIX)) return 'reply'
  if (data.startsWith(CALLBACK_COMMAND_PREFIX)) return 'command'
  return 'raw'
}

/** 取出管理员真正填写的内容，剥掉编辑器补充的回调前缀。 */
export function callbackDataContent(data: string, mode = callbackDataMode(data)): string {
  if (mode === 'reply' && data.startsWith(CALLBACK_REPLY_PREFIX)) {
    return data.slice(CALLBACK_REPLY_PREFIX.length)
  }
  if (mode === 'command' && data.startsWith(CALLBACK_COMMAND_PREFIX)) {
    return data.slice(CALLBACK_COMMAND_PREFIX.length)
  }
  return data
}

/** 按填写方式拼出最终 action.data；回复与指令模式由编辑器补前缀。 */
export function withCallbackData(mode: CallbackDataMode, content: string): string {
  if (mode === 'reply') return CALLBACK_REPLY_PREFIX + content
  if (mode === 'command') return CALLBACK_COMMAND_PREFIX + content
  return content
}

/** 把可解析的键盘 JSON 规范化成编辑器结构；解析失败时原样返回，交给校验报错。 */
export function normalizeKeyboardJson(value: string): string {
  if (!value.trim()) return value
  const result = parseKeyboardDocument(value)
  return result.ok ? serializeKeyboardDocument(result.document) : value
}

/**
 * 校验键盘 JSON 文本，供控制台页面在写入前给出格式提示。
 * @returns 出错原因；`undefined` 表示合法（空字符串代表「这个群不显示按钮」，同样合法）。
 */
export function validateKeyboardJson(value: string): string | undefined {
  const source = value.trim()
  if (!source) return

  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    return `JSON 解析失败：${error instanceof Error ? error.message : String(error)}`
  }
  if (!isRecord(parsed)) return '顶层必须是对象，例如 { "rows": [] }。'
  if (parsed.rows !== undefined && !Array.isArray(parsed.rows)) return 'rows 必须是数组。'
  for (const [rowIndex, row] of ((parsed.rows ?? []) as unknown[]).entries()) {
    if (!isRecord(row)) return `第 ${rowIndex + 1} 行的结构必须是对象。`
    if (row.buttons !== undefined && !Array.isArray(row.buttons)) return `第 ${rowIndex + 1} 行的 buttons 必须是数组。`
    for (const [buttonIndex, button] of ((row.buttons ?? []) as unknown[]).entries()) {
      const where = `第 ${rowIndex + 1} 行第 ${buttonIndex + 1} 个按钮`
      if (!isRecord(button)) return `${where}的结构必须是对象。`
      const renderData = button.render_data
      const action = button.action
      if (!isRecord(renderData)) return `${where}缺少 render_data 对象。`
      if (!isRecord(action)) return `${where}缺少 action 对象。`
      if (typeof renderData.label !== 'string' || !renderData.label.trim()) return `${where}缺少 render_data.label。`
      if (typeof action.data !== 'string' || !action.data.trim()) return `${where}缺少 action.data。`
    }
  }
  return
}
