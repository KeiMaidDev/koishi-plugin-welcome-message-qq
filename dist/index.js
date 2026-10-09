// client/index.ts
import { store } from "@koishijs/client";
import { defineComponent as defineComponent3, h as h3 } from "vue";

// src/console-permission.ts
var CONSOLE_PANEL_AUTHORITY = 4;

// client/app.ts
import { message as message2, messageBox } from "@koishijs/client";
import { defineComponent as defineComponent2, h as h2, nextTick, onMounted, reactive, ref as ref2, resolveComponent as resolveComponent2 } from "vue";

// src/defaults.ts
var CALLBACK_REPLY_PREFIX = "welcome-messge-qq:reply:";
var CALLBACK_COMMAND_PREFIX = "welcome-messge-qq:command:";
var DEFAULT_WELCOME_MESSAGE = "欢迎 {at} 加入群聊！";
var DEFAULT_LEAVE_MESSAGE = "{at} 已离开群聊。";
var DEFAULT_CLOSE_RESPONSE_MESSAGE = "# 已关闭本群入退群通知\n> 点击下方按钮可以重新开启。";
var DEFAULT_ENABLE_RESPONSE_MESSAGE = "# 已开启本群入退群通知\n> 点击下方按钮可以再次关闭。";
var DEFAULT_WELCOME_KEYBOARD = JSON.stringify({
  rows: [{
    buttons: [{
      render_data: { label: "关闭欢迎", style: 1 },
      action: {
        type: 1,
        permission: { type: 1 },
        data: `${CALLBACK_COMMAND_PREFIX}/关闭欢迎`,
        enter: true
      }
    }]
  }]
}, null, 2);
var DEFAULT_LEAVE_KEYBOARD = JSON.stringify({
  rows: [{
    buttons: [
      {
        render_data: { label: "关闭欢迎", style: 1 },
        action: {
          type: 1,
          permission: { type: 1 },
          data: `${CALLBACK_COMMAND_PREFIX}/关闭欢迎`,
          enter: true
        }
      },
      {
        render_data: { label: "帮助菜单", style: 1 },
        action: {
          type: 2,
          permission: { type: 2 },
          data: "/帮助菜单"
        }
      }
    ]
  }]
}, null, 2);
var DEFAULT_CLOSE_RESPONSE_KEYBOARD = JSON.stringify({
  rows: [{
    buttons: [{
      render_data: { label: "重新开启", style: 1 },
      action: {
        type: 1,
        permission: { type: 1 },
        data: `${CALLBACK_COMMAND_PREFIX}/开启欢迎`
      }
    }]
  }]
}, null, 2);
var DEFAULT_ENABLE_RESPONSE_KEYBOARD = JSON.stringify({
  rows: [{
    buttons: [{
      render_data: { label: "再次关闭", style: 1 },
      action: {
        type: 1,
        permission: { type: 1 },
        data: `${CALLBACK_COMMAND_PREFIX}/关闭欢迎`
      }
    }]
  }]
}, null, 2);
var DEFAULT_KEYBOARDS = {
  welcomeKeyboard: DEFAULT_WELCOME_KEYBOARD,
  leaveKeyboard: DEFAULT_LEAVE_KEYBOARD,
  closeResponseKeyboard: DEFAULT_CLOSE_RESPONSE_KEYBOARD,
  enableResponseKeyboard: DEFAULT_ENABLE_RESPONSE_KEYBOARD
};

// src/keyboard.ts
var EMPTY_KEYBOARD_JSON = JSON.stringify({ rows: [] }, null, 2);
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function emptyKeyboardDocument() {
  return { extras: {}, rows: [] };
}
function emptyKeyboardButton() {
  return {
    extras: {},
    id: "",
    renderData: { extras: {}, label: void 0, visitedLabel: "", style: void 0 },
    action: {
      extras: {},
      type: void 0,
      data: void 0,
      enter: void 0,
      reply: void 0,
      anchor: void 0,
      clickLimit: void 0,
      atBotShowChannelList: void 0,
      unsupportTips: "",
      permission: { extras: {}, type: void 0, specifyUserIds: "", specifyRoleIds: "" }
    }
  };
}
function emptyKeyboardRow() {
  return { extras: {}, buttons: [] };
}
function keyboardDocumentIsEmpty(document2) {
  return !document2.rows.some((row) => row.buttons.length > 0);
}
function parseIdList(text) {
  return text.split("\n").map((item) => item.trim()).filter(Boolean);
}
function takeNumber(target, key) {
  const value = target[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    delete target[key];
    return value;
  }
  return void 0;
}
function takeBoolean(target, key) {
  const value = target[key];
  if (typeof value === "boolean") {
    delete target[key];
    return value;
  }
  return void 0;
}
function takeString(target, key) {
  const value = target[key];
  if (typeof value === "string") {
    delete target[key];
    return value;
  }
  return void 0;
}
function takeStringList(target, key) {
  const value = target[key];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    delete target[key];
    return [...value];
  }
  return void 0;
}
function readPermission(value, where) {
  if (value === void 0) {
    return { extras: {}, type: void 0, specifyUserIds: "", specifyRoleIds: "" };
  }
  if (!isRecord(value)) throw new Error(`${where}的 action.permission 必须是对象。`);
  const extras = { ...value };
  const type = takeNumber(extras, "type");
  const specifyUserIds = takeStringList(extras, "specify_user_ids") ?? [];
  const specifyRoleIds = takeStringList(extras, "specify_role_ids") ?? [];
  return { extras, type, specifyUserIds: specifyUserIds.join("\n"), specifyRoleIds: specifyRoleIds.join("\n") };
}
function readAction(value, where) {
  if (value === void 0) {
    return {
      extras: {},
      type: void 0,
      data: void 0,
      enter: void 0,
      reply: void 0,
      anchor: void 0,
      clickLimit: void 0,
      atBotShowChannelList: void 0,
      unsupportTips: "",
      permission: readPermission(void 0, where)
    };
  }
  if (!isRecord(value)) throw new Error(`${where}的 action 必须是对象。`);
  const extras = { ...value };
  const permission = readPermission(extras.permission, where);
  delete extras.permission;
  return {
    extras,
    type: takeNumber(extras, "type"),
    data: takeString(extras, "data"),
    enter: takeBoolean(extras, "enter"),
    reply: takeBoolean(extras, "reply"),
    anchor: takeNumber(extras, "anchor"),
    clickLimit: takeNumber(extras, "click_limit"),
    atBotShowChannelList: takeBoolean(extras, "at_bot_show_channel_list"),
    unsupportTips: takeString(extras, "unsupport_tips") ?? "",
    permission
  };
}
function readRenderData(value, where) {
  if (value === void 0) return { extras: {}, label: void 0, visitedLabel: "", style: void 0 };
  if (!isRecord(value)) throw new Error(`${where}的 render_data 必须是对象。`);
  const extras = { ...value };
  return {
    extras,
    label: takeString(extras, "label"),
    visitedLabel: takeString(extras, "visited_label") ?? "",
    style: takeNumber(extras, "style")
  };
}
function readButton(value, rowIndex, buttonIndex) {
  const where = `第 ${rowIndex + 1} 行第 ${buttonIndex + 1} 个按钮`;
  if (!isRecord(value)) throw new Error(`${where}必须是对象。`);
  const extras = { ...value };
  const id = takeString(extras, "id") ?? "";
  const renderData = readRenderData(extras.render_data, where);
  delete extras.render_data;
  const action = readAction(extras.action, where);
  delete extras.action;
  return { extras, id, renderData, action };
}
function readRow(value, rowIndex) {
  if (!isRecord(value)) throw new Error(`第 ${rowIndex + 1} 行必须是对象。`);
  const extras = { ...value };
  const rawButtons = extras.buttons;
  delete extras.buttons;
  const buttons = [];
  if (rawButtons !== void 0) {
    if (!Array.isArray(rawButtons)) throw new Error(`第 ${rowIndex + 1} 行的 buttons 必须是数组。`);
    rawButtons.forEach((button, buttonIndex) => buttons.push(readButton(button, rowIndex, buttonIndex)));
  }
  return { extras, buttons };
}
function keyboardDocumentFromValue(value) {
  if (!isRecord(value)) throw new Error('顶层必须是对象，例如 { "rows": [] }。');
  const extras = { ...value };
  const rawRows = extras.rows;
  delete extras.rows;
  const rows = [];
  if (rawRows !== void 0) {
    if (!Array.isArray(rawRows)) throw new Error("rows 必须是数组。");
    rawRows.forEach((row, rowIndex) => rows.push(readRow(row, rowIndex)));
  }
  return { extras, rows };
}
function parseKeyboardDocument(text) {
  const source = text.trim();
  if (!source) return { ok: true, document: emptyKeyboardDocument() };
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    return { ok: false, error: `JSON 解析失败：${error instanceof Error ? error.message : String(error)}` };
  }
  try {
    return { ok: true, document: keyboardDocumentFromValue(parsed) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
function serializePermission(permission) {
  const value = { ...permission.extras };
  if (permission.type !== void 0) value.type = permission.type;
  const userIds = parseIdList(permission.specifyUserIds);
  if (userIds.length) value.specify_user_ids = userIds;
  const roleIds = parseIdList(permission.specifyRoleIds);
  if (roleIds.length) value.specify_role_ids = roleIds;
  return value;
}
function serializeAction(action) {
  const value = { ...action.extras };
  if (action.type !== void 0) value.type = action.type;
  value.permission = serializePermission(action.permission);
  if (action.data !== void 0) value.data = action.data;
  else if (!("data" in action.extras)) value.data = "";
  if (action.enter !== void 0) value.enter = action.enter;
  if (action.reply !== void 0) value.reply = action.reply;
  if (action.anchor !== void 0) value.anchor = action.anchor;
  if (action.clickLimit !== void 0) value.click_limit = action.clickLimit;
  if (action.atBotShowChannelList !== void 0) value.at_bot_show_channel_list = action.atBotShowChannelList;
  if (action.unsupportTips.trim()) value.unsupport_tips = action.unsupportTips;
  return value;
}
function serializeRenderData(renderData) {
  const value = { ...renderData.extras };
  if (renderData.label !== void 0) value.label = renderData.label;
  else if (!("label" in renderData.extras)) value.label = "";
  if (renderData.visitedLabel.trim()) value.visited_label = renderData.visitedLabel;
  if (renderData.style !== void 0) value.style = renderData.style;
  return value;
}
function serializeButton(button, rowIndex, buttonIndex) {
  const value = { ...button.extras };
  value.id = button.id.trim() || `${rowIndex}-${buttonIndex}`;
  value.render_data = serializeRenderData(button.renderData);
  value.action = serializeAction(button.action);
  return value;
}
function serializeKeyboardDocument(document2) {
  const value = { ...document2.extras };
  value.rows = document2.rows.map((row, rowIndex) => {
    const serializedRow = { ...row.extras };
    serializedRow.buttons = row.buttons.map((button, buttonIndex) => serializeButton(button, rowIndex, buttonIndex));
    return serializedRow;
  });
  return JSON.stringify(value, null, 2);
}
function keyboardButtonKind(type) {
  if (type === 0) return "link";
  if (type === 1) return "callback";
  return "command";
}
function keyboardActionType(kind) {
  if (kind === "link") return 0;
  if (kind === "callback") return 1;
  return 2;
}
function callbackDataMode(data) {
  if (data.startsWith(CALLBACK_REPLY_PREFIX)) return "reply";
  if (data.startsWith(CALLBACK_COMMAND_PREFIX)) return "command";
  return "raw";
}
function callbackDataContent(data, mode = callbackDataMode(data)) {
  if (mode === "reply" && data.startsWith(CALLBACK_REPLY_PREFIX)) {
    return data.slice(CALLBACK_REPLY_PREFIX.length);
  }
  if (mode === "command" && data.startsWith(CALLBACK_COMMAND_PREFIX)) {
    return data.slice(CALLBACK_COMMAND_PREFIX.length);
  }
  return data;
}
function withCallbackData(mode, content) {
  if (mode === "reply") return CALLBACK_REPLY_PREFIX + content;
  if (mode === "command") return CALLBACK_COMMAND_PREFIX + content;
  return content;
}
function normalizeKeyboardJson(value) {
  if (!value.trim()) return value;
  const result = parseKeyboardDocument(value);
  return result.ok ? serializeKeyboardDocument(result.document) : value;
}
function validateKeyboardJson(value) {
  const source = value.trim();
  if (!source) return;
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    return `JSON 解析失败：${error instanceof Error ? error.message : String(error)}`;
  }
  if (!isRecord(parsed)) return '顶层必须是对象，例如 { "rows": [] }。';
  if (parsed.rows !== void 0 && !Array.isArray(parsed.rows)) return "rows 必须是数组。";
  for (const [rowIndex, row] of (parsed.rows ?? []).entries()) {
    if (!isRecord(row)) return `第 ${rowIndex + 1} 行的结构必须是对象。`;
    if (row.buttons !== void 0 && !Array.isArray(row.buttons)) return `第 ${rowIndex + 1} 行的 buttons 必须是数组。`;
    for (const [buttonIndex, button] of (row.buttons ?? []).entries()) {
      const where = `第 ${rowIndex + 1} 行第 ${buttonIndex + 1} 个按钮`;
      if (!isRecord(button)) return `${where}的结构必须是对象。`;
      const renderData = button.render_data;
      const action = button.action;
      if (!isRecord(renderData)) return `${where}缺少 render_data 对象。`;
      if (!isRecord(action)) return `${where}缺少 action 对象。`;
      if (typeof renderData.label !== "string" || !renderData.label.trim()) return `${where}缺少 render_data.label。`;
      if (typeof action.data !== "string" || !action.data.trim()) return `${where}缺少 action.data。`;
    }
  }
  return;
}

// src/console-form.ts
var TEXT_FIELDS = [
  { key: "welcomeMessage", label: "入群文案", rows: 3 },
  { key: "leaveMessage", label: "离群文案", rows: 3 },
  { key: "welcomeKeyboard", label: "入群按钮", rows: 5, keyboard: true },
  { key: "leaveKeyboard", label: "离群按钮", rows: 5, keyboard: true },
  { key: "closeResponseMessage", label: "关闭回执文案", rows: 3 },
  { key: "closeResponseKeyboard", label: "关闭回执按钮", rows: 5, keyboard: true },
  { key: "enableResponseMessage", label: "开启回执文案", rows: 3 },
  { key: "enableResponseKeyboard", label: "开启回执按钮", rows: 5, keyboard: true }
];
var DETAIL_SWITCHES = {
  welcomeEnabled: "全局入群通知",
  leaveEnabled: "全局离群通知"
};
function switchField(key) {
  return { kind: "switch", key, label: DETAIL_SWITCHES[key] };
}
function textField(field2) {
  return { kind: "text", ...field2 };
}
var FIELD_GROUPS = [
  { title: "通知开关", kind: "switches", fields: [switchField("welcomeEnabled"), switchField("leaveEnabled")] },
  {
    title: "入群",
    fields: [
      textField(TEXT_FIELDS[0]),
      textField(TEXT_FIELDS[2])
    ]
  },
  {
    title: "离群",
    fields: [
      textField(TEXT_FIELDS[1]),
      textField(TEXT_FIELDS[3])
    ]
  },
  {
    title: "开关回执",
    fields: [
      textField(TEXT_FIELDS[4]),
      textField(TEXT_FIELDS[5]),
      textField(TEXT_FIELDS[6]),
      textField(TEXT_FIELDS[7])
    ]
  }
];
function fieldValue(row, key) {
  return row ? row[key] : null;
}
var BUILTIN_DEFAULTS = {
  welcomeMessage: DEFAULT_WELCOME_MESSAGE,
  leaveMessage: DEFAULT_LEAVE_MESSAGE,
  ...DEFAULT_KEYBOARDS,
  closeResponseMessage: DEFAULT_CLOSE_RESPONSE_MESSAGE,
  enableResponseMessage: DEFAULT_ENABLE_RESPONSE_MESSAGE
};
function resolveInheritedValue(row, key, isSentinel) {
  if (isSentinel) return BUILTIN_DEFAULTS[key];
  if (row && typeof fieldValue(row, key) === "string") return fieldValue(row, key);
  return BUILTIN_DEFAULTS[key];
}
function createFormState(row, id) {
  const editing = {
    id,
    sentinel: row?.sentinel ?? false,
    enabled: row?.enabled ?? true,
    welcomeEnabled: row ? row.welcomeEnabled !== false : true,
    leaveEnabled: row ? row.leaveEnabled !== false : true
  };
  const editors = {};
  for (const field2 of TEXT_FIELDS) {
    const value = fieldValue(row, field2.key);
    editors[field2.key] = {
      mode: typeof value !== "string" ? "inherit" : value === "" ? "none" : "override",
      value: typeof value === "string" ? value : ""
    };
  }
  return { editing, editors };
}
function collectKeyboardErrors(editors) {
  const errors = {};
  for (const field2 of TEXT_FIELDS) {
    if (!field2.keyboard) continue;
    const invalid = validateKeyboardJson(editors[field2.key].value);
    if (editors[field2.key].mode === "override" && invalid) errors[field2.key] = invalid;
  }
  return errors;
}
function fieldSubmitValue(editor) {
  if (editor.mode === "inherit") return null;
  if (editor.mode === "none") return "";
  return editor.value;
}
function collectGroupInput(state) {
  const { editing, editors } = state;
  const input = {
    id: editing.id,
    enabled: editing.sentinel ? true : editing.enabled
  };
  if (editing.sentinel) {
    input.welcomeEnabled = editing.welcomeEnabled;
    input.leaveEnabled = editing.leaveEnabled;
  }
  for (const field2 of TEXT_FIELDS) {
    const value = fieldSubmitValue(editors[field2.key]);
    input[field2.key] = field2.keyboard && typeof value === "string" && value ? normalizeKeyboardJson(value) : value;
  }
  return input;
}
function overrideChips(row) {
  const chips = [];
  for (const field2 of TEXT_FIELDS) {
    const value = fieldValue(row, field2.key);
    if (value === null || value === void 0) continue;
    chips.push({ text: value === "" ? `${field2.label} · 置空` : field2.label, fieldKey: field2.key });
  }
  if (!chips.length) return [{ text: row.sentinel ? "内置默认" : "全部继承全局" }];
  return chips;
}
var FIELD_KEYS = TEXT_FIELDS.map((field2) => field2.key);
function collectGroupChanges(state, row) {
  const changed = {};
  for (const field2 of TEXT_FIELDS) {
    const next = fieldSubmitValue(state.editors[field2.key]);
    changed[field2.key] = next !== fieldValue(row, field2.key);
  }
  if (!Object.values(changed).some(Boolean)) return null;
  const input = collectGroupInput(state);
  for (const key of Object.keys(input)) {
    if (key in changed && !changed[key]) delete input[key];
  }
  return input;
}
function hasSwitchChanges(state, row) {
  const { editing } = state;
  if (editing.sentinel) {
    return editing.welcomeEnabled !== (row ? row.welcomeEnabled !== false : true) || editing.leaveEnabled !== (row ? row.leaveEnabled !== false : true);
  }
  return editing.enabled !== (row ? row.enabled !== false : true);
}
function collectSaveInput(state, row) {
  const input = collectGroupChanges(state, row);
  if (input) return input;
  if (!hasSwitchChanges(state, row)) return null;
  const switches = collectGroupInput(state);
  for (const key of FIELD_KEYS) delete switches[key];
  return switches;
}
function hasFormChanges(state, row) {
  return collectSaveInput(state, row) !== null;
}
var FORM_CHANGES_MESSAGE = "详情有未保存的改动，离开将丢失这些改动。";
function applySavedInput(input, meta) {
  const saved = meta.sentinel ? { enabled: true } : { welcomeEnabled: null, leaveEnabled: null };
  return {
    ...Object.fromEntries(FIELD_KEYS.map((key) => [key, null])),
    ...input,
    ...saved,
    id: meta.id,
    sentinel: meta.sentinel,
    updatedAt: Date.now()
  };
}
function findExactRow(rows, id) {
  const lower = id.toLowerCase();
  return rows.find((row) => row.id.toLowerCase() === lower);
}

// client/api.ts
import { send } from "@koishijs/client";
async function assertWrite(result) {
  if (result.ok === true) return;
  throw new Error(result.detail ?? "操作失败。");
}
var fetchGroups = (query) => send("welcome-message-qq/list", query);
var fetchStats = () => send("welcome-message-qq/stats");
var updateGroup = async (input) => assertWrite(await send("welcome-message-qq/update", input));
var deleteGroup = async (id) => assertWrite(await send("welcome-message-qq/delete", id));
var migrateGroups = (options) => send("welcome-message-qq/migrate", options);

// client/keyboard-editor.ts
import { message } from "@koishijs/client";
import { defineComponent, h, ref, resolveComponent, watch } from "vue";
var el = (name) => resolveComponent(name);
var CANVAS_BUTTONS_PER_LINE = 5;
var rootStyle = "display:flex;flex-direction:column;gap:8px;width:100%;min-width:0;max-width:100%;box-sizing:border-box";
var toolbarStyle = "display:flex;align-items:center;gap:8px;flex-wrap:wrap";
var rowBoxStyle = "border:1px solid var(--k-color-divider);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:8px;min-width:0;box-sizing:border-box";
var canvasLineStyle = (count) => `display:grid;grid-template-columns:repeat(${count},minmax(0,1fr));gap:8px;align-items:start;min-width:0`;
var editCardStyle = "border:1px solid var(--k-color-divider);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:8px;background:var(--k-color-bg-2,transparent);width:100%;min-width:0;max-width:100%;box-sizing:border-box";
var labelStyle = "display:block;font-size:12px;font-weight:600;color:var(--k-text-dark);margin-bottom:2px";
var gridStyle = "display:grid;grid-template-columns:repeat(auto-fill,minmax(min(150px,100%),1fr));gap:8px;min-width:0";
var fullGridStyle = "display:grid;grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr));gap:8px;min-width:0";
var inlineStyle = "display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0";
var monoStyle = "font-family:var(--font-family-code);font-size:12px;line-height:1.5";
var smallLabelStyle = "font-size:12px;font-weight:600;color:var(--k-text-dark)";
var hintStyle = "font-size:12px;color:var(--k-text-light)";
var errorStyle = "font-size:12px;color:var(--k-color-danger)";
var emptyStyle = "border:1px dashed var(--k-color-divider);border-radius:6px;padding:12px;display:flex;flex-direction:column;gap:4px;color:var(--k-text-light)";
function field(label, control) {
  return h("div", { style: "min-width:0" }, [h("span", { style: labelStyle }, label), control]);
}
function textControl(value, onChange, extra = {}) {
  return h(el("el-input"), {
    ...extra,
    modelValue: value,
    "onUpdate:modelValue": (next) => onChange(next ?? ""),
    size: "small"
  });
}
function textareaControl(value, onChange, rows = 3, placeholder = "") {
  return textControl(value, onChange, { type: "textarea", rows, placeholder, inputStyle: monoStyle });
}
function numberControl(value, onChange) {
  return h(el("el-input-number"), {
    modelValue: value ?? void 0,
    "onUpdate:modelValue": (next) => {
      onChange(typeof next === "number" && Number.isFinite(next) ? next : void 0);
    },
    size: "small",
    controlsPosition: "right",
    style: "width:100%"
  });
}
function optionalSelect(value, entries, onChange) {
  return h(el("el-select"), {
    modelValue: value ?? "",
    "onUpdate:modelValue": (next) => onChange(next === "" ? void 0 : next),
    size: "small",
    style: "width:100%"
  }, () => entries.map((entry) => h(el("el-option"), { key: entry.value, value: entry.value, label: entry.label })));
}
var PERMISSION_TYPE_ENTRIES = [
  { value: "", label: "未填写" },
  { value: "0", label: "0 指定用户" },
  { value: "1", label: "1 管理员" },
  { value: "2", label: "2 所有人" },
  { value: "3", label: "3 指定身份组" }
];
var TRI_STATE_ENTRIES = [
  { value: "", label: "未填写（用默认）" },
  { value: "true", label: "是" },
  { value: "false", label: "否" }
];
var BUTTON_KIND_ENTRIES = [
  { value: "command", label: "指令按钮" },
  { value: "link", label: "链接按钮" },
  { value: "callback", label: "回调按钮" }
];
var CALLBACK_MODE_ENTRIES = [
  { value: "reply", label: "回复文本" },
  { value: "command", label: "执行指令" },
  { value: "raw", label: "原样填写" }
];
function triStateValue(value) {
  if (value === void 0) return void 0;
  return value ? "true" : "false";
}
function parseTriState(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return void 0;
}
function buttonCanvasStyle(style, selected) {
  const palette = style === 1 ? "background:transparent;color:var(--k-color-primary,#1677ff);border:1px solid var(--k-color-primary,#1677ff)" : style === 3 ? "background:var(--k-card-bg,#fff);color:var(--k-color-danger);border:1px solid var(--k-color-danger-fade)" : style === 4 ? "background:var(--k-color-primary,#1677ff);color:#fff;border:1px solid transparent" : "background:transparent;color:var(--k-text-dark);border:1px solid var(--k-color-divider)";
  const outline = selected ? ";box-shadow:0 0 0 2px var(--k-color-primary,#1677ff)" : "";
  return `${palette};border-radius:6px;padding:7px 12px;cursor:pointer;min-height:34px;display:inline-flex;align-items:center;justify-content:center;font:inherit;width:100%;min-width:0;box-sizing:border-box;overflow:hidden${outline}`;
}
function unknownCount(button) {
  return Object.keys(button.extras).length + Object.keys(button.renderData.extras).length + Object.keys(button.action.extras).length + Object.keys(button.action.permission.extras).length;
}
var KeyboardEditor = defineComponent({
  name: "KeyboardEditor",
  props: {
    /** 当前键盘 JSON 文本；由父组件持有，保存与脏检查都基于它。 */
    modelValue: { type: String, required: true },
    /** 该字段的内置默认键盘，「插入内置默认按钮」从这里取。 */
    defaultKeyboard: { type: String, default: "" }
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const view = ref("canvas");
    const document2 = ref(emptyKeyboardDocument());
    const sourceText = ref("");
    const sourceError = ref("");
    const selected = ref(null);
    let lastPushed = props.modelValue;
    function selectionOf(rowIndex, buttonIndex) {
      return selected.value?.row === rowIndex && selected.value?.button === buttonIndex;
    }
    function normalizeSelection() {
      if (!selected.value) return;
      const row = document2.value.rows[selected.value.row];
      if (!row || !row.buttons[selected.value.button]) selected.value = null;
    }
    function loadText(value) {
      const result = parseKeyboardDocument(value);
      if (result.ok) {
        document2.value = result.document;
        sourceText.value = serializeKeyboardDocument(result.document);
        sourceError.value = "";
        view.value = "canvas";
        normalizeSelection();
      } else {
        sourceText.value = value;
        sourceError.value = result.error;
        view.value = "source";
      }
    }
    lastPushed = props.modelValue;
    loadText(props.modelValue);
    watch(() => props.modelValue, (value) => {
      if (value === lastPushed) return;
      loadText(value);
    });
    function push() {
      const text = serializeKeyboardDocument(document2.value);
      lastPushed = text;
      sourceText.value = text;
      sourceError.value = "";
      emit("update:modelValue", text);
    }
    function onSourceInput(value) {
      sourceText.value = value;
      lastPushed = value;
      emit("update:modelValue", value);
      const result = parseKeyboardDocument(value);
      if (result.ok) {
        document2.value = result.document;
        sourceError.value = "";
        normalizeSelection();
      } else {
        sourceError.value = result.error;
      }
    }
    function switchView(next) {
      if (next === view.value) return;
      if (next === "canvas" && sourceError.value) {
        message.warning("源码里的 JSON 有错误，先修正后再切回画布。");
        return;
      }
      if (next === "canvas") {
        push();
      } else {
        sourceText.value = serializeKeyboardDocument(document2.value);
        sourceError.value = "";
      }
      view.value = next;
    }
    function insertDefault() {
      if (!props.defaultKeyboard) return;
      if (view.value === "source" && sourceError.value) {
        message.warning("源码里的 JSON 有错误，先修正后再插入默认按钮。");
        return;
      }
      const result = parseKeyboardDocument(props.defaultKeyboard);
      if (!result.ok) return;
      const firstRow = document2.value.rows.length;
      document2.value.rows.push(...result.document.rows);
      const firstButtonRow = result.document.rows.findIndex((row) => row.buttons.length > 0);
      selected.value = firstButtonRow >= 0 ? { row: firstRow + firstButtonRow, button: 0 } : null;
      push();
    }
    function addRow() {
      document2.value.rows.push(emptyKeyboardRow());
      selected.value = null;
      push();
    }
    function removeRow(index) {
      const rows = document2.value.rows;
      if (index < 0 || index >= rows.length) return;
      rows.splice(index, 1);
      if (selected.value?.row === index) selected.value = null;
      else if (selected.value && selected.value.row > index) selected.value.row -= 1;
      normalizeSelection();
      push();
    }
    function moveRow(index, delta) {
      const rows = document2.value.rows;
      const target = index + delta;
      if (target < 0 || target >= rows.length) return;
      const [row] = rows.splice(index, 1);
      rows.splice(target, 0, row);
      if (selected.value) {
        if (selected.value.row === index) selected.value.row = target;
        else if (index < selected.value.row && target >= selected.value.row) selected.value.row -= 1;
        else if (index > selected.value.row && target <= selected.value.row) selected.value.row += 1;
      }
      normalizeSelection();
      push();
    }
    function addButton(row, rowIndex) {
      row.buttons.push(emptyKeyboardButton());
      selected.value = { row: rowIndex, button: row.buttons.length - 1 };
      push();
    }
    function removeButton(rowIndex, buttonIndex) {
      const row = document2.value.rows[rowIndex];
      if (!row || buttonIndex < 0 || buttonIndex >= row.buttons.length) return;
      row.buttons.splice(buttonIndex, 1);
      if (selected.value?.row === rowIndex) {
        if (selected.value.button === buttonIndex) selected.value = null;
        else if (selected.value.button > buttonIndex) selected.value.button -= 1;
      }
      normalizeSelection();
      push();
    }
    function moveButton(rowIndex, buttonIndex, delta) {
      const row = document2.value.rows[rowIndex];
      if (!row) return;
      const target = buttonIndex + delta;
      if (target < 0 || target >= row.buttons.length) return;
      const [button] = row.buttons.splice(buttonIndex, 1);
      row.buttons.splice(target, 0, button);
      if (selected.value?.row === rowIndex) {
        if (selected.value.button === buttonIndex) selected.value.button = target;
        else if (buttonIndex < selected.value.button && target >= selected.value.button) selected.value.button -= 1;
        else if (buttonIndex > selected.value.button && target <= selected.value.button) selected.value.button += 1;
      }
      normalizeSelection();
      push();
    }
    const viewButton = (target, text) => h(el("el-button"), {
      size: "small",
      type: view.value === target ? "primary" : "default",
      onClick: () => switchView(target)
    }, () => text);
    const iconButton = (text, title, disabled, onClick) => h(el("el-button"), { size: "small", text: true, title, disabled, onClick }, () => text);
    function renderEditCard(button, rowIndex, buttonIndex) {
      const kind = keyboardButtonKind(button.action.type);
      const callbackMode = callbackDataMode(button.action.data ?? "");
      const callbackContent = callbackDataContent(button.action.data ?? "", callbackMode);
      const permissionType = button.action.permission.type;
      const kept = unknownCount(button);
      const dataControl = kind === "callback" ? h("div", [
        field("回调数据", h(el("el-radio-group"), {
          modelValue: callbackMode,
          size: "small",
          "onUpdate:modelValue": (value) => {
            button.action.data = withCallbackData(value, callbackContent);
            push();
          }
        }, () => CALLBACK_MODE_ENTRIES.map((entry) => h(el("el-radio-button"), { key: entry.value, value: entry.value }, () => entry.label)))),
        field(
          callbackMode === "command" ? "action.data（指令）" : "action.data（内容）",
          callbackMode === "command" ? textControl(callbackContent, (value) => {
            button.action.data = withCallbackData(callbackMode, value);
            push();
          }, { placeholder: "/帮助菜单" }) : textareaControl(callbackContent, (value) => {
            button.action.data = withCallbackData(callbackMode, value);
            push();
          }, 3, "支持 {userId}、{guildId} 等按钮变量")
        )
      ]) : field(
        kind === "link" ? "action.data（链接）" : "action.data（指令）",
        textareaControl(
          button.action.data ?? "",
          (value) => {
            button.action.data = value;
            push();
          },
          2,
          kind === "link" ? "https://example.com" : "/帮助菜单"
        )
      );
      const permissionLists = permissionType === 0 || permissionType === 3 || Boolean(button.action.permission.specifyUserIds) || Boolean(button.action.permission.specifyRoleIds) ? h("div", { style: fullGridStyle }, [
        field("action.permission.specify_user_ids（每行一个）", textareaControl(
          button.action.permission.specifyUserIds,
          (value) => {
            button.action.permission.specifyUserIds = value;
            push();
          }
        )),
        field("action.permission.specify_role_ids（每行一个）", textareaControl(
          button.action.permission.specifyRoleIds,
          (value) => {
            button.action.permission.specifyRoleIds = value;
            push();
          }
        ))
      ]) : null;
      const advanced = h("details", { style: "margin-top:4px" }, [
        h("summary", { style: `${smallLabelStyle};cursor:pointer` }, kept ? `高级（保留 ${kept} 个未暴露字段）` : "高级"),
        h("div", { style: `${gridStyle};margin-top:8px` }, [
          field("action.anchor", numberControl(button.action.anchor, (value) => {
            button.action.anchor = value;
            push();
          })),
          field("action.click_limit", numberControl(button.action.clickLimit, (value) => {
            button.action.clickLimit = value;
            push();
          })),
          field("action.at_bot_show_channel_list", optionalSelect(
            triStateValue(button.action.atBotShowChannelList),
            TRI_STATE_ENTRIES,
            (value) => {
              button.action.atBotShowChannelList = parseTriState(value);
              push();
            }
          )),
          field("action.unsupport_tips", textControl(button.action.unsupportTips, (value) => {
            button.action.unsupportTips = value;
            push();
          }))
        ]),
        kept ? h("div", { style: `${hintStyle};margin-top:6px` }, "表单没暴露的键会在保存与往返中原样保留。") : null
      ]);
      return h("div", { style: editCardStyle }, [
        h("div", { style: inlineStyle }, [
          h("span", { style: smallLabelStyle }, `按钮 ${rowIndex + 1}-${buttonIndex + 1}`),
          h("div", { style: "flex:1" }),
          iconButton("↑", "上移按钮", buttonIndex === 0, () => moveButton(rowIndex, buttonIndex, -1)),
          iconButton("↓", "下移按钮", buttonIndex === (document2.value.rows[rowIndex]?.buttons.length ?? 1) - 1, () => moveButton(rowIndex, buttonIndex, 1)),
          iconButton("删除", "删除按钮", false, () => removeButton(rowIndex, buttonIndex))
        ]),
        h("div", { style: gridStyle }, [
          field("id（留空用 行-列）", textControl(button.id, (value) => {
            button.id = value;
            push();
          }, { placeholder: `${rowIndex}-${buttonIndex}` })),
          field("render_data.label", textControl(button.renderData.label ?? "", (value) => {
            button.renderData.label = value;
            push();
          })),
          field("render_data.visited_label", textControl(button.renderData.visitedLabel, (value) => {
            button.renderData.visitedLabel = value;
            push();
          })),
          field("render_data.style", numberControl(button.renderData.style, (value) => {
            button.renderData.style = value;
            push();
          }))
        ]),
        field("按钮类型", h(el("el-radio-group"), {
          modelValue: kind,
          size: "small",
          "onUpdate:modelValue": (value) => {
            button.action.type = keyboardActionType(value);
            push();
          }
        }, () => BUTTON_KIND_ENTRIES.map((entry) => h(el("el-radio-button"), { key: entry.value, value: entry.value }, () => entry.label)))),
        h("div", { style: gridStyle }, [
          field("action.permission.type", optionalSelect(
            permissionType === void 0 ? void 0 : String(permissionType),
            PERMISSION_TYPE_ENTRIES,
            (value) => {
              button.action.permission.type = value === void 0 ? void 0 : Number(value);
              push();
            }
          )),
          field("action.enter", optionalSelect(
            triStateValue(button.action.enter),
            TRI_STATE_ENTRIES,
            (value) => {
              button.action.enter = parseTriState(value);
              push();
            }
          )),
          field("action.reply", optionalSelect(
            triStateValue(button.action.reply),
            TRI_STATE_ENTRIES,
            (value) => {
              button.action.reply = parseTriState(value);
              push();
            }
          ))
        ]),
        permissionLists,
        dataControl,
        advanced
      ]);
    }
    function renderCanvasButton(button, rowIndex, buttonIndex) {
      const isSelected = selectionOf(rowIndex, buttonIndex);
      const label = (button.renderData.label ?? "").trim() || "未命名按钮";
      const kindLabel = BUTTON_KIND_ENTRIES.find((entry) => entry.value === keyboardButtonKind(button.action.type))?.label ?? "按钮";
      return h("button", {
        key: `${rowIndex}-${buttonIndex}`,
        type: "button",
        title: `${label} · ${kindLabel}`,
        style: buttonCanvasStyle(button.renderData.style, isSelected),
        onClick: () => {
          selected.value = { row: rowIndex, button: buttonIndex };
        }
      }, [
        h("span", { style: "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" }, label)
      ]);
    }
    function renderRow(row, rowIndex) {
      const selectedButton = selected.value?.row === rowIndex ? selected.value.button : -1;
      const children = [
        h("div", { style: inlineStyle }, [
          h("span", { style: smallLabelStyle }, `第 ${rowIndex + 1} 行`),
          h("span", { style: hintStyle }, row.buttons.length ? `${row.buttons.length} 个按钮` : "空行"),
          h("div", { style: "flex:1" }),
          iconButton("↑", "上移整行", rowIndex === 0, () => moveRow(rowIndex, -1)),
          iconButton("↓", "下移整行", rowIndex === document2.value.rows.length - 1, () => moveRow(rowIndex, 1)),
          iconButton("删除行", "删除整行", false, () => removeRow(rowIndex)),
          h(el("el-button"), { size: "small", type: "primary", text: true, onClick: () => addButton(row, rowIndex) }, () => "添加按钮")
        ])
      ];
      if (row.buttons.length) {
        for (let start = 0; start < row.buttons.length; start += CANVAS_BUTTONS_PER_LINE) {
          const line = row.buttons.slice(start, start + CANVAS_BUTTONS_PER_LINE);
          children.push(h(
            "div",
            { style: canvasLineStyle(line.length), key: `line-${start}` },
            line.map((button, offset) => renderCanvasButton(button, rowIndex, start + offset))
          ));
          if (selectedButton >= start && selectedButton < start + line.length) {
            children.push(renderEditCard(row.buttons[selectedButton], rowIndex, selectedButton));
          }
        }
      } else {
        children.push(h("div", { style: hintStyle }, "这一行还没有按钮，发送时会忽略空行。点击右上角「添加按钮」开始。"));
      }
      return h("div", { style: rowBoxStyle, key: rowIndex }, children);
    }
    function renderCanvas() {
      const content = [];
      if (!document2.value.rows.length) {
        content.push(h("div", { style: emptyStyle }, [
          h("strong", "当前键盘不显示按钮"),
          h("span", {}, '空字符串、{ "rows": [] } 与字段的「置空」态等价。')
        ]));
      } else {
        document2.value.rows.forEach((row, rowIndex) => content.push(renderRow(row, rowIndex)));
      }
      if (document2.value.rows.length && keyboardDocumentIsEmpty(document2.value)) {
        content.push(h("div", { style: hintStyle }, "这些行里还没有按钮，保存后与空键盘等价。"));
      }
      content.push(h("div", { style: inlineStyle }, [
        h(el("el-button"), { size: "small", onClick: addRow }, () => "添加行")
      ]));
      return content;
    }
    function renderSource() {
      return [
        textareaControl(sourceText.value, onSourceInput, 18, '{ "rows": [] }'),
        sourceError.value ? h("div", { style: errorStyle }, sourceError.value) : h("div", { style: hintStyle }, "合法 JSON 会实时同步到画布；点「画布」查看按钮布局。")
      ];
    }
    return () => h("div", { style: rootStyle }, [
      h("div", { style: toolbarStyle }, [
        viewButton("canvas", "画布"),
        viewButton("source", "源码"),
        h("div", { style: "flex:1" }),
        h(el("el-button"), {
          size: "small",
          disabled: !props.defaultKeyboard,
          onClick: insertDefault
        }, () => "插入内置默认按钮")
      ]),
      view.value === "canvas" ? renderCanvas() : renderSource()
    ]);
  }
});

// client/app.ts
var el2 = (name) => resolveComponent2(name);
var DEDUPE_PAGE_SIZE = 200;
var PANEL_NAME = "入群欢迎管理";
var DETAIL_TABS = [
  { key: "welcome", label: "入群" },
  { key: "leave", label: "离群" },
  { key: "receipt", label: "开关回执" }
];
function filterToEnabled(filter) {
  if (filter === "enabled") return true;
  if (filter === "disabled") return false;
  return void 0;
}
var TAB_GROUP_TITLE = {
  welcome: "入群",
  leave: "离群",
  receipt: "开关回执"
};
function contentFieldsOf(tab) {
  const group = FIELD_GROUPS.find((item) => item.title === TAB_GROUP_TITLE[tab]);
  return group ? group.fields.filter((field2) => field2.kind !== "switch") : [];
}
function switchFieldOf(key) {
  for (const group of FIELD_GROUPS) {
    for (const field2 of group.fields) {
      if (field2.kind === "switch" && field2.key === key) return field2;
    }
  }
  return null;
}
function fieldsForTab(tab, sentinel) {
  const fields = contentFieldsOf(tab);
  const toggle = !sentinel || tab === "receipt" ? null : switchFieldOf(tab === "welcome" ? "welcomeEnabled" : "leaveEnabled");
  return toggle ? [toggle, ...fields] : fields;
}
var PANEL_STYLE_ID = "wm-panel-style";
var PANEL_STYLE = `
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
`;
function injectPanelStyle() {
  if (document.getElementById(PANEL_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PANEL_STYLE_ID;
  style.textContent = PANEL_STYLE;
  document.head.appendChild(style);
}
var fieldLabelStyle = "font-size:13px;font-weight:600;color:var(--k-text-dark)";
var fieldErrorStyle = "display:block;font-size:12px;color:var(--k-color-danger);margin-top:4px";
var monoInputStyle = "font-family:var(--font-family-code);font-size:12px;line-height:1.5";
var toolbarStyle2 = "display:flex;align-items:center;gap:8px;flex-wrap:wrap";
var detailPaneStyle = "flex:1.4;min-width:280px;display:flex;flex-direction:column";
function errorText(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
function formatTime(time) {
  if (!time) return "—";
  return new Date(time).toLocaleString("zh-CN", { hour12: false });
}
var app_default = defineComponent2({
  name: "WelcomeMessageGroupPanel",
  setup() {
    injectPanelStyle();
    const activeTab = ref2("groups");
    const detailTab = ref2("welcome");
    const stats = ref2(null);
    const list = ref2(null);
    const loading = ref2(false);
    const saving = ref2(false);
    const checking = ref2(false);
    const migrating = ref2(false);
    const query = reactive({ filter: "all", search: "", page: 1, pageSize: 20 });
    const searchInput = ref2("");
    const selectedId = ref2(null);
    const editing = ref2(null);
    const editingRow = ref2(null);
    const editors = reactive({});
    const errors = reactive({});
    let globalRow = null;
    let lastGroupId = null;
    async function fetchGlobalRow() {
      try {
        const result = await fetchRowById("*");
        globalRow = result?.sentinel ? result : null;
      } catch {
      }
      return globalRow;
    }
    async function fetchRowById(id) {
      const result = await fetchGroups({ search: id, page: 1, pageSize: DEDUPE_PAGE_SIZE });
      return findExactRow(result.rows, id) ?? null;
    }
    const groupRows = () => (list.value?.rows ?? []).filter((row) => !row.sentinel);
    const groupTotal = () => {
      const search = query.search.trim().toLowerCase();
      const sentinelInResults = (list.value?.rows.some((row) => row.sentinel) ?? false) || !!globalRow && query.filter !== "disabled" && (!search || globalRow.id.toLowerCase().includes(search));
      return Math.max(0, (list.value?.total ?? 0) - (sentinelInResults ? 1 : 0));
    };
    async function refresh() {
      loading.value = true;
      try {
        const [listResult, statsResult] = await Promise.allSettled([
          fetchGroups({
            search: query.search,
            enabled: filterToEnabled(query.filter),
            page: query.page,
            pageSize: query.pageSize
          }),
          fetchStats()
        ]);
        if (listResult.status === "fulfilled") {
          list.value = listResult.value;
          globalRow = listResult.value.rows.find((row) => row.sentinel) ?? globalRow;
        } else {
          message2.error("加载群覆盖列表失败：" + errorText(listResult.reason));
          list.value = null;
        }
        if (statsResult.status === "fulfilled") stats.value = statsResult.value;
        else message2.error("加载统计失败：" + errorText(statsResult.reason));
      } finally {
        loading.value = false;
      }
    }
    function currentState() {
      const current = editing.value;
      return current ? { editing: current, editors } : null;
    }
    function detailDirty() {
      const state = currentState();
      return !!state && hasFormChanges(state, editingRow.value);
    }
    function resetForm(row, id) {
      const state = createFormState(row, id);
      editing.value = state.editing;
      editingRow.value = row;
      for (const key of Object.keys(editors)) delete editors[key];
      Object.assign(editors, state.editors);
      for (const field2 of TEXT_FIELDS) delete errors[field2.key];
    }
    function loadDetail(row, resetTab = false) {
      selectedId.value = row.id;
      if (!row.sentinel) lastGroupId = row.id;
      if (resetTab) detailTab.value = "welcome";
      resetForm(row, row.id);
    }
    function selectAfterReload(id) {
      const row = list.value?.rows.find((item) => item.id === id);
      if (row) loadDetail(row);
      else clearDetail();
    }
    function clearDetail() {
      selectedId.value = null;
      editing.value = null;
      editingRow.value = null;
    }
    async function confirmLeave() {
      if (!detailDirty()) return true;
      try {
        await messageBox.confirm(FORM_CHANGES_MESSAGE, "未保存的改动", {
          type: "warning",
          confirmButtonText: "放弃改动",
          cancelButtonText: "留在详情"
        });
      } catch {
        return false;
      }
      return true;
    }
    async function switchTo(row) {
      if (row.id === selectedId.value) return;
      if (!await confirmLeave()) return;
      loadDetail(row, true);
    }
    async function openGlobalDetail() {
      const row = globalRow ?? await fetchGlobalRow();
      if (row) {
        loadDetail(row, true);
      } else {
        clearDetail();
        message2.warning("暂时读不到全局默认行，请点「刷新」重试。");
      }
    }
    function restoreGroupDetail() {
      if (editing.value && !editing.value.sentinel) return;
      const row = lastGroupId ? list.value?.rows.find((item) => item.id === lastGroupId) : void 0;
      if (row) loadDetail(row, true);
      else clearDetail();
    }
    async function switchTab(tab) {
      if (tab === activeTab.value) return;
      if (!await confirmLeave()) return;
      activeTab.value = tab;
      if (tab === "global") await openGlobalDetail();
      else restoreGroupDetail();
    }
    function onFilterChange(filter) {
      query.filter = filter;
      query.page = 1;
      void refresh();
    }
    async function openCreate() {
      let id;
      try {
        const { value } = await messageBox.prompt("填写群 OpenID（不是普通 QQ 群号）。", "新增群覆盖", {
          type: "info",
          confirmButtonText: "开始编辑草稿",
          cancelButtonText: "取消",
          inputPlaceholder: "QQ 群 OpenID",
          inputPattern: /\S/,
          inputErrorMessage: "群 OpenID 不能为空。"
        });
        id = value.trim();
      } catch {
        return;
      }
      checking.value = true;
      try {
        const hit = await fetchRowById(id);
        if (hit) {
          message2.warning("数据库里已有这个群的记录，请直接编辑它。");
          await switchTo(hit);
          return;
        }
      } catch (error) {
        message2.error("检查群 OpenID 是否已存在失败：" + errorText(error));
        return;
      } finally {
        checking.value = false;
      }
      if (!await confirmLeave()) return;
      selectedId.value = id;
      detailTab.value = "welcome";
      resetForm(null, id);
    }
    function validateKeyboardFields() {
      const found = collectKeyboardErrors(editors);
      for (const field2 of TEXT_FIELDS) {
        if (!field2.keyboard) continue;
        if (found[field2.key]) errors[field2.key] = found[field2.key];
        else delete errors[field2.key];
      }
      return !Object.keys(found).length;
    }
    function tabOfField(key) {
      const sentinel = editing.value?.sentinel ?? false;
      for (const tab of DETAIL_TABS) {
        if (fieldsForTab(tab.key, sentinel).some((field2) => field2.key === key)) return tab.key;
      }
      return "welcome";
    }
    async function focusFirstError() {
      const field2 = TEXT_FIELDS.find((item) => item.keyboard && errors[item.key]);
      if (!field2) return;
      detailTab.value = tabOfField(field2.key);
      await nextTick();
      const anchor = document.getElementById(`wm-field-${field2.key}`);
      anchor?.scrollIntoView({ behavior: "smooth", block: "center" });
      anchor?.querySelector("textarea")?.focus();
    }
    async function save() {
      const state = currentState();
      if (!state) return;
      if (!validateKeyboardFields()) {
        message2.error("键盘 JSON 有格式错误，请修正后再保存。");
        void focusFirstError();
        return;
      }
      const input = collectSaveInput(state, editingRow.value);
      if (!input) {
        message2.info("详情没有需要保存的改动。");
        return;
      }
      saving.value = true;
      try {
        await updateGroup(input);
        const creating = !editingRow.value;
        message2.success(state.editing.sentinel ? "全局默认已保存" : creating ? "群覆盖已创建" : "群覆盖已保存");
        if (state.editing.sentinel) void fetchGlobalRow();
        if (creating) {
          searchInput.value = state.editing.id;
          query.search = state.editing.id;
          query.filter = "all";
          query.page = 1;
        }
        await refresh();
        const row = list.value?.rows.find((item) => item.id === state.editing.id);
        if (row) {
          loadDetail(row);
        } else {
          editingRow.value = applySavedInput(input, { id: state.editing.id, sentinel: state.editing.sentinel });
        }
      } catch (error) {
        message2.error("保存失败：" + errorText(error));
      } finally {
        saving.value = false;
      }
    }
    async function toggleEnabled(row, enabled) {
      try {
        await updateGroup({ id: row.id, enabled });
        message2.success(enabled ? "已开启本群通知" : "已关闭本群通知");
      } catch (error) {
        message2.error("保存失败：" + errorText(error));
      }
      await refresh();
      if (selectedId.value === row.id && !detailDirty()) selectAfterReload(row.id);
    }
    async function removeRow() {
      const row = editingRow.value;
      if (!row || row.sentinel) return;
      try {
        await messageBox.confirm(
          `确认删除群 ${row.id} 的覆盖记录吗？删除后该群回到继承全局默认的状态。`,
          "删除群覆盖",
          { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" }
        );
      } catch {
        return;
      }
      try {
        await deleteGroup(row.id);
        message2.success("已删除群覆盖");
        if (selectedId.value === row.id) {
          clearDetail();
          lastGroupId = null;
        }
        await refresh();
      } catch (error) {
        message2.error("删除失败：" + errorText(error));
      }
    }
    async function migrate() {
      migrating.value = true;
      try {
        const preview = await migrateGroups({ dryRun: true });
        if (!preview.overwritten && !preview.written) {
          message2.info("旧配置里没有可迁移的群覆盖。");
          return;
        }
        try {
          await messageBox.confirm(
            `本次迁移将覆盖 ${preview.overwritten} 行、新建 ${preview.written} 行，且不会修改配置文件。确认迁移吗？`,
            "迁移旧配置",
            { type: "warning", confirmButtonText: "迁移", cancelButtonText: "取消" }
          );
        } catch {
          return;
        }
        const result = await migrateGroups();
        message2.success(`迁移完成：覆盖 ${result.overwritten} 行，新建 ${result.written} 行。`);
        await refresh();
        if (selectedId.value && !detailDirty()) selectAfterReload(selectedId.value);
      } catch (error) {
        message2.error("迁移旧配置失败：" + errorText(error));
      } finally {
        migrating.value = false;
      }
    }
    function applySearch() {
      query.search = searchInput.value.trim();
      query.page = 1;
      void refresh();
    }
    onMounted(() => {
      void refresh();
      void fetchGlobalRow();
    });
    const renderFieldLabel = (text) => h2("span", { style: fieldLabelStyle }, text);
    const inheritedPlaceholder = (field2) => editing.value?.sentinel ? resolveInheritedValue(null, field2.key, true) : resolveInheritedValue(globalRow, field2.key, false);
    const nonePlaceholder = (field2) => field2.keyboard ? "该群不显示按钮" : "该群不发送这条消息";
    const renderTextField = (field2) => {
      const editor = editors[field2.key];
      const inputStyle = field2.keyboard ? monoInputStyle : void 0;
      return h2(el2("el-form-item"), { key: field2.key, id: `wm-field-${field2.key}` }, {
        label: () => renderFieldLabel(field2.label),
        default: () => [
          // 三态 tab 栏：宽度随内容、左对齐，位于字段标签下方、输入框上方（issue #18）。
          h2(el2("el-radio-group"), {
            modelValue: editor.mode,
            "onUpdate:modelValue": (value) => {
              editor.mode = value;
              if (field2.keyboard) validateKeyboardFields();
            },
            size: "small",
            style: "margin-bottom:8px"
          }, () => [
            h2(el2("el-radio-button"), { value: "inherit" }, () => editing.value?.sentinel ? "内置默认" : "继承全局"),
            h2(el2("el-radio-button"), { value: "override" }, () => "覆盖"),
            h2(el2("el-radio-button"), { value: "none" }, () => "置空")
          ]),
          editor.mode === "override" ? field2.keyboard ? h2(KeyboardEditor, {
            key: `${editing.value?.id ?? "draft"}-${field2.key}`,
            modelValue: editor.value,
            defaultKeyboard: DEFAULT_KEYBOARDS[field2.key] ?? "",
            "onUpdate:modelValue": (value) => {
              editor.value = value;
              validateKeyboardFields();
            }
          }) : h2(el2("el-input"), {
            modelValue: editor.value,
            "onUpdate:modelValue": (value) => {
              editor.value = value;
            },
            type: "textarea",
            rows: field2.rows,
            placeholder: ""
          }) : h2(el2("el-input"), {
            modelValue: "",
            type: "textarea",
            rows: field2.rows,
            disabled: true,
            inputStyle,
            placeholder: editor.mode === "none" ? nonePlaceholder(field2) : inheritedPlaceholder(field2)
          }),
          errors[field2.key] ? h2("div", { style: fieldErrorStyle }, errors[field2.key]) : null
        ]
      });
    };
    const renderSwitch = (text, modelValue, onChange) => h2(el2("el-form-item"), { key: text }, {
      label: () => renderFieldLabel(text),
      default: () => h2(el2("el-switch"), { modelValue, "onUpdate:modelValue": onChange })
    });
    const renderDetailField = (field2) => {
      if (field2.kind === "switch") {
        return renderSwitch(field2.label, editing.value?.[field2.key] ?? true, (value) => {
          if (editing.value) editing.value[field2.key] = value;
        });
      }
      return renderTextField(field2);
    };
    const renderDetailCard = () => {
      const current = editing.value;
      if (!current) return null;
      const dirty = detailDirty();
      return h2(el2("k-card"), { class: "wm-detail-card" }, {
        header: () => [
          current.sentinel ? h2(el2("el-tag"), { type: "warning", size: "small" }, () => "全局默认") : h2("code", { class: "wm-detail-id" }, current.id),
          editingRow.value ? null : h2(el2("el-tag"), { type: "warning", size: "small" }, () => "未保存草稿"),
          dirty ? h2(el2("el-tag"), { size: "small" }, () => "有未保存改动") : null,
          // 群行只有一个总开关，放卡头；哨兵的入群 / 离群开关各归对应内部页签
          current.sentinel ? null : h2("div", { style: "flex:1" }),
          current.sentinel ? null : h2("div", { style: "display:flex;align-items:center;gap:6px" }, [
            h2("span", { style: "font-size:13px;color:var(--k-text-normal)" }, "本群通知开关"),
            h2(el2("el-switch"), {
              modelValue: current.enabled,
              "onUpdate:modelValue": (value) => {
                current.enabled = value;
              }
            })
          ])
        ],
        default: () => h2(el2("el-form"), { labelPosition: "top" }, () => h2(el2("el-tabs"), {
          modelValue: detailTab.value,
          "onUpdate:modelValue": (value) => {
            detailTab.value = value;
          }
        }, () => DETAIL_TABS.map((tab) => h2(el2("el-tab-pane"), {
          key: tab.key,
          label: tab.label,
          name: tab.key
        }, () => fieldsForTab(tab.key, current.sentinel).map(renderDetailField))))),
        footer: () => [
          editingRow.value && !current.sentinel ? h2(el2("el-button"), {
            size: "small",
            type: "danger",
            plain: true,
            disabled: saving.value,
            onClick: () => {
              void removeRow();
            }
          }, () => "删除群覆盖") : null,
          h2("div", { style: "flex:1" }),
          h2("span", { class: "wm-detail-footer-hint" }, dirty ? "未保存的改动不会自动写入。" : "与列表数据一致。"),
          h2(el2("el-button"), {
            size: "small",
            type: "primary",
            loading: saving.value,
            disabled: !dirty,
            onClick: () => {
              void save();
            }
          }, () => "保存")
        ]
      });
    };
    const renderDetailPane = () => h2("div", { style: detailPaneStyle }, [
      editing.value ? renderDetailCard() : h2(el2("k-empty"), { style: "flex:1" }, () => activeTab.value === "global" ? "暂时读不到全局默认行，请点「刷新」重试。" : "从左侧选择一个群查看详情；点「新增群覆盖」可开始编辑草稿。")
    ]);
    const renderListPane = () => {
      const rows = groupRows();
      const total = groupTotal();
      return h2("div", { style: "flex:1;min-width:280px;display:flex;flex-direction:column;gap:8px" }, [
        h2(el2("el-table"), {
          data: rows,
          size: "small",
          rowKey: "id",
          highlightCurrentRow: true,
          currentRowKey: selectedId.value ?? void 0,
          emptyText: loading.value ? "加载中…" : "数据库里还没有群覆盖记录",
          onRowClick: (row) => {
            void switchTo(row);
          },
          style: { width: "100%" }
        }, () => [
          h2(el2("el-table-column"), { label: "群 OpenID", minWidth: 150, showOverflowTooltip: true }, {
            default: ({ row }) => h2("code", { style: "font-size:13px" }, row.id)
          }),
          // 覆盖字段 chips：无覆盖时显示继承提示（哨兵行不进列表，这里都是群行）
          h2(el2("el-table-column"), { label: "覆盖摘要", minWidth: 200 }, {
            default: ({ row }) => h2(
              "div",
              { style: "display:flex;flex-wrap:wrap;gap:4px" },
              overrideChips(row).map((chip) => h2(el2("el-tag"), {
                key: chip.fieldKey || chip.text,
                size: "small",
                type: "info",
                effect: "plain"
              }, () => chip.text))
            )
          }),
          h2(el2("el-table-column"), { label: "通知开关", width: 96, align: "center" }, {
            default: ({ row }) => h2(el2("el-switch"), {
              modelValue: row.enabled,
              "onUpdate:modelValue": (value) => {
                void toggleEnabled(row, value);
              },
              onClick: (event) => event.stopPropagation()
            })
          }),
          h2(el2("el-table-column"), { label: "更新时间", width: 120 }, {
            default: ({ row }) => h2("span", { style: "font-size:12px;color:var(--k-text-light)" }, formatTime(row.updatedAt))
          })
        ]),
        total > query.pageSize ? h2(el2("el-pagination"), {
          layout: "total, prev, pager, next",
          small: true,
          total,
          currentPage: query.page,
          pageSize: query.pageSize,
          style: { justifyContent: "flex-end" },
          "onCurrentChange": (page) => {
            query.page = page;
            void refresh();
          }
        }) : null
      ]);
    };
    const statItem = (label, value, color, onClick) => h2("div", {
      class: "wm-stat-item",
      style: onClick ? "cursor:pointer" : void 0,
      onClick
    }, [
      h2("div", { class: "wm-stat-value", style: `color:${color}` }, value),
      h2("div", { class: "wm-stat-label" }, label)
    ]);
    const renderStatsBar = () => {
      const st = stats.value;
      const num = (value) => value === void 0 ? "—" : String(value);
      const toggle = (value) => value === void 0 ? "—" : value ? "已开启" : "已关闭";
      const toggleColor = (value) => value === false ? "var(--k-color-warning)" : "var(--k-color-success)";
      const openGlobal = () => {
        void switchTab("global");
      };
      const numColor = "var(--k-text-dark)";
      return h2("div", { class: "wm-stat-bar" }, [
        statItem("群覆盖数", num(st?.total), numColor),
        // 已开启 / 已关闭只统计数据库里已有的覆盖行：适配器无法枚举机器人所在的群
        statItem("已开启（已有覆盖行）", num(st?.enabled), "var(--k-color-success)"),
        statItem("已关闭（已有覆盖行）", num(st?.disabled), "var(--k-text-light)"),
        statItem("全局入群通知", toggle(st?.welcomeEnabled), toggleColor(st?.welcomeEnabled), openGlobal),
        statItem("全局离群通知", toggle(st?.leaveEnabled), toggleColor(st?.leaveEnabled), openGlobal)
      ]);
    };
    const renderTabRow = () => h2("div", { style: toolbarStyle2 }, [
      h2(el2("el-radio-group"), {
        modelValue: activeTab.value,
        size: "small",
        "onUpdate:modelValue": (value) => {
          void switchTab(value);
        }
      }, () => [
        h2(el2("el-radio-button"), { value: "groups" }, () => "群覆盖"),
        h2(el2("el-radio-button"), { value: "global" }, () => "全局默认")
      ]),
      h2("div", { style: "flex:1" }),
      h2(el2("el-button"), { size: "small", onClick: () => {
        void refresh();
      }, loading: loading.value }, () => "刷新")
    ]);
    const renderFilterRow = () => h2("div", { style: toolbarStyle2 }, [
      h2(el2("el-radio-group"), {
        modelValue: query.filter,
        size: "small",
        "onUpdate:modelValue": (value) => onFilterChange(value)
      }, () => [
        h2(el2("el-radio-button"), { value: "all" }, () => "全部"),
        h2(el2("el-radio-button"), { value: "enabled" }, () => "已开启"),
        h2(el2("el-radio-button"), { value: "disabled" }, () => "已关闭")
      ]),
      h2(el2("el-input"), {
        modelValue: searchInput.value,
        "onUpdate:modelValue": (value) => {
          searchInput.value = value;
        },
        placeholder: "按群 OpenID 搜索",
        clearable: true,
        size: "small",
        style: { width: "220px" },
        onKeyup: (event) => {
          if (event.key === "Enter") applySearch();
        },
        onClear: applySearch
      }),
      h2(el2("el-button"), { size: "small", onClick: applySearch }, () => "搜索"),
      h2("div", { style: "flex:1" }),
      h2(el2("el-button"), { size: "small", type: "primary", onClick: () => {
        void openCreate();
      }, loading: checking.value }, () => "新增群覆盖"),
      h2(el2("el-button"), { size: "small", onClick: () => {
        void migrate();
      }, loading: migrating.value }, () => "迁移旧配置")
    ]);
    return () => {
      return h2(el2("k-layout"), () => h2("div", {
        style: "padding:16px;display:flex;flex-direction:column;gap:12px;height:100%;box-sizing:border-box;overflow-y:auto"
      }, [
        renderStatsBar(),
        renderTabRow(),
        h2("div", { style: "display:flex;flex-direction:column;gap:12px;flex:1;min-width:0" }, [
          activeTab.value === "groups" ? renderFilterRow() : null,
          // 两栏：窄窗由 flex-wrap 纵向堆叠、列表在上；「全局默认」页签只有详情
          h2("div", { style: "display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap" }, [
            activeTab.value === "groups" ? renderListPane() : null,
            renderDetailPane()
          ])
        ])
      ]));
    };
  }
});

// client/index.ts
var GuardedApp = defineComponent3({
  name: "WelcomeMessageGroupPanelGuard",
  setup: () => () => store.user ? h3(app_default) : null
});
var client_default = (ctx) => {
  ctx.page({
    path: "/welcome-message-qq",
    name: PANEL_NAME,
    order: 5,
    // 与面板 RPC 同一门槛：未登录访问会被 plugin-auth 重定向到 /login
    authority: CONSOLE_PANEL_AUTHORITY,
    component: GuardedApp
  });
};
export {
  client_default as default
};
