/**
 * 客户端类型环境：@koishijs/client 的包入口是未编译的 TS 源码（client/*.ts + .vue），
 * 直接纳入 tsc 会连带报出库内部错误（.vue 模块声明缺失、cordis/schemastery 版本错位），
 * 而包内没有可用的编译产物 d.ts。
 *
 * tsconfig.client.json 用 paths 把 `@koishijs/client` 的类型解析重定向到本文件，
 * 把库声明为不透明边界，只保留本插件面板用到的 API 签名；真实运行时行为仍由库实现提供。
 */
import type {} from 'vue'

export interface ElMessageApi {
  (options: { message: string; type?: 'success' | 'warning' | 'info' | 'error' }): void
  success(messageText: string): void
  warning(messageText: string): void
  info(messageText: string): void
  error(messageText: string): void
}

export const message: ElMessageApi

export interface ElMessageBoxApi {
  confirm(
    messageText: string,
    title?: string,
    options?: {
      type?: 'warning' | 'info' | 'success' | 'error'
      confirmButtonText?: string
      cancelButtonText?: string
    },
  ): Promise<void>
}

export const messageBox: ElMessageBoxApi

/** 控制台 WebSocket RPC；事件契约在 client/api.ts 里用「请求参数 + 响应类型」显式给出。 */
export function send<T = unknown>(event: string, body?: unknown): Promise<T>

/** 控制台共享 store：面板只读 user 判断登录态。 */
export const store: { user?: Record<string, unknown> }

export interface ConsolePageOptions {
  path: string
  name: string
  order?: number
  authority?: number
  component: unknown
}

export interface Context {
  page(options: ConsolePageOptions): void
}
