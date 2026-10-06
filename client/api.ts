import { send } from '@koishijs/client'
import type {} from '@koishijs/plugin-console'
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

declare module '@koishijs/plugin-console' {
  interface Events {
    'welcome-message-qq/list'(query: ConsoleListQuery): Promise<ConsoleListResult>
    'welcome-message-qq/update'(input: ConsoleGroupInput): Promise<ConsoleWriteResult>
    'welcome-message-qq/delete'(id: string): Promise<ConsoleWriteResult>
    'welcome-message-qq/migrate'(options?: { dryRun?: boolean }): Promise<MigrationResult>
  }
}

export const fetchGroups = (query: ConsoleListQuery) => send('welcome-message-qq/list', query)
export const updateGroup = (input: ConsoleGroupInput) => send('welcome-message-qq/update', input)
export const deleteGroup = (id: string) => send('welcome-message-qq/delete', id)
export const migrateGroups = (options?: { dryRun?: boolean }) => send('welcome-message-qq/migrate', options)
