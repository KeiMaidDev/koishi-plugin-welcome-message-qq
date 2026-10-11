# koishi-plugin-welcome-message-qq

[![npm](https://img.shields.io/npm/v/koishi-plugin-welcome-message-qq?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-welcome-message-qq)

> [!NOTE]
> 本项目由各种 AI 工具开发，存在一定的问题，见谅，如有更好的实现欢迎 PR<br>
> 有好的提议欢迎提 ISSUE！

面向 QQ 群的 Koishi 入群欢迎与离群通知插件。成员加入或离开群时，插件按群配置发送 QQ 原生 Markdown 消息，并可附带命令按钮、链接按钮或回调按钮；群级状态保存在数据库里，通过控制台「入群欢迎管理」页维护。

> 包名与仓库名是 `welcome-message-qq`；插件内部注册名与指令命名空间沿用历史拼写 `welcome-messge-qq`（少一个 a）。文档里出现的 `welcome-messge-qq:` 前缀与 `/welcome-messge-qq.close` 都是实际生效的标识，请勿改写。

## 功能

- 监听 `guild-member-added` 与 `guild-member-removed`，分别发送欢迎消息与中性离群消息。
- 文案、键盘与开关按「群覆盖 → 全局默认 → 内置默认」逐字段生效，群覆盖字段可选继承、覆盖或显式置空。
- 消息一律按 QQ 原生 Markdown 发送，模板里的 Markdown 结构原样保留，只有变量替换出的动态值会被转义。
- 支持 `{at}`、`{username}`、`{guildName}`、`{time}` 等模板变量，并区分加入与离开事件。
- 键盘编辑器提供键盘画布与源码视图，两者双向同步；按钮支持指令、链接、回调三种动作类型，并透传权限、样式等 QQ 原生字段。
- 回调按钮可用 `welcome-messge-qq:reply:` 回复文本，或用 `welcome-messge-qq:command:` 执行 Koishi 指令。
- 群内可用 `/关闭欢迎`、`/开启欢迎` 关闭或恢复当前群的入退群消息，状态写入数据库并长期生效。
- 控制台「入群欢迎管理」页按群 OpenID 搜索、编辑、删除覆盖行，并支持从旧配置 `groups` 一次性迁移。

## 安装

在 Koishi 控制台的插件市场中搜索并安装：

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

> [!WARNING]
> 插件只消费适配器提供的标准 Koishi 事件，不解析 QQ WebSocket 原始数据，也不监听普通聊天消息。除开启/关闭当前群通知的管理指令外，仅监听带 `welcome-messge-qq:` 命名空间的 `interaction/button` 回调；其他插件的回调不会被接管。

## 快速开始

1. 在控制台安装并启用 `adapter-qq-crack`，确认 QQ 机器人已上线。
2. 添加并启用 `welcome-message-qq`。首次启动时，全局配置会被写成数据库里的全局默认行（`id` 为 `*`）；此后数据库是唯一事实来源，插件不再回写配置文件。
3. 先使用默认的 `scope: all` 在测试群验证事件；需要白名单时再改成 `configured`，然后到控制台「入群欢迎管理」页为指定群新建覆盖行。
4. 在「入群欢迎管理」页调整全局默认或群覆盖的文案、键盘与开关。
~~5. 从旧版配置升级时，在页面点击「迁移旧配置」，先看试算出的「将覆盖 / 新建」行数，再确认写入；确认无误后可以从 `koishi.yml` 删掉 `groups`。~~

## 常用命令

| 场景 | 命令示例 |
| --- | --- |
| 关闭当前群通知 | `/welcome-messge-qq.close`、`/关闭入退群消息`、`/关闭欢迎` |
| 开启当前群通知 | `/welcome-messge-qq.enable`、`/开启入退群消息`、`/开启欢迎` |

- 指令只能在 QQ 群聊中使用，私聊或其他平台不会生效。
- 开启与关闭默认都需要 Koishi 权限等级 `1`，可通过 `closeCommandAuthority` 统一调整。
- 一个开关同时管入群与离群两类消息。
- `scope: configured` 下对没有覆盖行的群执行关闭指令不会新建行（该群本来就不发送），指令直接回复当前状态。
- 重复开启或重复关闭会直接回复当前状态，不重复写库。
- 关闭成功后回执默认提供「重新开启」按钮，开启成功后默认提供「再次关闭」按钮，正文与键盘都可以在页面上自定义。

## 支持的事件

| QQ 成员事件 | Koishi 事件 | 插件行为 |
| --- | --- | --- |
| 成员加入群聊 | `guild-member-added` | 发送欢迎消息 |
| 成员离开群聊 | `guild-member-removed` | 发送中性离群消息 |

插件不处理 `guild-member-updated`。由于qq开放平台限制，离群通知在未开启主动消息的情况无法发送。

## 全局配置

`scope`（生效范围）、`ignoreBots`（忽略机器人）、`timeZone`（时区）、`closeCommandAuthority`（开关指令权限等级）每次启动都从配置文件读取；标了「仅初始化」的内容字段只在数据库里还没有全局默认行（`id = *`）时用来创建那一行，之后一律以数据库为准。

| 配置项 | 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| 生效范围 | `scope` | 单选 | 全部 QQ 群（推荐） | “全部 QQ 群”会在机器人所在的所有群启用；“仅指定的 QQ 群”只处理数据库里存在覆盖行的群 |
| 忽略机器人 | `ignoreBots` | `boolean` | `true` | 忽略机器人自身及标记为机器人的成员事件 |
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
| 离群键盘（仅初始化） | `leaveKeyboard` | `string(JSON)` | 内置“关闭欢迎 + 帮助菜单”按钮 | 填写离群消息专用 QQ 键盘 JSON |
| 群配置（已弃用） | `groups` | `GroupConfig[]` | `[]` | 已弃用；不再显示在插件配置页，只在「迁移旧配置」时读取，见下文 |

### 生效范围与优先级

状态只有一张表：`id = *` 的行是全局默认值，其余每行是一个群的覆盖。解析顺序固定为 **群覆盖行 → 全局默认行 → 内置默认值**。

- 内容字段是三态的：行里没有该字段或为 `NULL` 表示继承；空字符串表示显式置空（该消息不发）；有值则覆盖。
- `scope: all`：没有覆盖行的 QQ 群使用全局默认行。
- `scope: configured`：只有数据库里存在覆盖行的群参与发送。
- 覆盖行上的 `enabled: false`：无论全局配置如何，该群的欢迎与离群消息都不发送。
- 群覆盖行不区分入群与离群，只有一个总开关；`welcomeEnabled` / `leaveEnabled` 只在全局默认行上生效。
- 全局默认行不能被删除，它的 `enabled` 恒为开启。

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

时间变量基于 `session.timestamp`，只在时间戳缺失或非法时回退到 `Date.now()` 并告警。模板一律按 Markdown 渲染：只转义模板变量替换出的动态值，管理员写入的 Markdown 结构保持不变；`{at}` 在转义后作为受信任的 `<@OpenID>` 片段注入。

按钮命令中请用 `{userId}` 定位成员，不要使用 `{at}`。`${close.command}` 一类文本只有在外部配置系统事先替换时才会变化，本插件会按字面字符串保留。

## 消息示例

### 不用排版，无按钮

```yaml
# 欢迎消息
welcomeMessage: |-
  欢迎新成员 {username}！
  加入时间：{time}
```

模板一律按 QQ Markdown 渲染，上面这种没有 Markdown 结构的写法照常显示为普通文字。

### 用 Markdown 排版，无按钮

```yaml
# 欢迎消息
welcomeMessage: |-
  # 欢迎 {at}
  > 加入时间：{time}
```

无有效按钮时，插件使用 `h('markdown', rendered)` 发送 QQ 原生 Markdown，正文放在元素子节点中。

### Raw Markdown 与下挂原生按钮

下面是一个包含 `{at}`、`{time}` 和 `action.type: 2` 指令按钮的完整欢迎配置：

```yaml
# 欢迎消息
welcomeMessage: |-
  # 欢迎 {at}
  > 用户：{username}
  > 入群时间：{time}
# 欢迎消息的下挂按钮键盘
welcomeKeyboard: |-
  {
    "rows": [
      {
        "buttons": [
          {
            "render_data": {
              "label": "查看帮助",
              "style": 2
            },
            "action": {
              "type": 2,
              "permission": {
                "type": 2
              },
              "data": "/help {userId}",
              "enter": true,
              "reply": false
            }
          }
        ]
      }
    ]
  }
```

只要至少存在一个有效按钮，插件就发送**单个**元素：

```ts
h('qq:rawmarkdown', {
  markdown: {
    content: rendered,
  },
  keyboard: {
    content: {
      rows: renderedRows,
    },
  },
})
```


## 键盘编辑

欢迎与离群按钮分别由 `welcomeKeyboard`、`leaveKeyboard` 管理，两份开关回执键盘由 `closeResponseKeyboard`、`enableResponseKeyboard` 管理。控制台里这四个字段用 **键盘画布 + 源码视图**编辑：画布按消息在 QQ 群里的行和按钮布局展示，按钮文字取显示文字、按 `render_data.style` 着色；点中按钮会在它下方展开编辑卡。源码视图直接编辑 JSON。两边共用同一份数据：画布改动即时反映到源码，源码里的合法 JSON 也会同步回画布；非法 JSON 会保留原文并给出错误，不破坏画布状态。插件在每次事件中独立解析并创建发送对象，不会共享或串改配置。

画布外层是行（`rows`），行内是按钮，都可以增删与上下移动。点中按钮后，编辑卡覆盖 `id`、`render_data.label`、`render_data.visited_label`、`render_data.style`、按钮类型、`action.permission.type` 与 `specify_user_ids` / `specify_role_ids`、`action.data`、`action.enter`、`action.reply`；`anchor`、`click_limit`、`at_bot_show_channel_list`、`unsupport_tips` 收进编辑卡的「高级」区。按钮类型直接对应 QQ 的动作类型：**指令按钮**（`action.type: 2`）、**链接按钮**（`0`）、**回调按钮**（`1`）；回调按钮的 `action.data` 还可以选回复文本、执行指令或原样填写，前两种由编辑器补上本插件前缀。插件不再把按钮限制为指令按钮或“所有人可点击”，会按 `adapter-qq-crack` 支持的 QQ 原生结构透传以下字段：

- `rows`：键盘行数组；保持配置顺序。空数组表示不显示按钮。
- `buttons`：某一行的按钮数组。空行会被忽略。
- `id`：可选的按钮标识；画布里留空时保存为 `行号-列号`（例如 `0-0`、`1-0`），避免 QQ 因缺少按钮 ID 拒绝或忽略键盘。
- `render_data.label`：显示文字，不能为空。
- `render_data.visited_label`：可选的点击后显示文字。
- `render_data.style`：按钮样式数字，QQ 定义了 `0` 灰色线框、`1` 蓝色线框、`3` 白底红字、`4` 蓝底白字四种；未填写时插件默认 `2`。
- `action.type`：QQ 原生动作类型；`0` 为跳转、`1` 为回调、`2` 为指令。插件不再过滤非 `2` 类型，未填写时为兼容旧配置默认 `2`。
- `action.permission.type`：QQ 原生权限类型；`0` 为指定用户、`1` 为管理员、`2` 为所有人、`3` 为指定身份组。未填写时默认 `2`。
- `action.permission.specify_user_ids` / `specify_role_ids`：指定用户或身份组 OpenID 数组；编辑卡里每行填一个。
- `action.data`：动作数据，不能为空；插件只在这个字段中替换除 `{at}` 外的固定占位符。
- `action.enter`：未填写时默认 `true`。
- `action.reply`：未填写时默认 `false`。
- `action.anchor`、`click_limit`、`at_bot_show_channel_list`、`unsupport_tips`：存在且类型正确时原样透传。

「插入内置默认按钮」把该字段的内置默认键盘追加到当前编辑区，可作为空白键盘的起点。画布没有暴露的键（以及类型不匹配、画布无法表示的已知键）在源码视图与保存往返中原样保留，经过一次画布编辑与保存往返也不会丢内容。源码视图里的内容必须是合法 JSON，顶层为对象；解析失败时保留原文并在字段下方给出错误，画布状态不受影响，修正前也无法切回画布。字段选「置空」、键盘 JSON 为空字符串或 `{ "rows": [] }` 三种情况完全等价：运行时都不显示按钮，不影响正文明文发送。

空行、空按钮、空 `label`、空 `action.data` 或结构残缺的按钮会被局部忽略，不会阻断正文和其他有效按钮发送。`action.type: 1` 的回调仅在 `action.data` 使用本插件命名空间时处理；其他回调继续交给对应插件。`action.type: 2` 的目标 Koishi 命令必须已经注册。按钮字段、动作类型、权限组合是否被 QQ 接受，最终以 QQ 平台校验结果为准。

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

## 入群欢迎管理页

控制台侧栏的「入群欢迎管理」页（`/welcome-message-qq`，需要权限等级 `4`）直接读写数据库里的覆盖行，整页分「群覆盖」与「全局默认」两个 Tab。

- 顶部统计条给出群覆盖数、已开启 / 已关闭的群数与全局的入群 / 离群开关状态。注意「已开启 / 已关闭」只统计数据库里已有的覆盖行：适配器无法枚举机器人所在的群，按 `scope: all` 默认开启、又没有覆盖行的群不计入。
- 「群覆盖」Tab 按群 OpenID 升序分页，支持按 OpenID 片段搜索，以及「全部 / 已开启 / 已关闭」筛选；表格列有群 OpenID、覆盖摘要、通知开关与更新时间，开关可以在行内直接切换。
- 「全局默认」Tab 编辑对所有群生效的那份设置，包括全局入群 / 离群开关。
- 「新增群覆盖」弹出小输入框收集群 OpenID，确认后右侧进入未保存草稿，首次保存才写入数据库；填了已存在的 OpenID 会提示直接编辑该行，放弃草稿不产生任何写入。
- 详情区按「入群 / 离群 / 开关回执」分 Tab，可逐字段设置 `welcomeMessage`、`leaveMessage`、`welcomeKeyboard`、`leaveKeyboard`、`closeResponseMessage`、`closeResponseKeyboard`、`enableResponseMessage`、`enableResponseKeyboard` 八个内容字段，以及群行总开关；每个字段可选「继承 / 覆盖 / 置空」——继承取全局默认（全局默认行取内置默认），覆盖用该群自己的值，置空表示这条消息不发或这份键盘不显示按钮。
- 编辑时只写改动过的字段，不会把该群其它已有内容清空。
- 删除群行后该群回到继承状态；全局默认行不能删除，它的总开关恒为开启，只有它上面的欢迎/离群开关（`welcomeEnabled` / `leaveEnabled`）可以单独调整。
- 「迁移旧配置」把 `koishi.yml` 里 `groups` 的显式字段单向写入数据库，先给出「将覆盖 N 行 / 新建 N 行」的试算结果，确认后才真正写入。迁移不会删除任何已有行，也不会回写配置文件；配置里没写下的字段保持数据库原值。

### 旧配置的 `groups`（已弃用）

`groups` 现在只被上面的「迁移旧配置」读取，插件运行时不再看它：

| 配置项 | 字段 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| 群 OpenID | `guildId` | 是 | QQ 群 OpenID，唯一匹配键，不是普通群号 |
| 群通知开关 | `enabled` | 否 | 设为 `false` 时完全禁用该群；未填写时不改动数据库里已有的开关，新建的行默认开启 |
| 欢迎消息 | `welcomeMessage` | 否 | 覆盖欢迎模板；显式空白会跳过欢迎消息 |
| 欢迎键盘 | `welcomeKeyboard` | 否 | JSON 字符串；留空继承全局欢迎键盘，填写 `{ "rows": [] }` 表示不显示按钮 |
| 离群消息 | `leaveMessage` | 否 | 覆盖离群模板；显式空白会跳过离群消息 |
| 离群键盘 | `leaveKeyboard` | 否 | JSON 字符串；留空继承全局离群键盘，填写 `{ "rows": [] }` 表示不显示按钮 |
| 入群/离群开关 | `welcomeEnabled`、`leaveEnabled` | 否 | 不会迁移：新模型里群行只有一个总开关，请迁移后到页面上按需调整 |
| 消息格式（已删除） | `messageFormat` | 否 | 不会迁移：格式配置已删除，文案与回执固定按 QQ Markdown 发送 |

重复填写同一个 `guildId` 时以最后一项为准。示例：

```yaml
# 生效范围：仅已配置的群
scope: configured
# 群配置列表
groups:
  # 群 OpenID
  - guildId: QQ_GROUP_OPENID_A
    # 群通知开关
    enabled: true
    # 欢迎消息
    welcomeMessage: |-
      欢迎 {at}！
      加入时间：{time}
  - guildId: QQ_GROUP_OPENID_B
    enabled: true
```

## 最小手工验证

1. 将 `scope` 暂时设为 `all`，并在控制台「入群欢迎管理」页确认全局默认行的欢迎与离群开关都是开启的。
2. 在测试群中让一个非机器人测试账号加入，确认只出现一条欢迎消息。
3. 让该账号离开，确认只出现一条中性的离群消息；不要据此判断主动退出或被移出。
4. 在模板中加入 `{at}`、`{time}`、`{userId}`，核对提及对象和事件时间。
5. 用 `/关闭欢迎` 关闭当前群，确认通知停止、回复里的「群 OpenID」正确，再点按钮或执行 `/开启欢迎` 恢复。
6. 在「入群欢迎管理」页为测试群新建一行并只改其中一两个字段，确认只有该群受影响、其余字段仍继承全局默认；再删除该行，确认回到继承状态。
7. 分别配置 `action.type: 0/1/2` 的跳转、回调和指令按钮；回调分别验证 `welcome-messge-qq:reply:` 文本回复与 `welcome-messge-qq:command:` 指令执行。
8. 分别验证 `permission.type: 0/1/2/3`、指定用户/身份组数组，以及 `enter: true/false`；再检查手机 QQ、Windows QQ 的 Markdown 与按钮显示。
9. 若正文正常但按钮缺失，先检查适配器请求日志中是否存在 `keyboard.content.rows`；若请求里没有 `keyboard`，检查数据库里该群的 `welcomeKeyboard` / `leaveKeyboard` 是否为合法 JSON，插件会输出“按钮配置 JSON 解析失败”警告。若完全没有通知，再检查 `adapter-qq-crack` 是否实际收到并映射了 `GROUP_MEMBER_ADD` / `GROUP_MEMBER_REMOVE`，以及机器人应用是否具备相关事件权限。
10. 源码工作区运行时若提示找不到 `lib/index.js`，重新执行 `yarn yakumo esbuild welcome-message-qq` 并重载插件。

## 日志与容错

- 非 QQ 平台的同名事件直接忽略。
- 缺少 `guildId`、`channelId` 或 `userId` 时告警并跳过。
- 机器人自身事件始终跳过；`ignoreBots: true` 时还会跳过 `event.user.isBot` 标记的成员。
- 空白模板不发送，并记录调试日志。
- 数据库读取失败时记录群 OpenID 与错误信息并跳过本次通知，不向事件链抛错。
- 覆盖行写入失败时指令回复会说明失败原因，原有状态保持不变。
- 同一个成员的同一事件（按事件 ID）只发送一次，重复投递会被忽略。
- 单次发送失败会记录群 OpenID、成员 OpenID、事件类型和错误信息，不会使插件崩溃或影响后续事件。

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
yarn clone https://github.com/KeiMaidDev/koishi-plugin-welcome-message-qq
yarn build welcome-message-qq
```

## 许可证

MIT
