import { message } from '@koishijs/client'
import { defineComponent, h, ref, resolveComponent, watch } from 'vue'
import type { VNode } from 'vue'
import {
  callbackDataContent,
  callbackDataMode,
  emptyKeyboardButton,
  emptyKeyboardDocument,
  emptyKeyboardRow,
  keyboardActionType,
  keyboardButtonKind,
  keyboardDocumentIsEmpty,
  parseKeyboardDocument,
  serializeKeyboardDocument,
  withCallbackData,
  type CallbackDataMode,
  type KeyboardButtonDocument,
  type KeyboardButtonKind,
  type KeyboardDocument,
  type KeyboardRowDocument,
} from '../src/keyboard'

const el = (name: string) => resolveComponent(name)

/** 键盘编辑器：画布是默认视图，源码是同一份数据的文本视图。 */
type EditorView = 'canvas' | 'source'

interface ButtonSelection {
  row: number
  button: number
}

/** 画布一行最多画五个按钮：这不是协议限制，而是画布的行宽上限，避免长行把详情栏撑出横向溢出。 */
const CANVAS_BUTTONS_PER_LINE = 5

const rootStyle = 'display:flex;flex-direction:column;gap:8px;width:100%;min-width:0;max-width:100%;box-sizing:border-box'
const toolbarStyle = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap'
const rowBoxStyle = 'border:1px solid var(--k-color-divider);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:8px;min-width:0;box-sizing:border-box'
/** 画布的一行：按钮等分列宽、可收缩，行宽永远不超过详情栏。 */
const canvasLineStyle = (count: number) => `display:grid;grid-template-columns:repeat(${count},minmax(0,1fr));gap:8px;align-items:start;min-width:0`
const editCardStyle = 'border:1px solid var(--k-color-divider);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:8px;background:var(--k-color-bg-2,transparent);width:100%;min-width:0;max-width:100%;box-sizing:border-box'
const labelStyle = 'display:block;font-size:12px;font-weight:600;color:var(--k-text-dark);margin-bottom:2px'
const gridStyle = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(min(150px,100%),1fr));gap:8px;min-width:0'
const fullGridStyle = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr));gap:8px;min-width:0'
const inlineStyle = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0'
const monoStyle = 'font-family:var(--font-family-code);font-size:12px;line-height:1.5'
const smallLabelStyle = 'font-size:12px;font-weight:600;color:var(--k-text-dark)'
const hintStyle = 'font-size:12px;color:var(--k-text-light)'
const errorStyle = 'font-size:12px;color:var(--k-color-danger)'
const emptyStyle = 'border:1px dashed var(--k-color-divider);border-radius:6px;padding:12px;display:flex;flex-direction:column;gap:4px;color:var(--k-text-light)'

/** 一个带标签的控件：字段较多，统一用「标签在上、控件在下」的紧凑布局。 */
function field(label: string, control: VNode): VNode {
  return h('div', { style: 'min-width:0' }, [h('span', { style: labelStyle }, label), control])
}

function textControl(value: string, onChange: (value: string) => void, extra: Record<string, unknown> = {}): VNode {
  return h(el('el-input'), {
    ...extra,
    modelValue: value,
    'onUpdate:modelValue': (next: string | undefined) => onChange(next ?? ''),
    size: 'small',
  })
}

function textareaControl(value: string, onChange: (value: string) => void, rows = 3, placeholder = ''): VNode {
  return textControl(value, onChange, { type: 'textarea', rows, placeholder, inputStyle: monoStyle })
}

function numberControl(value: number | undefined, onChange: (value: number | undefined) => void): VNode {
  return h(el('el-input-number'), {
    modelValue: value ?? undefined,
    'onUpdate:modelValue': (next: number | null | undefined) => {
      onChange(typeof next === 'number' && Number.isFinite(next) ? next : undefined)
    },
    size: 'small',
    controlsPosition: 'right',
    style: 'width:100%',
  })
}

function optionalSelect(
  value: string | undefined,
  entries: { value: string; label: string }[],
  onChange: (value: string | undefined) => void,
): VNode {
  return h(el('el-select'), {
    modelValue: value ?? '',
    'onUpdate:modelValue': (next: string) => onChange(next === '' ? undefined : next),
    size: 'small',
    style: 'width:100%',
  }, () => entries.map(entry => h(el('el-option'), { key: entry.value, value: entry.value, label: entry.label })))
}

const PERMISSION_TYPE_ENTRIES = [
  { value: '', label: '未填写' },
  { value: '0', label: '0 指定用户' },
  { value: '1', label: '1 管理员' },
  { value: '2', label: '2 所有人' },
  { value: '3', label: '3 指定身份组' },
]

const TRI_STATE_ENTRIES = [
  { value: '', label: '未填写（用默认）' },
  { value: 'true', label: '是' },
  { value: 'false', label: '否' },
]

const BUTTON_KIND_ENTRIES: { value: KeyboardButtonKind; label: string }[] = [
  { value: 'command', label: '指令按钮' },
  { value: 'link', label: '链接按钮' },
  { value: 'callback', label: '回调按钮' },
]

const CALLBACK_MODE_ENTRIES: { value: CallbackDataMode; label: string }[] = [
  { value: 'reply', label: '回复文本' },
  { value: 'command', label: '执行指令' },
  { value: 'raw', label: '原样填写' },
]

function triStateValue(value: boolean | undefined): string | undefined {
  if (value === undefined) return undefined
  return value ? 'true' : 'false'
}

function parseTriState(value: string | undefined): boolean | undefined {
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function buttonCanvasStyle(style: number | undefined, selected: boolean): string {
  // QQ 定义了 0 / 1 / 3 / 4 四档；2 与其它未定义值都按 0 的灰色线框画。
  const palette = style === 1
    ? 'background:transparent;color:var(--k-color-primary,#1677ff);border:1px solid var(--k-color-primary,#1677ff)'
    : style === 3
      ? 'background:var(--k-card-bg,#fff);color:var(--k-color-danger);border:1px solid var(--k-color-danger-fade)'
      : style === 4
        ? 'background:var(--k-color-primary,#1677ff);color:#fff;border:1px solid transparent'
        : 'background:transparent;color:var(--k-text-dark);border:1px solid var(--k-color-divider)'
  const outline = selected ? ';box-shadow:0 0 0 2px var(--k-color-primary,#1677ff)' : ''
  return `${palette};border-radius:6px;padding:7px 12px;cursor:pointer;min-height:34px;display:inline-flex;align-items:center;justify-content:center;font:inherit;width:100%;min-width:0;box-sizing:border-box;overflow:hidden${outline}`
}

function unknownCount(button: KeyboardButtonDocument): number {
  return Object.keys(button.extras).length
    + Object.keys(button.renderData.extras).length
    + Object.keys(button.action.extras).length
    + Object.keys(button.action.permission.extras).length
}

/** 键盘画布 + 源码视图，两边共用同一份数据。 */
export const KeyboardEditor = defineComponent({
  name: 'KeyboardEditor',
  props: {
    /** 当前键盘 JSON 文本；由父组件持有，保存与脏检查都基于它。 */
    modelValue: { type: String, required: true },
    /** 该字段的内置默认键盘，「插入内置默认按钮」从这里取。 */
    defaultKeyboard: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const view = ref<EditorView>('canvas')
    const document = ref<KeyboardDocument>(emptyKeyboardDocument())
    const sourceText = ref('')
    const sourceError = ref('')
    const selected = ref<ButtonSelection | null>(null)
    let lastPushed = props.modelValue

    function selectionOf(rowIndex: number, buttonIndex: number): boolean {
      return selected.value?.row === rowIndex && selected.value?.button === buttonIndex
    }

    function normalizeSelection() {
      if (!selected.value) return
      const row = document.value.rows[selected.value.row]
      if (!row || !row.buttons[selected.value.button]) selected.value = null
    }

    function loadText(value: string) {
      const result = parseKeyboardDocument(value)
      if (result.ok) {
        document.value = result.document
        sourceText.value = serializeKeyboardDocument(result.document)
        sourceError.value = ''
        view.value = 'canvas'
        normalizeSelection()
      } else {
        // 解析失败：保留原文、停在源码视图，画布维持上一份可编辑状态。
        sourceText.value = value
        sourceError.value = result.error
        view.value = 'source'
      }
    }

    lastPushed = props.modelValue
    loadText(props.modelValue)

    watch(() => props.modelValue, (value) => {
      if (value === lastPushed) return
      loadText(value)
    })

    /** 画布改动：序列化后推给父组件，并让源码视图同步成同一份文本。 */
    function push() {
      const text = serializeKeyboardDocument(document.value)
      lastPushed = text
      sourceText.value = text
      sourceError.value = ''
      emit('update:modelValue', text)
    }

    /** 源码改动：合法时同步进画布，非法时只保留原文和错误。 */
    function onSourceInput(value: string) {
      sourceText.value = value
      lastPushed = value
      emit('update:modelValue', value)
      const result = parseKeyboardDocument(value)
      if (result.ok) {
        document.value = result.document
        sourceError.value = ''
        normalizeSelection()
      } else {
        sourceError.value = result.error
      }
    }

    function switchView(next: EditorView) {
      if (next === view.value) return
      if (next === 'canvas' && sourceError.value) {
        message.warning('源码里的 JSON 有错误，先修正后再切回画布。')
        return
      }
      if (next === 'canvas') {
        // 切回画布时把源码的合法 JSON 规范化，确保两边后续以同一份文本为准。
        push()
      } else {
        sourceText.value = serializeKeyboardDocument(document.value)
        sourceError.value = ''
      }
      view.value = next
    }

    function insertDefault() {
      if (!props.defaultKeyboard) return
      if (view.value === 'source' && sourceError.value) {
        message.warning('源码里的 JSON 有错误，先修正后再插入默认按钮。')
        return
      }
      const result = parseKeyboardDocument(props.defaultKeyboard)
      if (!result.ok) return
      const firstRow = document.value.rows.length
      document.value.rows.push(...result.document.rows)
      const firstButtonRow = result.document.rows.findIndex(row => row.buttons.length > 0)
      selected.value = firstButtonRow >= 0 ? { row: firstRow + firstButtonRow, button: 0 } : null
      push()
    }

    function addRow() {
      document.value.rows.push(emptyKeyboardRow())
      selected.value = null
      push()
    }

    function removeRow(index: number) {
      const rows = document.value.rows
      if (index < 0 || index >= rows.length) return
      rows.splice(index, 1)
      if (selected.value?.row === index) selected.value = null
      else if (selected.value && selected.value.row > index) selected.value.row -= 1
      normalizeSelection()
      push()
    }

    function moveRow(index: number, delta: number) {
      const rows = document.value.rows
      const target = index + delta
      if (target < 0 || target >= rows.length) return
      const [row] = rows.splice(index, 1)
      rows.splice(target, 0, row)
      if (selected.value) {
        if (selected.value.row === index) selected.value.row = target
        else if (index < selected.value.row && target >= selected.value.row) selected.value.row -= 1
        else if (index > selected.value.row && target <= selected.value.row) selected.value.row += 1
      }
      normalizeSelection()
      push()
    }

    function addButton(row: KeyboardRowDocument, rowIndex: number) {
      row.buttons.push(emptyKeyboardButton())
      selected.value = { row: rowIndex, button: row.buttons.length - 1 }
      push()
    }

    function removeButton(rowIndex: number, buttonIndex: number) {
      const row = document.value.rows[rowIndex]
      if (!row || buttonIndex < 0 || buttonIndex >= row.buttons.length) return
      row.buttons.splice(buttonIndex, 1)
      if (selected.value?.row === rowIndex) {
        if (selected.value.button === buttonIndex) selected.value = null
        else if (selected.value.button > buttonIndex) selected.value.button -= 1
      }
      normalizeSelection()
      push()
    }

    function moveButton(rowIndex: number, buttonIndex: number, delta: number) {
      const row = document.value.rows[rowIndex]
      if (!row) return
      const target = buttonIndex + delta
      if (target < 0 || target >= row.buttons.length) return
      const [button] = row.buttons.splice(buttonIndex, 1)
      row.buttons.splice(target, 0, button)
      if (selected.value?.row === rowIndex) {
        if (selected.value.button === buttonIndex) selected.value.button = target
        else if (buttonIndex < selected.value.button && target >= selected.value.button) selected.value.button -= 1
        else if (buttonIndex > selected.value.button && target <= selected.value.button) selected.value.button += 1
      }
      normalizeSelection()
      push()
    }

    const viewButton = (target: EditorView, text: string) =>
      h(el('el-button'), {
        size: 'small',
        type: view.value === target ? 'primary' : 'default',
        onClick: () => switchView(target),
      }, () => text)

    const iconButton = (text: string, title: string, disabled: boolean, onClick: () => void) =>
      h(el('el-button'), { size: 'small', text: true, title, disabled, onClick }, () => text)

    function renderEditCard(button: KeyboardButtonDocument, rowIndex: number, buttonIndex: number): VNode {
      const kind = keyboardButtonKind(button.action.type)
      const callbackMode = callbackDataMode(button.action.data ?? '')
      const callbackContent = callbackDataContent(button.action.data ?? '', callbackMode)
      const permissionType = button.action.permission.type
      const kept = unknownCount(button)

      const dataControl = kind === 'callback'
        ? h('div', [
          field('回调数据', h(el('el-radio-group'), {
            modelValue: callbackMode,
            size: 'small',
            'onUpdate:modelValue': (value: CallbackDataMode) => {
              button.action.data = withCallbackData(value, callbackContent)
              push()
            },
          }, () => CALLBACK_MODE_ENTRIES.map(entry => h(el('el-radio-button'), { key: entry.value, value: entry.value }, () => entry.label)))),
          field(callbackMode === 'command' ? 'action.data（指令）' : 'action.data（内容）',
            callbackMode === 'command'
              ? textControl(callbackContent, value => { button.action.data = withCallbackData(callbackMode, value); push() }, { placeholder: '/帮助菜单' })
              : textareaControl(callbackContent, value => { button.action.data = withCallbackData(callbackMode, value); push() }, 3, '支持 {userId}、{guildId} 等按钮变量')),
        ])
        : field(kind === 'link' ? 'action.data（链接）' : 'action.data（指令）',
          textareaControl(button.action.data ?? '', value => { button.action.data = value; push() }, 2,
            kind === 'link' ? 'https://example.com' : '/帮助菜单'))

      const permissionLists = permissionType === 0 || permissionType === 3
        || Boolean(button.action.permission.specifyUserIds)
        || Boolean(button.action.permission.specifyRoleIds)
        ? h('div', { style: fullGridStyle }, [
          field('action.permission.specify_user_ids（每行一个）', textareaControl(
            button.action.permission.specifyUserIds,
            value => { button.action.permission.specifyUserIds = value; push() },
          )),
          field('action.permission.specify_role_ids（每行一个）', textareaControl(
            button.action.permission.specifyRoleIds,
            value => { button.action.permission.specifyRoleIds = value; push() },
          )),
        ])
        : null

      const advanced = h('details', { style: 'margin-top:4px' }, [
        h('summary', { style: `${smallLabelStyle};cursor:pointer` }, kept ? `高级（保留 ${kept} 个未暴露字段）` : '高级'),
        h('div', { style: `${gridStyle};margin-top:8px` }, [
          field('action.anchor', numberControl(button.action.anchor, value => { button.action.anchor = value; push() })),
          field('action.click_limit', numberControl(button.action.clickLimit, value => { button.action.clickLimit = value; push() })),
          field('action.at_bot_show_channel_list', optionalSelect(
            triStateValue(button.action.atBotShowChannelList),
            TRI_STATE_ENTRIES,
            value => { button.action.atBotShowChannelList = parseTriState(value); push() },
          )),
          field('action.unsupport_tips', textControl(button.action.unsupportTips, value => { button.action.unsupportTips = value; push() })),
        ]),
        kept ? h('div', { style: `${hintStyle};margin-top:6px` }, '表单没暴露的键会在保存与往返中原样保留。') : null,
      ])

      return h('div', { style: editCardStyle }, [
        h('div', { style: inlineStyle }, [
          h('span', { style: smallLabelStyle }, `按钮 ${rowIndex + 1}-${buttonIndex + 1}`),
          h('div', { style: 'flex:1' }),
          iconButton('↑', '上移按钮', buttonIndex === 0, () => moveButton(rowIndex, buttonIndex, -1)),
          iconButton('↓', '下移按钮', buttonIndex === (document.value.rows[rowIndex]?.buttons.length ?? 1) - 1, () => moveButton(rowIndex, buttonIndex, 1)),
          iconButton('删除', '删除按钮', false, () => removeButton(rowIndex, buttonIndex)),
        ]),
        h('div', { style: gridStyle }, [
          field('id（留空用 行-列）', textControl(button.id, value => { button.id = value; push() }, { placeholder: `${rowIndex}-${buttonIndex}` })),
          field('render_data.label', textControl(button.renderData.label ?? '', value => { button.renderData.label = value; push() })),
          field('render_data.visited_label', textControl(button.renderData.visitedLabel, value => { button.renderData.visitedLabel = value; push() })),
          field('render_data.style', numberControl(button.renderData.style, value => { button.renderData.style = value; push() })),
        ]),
        field('按钮类型', h(el('el-radio-group'), {
          modelValue: kind,
          size: 'small',
          'onUpdate:modelValue': (value: KeyboardButtonKind) => {
            button.action.type = keyboardActionType(value)
            push()
          },
        }, () => BUTTON_KIND_ENTRIES.map(entry => h(el('el-radio-button'), { key: entry.value, value: entry.value }, () => entry.label)))),
        h('div', { style: gridStyle }, [
          field('action.permission.type', optionalSelect(
            permissionType === undefined ? undefined : String(permissionType),
            PERMISSION_TYPE_ENTRIES,
            value => { button.action.permission.type = value === undefined ? undefined : Number(value); push() },
          )),
          field('action.enter', optionalSelect(
            triStateValue(button.action.enter),
            TRI_STATE_ENTRIES,
            value => { button.action.enter = parseTriState(value); push() },
          )),
          field('action.reply', optionalSelect(
            triStateValue(button.action.reply),
            TRI_STATE_ENTRIES,
            value => { button.action.reply = parseTriState(value); push() },
          )),
        ]),
        permissionLists,
        dataControl,
        advanced,
      ])
    }

    function renderCanvasButton(button: KeyboardButtonDocument, rowIndex: number, buttonIndex: number): VNode {
      const isSelected = selectionOf(rowIndex, buttonIndex)
      const label = (button.renderData.label ?? '').trim() || '未命名按钮'
      const kindLabel = BUTTON_KIND_ENTRIES.find(entry => entry.value === keyboardButtonKind(button.action.type))?.label ?? '按钮'
      return h('button', {
        key: `${rowIndex}-${buttonIndex}`,
        type: 'button',
        title: `${label} · ${kindLabel}`,
        style: buttonCanvasStyle(button.renderData.style, isSelected),
        onClick: () => { selected.value = { row: rowIndex, button: buttonIndex } },
      }, [
        h('span', { style: 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, label),
      ])
    }

    function renderRow(row: KeyboardRowDocument, rowIndex: number): VNode {
      const selectedButton = selected.value?.row === rowIndex ? selected.value.button : -1
      const children: VNode[] = [
        h('div', { style: inlineStyle }, [
          h('span', { style: smallLabelStyle }, `第 ${rowIndex + 1} 行`),
          h('span', { style: hintStyle }, row.buttons.length ? `${row.buttons.length} 个按钮` : '空行'),
          h('div', { style: 'flex:1' }),
          iconButton('↑', '上移整行', rowIndex === 0, () => moveRow(rowIndex, -1)),
          iconButton('↓', '下移整行', rowIndex === document.value.rows.length - 1, () => moveRow(rowIndex, 1)),
          iconButton('删除行', '删除整行', false, () => removeRow(rowIndex)),
          h(el('el-button'), { size: 'small', type: 'primary', text: true, onClick: () => addButton(row, rowIndex) }, () => '添加按钮'),
        ]),
      ]
      if (row.buttons.length) {
        // 一行的按钮按 CANVAS_BUTTONS_PER_LINE 分块渲染；编辑卡就地展开在所选按钮所在那块的下面。
        for (let start = 0; start < row.buttons.length; start += CANVAS_BUTTONS_PER_LINE) {
          const line = row.buttons.slice(start, start + CANVAS_BUTTONS_PER_LINE)
          children.push(h('div', { style: canvasLineStyle(line.length), key: `line-${start}` },
            line.map((button, offset) => renderCanvasButton(button, rowIndex, start + offset))))
          if (selectedButton >= start && selectedButton < start + line.length) {
            children.push(renderEditCard(row.buttons[selectedButton], rowIndex, selectedButton))
          }
        }
      } else {
        children.push(h('div', { style: hintStyle }, '这一行还没有按钮，发送时会忽略空行。点击右上角「添加按钮」开始。'))
      }
      return h('div', { style: rowBoxStyle, key: rowIndex }, children)
    }

    function renderCanvas(): VNode[] {
      const content: VNode[] = []
      if (!document.value.rows.length) {
        content.push(h('div', { style: emptyStyle }, [
          h('strong', '当前键盘不显示按钮'),
          h('span', {}, '空字符串、{ "rows": [] } 与字段的「置空」态等价。'),
        ]))
      } else {
        document.value.rows.forEach((row, rowIndex) => content.push(renderRow(row, rowIndex)))
      }
      if (document.value.rows.length && keyboardDocumentIsEmpty(document.value)) {
        content.push(h('div', { style: hintStyle }, '这些行里还没有按钮，保存后与空键盘等价。'))
      }
      content.push(h('div', { style: inlineStyle }, [
        h(el('el-button'), { size: 'small', onClick: addRow }, () => '添加行'),
      ]))
      return content
    }

    function renderSource(): VNode[] {
      return [
        textareaControl(sourceText.value, onSourceInput, 18, '{ "rows": [] }'),
        sourceError.value
          ? h('div', { style: errorStyle }, sourceError.value)
          : h('div', { style: hintStyle }, '合法 JSON 会实时同步到画布；点「画布」查看按钮布局。'),
      ]
    }

    return () => h('div', { style: rootStyle }, [
      h('div', { style: toolbarStyle }, [
        viewButton('canvas', '画布'),
        viewButton('source', '源码'),
        h('div', { style: 'flex:1' }),
        h(el('el-button'), {
          size: 'small',
          disabled: !props.defaultKeyboard,
          onClick: insertDefault,
        }, () => '插入内置默认按钮'),
      ]),
      view.value === 'canvas' ? renderCanvas() : renderSource(),
    ])
  },
})
