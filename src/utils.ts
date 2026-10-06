/** 把字符串里的正则元字符转义，用于把用户输入拼进 RegExp。 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 把任意抛出物转成可读文本，用于日志与回执。 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
