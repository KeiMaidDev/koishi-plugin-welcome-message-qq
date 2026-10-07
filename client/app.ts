import { message, messageBox } from '@koishijs/client'
import { defineComponent, h, nextTick, onMounted, reactive, ref, resolveComponent } from 'vue'
import {
  collectKeyboardErrors,
  collectSaveInput,
  createFormState,
  FIELD_GROUPS,
  FIELD_KEYS,
  FORM_CHANGES_MESSAGE,
  hasFormChanges,
  TEXT_FIELDS,
  overrideChips,
  resolveInheritedValue,
  type DetailFieldMeta,
  type EditorState,
  type FieldEditor,
  type FormatMode,
  type TextFieldMeta,
} from '../src/console-form'
import * as api from './api'

/** 内容字段的全空基线：保存后行不在当前列表页时，用它补齐合成来源行的全部字段键。 */
const rowDefaults = Object.fromEntries(FIELD_KEYS.map(key => [key, null]))

const el = (name: string) => resolveComponent(name)

/** 控制台页名：侧栏入口与页内标题共用同一字面量。 */
export const PANEL_NAME = '入群欢迎管理'

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function formatTime(time: number | null): string {
  if (!time) return '—'
  return new Date(time).toLocaleString('zh-CN', { hour12: false })
}

export default defineComponent({
  name: 'WelcomeMessageGroupPanel',
  setup() {
    const list = ref<api.ConsoleListResult | null>(null)
    const loading = ref(false)
    const saving = ref(false)
    const migrating = ref(false)
    const query = reactive({ search: '', page: 1, pageSize: 20 })
    const searchInput = ref('')
    const newId = ref('')
    const selectedId = ref<string | null>(null)
    const editing = ref<EditorState | null>(null)
    /** 详情数据来源的数据库行；null 表示当前是未入库的新建草稿。 */
    const editingRow = ref<api.ConsoleGroupRow | null>(null)
    const editors = reactive<Record<string, FieldEditor>>({})
    const formats = reactive<Record<string, FormatMode>>({})
    const errors = reactive<Record<string, string>>({})
    /** 四个折叠分组默认全部展开。 */
    const expandedGroups = ref<string[]>(FIELD_GROUPS.map(group => group.title))
    /**
     * 全局默认行缓存，作群行继承 placeholder 的取值来源。
     * 列表是分页 + 搜索的，哨兵行可能不在当前页，这里单独拉取并缓存。
     */
    let globalRow: api.ConsoleGroupRow | null = null

    /**
     * 拉取全局默认行作群行继承 placeholder 的取值来源，并缓存。
     * 列表是分页 + 搜索的，哨兵行不一定在当前页；用 `*` 作搜索词可以
     * 精确命中主键为 `*` 的哨兵行，pageSize:1 保证一次只取这一行。
     */
    async function fetchGlobalRow(): Promise<api.ConsoleGroupRow | null> {
      try {
        const result = await api.fetchGroups({ search: '*', page: 1, pageSize: 1 })
        globalRow = result.rows.find(row => row.sentinel) ?? null
      } catch {
        // 拉取失败不影响编辑主流程，placeholder 用缓存或内置默认值兜底
      }
      return globalRow
    }

    async function refresh() {
      loading.value = true
      try {
        list.value = await api.fetchGroups({ ...query })
        // 保存/刷新后同步全局默认行缓存（列表第一页通常已带哨兵行，避免多余请求）
        globalRow = list.value?.rows.find(row => row.sentinel) ?? globalRow
      } catch (error) {
        message.error('加载群覆盖列表失败：' + errorText(error))
        list.value = null
      } finally {
        loading.value = false
      }
    }

    function currentState() {
      const current = editing.value
      return current ? { editing: current, editors, formats } : null
    }

    function detailDirty(): boolean {
      const state = currentState()
      return !!state && hasFormChanges(state, editingRow.value)
    }

    function resetForm(row: api.ConsoleGroupRow | null, id: string) {
      const state = createFormState(row, id)
      editing.value = state.editing
      editingRow.value = row
      for (const key of Object.keys(editors)) delete editors[key]
      Object.assign(editors, state.editors)
      for (const key of Object.keys(formats)) delete formats[key]
      Object.assign(formats, state.formats)
      for (const field of TEXT_FIELDS) delete errors[field.key]
    }

    function loadDetail(row: api.ConsoleGroupRow) {
      selectedId.value = row.id
      resetForm(row, row.id)
    }

    /** 列表刷新后按 id 恢复选中；行已不存在（被删除）时清空详情。 */
    function selectAfterReload(id: string) {
      const row = list.value?.rows.find(item => item.id === id)
      if (row) loadDetail(row)
      else clearDetail()
    }

    function clearDetail() {
      selectedId.value = null
      editing.value = null
      editingRow.value = null
    }

    /**
     * 详情有未保存改动时，切换前弹确认框。
     * 「放弃改动」不写库，原数据仍在，之后随时可以重新点开查看——所以放弃是可撤销的。
     */
    async function confirmLeave(): Promise<boolean> {
      if (!detailDirty()) return true
      try {
        await messageBox.confirm(FORM_CHANGES_MESSAGE, '未保存的改动', {
          type: 'warning',
          confirmButtonText: '放弃改动',
          cancelButtonText: '留在详情',
        })
      } catch {
        return false
      }
      return true
    }

    async function switchTo(row: api.ConsoleGroupRow) {
      if (row.id === selectedId.value) return
      if (!(await confirmLeave())) return
      loadDetail(row)
    }

    async function openCreate() {
      const id = newId.value.trim()
      if (!id) {
        message.warning('请先填写群 OpenID。')
        return
      }
      if (list.value?.rows.some(row => row.id === id)) {
        message.warning('数据库里已有这个群的记录，请直接编辑它。')
        return
      }
      if (!(await confirmLeave())) return
      selectedId.value = id
      resetForm(null, id)
    }

    /** 实时校验键盘字段并把错误写进 errors；返回是否全部合法。 */
    function validateKeyboardFields(): boolean {
      const found = collectKeyboardErrors(editors)
      for (const field of TEXT_FIELDS) {
        if (!field.keyboard) continue
        if (found[field.key]) errors[field.key] = found[field.key]
        else delete errors[field.key]
      }
      return !Object.keys(found).length
    }

    /** 保存被键盘校验拦下时，展开所在分组、滚动并聚焦到第一个错误字段。 */
    async function focusFirstError() {
      const field = TEXT_FIELDS.find(item => item.keyboard && errors[item.key])
      if (!field) return
      // 错误字段可能藏在折叠分组里：先把对应分组展开再定位
      const group = FIELD_GROUPS.find(item => item.fields.some(item2 => 'key' in item2 && item2.key === field.key))
      if (group && !expandedGroups.value.includes(group.title)) {
        expandedGroups.value = [...expandedGroups.value, group.title]
      }
      await nextTick()
      const anchor = document.getElementById(`wm-field-${field.key}`)
      anchor?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      anchor?.querySelector<HTMLTextAreaElement>('textarea')?.focus()
    }

    async function save() {
      const state = currentState()
      if (!state) return
      if (!validateKeyboardFields()) {
        message.error('键盘 JSON 有格式错误，请修正后再保存。')
        void focusFirstError()
        return
      }
      // 只提交与来源行有差异的字段；开关总是提交，该群其它已有覆盖不受影响
      const input = collectSaveInput(state, editingRow.value)
      if (!input) {
        message.info('详情没有需要保存的改动。')
        return
      }
      saving.value = true
      try {
        await api.updateGroup(input)
        message.success(state.editing.sentinel ? '全局默认已保存' : '群覆盖已保存')
        // 哨兵行是群行 placeholder 的继承来源，保存后立即刷新缓存
        if (state.editing.sentinel) void fetchGlobalRow()
        await refresh()
        const row = list.value?.rows.find(item => item.id === state.editing.id)
        if (row) {
          loadDetail(row)
        } else {
          // 该行不在当前页/搜索结果内：按提交值合成来源行（字段键齐全，脏检查才为 false），
          // 让详情保持打开、视为干净基线
          const saved = state.editing.sentinel
            ? { welcomeEnabled: state.editing.welcomeEnabled, leaveEnabled: state.editing.leaveEnabled }
            : { enabled: state.editing.enabled }
          editingRow.value = {
            ...rowDefaults,
            ...input,
            ...saved,
            id: state.editing.id,
            sentinel: state.editing.sentinel,
            updatedAt: Date.now(),
          } as api.ConsoleGroupRow
        }
      } catch (error) {
        message.error('保存失败：' + errorText(error))
      } finally {
        saving.value = false
      }
    }

    async function toggleEnabled(row: api.ConsoleGroupRow, enabled: boolean) {
      try {
        await api.updateGroup({ id: row.id, enabled })
        message.success(enabled ? '已开启本群通知' : '已关闭本群通知')
      } catch (error) {
        message.error('保存失败：' + errorText(error))
      }
      await refresh()
      // 详情正显示这一行且没有未保存改动时才同步详情，避免覆盖用户正在编辑的内容
      if (selectedId.value === row.id && !detailDirty()) selectAfterReload(row.id)
    }

    async function removeRow() {
      const row = editingRow.value
      if (!row || row.sentinel) return
      try {
        await messageBox.confirm(
          `确认删除群 ${row.id} 的覆盖记录吗？删除后该群回到继承全局默认的状态。`,
          '删除群覆盖',
          { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
        )
      } catch {
        return
      }
      try {
        await api.deleteGroup(row.id)
        message.success('已删除群覆盖')
        if (selectedId.value === row.id) clearDetail()
        await refresh()
      } catch (error) {
        message.error('删除失败：' + errorText(error))
      }
    }

    async function migrate() {
      migrating.value = true
      try {
        const preview = await api.migrateGroups({ dryRun: true })
        if (!preview.overwritten && !preview.written) {
          message.info('旧配置里没有可迁移的群覆盖。')
          return
        }
        try {
          await messageBox.confirm(
            `本次迁移将覆盖 ${preview.overwritten} 行、新建 ${preview.written} 行，且不会修改配置文件。确认迁移吗？`,
            '迁移旧配置',
            { type: 'warning', confirmButtonText: '迁移', cancelButtonText: '取消' },
          )
        } catch {
          return
        }
        const result = await api.migrateGroups()
        message.success(`迁移完成：覆盖 ${result.overwritten} 行，新建 ${result.written} 行。`)
        await refresh()
        // 迁移会覆盖包括当前行在内的存量数据；详情脏时保留用户改动，干净时同步成新值
        if (selectedId.value && !detailDirty()) selectAfterReload(selectedId.value)
      } catch (error) {
        message.error('迁移旧配置失败：' + errorText(error))
      } finally {
        migrating.value = false
      }
    }

    function applySearch() {
      query.search = searchInput.value.trim()
      query.page = 1
      void refresh()
    }

    onMounted(() => {
      void refresh()
      void fetchGlobalRow()
    })

    const label = (text: string, minWidth?: string) =>
      h('span', { style: `font-size:13px;font-weight:600;min-width:${minWidth ?? '130px'}` }, text)

    /**
     * 继承模式下输入框的 placeholder，显示真正生效的值（与运行时继承链一致）：
     * 群行 = 全局默认行的值，全局也没设时兜底内置默认值；哨兵行 = 内置默认值。
     */
    const inheritedPlaceholder = (field: TextFieldMeta): string | undefined =>
      editing.value?.sentinel
        ? resolveInheritedValue(null, field.key, true)
        : resolveInheritedValue(globalRow, field.key, false)

    const renderTextField = (field: TextFieldMeta) => {
      const editor = editors[field.key]
      return h('div', { key: field.key, id: `wm-field-${field.key}`, style: 'margin-bottom:10px' }, [
        h('div', { style: 'display:flex;align-items:center;gap:8px' }, [
          label(field.label, '90px'),
          h(el('el-select'), {
            modelValue: editor.mode,
            'onUpdate:modelValue': (value: 'inherit' | 'override') => {
              editor.mode = value
              if (field.keyboard) validateKeyboardFields()
            },
            size: 'small',
            style: 'width:110px',
          }, () => [
            h(el('el-option'), { value: 'inherit', label: editing.value?.sentinel ? '内置默认' : '继承全局' }),
            h(el('el-option'), { value: 'override', label: '覆盖' }),
          ]),
          field.hint ? h('span', { style: 'font-size:12px;color:#909399' }, field.hint) : null,
        ]),
        editor.mode === 'override'
          ? h(el('el-input'), {
              modelValue: editor.value,
              'onUpdate:modelValue': (value: string) => {
                editor.value = value
                if (field.keyboard) validateKeyboardFields()
              },
              type: 'textarea',
              rows: field.rows,
              placeholder: field.keyboard ? '{ "rows": [] }' : '',
            })
          // 继承模式：禁用的空输入框，用继承来源值作 placeholder，让用户看得到继承源头
          : h(el('el-input'), {
              modelValue: '',
              type: 'textarea',
              rows: field.rows,
              disabled: true,
              placeholder: inheritedPlaceholder(field),
            }),
        errors[field.key]
          ? h('div', { style: 'font-size:12px;color:#f56c6c;margin-top:4px' }, errors[field.key])
          : null,
      ])
    }

    const renderFormatField = (field: { key: string; label: string }) => h('div', {
      key: field.key,
      style: 'display:flex;align-items:center;gap:8px;margin-bottom:10px',
    }, [
      label(field.label, '90px'),
      h(el('el-select'), {
        modelValue: formats[field.key],
        'onUpdate:modelValue': (value: FormatMode) => { formats[field.key] = value },
        size: 'small',
        style: 'width:140px',
      }, () => [
        h(el('el-option'), { value: 'inherit', label: editing.value?.sentinel ? '内置默认' : '继承全局' }),
        h(el('el-option'), { value: 'text', label: '普通消息' }),
        h(el('el-option'), { value: 'markdown', label: 'Markdown' }),
      ]),
    ])

    const renderSwitch = (text: string, modelValue: boolean, onChange: (value: boolean) => void) =>
      h('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:4px' }, [
        h('span', { style: 'font-size:13px' }, text),
        h(el('el-switch'), { modelValue, 'onUpdate:modelValue': onChange }),
      ])

    /** 按字段元数据渲染单个字段行：开关 / 格式下拉 / 三态文本。 */
    const renderDetailField = (field: DetailFieldMeta) => {
      if (field.kind === 'switch') {
        return renderSwitch(field.label, editing.value?.[field.key] ?? true, value => {
          if (editing.value) editing.value[field.key] = value
        })
      }
      if (field.kind === 'format') return renderFormatField(field)
      return renderTextField(field)
    }

    const renderDetail = () => {
      const current = editing.value
      if (!current) return null
      const dirty = detailDirty()
      return h('div', { style: 'border:1px solid #ebeef5;border-radius:4px;padding:14px;background:#fff' }, [
        h('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap' }, [
          h('span', { style: 'font-size:14px;font-weight:600' }, current.sentinel ? '全局默认' : '群覆盖详情'),
          h('code', { style: 'font-size:13px' }, current.sentinel ? '全局默认行 *' : current.id),
          editingRow.value ? null : h(el('el-tag'), { type: 'warning', size: 'small' }, () => '未保存草稿'),
          dirty ? h(el('el-tag'), { size: 'small' }, () => '有未保存改动') : null,
        ]),
        // 四个可折叠分组：通知开关 / 入群 / 离群 / 开关回执，默认全部展开
        h(el('el-collapse'), {
          modelValue: expandedGroups.value,
          'onUpdate:modelValue': (value: string[]) => { expandedGroups.value = value },
        }, () => FIELD_GROUPS.map(group => h(el('el-collapse-item'), {
          key: group.title,
          title: group.title,
          name: group.title,
        }, () => {
          // 群行只有一个总开关：开关分组显示总开关，哨兵行显示全局入群 / 离群开关
          if (group.kind === 'switches' && !current.sentinel) {
            return [renderSwitch('本群通知开关', current.enabled, value => { current.enabled = value })]
          }
          return group.fields.map(renderDetailField)
        }))),
        h('div', { style: 'border-top:1px solid #ebeef5;margin:10px 0' }),
        h('div', { style: 'display:flex;align-items:center;gap:8px' }, [
          editingRow.value && !current.sentinel
            ? h(el('el-button'), {
                size: 'small',
                type: 'danger',
                text: true,
                disabled: saving.value,
                onClick: () => { void removeRow() },
              }, () => '删除这条群覆盖')
            : null,
          h('div', { style: 'flex:1' }),
          h('span', { style: 'font-size:12px;color:#909399' }, dirty ? '改动将在点击保存后写入数据库。' : '与列表数据一致，暂无需要保存的改动。'),
          h(el('el-button'), {
            type: 'primary',
            loading: saving.value,
            disabled: !dirty,
            onClick: () => { void save() },
          }, () => '保存'),
        ]),
      ])
    }

    const renderListItem = (row: api.ConsoleGroupRow) => {
      const selected = row.id === selectedId.value
      return h('div', {
        key: row.id,
        style: `display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #ebeef5;cursor:pointer;background:${selected ? '#ecf5ff' : 'transparent'}`,
        onClick: () => { void switchTo(row) },
      }, [
        h('div', { style: 'flex:1;min-width:0' }, [
          h('div', { style: 'display:flex;align-items:center;gap:6px' }, [
            h('code', { style: 'font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, row.id),
            row.sentinel ? h(el('el-tag'), { type: 'warning', size: 'small' }, () => '全局默认') : null,
          ]),
          h('div', {
            style: 'font-size:12px;color:#909399;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap',
          }, row.updatedAt ? `更新于 ${formatTime(row.updatedAt)}` : undefined),
          // 覆盖字段 chips：无覆盖时显示继承提示（内置默认 / 全部继承全局）
          h('div', { style: 'display:flex;flex-wrap:wrap;gap:4px;margin-top:4px' },
            overrideChips(row).map(chip => h(el('el-tag'), {
              key: chip.fieldKey || chip.text,
              size: 'small',
              type: 'info',
              effect: 'plain',
            }, () => chip.text))),
        ]),
        row.sentinel ? null : h(el('el-switch'), {
          modelValue: row.enabled,
          'onUpdate:modelValue': (value: boolean) => { void toggleEnabled(row, value) },
          onClick: (event: Event) => event.stopPropagation(),
        }),
      ])
    }

    const renderList = () => {
      const rows = list.value?.rows ?? []
      const total = list.value?.total ?? 0
      return h('div', { style: 'width:360px;flex-shrink:0;border:1px solid #ebeef5;border-radius:4px;background:#fff;align-self:stretch' }, [
        h('div', { style: 'padding:8px 10px;display:flex;gap:6px;align-items:center;border-bottom:1px solid #ebeef5' }, [
          h(el('el-input'), {
            modelValue: searchInput.value,
            'onUpdate:modelValue': (value: string) => { searchInput.value = value },
            placeholder: '按群 OpenID 搜索',
            clearable: true,
            size: 'small',
            style: 'flex:1',
            onKeyup: (event: KeyboardEvent) => { if (event.key === 'Enter') applySearch() },
            onClear: applySearch,
          }),
          h(el('el-button'), { size: 'small', onClick: applySearch }, () => '搜索'),
        ]),
        rows.length
          ? h('div', {}, rows.map(renderListItem))
          : h('div', { style: 'padding:24px 12px;text-align:center;color:#909399;font-size:13px' }, loading.value ? '加载中…' : '数据库里还没有群覆盖记录'),
        total > query.pageSize
          ? h(el('el-pagination'), {
              layout: 'total, prev, pager, next',
              small: true,
              total,
              currentPage: query.page,
              pageSize: query.pageSize,
              style: 'margin:8px 0;justify-content:center',
              'onCurrentChange': (page: number) => { query.page = page; void refresh() },
            })
          : null,
      ])
    }

    return () => {
      return h('div', { style: 'padding:16px' }, [
        h('div', { style: 'font-size:16px;font-weight:600;margin-bottom:4px' }, PANEL_NAME),
        h('div', { style: 'font-size:12px;color:#909399;margin-bottom:12px' }, [
          '本页同时管理入群欢迎、离群通知与开关回执三类内容。群级状态保存在数据库表 welcome_message_group 中；插件不会改写 koishi.yml。',
          '内容字段可以逐项选择「继承全局」或「覆盖」，选「覆盖」后留空即显式置空。',
        ]),
        h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px' }, [
          h(el('el-button'), { size: 'small', onClick: () => { void refresh() }, loading: loading.value }, () => '刷新'),
          h('div', { style: 'flex:1' }),
          h(el('el-input'), {
            modelValue: newId.value,
            'onUpdate:modelValue': (value: string) => { newId.value = value },
            placeholder: '手工填入群 OpenID 以新增覆盖',
            size: 'small',
            style: 'width:260px',
          }),
          h(el('el-button'), { size: 'small', type: 'primary', onClick: openCreate }, () => '新增群覆盖'),
          h(el('el-button'), { size: 'small', onClick: () => { void migrate() }, loading: migrating.value }, () => '迁移旧配置'),
        ]),
        h('div', { style: 'display:flex;gap:12px;align-items:flex-start' }, [
          renderList(),
          h('div', { style: 'flex:1;min-width:0' }, [
            editing.value
              ? renderDetail()
              : h('div', {
                  style: 'border:1px dashed #dcdfe6;border-radius:4px;padding:40px 12px;text-align:center;color:#909399;font-size:13px',
                }, '从左侧选择一个群查看详情；在上方填入群 OpenID 并点「新增群覆盖」可开始编辑。'),
          ]),
        ]),
      ])
    }
  },
})
