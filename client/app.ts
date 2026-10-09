import { message, messageBox } from '@koishijs/client'
import { defineComponent, h, nextTick, onMounted, reactive, ref, resolveComponent } from 'vue'
import {
  applySavedInput,
  collectKeyboardErrors,
  collectSaveInput,
  createFormState,
  FIELD_GROUPS,
  findExactRow,
  FORM_CHANGES_MESSAGE,
  hasFormChanges,
  TEXT_FIELDS,
  overrideChips,
  resolveInheritedValue,
  type ContentFieldMode,
  type DetailFieldMeta,
  type EditorState,
  type FieldEditor,
  type TextFieldMeta,
} from '../src/console-form'
import { DEFAULT_KEYBOARDS, type KeyboardField } from '../src/defaults'
import * as api from './api'
import { KeyboardEditor } from './keyboard-editor'

const el = (name: string) => resolveComponent(name)

/** 新增查重候选页大小：取服务端 store 的 MAX_PAGE_SIZE 上限，保证目标行不会被挤出单页。 */
const DEDUPE_PAGE_SIZE = 200

/**
 * 控制台页名：侧栏入口与 ctx.page 的 name 共用同一字面量；
 * 页头标题由 k-layout 外壳按活动元数据（同一个 name）原生显示。
 */
export const PANEL_NAME = '入群欢迎管理'

/** 顶部两个并列页签：群覆盖列表与全局默认（哨兵行）。 */
type PanelTab = 'groups' | 'global'

/** 详情卡内部的三个页签。 */
type DetailTab = 'welcome' | 'leave' | 'receipt'

const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'welcome', label: '入群' },
  { key: 'leave', label: '离群' },
  { key: 'receipt', label: '开关回执' },
]

/** 筛选状态 → 服务端 `enabled` 参数；`all` 不传条件，与现状一致。 */
type FilterMode = 'all' | 'enabled' | 'disabled'

function filterToEnabled(filter: FilterMode): boolean | undefined {
  if (filter === 'enabled') return true
  if (filter === 'disabled') return false
  return undefined
}

/**
 * 详情内页签 → console-form 里的内容分组标题。分组元数据仍只在 console-form 定义一处，
 * 这里只是把三个标题收进一张表，避免裸字面量散落在各处。
 */
const TAB_GROUP_TITLE: Record<DetailTab, string> = {
  welcome: '入群',
  leave: '离群',
  receipt: '开关回执',
}

/** 取某个内容分组里的字段（开关单独归类，不计入内容分组）。 */
function contentFieldsOf(tab: DetailTab): DetailFieldMeta[] {
  const group = FIELD_GROUPS.find(item => item.title === TAB_GROUP_TITLE[tab])
  return group ? group.fields.filter(field => field.kind !== 'switch') : []
}

/** 从 console-form 的分组元数据里取开关字段；标签只在 console-form 定义一处。 */
function switchFieldOf(key: 'welcomeEnabled' | 'leaveEnabled'): DetailFieldMeta | null {
  for (const group of FIELD_GROUPS) {
    for (const field of group.fields) {
      if (field.kind === 'switch' && field.key === key) return field
    }
  }
  return null
}

/**
 * 详情卡内部页签的字段归属（issue #13）：入群 / 离群 / 开关回执。
 * 哨兵行的全局入群 / 离群开关各归对应页签；群行只有一个总开关，放在卡头。
 */
function fieldsForTab(tab: DetailTab, sentinel: boolean): DetailFieldMeta[] {
  const fields = contentFieldsOf(tab)
  const toggle = !sentinel || tab === 'receipt'
    ? null
    : switchFieldOf(tab === 'welcome' ? 'welcomeEnabled' : 'leaveEnabled')
  return toggle ? [toggle, ...fields] : fields
}

/** 详情卡片样式：一次性注入，颜色全部取主题 CSS 变量（暗色主题自动跟随）。 */
const PANEL_STYLE_ID = 'wm-panel-style'

const PANEL_STYLE = `
.k-card.wm-detail-card > header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 1rem;
  margin-bottom: 0;
}
.k-card.wm-detail-card .wm-detail-id {
  font-size: 13px;
  color: var(--k-text-normal);
}
.k-card.wm-detail-card > footer {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wm-detail-card .wm-detail-footer-hint {
  font-size: 12px;
  color: var(--k-text-light);
}
.wm-stat-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 24px;
  padding: 10px 16px;
  border: 1px solid var(--k-color-divider);
  border-radius: 6px;
}
.wm-stat-item {
  min-width: 96px;
  text-align: center;
}
.wm-stat-value {
  font-size: 22px;
  font-weight: 600;
}
.wm-stat-label {
  margin-top: 2px;
  font-size: 12px;
  color: var(--k-text-light);
}
`

function injectPanelStyle() {
  if (document.getElementById(PANEL_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = PANEL_STYLE_ID
  style.textContent = PANEL_STYLE
  document.head.appendChild(style)
}

/** 表单布局：字段行统一交给 el-form 对齐，标签不再手写固定像素宽度。 */
const fieldLabelStyle = 'font-size:13px;font-weight:600;color:var(--k-text-dark)'

/** 错误提示颜色走主题 danger 变量，暗色主题下对比度由主题保证；块级独占一行。 */
const fieldErrorStyle = 'display:block;font-size:12px;color:var(--k-color-danger);margin-top:4px'

/** 键盘 JSON 文本框等宽字体：用主题代码字体变量。 */
const monoInputStyle = 'font-family:var(--font-family-code);font-size:12px;line-height:1.5'

/** Tab 行 / 筛选行的通用外壳：同一行内对齐、窄窗自动换行。 */
const toolbarStyle = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap'

/** 详情栏最小宽度：两栏在窄窗下由此触发 flex-wrap 纵向堆叠。 */
const detailPaneStyle = 'flex:1.4;min-width:280px;display:flex;flex-direction:column'

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
    injectPanelStyle()

    const activeTab = ref<PanelTab>('groups')
    const detailTab = ref<DetailTab>('welcome')
    const stats = ref<api.ConsoleStats | null>(null)
    const list = ref<api.ConsoleListResult | null>(null)
    const loading = ref(false)
    const saving = ref(false)
    /** 新增入口的查重请求进行中：与 saving 分离，避免「保存中」语义被扩成「任意 RPC 进行中」。 */
    const checking = ref(false)
    const migrating = ref(false)
    const query = reactive({ filter: 'all' as FilterMode, search: '', page: 1, pageSize: 20 })
    const searchInput = ref('')
    const selectedId = ref<string | null>(null)
    const editing = ref<EditorState | null>(null)
    /** 详情数据来源的数据库行；null 表示当前是未入库的新建草稿。 */
    const editingRow = ref<api.ConsoleGroupRow | null>(null)
    const editors = reactive<Record<string, FieldEditor>>({})
    const errors = reactive<Record<string, string>>({})
    /**
     * 全局默认行缓存，作群行继承 placeholder 的取值来源。
     * 列表是分页 + 搜索 + 筛选的，哨兵行不一定在当前结果里，这里单独拉取并缓存。
     */
    let globalRow: api.ConsoleGroupRow | null = null
    /** 群覆盖页签上次打开的群；切回该页签时恢复，避免详情跳到空白。 */
    let lastGroupId: string | null = null

    /**
     * 拉取全局默认行作群行继承 placeholder 的取值来源，并缓存。
     * 列表是分页 + 筛选的，哨兵行不一定在当前结果里；用 `*` 作搜索词可以
     * 精确命中主键为 `*` 的哨兵行，fetchRowById 会过滤出整串相等的这一行。
     */
    async function fetchGlobalRow(): Promise<api.ConsoleGroupRow | null> {
      try {
        const result = await fetchRowById('*')
        globalRow = result?.sentinel ? result : null
      } catch {
        // 拉取失败不影响编辑主流程，placeholder 用缓存或内置默认值兜底
      }
      return globalRow
    }

    /**
     * 用列表 RPC 的搜索语义精确取一行。候选页取服务端单页上限 200：搜索是
     * 大小写不敏感的子串匹配，按 id 升序返回，页太小会被字典序更小的同串行
     * 占满，把目标行挤出结果（如查 "G2" 时 "0G2" 先出现）→ 误判不存在 →
     * 首存静默覆盖已有行。取满后再用 findExactRow 做大小写不敏感的整串比较。
     */
    async function fetchRowById(id: string): Promise<api.ConsoleGroupRow | null> {
      const result = await api.fetchGroups({ search: id, page: 1, pageSize: DEDUPE_PAGE_SIZE })
      return findExactRow(result.rows, id) ?? null
    }

    /** 列表页签要显示的群覆盖行：哨兵行已提升为「全局默认」页签，不再出现在列表里。 */
    const groupRows = () => (list.value?.rows ?? []).filter(row => !row.sentinel)

    /**
     * 列表显示的总行数。服务端分页把哨兵行一并计入 total，但它已提升为「全局默认」页签，
     * 不该影响群覆盖列表的计数与页码，所以命中时减掉 1。哨兵 `enabled` 恒为 true、id 是
     * `*`，是否被当前查询计入可以只看缓存：不筛「已关闭」、且搜索词是 `*` 的子串时才命中。
     * 另用当前页是否出现哨兵兜底（`*` 恒排第一页开头，缓存缺失时也能对上）。
     */
    const groupTotal = () => {
      const search = query.search.trim().toLowerCase()
      const sentinelInResults = (list.value?.rows.some(row => row.sentinel) ?? false)
        || (!!globalRow
          && query.filter !== 'disabled'
          && (!search || globalRow.id.toLowerCase().includes(search)))
      return Math.max(0, (list.value?.total ?? 0) - (sentinelInResults ? 1 : 0))
    }

    async function refresh() {
      loading.value = true
      try {
        // 列表与统计分别处理失败：统计 RPC 出错不该把已经拿到的列表一起清空
        const [listResult, statsResult] = await Promise.allSettled([
          api.fetchGroups({
            search: query.search,
            enabled: filterToEnabled(query.filter),
            page: query.page,
            pageSize: query.pageSize,
          }),
          api.fetchStats(),
        ])
        if (listResult.status === 'fulfilled') {
          list.value = listResult.value
          // 保存/刷新后同步全局默认行缓存（列表第一页通常已带哨兵行，避免多余请求）
          globalRow = listResult.value.rows.find(row => row.sentinel) ?? globalRow
        } else {
          message.error('加载群覆盖列表失败：' + errorText(listResult.reason))
          list.value = null
        }
        if (statsResult.status === 'fulfilled') stats.value = statsResult.value
        else message.error('加载统计失败：' + errorText(statsResult.reason))
      } finally {
        loading.value = false
      }
    }

    function currentState() {
      const current = editing.value
      return current ? { editing: current, editors } : null
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
      for (const field of TEXT_FIELDS) delete errors[field.key]
    }

    /** 载入一行到详情；只有真正切群（点行 / 新增 / 切页签）才把内部页签拨回「入群」。 */
    function loadDetail(row: api.ConsoleGroupRow, resetTab = false) {
      selectedId.value = row.id
      if (!row.sentinel) lastGroupId = row.id
      if (resetTab) detailTab.value = 'welcome'
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
      loadDetail(row, true)
    }

    /** 切到「全局默认」页签：脏时先确认，再载入哨兵行。 */
    async function openGlobalDetail() {
      const row = globalRow ?? (await fetchGlobalRow())
      if (row) {
        loadDetail(row, true)
      } else {
        clearDetail()
        message.warning('暂时读不到全局默认行，请点「刷新」重试。')
      }
    }

    /** 切回「群覆盖」页签：恢复上次打开的群，找不到就留空。 */
    function restoreGroupDetail() {
      if (editing.value && !editing.value.sentinel) return
      const row = lastGroupId ? list.value?.rows.find(item => item.id === lastGroupId) : undefined
      if (row) loadDetail(row, true)
      else clearDetail()
    }

    async function switchTab(tab: PanelTab) {
      if (tab === activeTab.value) return
      if (!(await confirmLeave())) return
      activeTab.value = tab
      if (tab === 'global') await openGlobalDetail()
      else restoreGroupDetail()
    }

    function onFilterChange(filter: FilterMode) {
      query.filter = filter
      query.page = 1
      void refresh()
    }

    /**
     * 新增群覆盖：弹小输入框收集群 OpenID，确认后右侧进入未保存草稿（issue #7）。
     * 查重直接查数据库而不是只看当前列表页——列表是分页 + 搜索的，
     * 目标行不在当前页时会漏判，保存时就会静默覆盖已有行。
     * 已存在的 OpenID 提示直接编辑，不进入草稿；放弃草稿不产生任何数据库写入。
     */
    async function openCreate() {
      let id: string
      try {
        const { value } = await messageBox.prompt('填写群 OpenID（不是普通 QQ 群号）。', '新增群覆盖', {
          type: 'info',
          confirmButtonText: '开始编辑草稿',
          cancelButtonText: '取消',
          inputPlaceholder: 'QQ 群 OpenID',
          inputPattern: /\S/,
          inputErrorMessage: '群 OpenID 不能为空。',
        })
        id = value.trim()
      } catch {
        return
      }
      checking.value = true
      try {
        const hit = await fetchRowById(id)
        if (hit) {
          message.warning('数据库里已有这个群的记录，请直接编辑它。')
          await switchTo(hit)
          return
        }
      } catch (error) {
        message.error('检查群 OpenID 是否已存在失败：' + errorText(error))
        return
      } finally {
        checking.value = false
      }
      if (!(await confirmLeave())) return
      selectedId.value = id
      detailTab.value = 'welcome'
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

    /** 错误字段所在的详情页签；找不到时退回「入群」。 */
    function tabOfField(key: string): DetailTab {
      const sentinel = editing.value?.sentinel ?? false
      for (const tab of DETAIL_TABS) {
        if (fieldsForTab(tab.key, sentinel).some(field => field.key === key)) return tab.key
      }
      return 'welcome'
    }

    /** 保存被键盘校验拦下时，切到所在页签、滚动并聚焦到第一个错误字段。 */
    async function focusFirstError() {
      const field = TEXT_FIELDS.find(item => item.keyboard && errors[item.key])
      if (!field) return
      // 错误字段可能藏在其它内部页签里：先把页签拨过去再定位
      detailTab.value = tabOfField(field.key)
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
        // 未入库的新建草稿首次保存 = 创建；入库行保存 = 更新
        const creating = !editingRow.value
        message.success(state.editing.sentinel ? '全局默认已保存' : creating ? '群覆盖已创建' : '群覆盖已保存')
        // 哨兵行是群行 placeholder 的继承来源，保存后立即刷新缓存
        if (state.editing.sentinel) void fetchGlobalRow()
        if (creating) {
          // 新草稿首存：新行按 id 升序可能落在后面的分页里，用搜索 + 清筛选定位它，
          // 保证刷新后能在列表看到并选中新行；搜索框同步显示该 OpenID
          searchInput.value = state.editing.id
          query.search = state.editing.id
          query.filter = 'all'
          query.page = 1
        }
        await refresh()
        const row = list.value?.rows.find(item => item.id === state.editing.id)
        if (row) {
          loadDetail(row)
        } else {
          // 该行不在当前页/搜索结果内：按提交值合成来源行（字段键齐全，脏检查才为 false），
          // 让详情保持打开、视为干净基线
          editingRow.value = applySavedInput(input, { id: state.editing.id, sentinel: state.editing.sentinel })
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
        if (selectedId.value === row.id) {
          clearDetail()
          lastGroupId = null
        }
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

    /** el-form-item 的 label 插槽：统一字重与颜色，宽度交给表单布局。 */
    const renderFieldLabel = (text: string) => h('span', { style: fieldLabelStyle }, text)

    /**
     * 继承模式下输入框的 placeholder，显示真正生效的值（与运行时继承链一致）：
     * 群行 = 全局默认行的值，全局也没设时兜底内置默认值；哨兵行 = 内置默认值。
     */
    const inheritedPlaceholder = (field: TextFieldMeta): string | undefined =>
      editing.value?.sentinel
        ? resolveInheritedValue(null, field.key, true)
        : resolveInheritedValue(globalRow, field.key, false)

    /** 置空态输入框的占位文案：消息类＝这条消息不发，键盘类＝不显示按钮。 */
    const nonePlaceholder = (field: TextFieldMeta): string =>
      field.keyboard ? '该群不显示按钮' : '该群不发送这条消息'

    const renderTextField = (field: TextFieldMeta) => {
      const editor = editors[field.key]
      const inputStyle = field.keyboard ? monoInputStyle : undefined
      return h(el('el-form-item'), { key: field.key, id: `wm-field-${field.key}` }, {
        label: () => renderFieldLabel(field.label),
        default: () => [
          // 三态 tab 栏：宽度随内容、左对齐，位于字段标签下方、输入框上方（issue #18）。
          h(el('el-radio-group'), {
            modelValue: editor.mode,
            'onUpdate:modelValue': (value: ContentFieldMode) => {
              editor.mode = value
              if (field.keyboard) validateKeyboardFields()
            },
            size: 'small',
            style: 'margin-bottom:8px',
          }, () => [
            h(el('el-radio-button'), { value: 'inherit' }, () => editing.value?.sentinel ? '内置默认' : '继承全局'),
            h(el('el-radio-button'), { value: 'override' }, () => '覆盖'),
            h(el('el-radio-button'), { value: 'none' }, () => '置空'),
          ]),
          editor.mode === 'override'
            ? field.keyboard
              // 键盘字段：结构化表单 + 源码视图，纯文本消息字段仍是普通多行输入
              ? h(KeyboardEditor, {
                  key: `${editing.value?.id ?? 'draft'}-${field.key}`,
                  modelValue: editor.value,
                  defaultKeyboard: DEFAULT_KEYBOARDS[field.key as KeyboardField] ?? '',
                  'onUpdate:modelValue': (value: string) => {
                    editor.value = value
                    validateKeyboardFields()
                  },
                })
              : h(el('el-input'), {
                  modelValue: editor.value,
                  'onUpdate:modelValue': (value: string) => {
                    editor.value = value
                  },
                  type: 'textarea',
                  rows: field.rows,
                  placeholder: '',
                })
            // 继承 / 置空：禁用的空输入框；继承显示来源值，置空显示「不发 / 不显示」
            : h(el('el-input'), {
                modelValue: '',
                type: 'textarea',
                rows: field.rows,
                disabled: true,
                inputStyle,
                placeholder: editor.mode === 'none' ? nonePlaceholder(field) : inheritedPlaceholder(field),
              }),
          errors[field.key] ? h('div', { style: fieldErrorStyle }, errors[field.key]) : null,
        ],
      })
    }

    const renderSwitch = (text: string, modelValue: boolean, onChange: (value: boolean) => void) =>
      h(el('el-form-item'), { key: text }, {
        label: () => renderFieldLabel(text),
        default: () => h(el('el-switch'), { modelValue, 'onUpdate:modelValue': onChange }),
      })

    /** 按字段元数据渲染单个字段行：开关 / 三态文本。 */
    const renderDetailField = (field: DetailFieldMeta) => {
      if (field.kind === 'switch') {
        return renderSwitch(field.label, editing.value?.[field.key] ?? true, value => {
          if (editing.value) editing.value[field.key] = value
        })
      }
      return renderTextField(field)
    }

    /** 详情卡：卡头（标识 + 状态标签 + 群行总开关）/ 三个内部页签 / 页脚（删除居左、保存居右）。 */
    const renderDetailCard = () => {
      const current = editing.value
      if (!current) return null
      const dirty = detailDirty()
      return h(el('k-card'), { class: 'wm-detail-card' }, {
        header: () => [
          current.sentinel
            ? h(el('el-tag'), { type: 'warning', size: 'small' }, () => '全局默认')
            : h('code', { class: 'wm-detail-id' }, current.id),
          editingRow.value ? null : h(el('el-tag'), { type: 'warning', size: 'small' }, () => '未保存草稿'),
          dirty ? h(el('el-tag'), { size: 'small' }, () => '有未保存改动') : null,
          // 群行只有一个总开关，放卡头；哨兵的入群 / 离群开关各归对应内部页签
          current.sentinel ? null : h('div', { style: 'flex:1' }),
          current.sentinel ? null : h('div', { style: 'display:flex;align-items:center;gap:6px' }, [
            h('span', { style: 'font-size:13px;color:var(--k-text-normal)' }, '本群通知开关'),
            h(el('el-switch'), {
              modelValue: current.enabled,
              'onUpdate:modelValue': (value: boolean) => { current.enabled = value },
            }),
          ]),
        ],
        default: () => h(el('el-form'), { labelPosition: 'top' }, () => h(el('el-tabs'), {
          modelValue: detailTab.value,
          'onUpdate:modelValue': (value: DetailTab) => { detailTab.value = value },
        }, () => DETAIL_TABS.map(tab => h(el('el-tab-pane'), {
          key: tab.key,
          label: tab.label,
          name: tab.key,
        }, () => fieldsForTab(tab.key, current.sentinel).map(renderDetailField))))),
        footer: () => [
          editingRow.value && !current.sentinel
            ? h(el('el-button'), {
                size: 'small',
                type: 'danger',
                plain: true,
                disabled: saving.value,
                onClick: () => { void removeRow() },
              }, () => '删除群覆盖')
            : null,
          h('div', { style: 'flex:1' }),
          h('span', { class: 'wm-detail-footer-hint' }, dirty ? '未保存的改动不会自动写入。' : '与列表数据一致。'),
          h(el('el-button'), {
            size: 'small',
            type: 'primary',
            loading: saving.value,
            disabled: !dirty,
            onClick: () => { void save() },
          }, () => '保存'),
        ],
      })
    }

    /** 详情栏：编辑态渲染详情卡，否则给一条空态提示（全局页签与群覆盖页签文案不同）。 */
    const renderDetailPane = () => h('div', { style: detailPaneStyle }, [
      editing.value
        ? renderDetailCard()
        : h(el('k-empty'), { style: 'flex:1' }, () => activeTab.value === 'global'
            ? '暂时读不到全局默认行，请点「刷新」重试。'
            : '从左侧选择一个群查看详情；点「新增群覆盖」可开始编辑草稿。'),
    ])

    /** 左栏：el-table（群 OpenID / 覆盖摘要 / 行内开关 / 更新时间）；空态交给表格自带的单层空态。 */
    const renderListPane = () => {
      const rows = groupRows()
      const total = groupTotal()
      return h('div', { style: 'flex:1;min-width:280px;display:flex;flex-direction:column;gap:8px' }, [
        h(el('el-table'), {
          data: rows,
          size: 'small',
          rowKey: 'id',
          highlightCurrentRow: true,
          currentRowKey: selectedId.value ?? undefined,
          emptyText: loading.value ? '加载中…' : '数据库里还没有群覆盖记录',
          onRowClick: (row: api.ConsoleGroupRow) => { void switchTo(row) },
          style: { width: '100%' },
        }, () => [
          h(el('el-table-column'), { label: '群 OpenID', minWidth: 150, showOverflowTooltip: true }, {
            default: ({ row }: { row: api.ConsoleGroupRow }) => h('code', { style: 'font-size:13px' }, row.id),
          }),
          // 覆盖字段 chips：无覆盖时显示继承提示（哨兵行不进列表，这里都是群行）
          h(el('el-table-column'), { label: '覆盖摘要', minWidth: 200 }, {
            default: ({ row }: { row: api.ConsoleGroupRow }) =>
              h('div', { style: 'display:flex;flex-wrap:wrap;gap:4px' },
                overrideChips(row).map(chip => h(el('el-tag'), {
                  key: chip.fieldKey || chip.text,
                  size: 'small',
                  type: 'info',
                  effect: 'plain',
                }, () => chip.text))),
          }),
          h(el('el-table-column'), { label: '通知开关', width: 96, align: 'center' }, {
            default: ({ row }: { row: api.ConsoleGroupRow }) => h(el('el-switch'), {
              modelValue: row.enabled,
              'onUpdate:modelValue': (value: boolean) => { void toggleEnabled(row, value) },
              onClick: (event: Event) => event.stopPropagation(),
            }),
          }),
          h(el('el-table-column'), { label: '更新时间', width: 120 }, {
            default: ({ row }: { row: api.ConsoleGroupRow }) =>
              h('span', { style: 'font-size:12px;color:var(--k-text-light)' }, formatTime(row.updatedAt)),
          }),
        ]),
        total > query.pageSize
          ? h(el('el-pagination'), {
              layout: 'total, prev, pager, next',
              small: true,
              total,
              currentPage: query.page,
              pageSize: query.pageSize,
              style: { justifyContent: 'flex-end' },
              'onCurrentChange': (page: number) => { query.page = page; void refresh() },
            })
          : null,
      ])
    }

    /** 顶部统计条：5 项取 stats RPC；全局两项可点击跳到「全局默认」页签。 */
    const statItem = (label: string, value: string, color: string, onClick?: () => void) =>
      h('div', {
        class: 'wm-stat-item',
        style: onClick ? 'cursor:pointer' : undefined,
        onClick,
      }, [
        h('div', { class: 'wm-stat-value', style: `color:${color}` }, value),
        h('div', { class: 'wm-stat-label' }, label),
      ])

    const renderStatsBar = () => {
      const st = stats.value
      const num = (value: number | undefined) => value === undefined ? '—' : String(value)
      const toggle = (value: boolean | undefined) => value === undefined ? '—' : value ? '已开启' : '已关闭'
      const toggleColor = (value: boolean | undefined) =>
        value === false ? 'var(--k-color-warning)' : 'var(--k-color-success)'
      const openGlobal = () => { void switchTab('global') }
      const numColor = 'var(--k-text-dark)'
      return h('div', { class: 'wm-stat-bar' }, [
        statItem('群覆盖数', num(st?.total), numColor),
        // 已开启 / 已关闭只统计数据库里已有的覆盖行：适配器无法枚举机器人所在的群
        statItem('已开启（已有覆盖行）', num(st?.enabled), 'var(--k-color-success)'),
        statItem('已关闭（已有覆盖行）', num(st?.disabled), 'var(--k-text-light)'),
        statItem('全局入群通知', toggle(st?.welcomeEnabled), toggleColor(st?.welcomeEnabled), openGlobal),
        statItem('全局离群通知', toggle(st?.leaveEnabled), toggleColor(st?.leaveEnabled), openGlobal),
      ])
    }

    /** Tab 行：群覆盖 / 全局默认，右侧刷新。 */
    const renderTabRow = () => h('div', { style: toolbarStyle }, [
      h(el('el-radio-group'), {
        modelValue: activeTab.value,
        size: 'small',
        'onUpdate:modelValue': (value: PanelTab) => { void switchTab(value) },
      }, () => [
        h(el('el-radio-button'), { value: 'groups' }, () => '群覆盖'),
        h(el('el-radio-button'), { value: 'global' }, () => '全局默认'),
      ]),
      h('div', { style: 'flex:1' }),
      h(el('el-button'), { size: 'small', onClick: () => { void refresh() }, loading: loading.value }, () => '刷新'),
    ])

    /** 筛选行：全部 / 已开启 / 已关闭（走服务端 enabled）+ 搜索 + 新增 / 迁移。 */
    const renderFilterRow = () => h('div', { style: toolbarStyle }, [
      h(el('el-radio-group'), {
        modelValue: query.filter,
        size: 'small',
        'onUpdate:modelValue': (value: FilterMode) => onFilterChange(value),
      }, () => [
        h(el('el-radio-button'), { value: 'all' }, () => '全部'),
        h(el('el-radio-button'), { value: 'enabled' }, () => '已开启'),
        h(el('el-radio-button'), { value: 'disabled' }, () => '已关闭'),
      ]),
      h(el('el-input'), {
        modelValue: searchInput.value,
        'onUpdate:modelValue': (value: string) => { searchInput.value = value },
        placeholder: '按群 OpenID 搜索',
        clearable: true,
        size: 'small',
        style: { width: '220px' },
        onKeyup: (event: KeyboardEvent) => { if (event.key === 'Enter') applySearch() },
        onClear: applySearch,
      }),
      h(el('el-button'), { size: 'small', onClick: applySearch }, () => '搜索'),
      h('div', { style: 'flex:1' }),
      h(el('el-button'), { size: 'small', type: 'primary', onClick: () => { void openCreate() }, loading: checking.value }, () => '新增群覆盖'),
      h(el('el-button'), { size: 'small', onClick: () => { void migrate() }, loading: migrating.value }, () => '迁移旧配置'),
    ])

    return () => {
      // k-layout 的 .layout-main 固定 overflow:hidden，页面必须自备滚动容器，
      // 否则满页内容溢出部分会被直接裁掉（无法滚动）；底部也不会被状态栏压住。
      return h(el('k-layout'), () => h('div', {
        style: 'padding:16px;display:flex;flex-direction:column;gap:12px;height:100%;box-sizing:border-box;overflow-y:auto',
      }, [
        renderStatsBar(),
        renderTabRow(),
        h('div', { style: 'display:flex;flex-direction:column;gap:12px;flex:1;min-width:0' }, [
          activeTab.value === 'groups' ? renderFilterRow() : null,
          // 两栏：窄窗由 flex-wrap 纵向堆叠、列表在上；「全局默认」页签只有详情
          h('div', { style: 'display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap' }, [
            activeTab.value === 'groups' ? renderListPane() : null,
            renderDetailPane(),
          ]),
        ]),
      ]))
    }
  },
})
