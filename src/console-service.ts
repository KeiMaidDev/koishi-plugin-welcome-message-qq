import { validateKeyboardJson } from './keyboard'
import { GLOBAL_ROW_ID } from './model'
import {
  deleteGroupRow,
  importLegacyGroups,
  listGroupRows,
  loadGroupStats,
  saveGroupRow,
  type DatabaseLike,
  type MigrationResult,
} from './store'
import {
  CONTENT_FIELDS,
  type ContentField,
  type GroupConfig,
  type WelcomeMessageGroup,
} from './types'

export { GLOBAL_ROW_ID }

const KEYBOARD_FIELDS: readonly ContentField[] = [
  'welcomeKeyboard',
  'leaveKeyboard',
  'closeResponseKeyboard',
  'enableResponseKeyboard',
]

/**
 * 控制台传输用的一行。
 * 内容字段三态：`null` = 继承，`''` = 显式置空，有值 = 覆盖。
 */
export interface ConsoleGroupRow {
  id: string
  /** 哨兵行（全局默认）不能删除，`enabled` 也不可编辑。 */
  sentinel: boolean
  enabled: boolean
  /** 全局入群/离群开关，只有哨兵行有意义。 */
  welcomeEnabled: boolean | null
  leaveEnabled: boolean | null
  welcomeMessage: string | null
  leaveMessage: string | null
  welcomeKeyboard: string | null
  leaveKeyboard: string | null
  closeResponseMessage: string | null
  closeResponseKeyboard: string | null
  enableResponseMessage: string | null
  enableResponseKeyboard: string | null
  /** 最后更新时间戳；没有记录时为 null。 */
  updatedAt: number | null
}

export interface ConsoleListQuery {
  search?: string
  /** 只看开启（`true`）或关闭（`false`）的群覆盖行；不传时与现状一致，不加开关条件。 */
  enabled?: boolean
  page?: number
  pageSize?: number
}

export interface ConsoleListResult {
  rows: ConsoleGroupRow[]
  total: number
  page: number
  pageSize: number
}

/**
 * 管理页统计条的取值。
 *
 * 统计口径：适配器无法枚举机器人所在的群，因此「已开启 / 已关闭」只覆盖数据库里
 * 已有覆盖行的群；按 `scope: all` 默认开启、又没有覆盖行的群不计入。哨兵行（`*`）
 * 本身不计入行数，只用来读取两个全局开关。类型与口径的权威定义在 `store.GroupStats`。
 */
export interface ConsoleStats {
  /** 数据库里已有覆盖行的群总数，不含哨兵行。 */
  total: number
  /** 上述群里开启（`enabled === true`）的群数。 */
  enabled: number
  /** 上述群里关闭（`enabled === false`）的群数。 */
  disabled: number
  /** 全局入群开关；哨兵行缺失时为内置默认 `true`。 */
  welcomeEnabled: boolean
  /** 全局离群开关；哨兵行缺失时为内置默认 `true`。 */
  leaveEnabled: boolean
}

export type ConsoleErrorReason =
  | 'invalid_id'
  | 'invalid_field'
  | 'invalid_keyboard'
  | 'sentinel_not_deletable'

export type ConsoleWriteResult =
  | { ok: true }
  | { ok: false; reason: ConsoleErrorReason; detail?: string }

/** 更新入参原样来自控制台，字段一律按 unknown 校验，不信任客户端。 */
export interface ConsoleGroupInput {
  id?: unknown
  enabled?: unknown
  welcomeEnabled?: unknown
  leaveEnabled?: unknown
  [field: string]: unknown
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function readTimestamp(value: unknown): number | null {
  const parsed = value instanceof Date
    ? value.getTime()
    : typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Date.parse(value)
        : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

export function toConsoleRow(row: WelcomeMessageGroup): ConsoleGroupRow {
  return {
    id: row.id,
    sentinel: row.id === GLOBAL_ROW_ID,
    enabled: row.enabled !== false,
    welcomeEnabled: typeof row.welcomeEnabled === 'boolean' ? row.welcomeEnabled : null,
    leaveEnabled: typeof row.leaveEnabled === 'boolean' ? row.leaveEnabled : null,
    welcomeMessage: readString(row.welcomeMessage),
    leaveMessage: readString(row.leaveMessage),
    welcomeKeyboard: readString(row.welcomeKeyboard),
    leaveKeyboard: readString(row.leaveKeyboard),
    closeResponseMessage: readString(row.closeResponseMessage),
    closeResponseKeyboard: readString(row.closeResponseKeyboard),
    enableResponseMessage: readString(row.enableResponseMessage),
    enableResponseKeyboard: readString(row.enableResponseKeyboard),
    updatedAt: readTimestamp(row.updatedAt),
  }
}

/** `enabled` 只接受布尔值；其它类型按「不筛选」处理，保持缺省行为不变。 */
function readEnabledFilter(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

/** 服务端分页 + 按群 OpenID 搜索 + 可选开关筛选；渲染层的过滤一律不做。 */
export async function listConsoleGroups(
  database: DatabaseLike,
  query: ConsoleListQuery = {},
): Promise<ConsoleListResult> {
  const result = await listGroupRows(database, {
    search: query.search,
    enabled: readEnabledFilter(query.enabled),
    page: query.page,
    pageSize: query.pageSize,
  })
  return {
    rows: result.rows.map(toConsoleRow),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  }
}

/** 读取统计条的开关分布与全局开关；统计口径见 {@link ConsoleStats}。 */
export async function loadConsoleStats(database: DatabaseLike): Promise<ConsoleStats> {
  return loadGroupStats(database)
}

/** 逐字段校验三态内容字段，返回要写入的补丁。 */
function buildContentPatch(
  input: ConsoleGroupInput,
): { patch: Record<string, unknown> } | { error: string; reason: ConsoleErrorReason } {
  const patch: Record<string, unknown> = {}
  for (const field of CONTENT_FIELDS) {
    const value = input[field]
    if (value === undefined) continue
    if (value !== null && typeof value !== 'string') {
      return { error: `${field} 只能是 null 或字符串。`, reason: 'invalid_field' }
    }
    if (typeof value === 'string' && KEYBOARD_FIELDS.includes(field)) {
      const invalid = validateKeyboardJson(value)
      if (invalid) return { error: `${field} 不是合法的键盘 JSON：${invalid}`, reason: 'invalid_keyboard' }
    }
    patch[field] = value
  }
  return { patch }
}

/**
 * 按 `id` 写入或新建一行。
 *
 * 哨兵行的 `enabled` 恒为 true、入群/离群开关可编辑；群行只有一个总开关。
 * 缺省字段不写入，因此页面可以只改一部分字段。
 */
export async function updateConsoleGroup(
  database: DatabaseLike,
  input: ConsoleGroupInput,
): Promise<ConsoleWriteResult> {
  const id = typeof input?.id === 'string' ? input.id.trim() : ''
  if (!id) return { ok: false, reason: 'invalid_id' }

  const built = buildContentPatch(input ?? {})
  if ('error' in built) return { ok: false, reason: built.reason, detail: built.error }

  const sentinel = id === GLOBAL_ROW_ID
  const patch: Record<string, unknown> = { ...built.patch }
  if (sentinel) {
    patch.enabled = true
    if (input.welcomeEnabled !== undefined) {
      if (typeof input.welcomeEnabled !== 'boolean') return { ok: false, reason: 'invalid_field', detail: 'welcomeEnabled 只能是布尔值。' }
      patch.welcomeEnabled = input.welcomeEnabled
    }
    if (input.leaveEnabled !== undefined) {
      if (typeof input.leaveEnabled !== 'boolean') return { ok: false, reason: 'invalid_field', detail: 'leaveEnabled 只能是布尔值。' }
      patch.leaveEnabled = input.leaveEnabled
    }
  } else {
    if (input.enabled !== undefined) {
      if (typeof input.enabled !== 'boolean') return { ok: false, reason: 'invalid_field', detail: 'enabled 只能是布尔值。' }
      patch.enabled = input.enabled
    }
  }

  await saveGroupRow(database, { ...patch, id } as Partial<WelcomeMessageGroup> & { id: string })
  return { ok: true }
}

/** 删除群覆盖行，让它回到继承状态；哨兵行不可删除。 */
export async function deleteConsoleGroup(
  database: DatabaseLike,
  id: unknown,
): Promise<ConsoleWriteResult> {
  const normalized = typeof id === 'string' ? id.trim() : ''
  if (!normalized) return { ok: false, reason: 'invalid_id' }
  if (normalized === GLOBAL_ROW_ID) return { ok: false, reason: 'sentinel_not_deletable' }
  await deleteGroupRow(database, normalized)
  return { ok: true }
}

/**
 * 迁移旧配置里的 `groups`。
 * `dryRun = true` 时只试算不写入，用于点击按钮前的「将覆盖 N 行」提示。
 */
export async function migrateConsoleGroups(
  database: DatabaseLike,
  groups: readonly GroupConfig[] | undefined,
  dryRun = false,
): Promise<MigrationResult> {
  return importLegacyGroups(database, groups, { dryRun })
}
