import fs from 'fs'
import path from 'path'
import type { Context } from 'koishi'
import type {} from '@koishijs/console'
import { CONSOLE_PANEL_AUTHORITY } from './console-permission'
import {
  deleteConsoleGroup,
  listConsoleGroups,
  migrateConsoleGroups,
  updateConsoleGroup,
  type ConsoleErrorReason,
  type ConsoleGroupInput,
  type ConsoleListQuery,
  type ConsoleListResult,
  type ConsoleWriteResult,
} from './console-service'
import type { MigrationResult } from './store'
import type { Config } from './types'
import { errorMessage } from './utils'

declare module '@koishijs/console' {
  interface Events {
    'welcome-message-qq/list'(query: ConsoleListQuery): Promise<ConsoleListResult>
    'welcome-message-qq/update'(input: ConsoleGroupInput): Promise<ConsoleWriteResult>
    'welcome-message-qq/delete'(id: string): Promise<ConsoleWriteResult>
    'welcome-message-qq/migrate'(options?: { dryRun?: boolean }): Promise<MigrationResult>
  }
}

/** 控制台 RPC 命名空间，统一用正确拼写（插件 id 的旧拼写保持不变）。 */
export const CONSOLE_API_PREFIX = 'welcome-message-qq'

/** 与 package.json 的 name 一致：包名里的拼写错误不在本次修正范围内。 */
const PKG_NAME = 'koishi-plugin-welcome-messge-qq'

/**
 * 计算控制台客户端 entry 路径。
 * 生产模式下 @koishijs/plugin-console 的静态服务只放行 console 自身 dist 与
 * 路径含 node_modules 的文件；本插件经 workspace symlink 被 Node realpath 解析到
 * external/ 下，__dirname 形式的路径会被 403（面板无法显示）。
 * 因此 prod 优先走 node_modules 链接路径，真实安装进 node_modules 时回退 __dirname。
 */
export function resolveConsoleEntry(ctx: Pick<Context, 'baseDir'>): { dev: string; prod: string } {
  const viaNodeModules = path.resolve(ctx.baseDir, 'node_modules', PKG_NAME, 'dist')
  return {
    dev: path.resolve(ctx.baseDir, 'client/index.ts'),
    prod: fs.existsSync(viaNodeModules) ? viaNodeModules : path.resolve(__dirname, '../dist'),
  }
}

const ERROR_MESSAGES: Record<ConsoleErrorReason, string> = {
  invalid_id: '缺少合法的群 OpenID。',
  invalid_field: '字段内容不合法。',
  invalid_keyboard: '键盘 JSON 不合法。',
  sentinel_not_deletable: '全局默认行不能删除。',
}

export interface ConsoleOptions {
  config: Config
}

/**
 * 群覆盖管理页的服务端子插件。
 * console 服务未就绪时 cordis 会在其可用后重新加载本子插件，因此这里可以放心 inject 可选。
 */
export const setupConsole = Object.assign(
  function setupConsole(ctx: Context, options: ConsoleOptions) {
    // console 服务未就绪时，cordis 会在其可用后重新加载本子插件
    if (!ctx.console) return

    const logger = ctx.logger('welcome-message-qq-console')
    const legacyGroups = () => options.config?.groups ?? []

    /** 数据库读写失败时给出可读原因，页面据此提示而不是白屏。 */
    const run = async <T>(label: string, task: () => Promise<T>): Promise<T> => {
      try {
        return await task()
      } catch (error) {
        logger.warn('%s失败：%s', label, errorMessage(error))
        throw new Error(`${label}失败：${errorMessage(error)}`)
      }
    }

    const assertOk = (result: ConsoleWriteResult) => {
      if (result.ok === true) return result
      throw new Error(result.detail ?? ERROR_MESSAGES[result.reason] ?? '操作失败。')
    }

    // 面板数据与操作只对权限等级 4（与「插件配置」页同级）的用户开放
    const requireAuthority = { authority: CONSOLE_PANEL_AUTHORITY }

    ctx.console.addListener(`${CONSOLE_API_PREFIX}/list`, (query) =>
      run('加载群覆盖列表', () => listConsoleGroups(ctx.database, query ?? {})), requireAuthority)

    ctx.console.addListener(`${CONSOLE_API_PREFIX}/update`, async (input) =>
      assertOk(await run('保存群覆盖', () => updateConsoleGroup(ctx.database, input ?? {}))), requireAuthority)

    ctx.console.addListener(`${CONSOLE_API_PREFIX}/delete`, async (id) =>
      assertOk(await run('删除群覆盖', () => deleteConsoleGroup(ctx.database, id))), requireAuthority)

    ctx.console.addListener(`${CONSOLE_API_PREFIX}/migrate`, (migrationOptions) => {
      const dryRun = migrationOptions?.dryRun === true
      return run(dryRun ? '试算迁移' : '迁移旧配置', () =>
        migrateConsoleGroups(ctx.database, legacyGroups(), dryRun))
    }, requireAuthority)

    ctx.console.addEntry(resolveConsoleEntry(ctx))
  },
  { inject: { console: { required: false } } },
)
