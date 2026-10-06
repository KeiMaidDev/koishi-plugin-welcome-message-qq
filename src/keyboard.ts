/**
 * 键盘 JSON 的纯逻辑：不依赖 koishi，浏览器端页面与服务端共用同一份校验规则。
 */

export const EMPTY_KEYBOARD_JSON = JSON.stringify({ rows: [] }, null, 2)

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 校验键盘 JSON 文本，供控制台页面在写入前给出格式提示。
 * @returns 出错原因；`undefined` 表示合法（空字符串代表「这个群不显示按钮」，同样合法）。
 */
export function validateKeyboardJson(value: string): string | undefined {
  const source = value.trim()
  if (!source) return

  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    return `JSON 解析失败：${error instanceof Error ? error.message : String(error)}`
  }
  if (!isRecord(parsed)) return '顶层必须是对象，例如 { "rows": [] }。'
  if (parsed.rows !== undefined && !Array.isArray(parsed.rows)) return 'rows 必须是数组。'
  for (const [rowIndex, row] of ((parsed.rows ?? []) as unknown[]).entries()) {
    if (!isRecord(row)) return `第 ${rowIndex + 1} 行的结构必须是对象。`
    if (row.buttons !== undefined && !Array.isArray(row.buttons)) return `第 ${rowIndex + 1} 行的 buttons 必须是数组。`
    for (const [buttonIndex, button] of ((row.buttons ?? []) as unknown[]).entries()) {
      const where = `第 ${rowIndex + 1} 行第 ${buttonIndex + 1} 个按钮`
      if (!isRecord(button)) return `${where}的结构必须是对象。`
      const renderData = button.render_data
      const action = button.action
      if (!isRecord(renderData)) return `${where}缺少 render_data 对象。`
      if (!isRecord(action)) return `${where}缺少 action 对象。`
      if (typeof renderData.label !== 'string' || !renderData.label.trim()) return `${where}缺少 render_data.label。`
      if (typeof action.data !== 'string' || !action.data.trim()) return `${where}缺少 action.data。`
    }
  }
  return
}
