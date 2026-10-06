import { message, messageBox } from '@koishijs/client'
import { defineComponent, h, onMounted, reactive, ref, resolveComponent } from 'vue'
import { validateKeyboardJson } from '../src/keyboard'
import * as api from './api'

const el = (name: string) => resolveComponent(name)

interface TextFieldMeta {
  key: string
  label: string
  rows: number
  keyboard?: boolean
  hint?: string
}

const TEXT_FIELDS: TextFieldMeta[] = [
  { key: 'welcomeMessage', label: '入群文案', rows: 3 },
  { key: 'leaveMessage', label: '离群文案', rows: 3 },
  { key: 'welcomeKeyboard', label: '入群按钮', rows: 5, keyboard: true, hint: '选「覆盖」但留空 = 该群不显示按钮' },
  { key: 'leaveKeyboard', label: '离群按钮', rows: 5, keyboard: true, hint: '选「覆盖」但留空 = 该群不显示按钮' },
  { key: 'closeResponseMessage', label: '关闭回执文案', rows: 3 },
  { key: 'closeResponseKeyboard', label: '关闭回执按钮', rows: 5, keyboard: true, hint: '选「覆盖」但留空 = 不显示按钮' },
  { key: 'enableResponseMessage', label: '开启回执文案', rows: 3 },
  { key: 'enableResponseKeyboard', label: '开启回执按钮', rows: 5, keyboard: true, hint: '选「覆盖」但留空 = 不显示按钮' },
]

const FORMAT_FIELDS = [
  { key: 'messageFormat', label: '入群/离群消息格式' },
  { key: 'commandResponseFormat', label: '开关回执格式' },
]

type FormatMode = 'inherit' | 'text' | 'markdown'

interface EditorState {
  id: string
  sentinel: boolean
  enabled: boolean
  welcomeEnabled: boolean
  leaveEnabled: boolean
}

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
    const dialogVisible = ref(false)
    const editing = ref<EditorState | null>(null)
    const editors = reactive<Record<string, { mode: 'inherit' | 'override'; value: string }>>({})
    const formats = reactive<Record<string, FormatMode>>({})
    const errors = reactive<Record<string, string>>({})

    async function refresh() {
      loading.value = true
      try {
        list.value = await api.fetchGroups({ ...query })
      } catch (error) {
        message.error('加载群覆盖列表失败：' + errorText(error))
        list.value = null
      } finally {
        loading.value = false
      }
    }

    function resetForm(row: api.ConsoleGroupRow | null, id: string) {
      editing.value = {
        id,
        sentinel: row?.sentinel ?? false,
        enabled: row?.enabled ?? true,
        welcomeEnabled: row ? row.welcomeEnabled !== false : true,
        leaveEnabled: row ? row.leaveEnabled !== false : true,
      }
      for (const field of TEXT_FIELDS) {
        const value = row ? (row as unknown as Record<string, unknown>)[field.key] : null
        editors[field.key] = {
          mode: typeof value === 'string' ? 'override' : 'inherit',
          value: typeof value === 'string' ? value : '',
        }
        delete errors[field.key]
      }
      for (const field of FORMAT_FIELDS) {
        const value = row ? (row as unknown as Record<string, unknown>)[field.key] : null
        formats[field.key] = value === 'markdown' ? 'markdown' : value === 'text' ? 'text' : 'inherit'
      }
    }

    function openEdit(row: api.ConsoleGroupRow) {
      resetForm(row, row.id)
      dialogVisible.value = true
    }

    function openCreate() {
      const id = newId.value.trim()
      if (!id) {
        message.warning('请先填写群 OpenID。')
        return
      }
      if (list.value?.rows.some(row => row.id === id)) {
        message.warning('数据库里已有这个群的记录，请直接编辑它。')
        return
      }
      resetForm(null, id)
      dialogVisible.value = true
    }

    function validateForm(): boolean {
      let valid = true
      for (const field of TEXT_FIELDS) {
        if (!field.keyboard) continue
        const editor = editors[field.key]
        const invalid = editor.mode === 'override' ? validateKeyboardJson(editor.value) : undefined
        if (invalid) {
          errors[field.key] = invalid
          valid = false
        } else {
          delete errors[field.key]
        }
      }
      if (!valid) message.error('键盘 JSON 有格式错误，请修正后再保存。')
      return valid
    }

    function collectInput(): api.ConsoleGroupInput {
      const current = editing.value!
      const input: api.ConsoleGroupInput = {
        id: current.id,
        enabled: current.sentinel ? true : current.enabled,
      }
      if (current.sentinel) {
        input.welcomeEnabled = current.welcomeEnabled
        input.leaveEnabled = current.leaveEnabled
      }
      for (const field of TEXT_FIELDS) {
        const editor = editors[field.key]
        input[field.key] = editor.mode === 'override' ? editor.value : null
      }
      for (const field of FORMAT_FIELDS) {
        const mode = formats[field.key]
        input[field.key] = mode === 'inherit' ? null : mode
      }
      return input
    }

    async function save() {
      const current = editing.value
      if (!current || !validateForm()) return
      saving.value = true
      try {
        await api.updateGroup(collectInput())
        message.success(current.sentinel ? '全局默认已保存' : '群覆盖已保存')
        dialogVisible.value = false
        await refresh()
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
    }

    async function removeRow(row: api.ConsoleGroupRow) {
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

    function overrideSummary(row: api.ConsoleGroupRow): string {
      const record = row as unknown as Record<string, unknown>
      const count = [...TEXT_FIELDS.map(field => field.key), ...FORMAT_FIELDS.map(field => field.key)]
        .filter(key => record[key] !== null && record[key] !== undefined)
        .length
      if (!count) return row.sentinel ? '全部使用内置默认' : '全部继承全局'
      return row.sentinel ? `${count} 项自定义` : `${count} 个字段覆盖`
    }

    onMounted(() => { void refresh() })

    const label = (text: string) => h('span', { style: 'font-size:13px;font-weight:600;min-width:130px' }, text)

    const renderTextField = (field: TextFieldMeta) => {
      const editor = editors[field.key]
      return h('div', { key: field.key, style: 'margin-bottom:10px' }, [
        h('div', { style: 'display:flex;align-items:center;gap:8px' }, [
          label(field.label),
          h(el('el-select'), {
            modelValue: editor.mode,
            'onUpdate:modelValue': (value: 'inherit' | 'override') => { editor.mode = value },
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
              'onUpdate:modelValue': (value: string) => { editor.value = value },
              type: 'textarea',
              rows: field.rows,
              placeholder: field.keyboard ? '{ "rows": [] }' : '',
            })
          : null,
        errors[field.key]
          ? h('div', { style: 'font-size:12px;color:#f56c6c;margin-top:4px' }, errors[field.key])
          : null,
      ])
    }

    const renderFormatField = (field: { key: string; label: string }) => h('div', {
      key: field.key,
      style: 'display:flex;align-items:center;gap:8px;margin-bottom:10px',
    }, [
      label(field.label),
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
      h('div', { style: 'display:flex;align-items:center;gap:8px' }, [
        h('span', { style: 'font-size:13px' }, text),
        h(el('el-switch'), { modelValue, 'onUpdate:modelValue': onChange }),
      ])

    const renderDialogBody = () => {
      const current = editing.value
      if (!current) return null
      return h('div', [
        h('div', { style: 'margin-bottom:10px;font-size:13px;color:#606266' }, [
          '群 OpenID：',
          h('code', current.sentinel ? '全局默认行 *' : current.id),
        ]),
        current.sentinel
          ? h('div', { style: 'margin-bottom:10px' }, [
              h('div', { style: 'font-size:12px;color:#909399;margin-bottom:6px' }, '全局默认行本身就是所有群的兜底内容，没有「总开关」；下面两项控制是否发送这一类通知。'),
              renderSwitch('全局入群通知', current.welcomeEnabled, value => { current.welcomeEnabled = value }),
              renderSwitch('全局离群通知', current.leaveEnabled, value => { current.leaveEnabled = value }),
            ])
          : h('div', { style: 'margin-bottom:10px' }, [
              renderSwitch('本群通知开关', current.enabled, value => { current.enabled = value }),
            ]),
        h('div', { style: 'border-top:1px solid #ebeef5', margin: '10px 0' }),
        ...TEXT_FIELDS.map(renderTextField),
        ...FORMAT_FIELDS.map(renderFormatField),
      ])
    }

    return () => {
      const rows = list.value?.rows ?? []
      const total = list.value?.total ?? 0
      return h('div', { style: 'padding:16px' }, [
        h('div', { style: 'font-size:16px;font-weight:600;margin-bottom:4px' }, '群覆盖管理'),
        h('div', { style: 'font-size:12px;color:#909399;margin-bottom:12px' }, [
          '群级状态保存在数据库表 welcome_message_group 中；插件不会改写 koishi.yml。',
          '内容字段可以逐项选择「继承全局」或「覆盖」，选「覆盖」后留空即显式置空。',
        ]),
        h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px' }, [
          h(el('el-input'), {
            modelValue: searchInput.value,
            'onUpdate:modelValue': (value: string) => { searchInput.value = value },
            placeholder: '按群 OpenID 搜索',
            clearable: true,
            size: 'small',
            style: 'width:220px',
            onKeyup: (event: KeyboardEvent) => { if (event.key === 'Enter') applySearch() },
            onClear: applySearch,
          }),
          h(el('el-button'), { size: 'small', onClick: applySearch }, () => '搜索'),
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
        h(el('el-table'), {
          data: rows,
          size: 'small',
          style: 'width:100%',
          emptyText: '数据库里还没有群覆盖记录',
        }, () => [
          h(el('el-table-column'), { label: '群 OpenID', minWidth: 260 }, {
            default: ({ row }: { row: api.ConsoleGroupRow }) => h('div', { style: 'display:flex;align-items:center;gap:6px' }, [
              h('code', row.sentinel ? '*' : row.id),
              row.sentinel
                ? h(el('el-tag'), { type: 'warning', size: 'small' }, () => '全局默认')
                : null,
            ]),
          }),
          h(el('el-table-column'), { label: '通知开关', width: 120 }, {
            default: ({ row }: { row: api.ConsoleGroupRow }) => row.sentinel
              ? h('span', { style: 'font-size:12px;color:#909399' }, '不适用')
              : h(el('el-switch'), {
                  modelValue: row.enabled,
                  'onUpdate:modelValue': (value: boolean) => { void toggleEnabled(row, value) },
                }),
          }),
          h(el('el-table-column'), { label: '内容覆盖', width: 150 }, {
            default: ({ row }: { row: api.ConsoleGroupRow }) => h('span', overrideSummary(row)),
          }),
          h(el('el-table-column'), { label: '最后更新', width: 170 }, {
            default: ({ row }: { row: api.ConsoleGroupRow }) => h('span', formatTime(row.updatedAt)),
          }),
          h(el('el-table-column'), { label: '操作', width: 150 }, {
            default: ({ row }: { row: api.ConsoleGroupRow }) => h('div', {}, [
              h(el('el-button'), { size: 'small', text: true, onClick: () => openEdit(row) }, () => '编辑'),
              row.sentinel
                ? null
                : h(el('el-button'), {
                    size: 'small',
                    text: true,
                    type: 'danger',
                    onClick: () => { void removeRow(row) },
                  }, () => '删除'),
            ]),
          }),
        ]),
        rows.length && total > query.pageSize
          ? h(el('el-pagination'), {
              layout: 'total, prev, pager, next',
              total,
              currentPage: query.page,
              pageSize: query.pageSize,
              style: 'margin-top:10px;justify-content:flex-end',
              'onCurrentChange': (page: number) => { query.page = page; void refresh() },
            })
          : null,
        h(el('el-dialog'), {
          modelValue: dialogVisible.value,
          'onUpdate:modelValue': (value: boolean) => { dialogVisible.value = value },
          title: editing.value?.sentinel ? '编辑全局默认' : '编辑群覆盖',
          width: '680px',
        }, {
          default: renderDialogBody,
          footer: () => h('div', {}, [
            h(el('el-button'), { onClick: () => { dialogVisible.value = false } }, () => '取消'),
            h(el('el-button'), { type: 'primary', loading: saving.value, onClick: () => { void save() } }, () => '保存'),
          ]),
        }),
      ])
    }
  },
})
