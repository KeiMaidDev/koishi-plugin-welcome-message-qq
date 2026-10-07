import type { ConsoleGroupInput, ConsoleGroupRow } from './console-service'
import {
  DEFAULT_CLOSE_RESPONSE_KEYBOARD,
  DEFAULT_CLOSE_RESPONSE_MESSAGE,
  DEFAULT_ENABLE_RESPONSE_KEYBOARD,
  DEFAULT_ENABLE_RESPONSE_MESSAGE,
  DEFAULT_LEAVE_KEYBOARD,
  DEFAULT_LEAVE_MESSAGE,
  DEFAULT_WELCOME_KEYBOARD,
  DEFAULT_WELCOME_MESSAGE,
} from './defaults'
import { validateKeyboardJson } from './keyboard'

/**
 * 控制台面板的表单纯逻辑：从组件 setup 中抽出，供页面直接调用，也可在 Node 测试里导入。
 *
 * 三态语义与数据库一致：编辑器里「继承」收集为 `null`，「覆盖」原样提交（空字符串即显式置空）。
 */

export interface TextFieldMeta {
  key: string
  label: string
  rows: number
  keyboard?: boolean
  hint?: string
}

/** 面板里逐字段三态编辑的文本内容字段。 */
export const TEXT_FIELDS: TextFieldMeta[] = [
  { key: 'welcomeMessage', label: '入群文案', rows: 3 },
  { key: 'leaveMessage', label: '离群文案', rows: 3 },
  { key: 'welcomeKeyboard', label: '入群按钮', rows: 5, keyboard: true, hint: '选「覆盖」但留空 = 该群不显示按钮' },
  { key: 'leaveKeyboard', label: '离群按钮', rows: 5, keyboard: true, hint: '选「覆盖」但留空 = 该群不显示按钮' },
  { key: 'closeResponseMessage', label: '关闭回执文案', rows: 3 },
  { key: 'closeResponseKeyboard', label: '关闭回执按钮', rows: 5, keyboard: true, hint: '选「覆盖」但留空 = 不显示按钮' },
  { key: 'enableResponseMessage', label: '开启回执文案', rows: 3 },
  { key: 'enableResponseKeyboard', label: '开启回执按钮', rows: 5, keyboard: true, hint: '选「覆盖」但留空 = 不显示按钮' },
]

/** 详情区分组里的字段元数据：开关、格式或文本内容字段。 */
export type DetailFieldMeta =
  | { kind: 'switch'; key: 'welcomeEnabled' | 'leaveEnabled'; label: string }
  | { kind: 'format'; key: 'messageFormat' | 'commandResponseFormat'; label: string }
  | { kind: 'text' } & TextFieldMeta

export interface FieldGroup {
  /** 折叠面板标题。 */
  title: string
  /**
   * 分组特性标记：'switches' 表示开关分组（群行渲染总开关，哨兵行渲染全局开关），
   * 缺省为内容字段分组。
   */
  kind?: 'switches'
  /** 该分组里的字段，按详情渲染顺序排列。 */
  fields: DetailFieldMeta[]
}

/** 详情分组的开关标题；开关字段只出现在哨兵行详情里。 */
const DETAIL_SWITCHES: Record<'welcomeEnabled' | 'leaveEnabled', string> = {
  welcomeEnabled: '全局入群通知',
  leaveEnabled: '全局离群通知',
}

function switchField(key: 'welcomeEnabled' | 'leaveEnabled'): DetailFieldMeta {
  return { kind: 'switch', key, label: DETAIL_SWITCHES[key] }
}

function textField(field: TextFieldMeta): DetailFieldMeta {
  return { kind: 'text', ...field }
}

/**
 * 详情区四个可折叠分组（issue #6）：通知开关 / 入群 / 离群 / 开关回执。
 * 分组内字段顺序即详情渲染顺序；通知开关分组在群行详情里整体隐藏（群行只有一个总开关）。
 */
export const FIELD_GROUPS: FieldGroup[] = [
  { title: '通知开关', kind: 'switches', fields: [switchField('welcomeEnabled'), switchField('leaveEnabled')] },
  {
    title: '入群',
    fields: [
      textField(TEXT_FIELDS[0]),
      textField(TEXT_FIELDS[2]),
      // messageFormat 同时作用于入群与离群消息，标签自带全称；归入首个相关分组
      { kind: 'format', key: 'messageFormat', label: '入群/离群消息格式' },
    ],
  },
  {
    title: '离群',
    fields: [
      textField(TEXT_FIELDS[1]),
      textField(TEXT_FIELDS[3]),
    ],
  },
  {
    title: '开关回执',
    fields: [
      { kind: 'format', key: 'commandResponseFormat', label: '回执格式' },
      textField(TEXT_FIELDS[4]),
      textField(TEXT_FIELDS[5]),
      textField(TEXT_FIELDS[6]),
      textField(TEXT_FIELDS[7]),
    ],
  },
]

export const FORMAT_FIELDS = [
  { key: 'messageFormat', label: '入群/离群消息格式' },
  { key: 'commandResponseFormat', label: '开关回执格式' },
]

export type FormatMode = 'inherit' | 'text' | 'markdown'

export type ContentFieldMode = 'inherit' | 'override'

/** 单个内容字段的编辑器状态：选「继承」时 value 不提交。 */
export interface FieldEditor {
  mode: ContentFieldMode
  value: string
}

/** 弹窗正在编辑的那一行。 */
export interface EditorState {
  id: string
  sentinel: boolean
  enabled: boolean
  welcomeEnabled: boolean
  leaveEnabled: boolean
}

/** 一次编辑会话的完整表单状态。 */
export interface FormState {
  editing: EditorState
  editors: Record<string, FieldEditor>
  formats: Record<string, FormatMode>
}

/** 按字段键读行值；row 为 null（新建草稿）或字段缺失时返回 null。 */
function fieldValue(row: ConsoleGroupRow | null, key: string): unknown {
  return row ? (row as unknown as Record<string, unknown>)[key] : null
}

/** 内容字段的内置默认值；格式与开关字段没有内置默认（运行时兜底取值），映射为空。 */
const BUILTIN_DEFAULTS: Record<string, string> = {
  welcomeMessage: DEFAULT_WELCOME_MESSAGE,
  leaveMessage: DEFAULT_LEAVE_MESSAGE,
  welcomeKeyboard: DEFAULT_WELCOME_KEYBOARD,
  leaveKeyboard: DEFAULT_LEAVE_KEYBOARD,
  closeResponseMessage: DEFAULT_CLOSE_RESPONSE_MESSAGE,
  closeResponseKeyboard: DEFAULT_CLOSE_RESPONSE_KEYBOARD,
  enableResponseMessage: DEFAULT_ENABLE_RESPONSE_MESSAGE,
  enableResponseKeyboard: DEFAULT_ENABLE_RESPONSE_KEYBOARD,
}

/**
 * 解析内容字段选「继承」时实际生效的值，用作输入框 placeholder（issue #6）。
 *
 * 与运行时继承链一致（群覆盖 → 全局默认行 → 内置默认，见 `src/store.ts` 的 pickString）：
 * - 编辑群行（`isSentinel = false`）：先取全局默认行（`row`）的值，没有时兜底内置默认值；
 * - 编辑哨兵行（`isSentinel = true`）：继承指向内置默认值。
 * 格式与开关字段没有内置默认文本，为 undefined，placeholder 显示占位文案。
 */
export function resolveInheritedValue(
  row: ConsoleGroupRow | null | undefined,
  key: string,
  isSentinel: boolean,
): string | undefined {
  if (isSentinel) return BUILTIN_DEFAULTS[key]
  if (row && typeof fieldValue(row, key) === 'string') return fieldValue(row, key) as string
  return BUILTIN_DEFAULTS[key]
}

/**
 * 由数据库行（或 null = 新建草稿）初始化表单状态。
 *
 * 行里的字符串值（含空串）恢复为「覆盖」，`null` / 缺失恢复为「继承」；
 * 群行开关默认开启；哨兵行的入群 / 离群开关只在显式为 `false` 时关闭。
 */
export function createFormState(row: ConsoleGroupRow | null, id: string): FormState {
  const editing: EditorState = {
    id,
    sentinel: row?.sentinel ?? false,
    enabled: row?.enabled ?? true,
    welcomeEnabled: row ? row.welcomeEnabled !== false : true,
    leaveEnabled: row ? row.leaveEnabled !== false : true,
  }
  const editors: Record<string, FieldEditor> = {}
  for (const field of TEXT_FIELDS) {
    const value = fieldValue(row, field.key)
    editors[field.key] = {
      mode: typeof value === 'string' ? 'override' : 'inherit',
      value: typeof value === 'string' ? value : '',
    }
  }
  const formats: Record<string, FormatMode> = {}
  for (const field of FORMAT_FIELDS) {
    const value = fieldValue(row, field.key)
    formats[field.key] = value === 'markdown' ? 'markdown' : value === 'text' ? 'text' : 'inherit'
  }
  return { editing, editors, formats }
}

/** 校验表单里所有键盘字段的 JSON，返回「字段 → 错误文案」；只检查覆盖模式。 */
export function collectKeyboardErrors(editors: Record<string, FieldEditor>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const field of TEXT_FIELDS) {
    if (!field.keyboard) continue
    const invalid = validateKeyboardJson(editors[field.key].value)
    if (editors[field.key].mode === 'override' && invalid) errors[field.key] = invalid
  }
  return errors
}

/**
 * 把表单状态收集为 update RPC 的入参。
 *
 * 群行只带总开关；哨兵行 `enabled` 恒为 true，并携带全局入群 / 离群开关。
 * 继承字段一律收集为 `null`，覆盖字段原样提交（空字符串即显式置空）。
 */
export function collectGroupInput(state: FormState): ConsoleGroupInput {
  const { editing, editors, formats } = state
  const input: ConsoleGroupInput = {
    id: editing.id,
    enabled: editing.sentinel ? true : editing.enabled,
  }
  if (editing.sentinel) {
    input.welcomeEnabled = editing.welcomeEnabled
    input.leaveEnabled = editing.leaveEnabled
  }
  for (const field of TEXT_FIELDS) {
    const editor = editors[field.key]
    input[field.key] = editor.mode === 'override' ? editor.value : null
  }
  for (const field of FORMAT_FIELDS) {
    const mode = formats[field.key]
    input[field.key] = mode === 'inherit' ? null : mode
  }
  return input
}

/** 列表项的一个覆盖字段 chip。 */
export interface OverrideChip {
  /** chip 显示文案。 */
  text: string
  /** 对应的字段键，用作渲染层的 key；继承提示 chip 没有对应字段。 */
  fieldKey?: string
}

const FORMAT_CHIP_TEXT: Record<'messageFormat' | 'commandResponseFormat', string> = {
  messageFormat: '消息格式',
  commandResponseFormat: '回执格式',
}

const FORMAT_CHIP_VALUE: Record<string, string> = { text: '普通消息', markdown: 'Markdown' }

/** 格式字段的 chip 文案；行里的非法取值原样显示，避免 chips 静默丢字段。 */
function formatChip(field: 'messageFormat' | 'commandResponseFormat', value: string): OverrideChip {
  return { text: `${FORMAT_CHIP_TEXT[field]} · ${FORMAT_CHIP_VALUE[value] ?? value}`, fieldKey: field }
}

/**
 * 左列列表项的覆盖字段 chips（issue #6）：逐字段检查行值，非空即给一个 chip
 * （空串显式置空也算覆盖）；格式字段 chip 带格式取值。按 TEXT_FIELDS → FORMAT_FIELDS
 * 的定义顺序输出，与详情分组顺序一致；按钮字段标签本身已含「按钮」。
 * 没有任何覆盖时给一条继承提示，哨兵行与群行文案不同。
 */
export function overrideChips(row: ConsoleGroupRow): OverrideChip[] {
  const chips: OverrideChip[] = []
  for (const field of TEXT_FIELDS) {
    if (fieldValue(row, field.key) !== null) {
      chips.push({ text: field.label, fieldKey: field.key })
    }
  }
  for (const field of FORMAT_FIELDS) {
    const value = fieldValue(row, field.key)
    if (typeof value === 'string') {
      chips.push(formatChip(field.key as 'messageFormat' | 'commandResponseFormat', value))
    }
  }
  if (!chips.length) return [{ text: row.sentinel ? '内置默认' : '全部继承全局' }]
  return chips
}

/** 内容字段键集合：与 `ConsoleGroupRow` 的内容字段一一对应，收集与摘共用。 */
export const FIELD_KEYS: readonly string[] = [
  ...TEXT_FIELDS.map(field => field.key),
  ...FORMAT_FIELDS.map(field => field.key),
]

/**
 * 按字段键对比表单状态与来源行，收集真正变化的内容字段。
 *
 * `row` 是详情数据来源的数据库行（新建草稿为 `null`，此时任何非继承值都算改动）。
 * 返回 null 表示内容字段与来源行完全一致；否则只带变化字段的键 +
 * `id` / `enabled`（哨兵行另带全局入群 / 离群开关，开关变化由 `collectSaveInput` 单独判定）。
 */
export function collectGroupChanges(
  state: FormState,
  row: ConsoleGroupRow | null,
): ConsoleGroupInput | null {
  const changed: Record<string, boolean> = {}
  for (const field of TEXT_FIELDS) {
    const editor = state.editors[field.key]
    const original = fieldValue(row, field.key)
    changed[field.key] = editor.mode === 'override'
      ? editor.value !== original
      : original !== null
  }
  for (const field of FORMAT_FIELDS) {
    const mode = state.formats[field.key]
    // 表单里的「继承」提交为 null，与行值比较前先换算成同一套取值
    const next = mode === 'inherit' ? null : mode
    changed[field.key] = next !== fieldValue(row, field.key)
  }
  if (!Object.values(changed).some(Boolean)) return null
  const input = collectGroupInput(state)
  for (const key of Object.keys(input)) {
    if (key in changed && !changed[key]) delete input[key]
  }
  return input
}

/**
 * 开关是否与来源行不同：群行看总开关，哨兵行看全局入群 / 离群开关。
 * 开关不参与内容差异收集（保存时总是提交），草稿以「默认开启」为基准。
 */
export function hasSwitchChanges(state: FormState, row: ConsoleGroupRow | null): boolean {
  const { editing } = state
  if (editing.sentinel) {
    return editing.welcomeEnabled !== (row ? row.welcomeEnabled !== false : true)
      || editing.leaveEnabled !== (row ? row.leaveEnabled !== false : true)
  }
  return editing.enabled !== (row ? row.enabled !== false : true)
}

/**
 * 收集本次保存要提交的输入：内容字段只带真正变化的，开关总是提交。
 * 返回 null 表示详情与来源行完全一致，没有需要保存的内容。
 */
export function collectSaveInput(state: FormState, row: ConsoleGroupRow | null): ConsoleGroupInput | null {
  const input = collectGroupChanges(state, row)
  if (input) return input
  if (!hasSwitchChanges(state, row)) return null
  const switches = collectGroupInput(state)
  for (const key of FIELD_KEYS) delete switches[key]
  return switches
}

/** 详情是否有未保存改动：内容字段差异或开关变化都算，与 `collectSaveInput` 用同一套判定。 */
export function hasFormChanges(state: FormState, row: ConsoleGroupRow | null): boolean {
  return collectSaveInput(state, row) !== null
}

/** 详情脏状态时切换列表项弹确认框用的固定文案。 */
export const FORM_CHANGES_MESSAGE = '详情有未保存的改动，离开将丢失这些改动。'
