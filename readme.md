# koishi-plugin-welcome-message-qq

[![npm](https://img.shields.io/npm/v/koishi-plugin-welcome-message-qq?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-welcome-message-qq) [![npm downloads](https://img.shields.io/npm/dm/koishi-plugin-welcome-message-qq)](https://www.npmjs.com/package/koishi-plugin-welcome-message-qq)

> [!NOTE]
> 本项目由各种 AI 工具开发，存在一定的问题，见谅，如有更好的实现欢迎 PR<br>
> 有好的提议欢迎提 ISSUE！

面向 QQ 群的 Koishi 入群欢迎与离群通知插件。成员加入或离开群时，插件按群配置发送 QQ 原生 Markdown 消息，并可附带命令按钮、链接按钮或回调按钮；群级状态保存在数据库里，通过控制台「入群欢迎管理」页维护。

## 安装

在 Koishi 插件市场中搜索并安装：

```text
welcome-message-qq
```

## 运行要求

- Node.js 18 或更高版本。
- Koishi 4.18.7 或兼容版本，并已启用 `database` 服务（例如 `koishi-plugin-database-sqlite`）；缺少数据库插件时本插件不会加载。
-  需使用[adapter-qq-crack](https://github.com/koishi-shangxue-plugins/koishi-plugin-adapter-qq-crack)。
- 适配器需开启接收群成员增加、离开事件的权限。
- 需要 `@koishijs/plugin-console` 才能使用「入群欢迎管理」页；没有控制台时插件仍可运行，但只能依赖默认配置或手动修改数据库。

群标识需填写 **QQ 群 OpenID**，而非普通 QQ 群号。

## 常用命令

| 场景 | 命令示例 |
| --- | --- |
| 关闭当前群通知 | `/welcome-messge-qq.close`、`/关闭入退群消息`、`/关闭欢迎` |
| 开启当前群通知 | `/welcome-messge-qq.enable`、`/开启入退群消息`、`/开启欢迎` |

- 指令只能在 QQ 群聊中使用，私聊或其他平台不会生效。
- 开启与关闭默认需要 Koishi 权限等级 `1`，可通过配置统一调整。

## 支持的事件

| QQ 成员事件 | Koishi 事件 | 插件行为 |
| --- | --- | --- |
| 成员加入群聊 | `guild-member-added` | 发送欢迎消息 |
| 成员离开群聊 | `guild-member-removed` | 发送中性离群消息 |

由于qq开放平台限制，离群通知在未开启主动消息的情况无法发送。

## 全局配置

| 配置项 | 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| 生效范围 | `scope` | 单选 | 全部 QQ 群（推荐） | “全部 QQ 群”会在机器人所在的所有群启用；“仅指定的 QQ 群”只处理数据库里存在覆盖行的群 |
| 时区 | `timeZone` | `string` | `Asia/Shanghai` | `{time}`、`{date}`、`{clock}` 使用的 IANA 时区；非法值无法通过 Schema，运行时也会回退并告警 |
| 开关指令权限等级 | `closeCommandAuthority` | `number` | `1` | 开启/关闭当前群通知指令所需的 Koishi 权限等级 |
| 入群欢迎开关（仅初始化） | `welcomeEnabled` | `boolean` | `true` | 是否发送入群欢迎消息（仅全局默认行） |
| 欢迎消息（仅初始化） | `welcomeMessage` | `string` | `欢迎 {at} 加入群聊！` | 欢迎消息模板，支持多行 |
| 离群通知开关（仅初始化） | `leaveEnabled` | `boolean` | `true` | 是否发送离群消息（仅全局默认行） |
| 离群消息（仅初始化） | `leaveMessage` | `string` | `{at} 已离开群聊。` | 中性的离群消息模板，支持多行 |
| 关闭回执文案（仅初始化） | `closeResponseMessage` | `string` | Markdown 关闭提示 | 默认提示已关闭，并引导点击“重新开启” |
| 关闭回执键盘（仅初始化） | `closeResponseKeyboard` | `string(JSON)` | 内置“重新开启”按钮 | 关闭成功后的自定义 QQ 键盘 |
| 开启回执文案（仅初始化） | `enableResponseMessage` | `string` | Markdown 开启提示 | 默认提示已开启，并引导点击“再次关闭” |
| 开启回执键盘（仅初始化） | `enableResponseKeyboard` | `string(JSON)` | 内置“再次关闭”按钮 | 开启成功后的自定义 QQ 键盘 |
| 欢迎键盘（仅初始化） | `welcomeKeyboard` | `string(JSON)` | 内置“关闭欢迎”按钮 | 填写欢迎消息专用 QQ 键盘 JSON |
| 离群键盘（仅初始化） | `leaveKeyboard` | `string(JSON)` | 内置“关闭欢迎”按钮 | 填写离群消息专用 QQ 键盘 JSON |

## 模板变量

插件只替换下表中的固定占位符，不执行 JavaScript、`eval`、`new Function` 或 `${...}` 表达式。未识别的 `{name}` 保持原样并记录调试日志。

| 占位符 | 消息正文 | 按钮 `action.data` | 值与回退行为 |
| --- | --- | --- | --- |
| `{at}` | 是 | 否 | 生成 `<@成员OpenID>`，通过 QQ Markdown 真正提及本次事件成员 |
| `{userId}` | 是 | 是 | 成员 OpenID |
| `{username}` | 是 | 是 | `event.user.name` → `event.member.nick` → `session.username` → 成员 OpenID |
| `{guildId}` | 是 | 是 | QQ 群 OpenID |
| `{guildName}` | 是 | 是 | 群名称；缺失时回退到群 OpenID |
| `{time}` | 是 | 是 | 事件时间，`YYYY-MM-DD HH:mm:ss` |
| `{date}` | 是 | 是 | 事件日期，`YYYY-MM-DD` |
| `{clock}` | 是 | 是 | 事件时刻，`HH:mm:ss` |
| `{timestamp}` | 是 | 是 | 事件时间的 Unix 秒级时间戳 |
| `{event}` | 是 | 是 | `加入群聊` 或 `离开群聊` |
| `{eventType}` | 是 | 是 | 稳定值 `join` 或 `leave` |
| `{botId}` | 是 | 是 | 当前 QQ 机器人 ID；缺失时为空字符串并记录调试日志 |

时间变量基于 `session.timestamp`，只在时间戳缺失或非法时回退到 `Date.now()` 并告警。模板一律按 Markdown 渲染：只转义模板变量替换出的动态值，`{at}` 在转义后作为受信任的 `<@OpenID>` 片段注入。

按钮命令中请用 `{userId}` 定位成员，不要使用 `{at}`。`${close.command}` 一类文本只有在外部配置系统事先替换时才会变化，本插件会按字面字符串保留。

## 回调按钮配置

`adapter-qq-crack` 会把 QQ 的 `INTERACTION_CREATE` 映射为 Koishi `interaction/button`，并把按钮数据放在 `session.event.button.data`。本插件只处理以下两个前缀，避免误处理其他插件的按钮。

### 点击后回复文本

```json
{
  "id": "welcome-reply",
  "render_data": {
    "label": "查看提示",
    "style": 1
  },
  "action": {
    "type": 1,
    "permission": {
      "type": 2
    },
    "data": "welcome-messge-qq:reply:欢迎加入本群！"
  }
}
```

点击后插件通过当前 `INTERACTION_CREATE event_id` 被动回复 `欢迎加入本群！`。

### 点击后执行 Koishi 指令

```json
{
  "id": "close-welcome",
  "render_data": {
    "label": "关闭欢迎",
    "style": 1
  },
  "action": {
    "type": 1,
    "permission": {
      "type": 1
    },
    "data": "welcome-messge-qq:command:/关闭欢迎"
  }
}
```

`command:` 后可以带或不带开头的 `/`。插件会以点击按钮的用户和群聊会话执行命令，因此 Koishi 的指令权限检查仍然生效。命令必须是单行文本。

回调数据中仍可使用 `{userId}`、`{guildId}`、`{username}`、`{eventType}` 等按钮模板变量，它们会在欢迎消息生成时替换。不要为其他插件的回调使用 `welcome-messge-qq:` 前缀。

不同 QQ 客户端对 Markdown 换行、按钮宽度和样式的显示可能不同，建议至少在手机 QQ 与 Windows QQ 各验证一次。

## 项目结构

```text
welcome-message-qq/
├─ client/            # 控制台页面：群覆盖列表、详情表单与键盘编辑器
├─ docs/
│  ├─ adr/            # 决策记录：配置入库、页面布局、固定 Markdown、键盘画布
│  └─ agents/         # issue 跟踪、triage 标签与领域文档约定
├─ src/
│  ├─ index.ts        # 插件入口、事件处理、指令注册与配置 Schema
│  ├─ button.ts       # 按钮规范化与回调前缀解析
│  ├─ keyboard.ts     # 键盘渲染与校验
│  ├─ store.ts        # 数据库读写与继承解析
│  ├─ model.ts        # 数据库表声明与字段扩展
│  ├─ template.ts     # 模板变量替换与 Markdown 转义
│  ├─ console*.ts     # 控制台服务、权限与表单元数据
│  ├─ defaults.ts     # 内置默认文案与键盘
│  └─ types.ts        # 配置、键盘与事件类型
├─ tests/             # node:test 用例：指令、通知、存储、键盘与控制台
├─ package.json       # npm 与 Koishi 插件元数据
└─ readme.md          # 使用与开发文档
```

## 开发

在 Koishi 工作区根目录克隆并构建：

```powershell
yarn clone https://github.com/KeiMaidDev/koishi-plugin-welcome-message-qq.git
```

## 许可证

MIT
