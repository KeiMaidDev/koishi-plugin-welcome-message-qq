import { send } from '@koishijs/client'
import type {
  ConsoleGroupInput,
  ConsoleGroupRow,
  ConsoleListQuery,
  ConsoleListResult,
  ConsoleWriteResult,
} from '../src/console-service'
import type { MigrationResult } from '../src/store'

export type {
  ConsoleGroupInput,
  ConsoleGroupRow,
  ConsoleListQuery,
  ConsoleListResult,
  ConsoleWriteResult,
  MigrationResult,
}

// @koishijs/client 在 client/env.d.ts 中被声明为不透明边界，send 不感知插件事件契约；
// 这里用「请求参数 + 响应类型」逐个封装 RPC，保持与 src/console.ts 服务端监听一致的类型。

/** list / delete 在服务端恒 resolve（失败走 throw）；update 返回写结果并断言 ok。 */
async function assertWrite(result: ConsoleWriteResult): Promise<void> {
  if (result.ok === true) return
  throw new Error(result.detail ?? '操作失败。')
}

export const fetchGroups = (query: ConsoleListQuery) => send<ConsoleListResult>('welcome-message-qq/list', query)
export const updateGroup = async (input: ConsoleGroupInput): Promise<void> =>
  assertWrite(await send<ConsoleWriteResult>('welcome-message-qq/update', input))
export const deleteGroup = async (id: string): Promise<void> =>
  assertWrite(await send<ConsoleWriteResult>('welcome-message-qq/delete', id))
export const migrateGroups = (options?: { dryRun?: boolean }) =>
  send<MigrationResult>('welcome-message-qq/migrate', options)
