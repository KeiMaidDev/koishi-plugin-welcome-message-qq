import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  collectGroupChanges,
  collectGroupInput,
  collectKeyboardErrors,
  collectSaveInput,
  createFormState,
  hasFormChanges,
  hasSwitchChanges,
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

describe('collectGroupChanges（相对来源行的差异收集）', () => {
  it('与来源行一致时返回 null：null 值、空串覆盖、format 取值都要逐项对上', () => {
    const row = makeRow({
      welcomeMessage: '你好',
      leaveKeyboard: '',
      messageFormat: 'markdown',
    })
    const state = createFormState(row, 'G1')
    assert.equal(collectGroupChanges(state, row), null)

    // 新建草稿（row = null）在全部继承、开关默认时也不算内容改动
    const draft = createFormState(null, 'G-new')
    assert.equal(collectGroupChanges(draft, null), null)
  })

  it('只带改动过的字段：未动的覆盖保留在数据库里不提交', () => {
    const row = makeRow({ welcomeMessage: '原文案', closeResponseMessage: '已有回执' })
    const state = createFormState(row, 'G1')
    state.editors.leaveMessage = { mode: 'override', value: '新离群文案' }

    assert.deepEqual(collectGroupChanges(state, row), {
      id: 'G1',
      enabled: true,
      leaveMessage: '新离群文案',
    })
  })

  it('三态都参与差异：改成继承 = 提交 null 清掉覆盖，改文案 = 提交新值', () => {
    const row = makeRow({ welcomeMessage: '原文案', messageFormat: 'text' })
    const state = createFormState(row, 'G1')
    state.editors.welcomeMessage = { mode: 'inherit', value: '' }

    assert.deepEqual(collectGroupChanges(state, row), {
      id: 'G1',
      enabled: true,
      welcomeMessage: null,
    })

    state.editors.welcomeMessage = { mode: 'override', value: '新文案' }
    state.formats.messageFormat = 'markdown'
    assert.deepEqual(collectGroupChanges(state, row), {
      id: 'G1',
      enabled: true,
      welcomeMessage: '新文案',
      messageFormat: 'markdown',
    })
  })

  it('哨兵行差异成对携带全局开关，enabled 恒为 true', () => {
    const row = makeRow({ id: '*', sentinel: true, welcomeMessage: '默认欢迎' })
    const state = createFormState(row, '*')
    state.editors.welcomeMessage = { mode: 'override', value: '新默认欢迎' }

    assert.deepEqual(collectGroupChanges(state, row), {
      id: '*',
      enabled: true,
      welcomeEnabled: true,
      leaveEnabled: true,
      welcomeMessage: '新默认欢迎',
    })
  })

  it('开关变化不算内容差异：collectGroupChanges 返回 null 但 hasSwitchChanges 为 true', () => {
    const row = makeRow()
    const state = createFormState(row, 'G1')
    state.editing.enabled = false

    assert.equal(collectGroupChanges(state, row), null)
    assert.equal(hasSwitchChanges(state, row), true)
  })

  it('草稿（row = null）任何非继承取值都算改动，继承仍不算', () => {
    const state = createFormState(null, 'G-new')
    state.editors.welcomeMessage = { mode: 'override', value: '' }

    assert.deepEqual(collectGroupChanges(state, null), {
      id: 'G-new',
      enabled: true,
      welcomeMessage: '',
    })
  })
})

describe('collectSaveInput / hasFormChanges（保存输入与脏检查）', () => {
  it('只有内容改动时：内容字段按差异带，开关总是提交', () => {
    const row = makeRow({ enabled: false, welcomeMessage: '原' })
    const state = createFormState(row, 'G1')
    state.editors.leaveMessage = { mode: 'override', value: '新' }

    assert.deepEqual(collectSaveInput(state, row), {
      id: 'G1',
      enabled: false,
      leaveMessage: '新',
    })
    assert.equal(hasFormChanges(state, row), true)
  })

  it('只有开关变化时：只提交开关，不带任何内容字段', () => {
    const row = makeRow({ welcomeMessage: '已有覆盖' })
    const state = createFormState(row, 'G1')
    state.editing.enabled = false

    assert.deepEqual(collectSaveInput(state, row), { id: 'G1', enabled: false })
  })

  it('哨兵行只动全局开关：enabled 恒为 true，两个全局开关成对提交', () => {
    const row = makeRow({ id: '*', sentinel: true })
    const state = createFormState(row, '*')
    state.editing.leaveEnabled = false

    assert.deepEqual(collectSaveInput(state, row), {
      id: '*',
      enabled: true,
      welcomeEnabled: true,
      leaveEnabled: false,
    })
  })

  it('完全一致时返回 null：hasFormChanges 为 false，hasSwitchChanges 为 false', () => {
    const row = makeRow({ welcomeMessage: 'x', messageFormat: 'markdown' })
    const state = createFormState(row, 'G1')

    assert.equal(collectSaveInput(state, row), null)
    assert.equal(hasFormChanges(state, row), false)
    assert.equal(hasSwitchChanges(state, row), false)
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
