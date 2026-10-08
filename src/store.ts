import type { Context } from 'koishi'
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
import { GLOBAL_ROW_ID, GROUP_TABLE } from './model'
import { escapeRegExp } from './utils'
import {
  CONTENT_FIELDS,
  type Config,
  type ContentField,
  type GroupConfig,
  type MessageFormat,
  type NotificationEventType,
  type NotificationScope,
  type ResolvedNotificationConfig,
  type ResolvedResponseConfig,
  type WelcomeMessageGroup,
} from './types'

export type DatabaseLike = Context['database']

/** 一次事件里用到的两行：群覆盖行与全局哨兵行。 */
export interface GroupRowSet {
  group?: WelcomeMessageGroup
  global?: WelcomeMessageGroup
}

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 200

function pickString(
  local: string | null | undefined,
  global: string | null | undefined,
  fallback: string,
): string {
  if (typeof local === 'string') return local
  if (typeof global === 'string') return global
  return fallback
}

function pickFormat(
  local: MessageFormat | null | undefined,
  global: MessageFormat | null | undefined,
): MessageFormat {
  if (local === 'text' || local === 'markdown') return local
  if (global === 'text' || global === 'markdown') return global
  return 'text'
}

/**
 * 一次性读出群覆盖行与哨兵行。
 * 读失败由调用方处理：事件链只记日志并跳过，指令回执提示读取失败，都不向上抛。
 */
export async function loadGroupRows(database: DatabaseLike, guildId: string): Promise<GroupRowSet> {
  const normalized = guildId?.trim()
  if (!normalized) return {}
  const ids = normalized === GLOBAL_ROW_ID ? [GLOBAL_ROW_ID] : [normalized, GLOBAL_ROW_ID]
  const rows = await database.get(GROUP_TABLE, { id: { $in: ids } })
  const result: GroupRowSet = {}
  for (const row of rows) {
    if (row.id === GLOBAL_ROW_ID) result.global = row
    else if (row.id === normalized) result.group = row
  }
  return result
}

/**
 * 群当前是否处于开启状态。
 * `scope = 'all'` 时所有群默认开启，只有显式关闭的群跳过；
 * `scope = 'configured'` 时只有存在覆盖行的群开启。
 */
export function isGuildEnabled(rows: GroupRowSet, scope: NotificationScope): boolean {
  if (rows.group) return rows.group.enabled !== false
  return scope !== 'configured'
}

/**
 * 群覆盖行 → 哨兵行 → 内置常量，逐字段解析出本次事件真正要发送的内容。
 */
export function resolveNotificationConfig(
  rows: GroupRowSet,
  scope: NotificationScope,
  eventType: NotificationEventType,
): ResolvedNotificationConfig | undefined {
  const { group, global } = rows
  if (scope === 'configured' && !group) return
  if (group && group.enabled === false) return

  const eventEnabled = eventType === 'join'
    ? global?.welcomeEnabled ?? true
    : global?.leaveEnabled ?? true
  if (!eventEnabled) return

  if (eventType === 'join') {
    return {
      enabled: true,
      message: pickString(group?.welcomeMessage, global?.welcomeMessage, DEFAULT_WELCOME_MESSAGE),
      messageFormat: pickFormat(group?.messageFormat, global?.messageFormat),
      keyboard: pickString(group?.welcomeKeyboard, global?.welcomeKeyboard, DEFAULT_WELCOME_KEYBOARD),
    }
  }

  return {
    enabled: true,
    message: pickString(group?.leaveMessage, global?.leaveMessage, DEFAULT_LEAVE_MESSAGE),
    messageFormat: pickFormat(group?.messageFormat, global?.messageFormat),
    keyboard: pickString(group?.leaveKeyboard, global?.leaveKeyboard, DEFAULT_LEAVE_KEYBOARD),
  }
}

/** 开关指令回执的正文与按钮，同样逐字段解析三态。 */
export function resolveResponseConfig(rows: GroupRowSet, enabled: boolean): ResolvedResponseConfig {
  const { group, global } = rows
  const messageFormat = pickFormat(group?.commandResponseFormat, global?.commandResponseFormat)
  if (enabled) {
    return {
      message: pickString(group?.enableResponseMessage, global?.enableResponseMessage, DEFAULT_ENABLE_RESPONSE_MESSAGE),
      messageFormat,
      keyboard: pickString(group?.enableResponseKeyboard, global?.enableResponseKeyboard, DEFAULT_ENABLE_RESPONSE_KEYBOARD),
    }
  }
  return {
    message: pickString(group?.closeResponseMessage, global?.closeResponseMessage, DEFAULT_CLOSE_RESPONSE_MESSAGE),
    messageFormat,
    keyboard: pickString(group?.closeResponseKeyboard, global?.closeResponseKeyboard, DEFAULT_CLOSE_RESPONSE_KEYBOARD),
  }
}

/** 旧版全局配置里的内容字段 → 哨兵行。只在哨兵行不存在时使用。 */
export function globalRowFromConfig(config: Config): WelcomeMessageGroup {
  return {
    id: GLOBAL_ROW_ID,
    enabled: true,
    welcomeEnabled: config.welcomeEnabled ?? true,
    leaveEnabled: config.leaveEnabled ?? true,
    welcomeMessage: config.welcomeMessage ?? null,
    leaveMessage: config.leaveMessage ?? null,
    welcomeKeyboard: config.welcomeKeyboard ?? null,
    leaveKeyboard: config.leaveKeyboard ?? null,
    messageFormat: config.messageFormat ?? null,
    commandResponseFormat: config.commandResponseFormat ?? null,
    closeResponseMessage: config.closeResponseMessage ?? null,
    closeResponseKeyboard: config.closeResponseKeyboard ?? null,
    enableResponseMessage: config.enableResponseMessage ?? null,
    enableResponseKeyboard: config.enableResponseKeyboard ?? null,
  }
}

/**
 * 哨兵行不存在时按旧全局配置创建，存在时原样保留。
 * @returns 本次调用是否真的创建了哨兵行。
 */
export async function ensureGlobalRow(database: DatabaseLike, config: Config): Promise<boolean> {
  const rows = await database.get(GROUP_TABLE, { id: GLOBAL_ROW_ID }, ['id'])
  if (rows.length) return false
  await database.create(GROUP_TABLE, { ...globalRowFromConfig(config), updatedAt: new Date() })
  return true
}

/**
 * 写入一行：存在则只覆盖给出的字段（不影响其它内容字段），不存在则插入。
 * `enabled` 是唯一不可空的开关，新建行时缺省为 true。
 */
export async function saveGroupRow(
  database: DatabaseLike,
  row: Partial<WelcomeMessageGroup> & { id: string },
): Promise<void> {
  const id = row.id.trim()
  const data: Record<string, unknown> = { ...row, id, updatedAt: new Date() }
  delete data.id
  for (const key of Object.keys(data)) {
    if (data[key] === undefined) delete data[key]
  }
  const existing = await database.get(GROUP_TABLE, { id }, ['id'])
  if (existing.length) {
    await database.set(GROUP_TABLE, { id }, data)
    return
  }
  await database.create(GROUP_TABLE, { ...data, id, enabled: row.enabled ?? true })
}

/**
 * 单行写入群开关：只动 `enabled` 与 `updatedAt`，绝不覆盖该群已有的正文、按钮等字段。
 */
export async function setGroupEnabled(
  database: DatabaseLike,
  guildId: string,
  enabled: boolean,
): Promise<void> {
  await saveGroupRow(database, { id: guildId, enabled })
}

/** 删除群覆盖行；哨兵行不允许删除。 */
export async function deleteGroupRow(database: DatabaseLike, id: string): Promise<void> {
  const normalized = id?.trim()
  if (!normalized) throw new Error('缺少群 OpenID。')
  if (normalized === GLOBAL_ROW_ID) throw new Error('全局默认行不能删除。')
  await database.remove(GROUP_TABLE, { id: normalized })
}

function assignContentField(patch: Partial<WelcomeMessageGroup>, field: ContentField, value: unknown) {
  if (value === undefined) return
  if (field === 'messageFormat' || field === 'commandResponseFormat') {
    if (value === 'text' || value === 'markdown') patch[field] = value
    return
  }
  if (typeof value === 'string') patch[field] = value
}

export interface MigrationResult {
  /** 数据库里已有、被配置的显式字段覆盖掉的行数。 */
  overwritten: number
  /** 数据库里没有、需要新建的行数。 */
  written: number
  /** 本次只试算、未真正写入时为 true。 */
  dryRun: boolean
}

/** 旧配置 → 迁移计划：同一个 OpenID 出现多次时以最后一项为准。 */
function buildMigrationPlan(groups: readonly GroupConfig[] | undefined) {
  const patches = new Map<string, Partial<WelcomeMessageGroup>>()
  for (const group of Array.isArray(groups) ? groups : []) {
    if (!group || typeof group !== 'object') continue
    const id = typeof group.guildId === 'string' ? group.guildId.trim() : ''
    if (!id || id === GLOBAL_ROW_ID) continue
    const patch: Partial<WelcomeMessageGroup> = {}
    if (typeof group.enabled === 'boolean') patch.enabled = group.enabled
    for (const field of CONTENT_FIELDS) {
      assignContentField(patch, field, (group as Record<string, unknown>)[field])
    }
    // 重复 OpenID 以最后一项为准：整条替换而不是合并
    patches.set(id, patch)
  }
  return patches
}

/**
 * 把旧配置里的 `groups` 迁移进数据库。
 *
 * - 只写配置里显式出现的字段，未出现的字段保持数据库原值；
 * - 不删除任何数据，也不回写配置文件；
 * - 计划在写入前算好，所以试算和真正执行判定的是同一批行；重复执行时判定不变，只是
 *   本该新建的行变成覆盖已有行（`written` 递减、`overwritten` 递增）。
 */
export async function importLegacyGroups(
  database: DatabaseLike,
  groups: readonly GroupConfig[] | undefined,
  options: { dryRun?: boolean } = {},
): Promise<MigrationResult> {
  const patches = buildMigrationPlan(groups)
  const ids = [...patches.keys()]
  const existing = ids.length
    ? await database.get(GROUP_TABLE, { id: { $in: ids } }, ['id'])
    : []
  const existingIds = new Set(existing.map(row => row.id))

  const result: MigrationResult = { overwritten: 0, written: 0, dryRun: Boolean(options.dryRun) }
  for (const [id, patch] of patches) {
    if (existingIds.has(id)) result.overwritten++
    else result.written++
    if (options.dryRun) continue
    await saveGroupRow(database, { ...patch, id })
  }
  return result
}

export interface ListGroupRowsQuery {
  search?: string
  /** 只看开启（`true`）或关闭（`false`）的群行；不传时与现状一致，不加开关条件。 */
  enabled?: boolean
  page?: number
  pageSize?: number
}

export interface ListGroupRowsResult {
  rows: WelcomeMessageGroup[]
  total: number
  page: number
  pageSize: number
}

function normalizePage(value: unknown, fallback: number, max?: number): number {
  const parsed = typeof value === 'number' ? Math.floor(value) : Number.NaN
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return max ? Math.min(parsed, max) : parsed
}

/**
 * 服务端分页 + 按群 OpenID 片段搜索 + 可选开关筛选，哨兵行（`*`）排序后自然落在
 * 第一页开头。`enabled` 只接受布尔值，不传时与现状完全一致、不并入开关条件。
 */
export async function listGroupRows(
  database: DatabaseLike,
  query: ListGroupRowsQuery = {},
): Promise<ListGroupRowsResult> {
  const page = normalizePage(query.page, 1)
  const pageSize = normalizePage(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const search = typeof query.search === 'string' ? query.search.trim() : ''
  const match: Record<string, unknown> = {}
  if (search) match.id = { $regex: new RegExp(escapeRegExp(search), 'i') }
  if (typeof query.enabled === 'boolean') match.enabled = query.enabled
  const [rows, ids] = await Promise.all([
    database.get(GROUP_TABLE, match, {
      limit: pageSize,
      offset: (page - 1) * pageSize,
      sort: { id: 'asc' as const },
    }),
    database.get(GROUP_TABLE, match, ['id']),
  ])
  return { rows, total: ids.length, page, pageSize }
}

/**
 * 群覆盖行的开关分布与全局开关。
 *
 * 统计口径：适配器无法枚举机器人所在的群，所以「已开启 / 已关闭」只覆盖数据库里
 * 已有覆盖行的群；按 `scope: all` 默认开启、又没有覆盖行的群不计入。哨兵行（`*`）
 * 本身不计入行数，只用来读取两个全局开关。
 */
export interface GroupStats {
  /** 数据库里已有覆盖行的群总数，不含哨兵行。 */
  total: number
  /** 上述群里 `enabled === true` 的数量。 */
  enabled: number
  /** 上述群里 `enabled === false` 的数量。 */
  disabled: number
  /** 全局入群开关；哨兵行缺失时回退到内置默认 `true`。 */
  welcomeEnabled: boolean
  /** 全局离群开关；哨兵行缺失时回退到内置默认 `true`。 */
  leaveEnabled: boolean
}

/**
 * 统计群覆盖行的开关分布与全局开关。
 *
 * 行数只算群覆盖行，哨兵行单独读取、不计入 `total`；两个全局开关在哨兵行缺失或
 * 字段为空时回退到内置默认 `true`。口径细节见 {@link GroupStats}。
 */
export async function loadGroupStats(database: DatabaseLike): Promise<GroupStats> {
  const groupFilter = { id: { $ne: GLOBAL_ROW_ID } }
  const [groups, sentinels] = await Promise.all([
    database.get(GROUP_TABLE, groupFilter, ['id', 'enabled']),
    database.get(GROUP_TABLE, { id: GLOBAL_ROW_ID }),
  ])
  let enabled = 0
  let disabled = 0
  for (const row of groups) {
    if (row.enabled === true) enabled++
    else if (row.enabled === false) disabled++
  }
  const sentinel = sentinels[0]
  return {
    total: groups.length,
    enabled,
    disabled,
    welcomeEnabled: sentinel?.welcomeEnabled ?? true,
    leaveEnabled: sentinel?.leaveEnabled ?? true,
  }
}
