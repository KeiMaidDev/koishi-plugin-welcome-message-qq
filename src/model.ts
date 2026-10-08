import type { Context } from 'koishi'
import type { WelcomeMessageGroup } from './types'

/** 群级通知状态表名。新表使用正确拼写，插件 id 的旧拼写保持不变。 */
export const GROUP_TABLE = 'welcome_message_group'

/** 全局默认行的主键；其余行的主键是 QQ 群 OpenID。 */
export const GLOBAL_ROW_ID = '*'

declare module 'koishi' {
  interface Tables {
    welcome_message_group: WelcomeMessageGroup
  }
}

/**
 * 注册群级通知状态表。
 *
 * 内容字段一律可空，用 NULL 表示继承：群行继承哨兵行，哨兵行继承内置常量。
 * 开关字段不可空：群行只有一个 `enabled`，哨兵行的 `welcomeEnabled` / `leaveEnabled` 是全局开关。
 *
 * 注意：字符串字段必须显式声明 `nullable`，否则 minato 会用 `''` 填充缺省值，
 * 把「未覆盖」变成「显式置空」。
 */
export function extendGroupTable(ctx: Context) {
  const contentField = { type: 'string', nullable: true } as const
  ctx.model.extend(GROUP_TABLE, {
    id: 'string',
    enabled: 'boolean',
    welcomeEnabled: { type: 'boolean', nullable: true },
    leaveEnabled: { type: 'boolean', nullable: true },
    welcomeMessage: contentField,
    leaveMessage: contentField,
    welcomeKeyboard: contentField,
    leaveKeyboard: contentField,
    // @deprecated 文案与回执已一律按 Markdown 发送，仅作历史数据清理用，0.2.0 再从模型移除。
    messageFormat: contentField,
    commandResponseFormat: contentField,
    closeResponseMessage: contentField,
    closeResponseKeyboard: contentField,
    enableResponseMessage: contentField,
    enableResponseKeyboard: contentField,
    updatedAt: 'timestamp',
  }, { primary: 'id' })
}
