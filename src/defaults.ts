/**
 * 内置默认值：哨兵行缺失（例如数据库被清空）时的最终兜底，
 * 也是哨兵行首次创建时的初始内容来源。
 */

/** 按钮回调的回复命名空间前缀。 */
export const CALLBACK_REPLY_PREFIX = 'welcome-messge-qq:reply:'

/** 按钮回调的指令命名空间前缀。 */
export const CALLBACK_COMMAND_PREFIX = 'welcome-messge-qq:command:'

export const DEFAULT_TIME_ZONE = 'Asia/Shanghai'
export const DEFAULT_WELCOME_MESSAGE = '欢迎 {at} 加入群聊！'
export const DEFAULT_LEAVE_MESSAGE = '{at} 已离开群聊。'
export const DEFAULT_CLOSE_RESPONSE_MESSAGE = '# 已关闭本群入退群通知\n> 点击下方按钮可以重新开启。'
export const DEFAULT_ENABLE_RESPONSE_MESSAGE = '# 已开启本群入退群通知\n> 点击下方按钮可以再次关闭。'

export const DEFAULT_WELCOME_KEYBOARD = JSON.stringify({
  rows: [{
    buttons: [{
      render_data: { label: '关闭欢迎', style: 1 },
      action: {
        type: 1,
        permission: { type: 1 },
        data: `${CALLBACK_COMMAND_PREFIX}/关闭欢迎`,
        enter: true,
      },
    }],
  }],
}, null, 2)

export const DEFAULT_LEAVE_KEYBOARD = JSON.stringify({
  rows: [{
    buttons: [
      {
        render_data: { label: '关闭欢迎', style: 1 },
        action: {
          type: 1,
          permission: { type: 1 },
          data: `${CALLBACK_COMMAND_PREFIX}/关闭欢迎`,
          enter: true,
        },
      },
      {
        render_data: { label: '帮助菜单', style: 1 },
        action: {
          type: 2,
          permission: { type: 2 },
          data: '/帮助菜单',
        },
      },
    ],
  }],
}, null, 2)

export const DEFAULT_CLOSE_RESPONSE_KEYBOARD = JSON.stringify({
  rows: [{
    buttons: [{
      render_data: { label: '重新开启', style: 1 },
      action: {
        type: 1,
        permission: { type: 1 },
        data: `${CALLBACK_COMMAND_PREFIX}/开启欢迎`,
      },
    }],
  }],
}, null, 2)

export const DEFAULT_ENABLE_RESPONSE_KEYBOARD = JSON.stringify({
  rows: [{
    buttons: [{
      render_data: { label: '再次关闭', style: 1 },
      action: {
        type: 1,
        permission: { type: 1 },
        data: `${CALLBACK_COMMAND_PREFIX}/关闭欢迎`,
      },
    }],
  }],
}, null, 2)


/**
 * 按控制台字段键索引的内置默认键盘：编辑器的「插入内置默认按钮」按字段取用。
 * 键与 `WelcomeMessageGroup` 的四个键盘内容字段同名，方便 console-form 与页面直接查表。
 */
export const DEFAULT_KEYBOARDS = {
  welcomeKeyboard: DEFAULT_WELCOME_KEYBOARD,
  leaveKeyboard: DEFAULT_LEAVE_KEYBOARD,
  closeResponseKeyboard: DEFAULT_CLOSE_RESPONSE_KEYBOARD,
  enableResponseKeyboard: DEFAULT_ENABLE_RESPONSE_KEYBOARD,
} as const

export type KeyboardField = keyof typeof DEFAULT_KEYBOARDS
