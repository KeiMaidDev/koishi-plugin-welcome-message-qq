import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  collectGroupInput,
  collectKeyboardErrors,
  createFormState,
  overrideSummary,
} from '../src/console-form'
import type { ConsoleGroupRow } from '../src/console-service'

/** 一条空白的群覆盖行：所有内容字段都是继承。 */
function makeRow(overrides: Partial<ConsoleGroupRow> = {}): ConsoleGroupRow {
  return {
    id: 'G1',
    sentinel: false,
    enabled: true,
    welcomeEnabled: null,
    leaveEnabled: null,
    welcomeMessage: null,
    leaveMessage: null,
    welcomeKeyboard: null,
    leaveKeyboard: null,
    messageFormat: null,
    commandResponseFormat: null,
    closeResponseMessage: null,
    closeResponseKeyboard: null,
    enableResponseMessage: null,
    enableResponseKeyboard: null,
    updatedAt: null,
    ...overrides,
  }
}

const VALID_KEYBOARD = JSON.stringify({
  rows: [{ buttons: [{ render_data: { label: '查看' }, action: { data: 'help' } }] }],
})

describe('createFormState（表单状态初始化）', () => {
  it('从数据库行恢复：有值 → 覆盖，null → 继承，空串 → 覆盖 + 空串', () => {
    const state = createFormState(makeRow({
      welcomeMessage: '你好',
      leaveKeyboard: '',
      messageFormat: 'markdown',
      enabled: false,
    }), 'G1')

    assert.deepEqual(state.editing, {
      id: 'G1',
      sentinel: false,
      enabled: false,
      welcomeEnabled: true,
      leaveEnabled: true,
    })
    assert.deepEqual(state.editors.welcomeMessage, { mode: 'override', value: '你好' })
    assert.deepEqual(state.editors.leaveKeyboard, { mode: 'override', value: '' })
    assert.deepEqual(state.editors.leaveMessage, { mode: 'inherit', value: '' })
    assert.equal(state.formats.messageFormat, 'markdown')
    assert.equal(state.formats.commandResponseFormat, 'inherit')
  })

  it('哨兵行恢复全局开关，welcomeEnabled / leaveEnabled 非 false 时视为开启', () => {
    const sentinel = createFormState(
      makeRow({ id: '*', sentinel: true, welcomeEnabled: false, leaveEnabled: null }),
      '*',
    )
    assert.equal(sentinel.editing.sentinel, true)
    assert.equal(sentinel.editing.welcomeEnabled, false)
    assert.equal(sentinel.editing.leaveEnabled, true)
  })

  it('新建草稿：全部字段从继承开始，开关默认开启', () => {
    const state = createFormState(null, 'G-new')
    assert.deepEqual(state.editing, {
      id: 'G-new',
      sentinel: false,
      enabled: true,
      welcomeEnabled: true,
      leaveEnabled: true,
    })
    for (const editor of Object.values(state.editors)) {
      assert.deepEqual(editor, { mode: 'inherit', value: '' })
    }
    for (const mode of Object.values(state.formats)) {
      assert.equal(mode, 'inherit')
    }
  })
})

describe('collectGroupInput（三态收集）', () => {
  it('群行：覆盖原样提交（空串即显式置空），继承收集成 null，不带全局开关', () => {
    const state = createFormState(null, 'G2')
    state.editors.welcomeMessage = { mode: 'override', value: '定制文案' }
    state.editors.leaveKeyboard = { mode: 'override', value: '' }
    state.editing.enabled = false
    state.formats.commandResponseFormat = 'markdown'

    assert.deepEqual(collectGroupInput(state), {
      id: 'G2',
      enabled: false,
      welcomeMessage: '定制文案',
      leaveMessage: null,
      welcomeKeyboard: null,
      leaveKeyboard: '',
      messageFormat: null,
      commandResponseFormat: 'markdown',
      closeResponseMessage: null,
      closeResponseKeyboard: null,
      enableResponseMessage: null,
      enableResponseKeyboard: null,
    })
  })

  it('哨兵行：enabled 恒为 true，并携带全局入群 / 离群开关', () => {
    const state = createFormState(
      makeRow({ id: '*', sentinel: true, enabled: false, welcomeEnabled: false }),
      '*',
    )
    const input = collectGroupInput(state)
    assert.equal(input.enabled, true)
    assert.equal(input.welcomeEnabled, false)
    assert.equal(input.leaveEnabled, true)
  })
})

describe('overrideSummary（覆盖字段摘要）', () => {
  it('没有覆盖时哨兵行与群行文案不同', () => {
    assert.equal(overrideSummary(makeRow({ id: '*', sentinel: true })), '全部使用内置默认')
    assert.equal(overrideSummary(makeRow()), '全部继承全局')
  })

  it('数出覆盖的字段数，空串（显式置空）也算覆盖', () => {
    assert.equal(
      overrideSummary(makeRow({ id: '*', sentinel: true, welcomeMessage: 'x', messageFormat: 'text' })),
      '2 项自定义',
    )
    assert.equal(
      overrideSummary(makeRow({ welcomeKeyboard: '', leaveMessage: 'y', closeResponseKeyboard: 'z' })),
      '3 个字段覆盖',
    )
  })
})

describe('collectKeyboardErrors（键盘 JSON 校验入口）', () => {
  it('只校验覆盖模式下的键盘字段：继承不校验、空串合法、普通文案不校验', () => {
    const state = createFormState(null, 'G1')
    state.editors.welcomeKeyboard = { mode: 'override', value: 'not json' }
    state.editors.leaveKeyboard = { mode: 'inherit', value: '{bad' }
    state.editors.closeResponseKeyboard = { mode: 'override', value: '' }
    state.editors.welcomeMessage = { mode: 'override', value: '{{{' }

    const found = collectKeyboardErrors(state.editors)
    assert.deepEqual(Object.keys(found), ['welcomeKeyboard'])
    assert.ok(found.welcomeKeyboard!.includes('JSON 解析失败'))
  })

  it('结构错误有提示，合法键盘无错误', () => {
    const state = createFormState(null, 'G1')
    state.editors.welcomeKeyboard = { mode: 'override', value: '{"rows": 1}' }
    assert.ok(collectKeyboardErrors(state.editors).welcomeKeyboard!.includes('rows 必须是数组'))

    state.editors.welcomeKeyboard = { mode: 'override', value: VALID_KEYBOARD }
    assert.deepEqual(collectKeyboardErrors(state.editors), {})
  })
})
