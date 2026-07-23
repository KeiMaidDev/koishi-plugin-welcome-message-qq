# koishi-plugin-welcome-messge-qq

面向 QQ 群的 Koishi 入群欢迎与离群通知插件。插件监听标准 `guild-member-added` / `guild-member-removed` 事件，可配置普通文本、QQ 原生 Markdown，以及与正文同一条发送的 QQ 原生按钮。

> 插件名中的 `messge` 为当前包名的一部分：`koishi-plugin-welcome-messge-qq`。

## 前置条件

- Koishi 4.18.7 或兼容版本。
- 必须使用能够上报 QQ 群成员事件的 `adapter-qq-crack`。
- 适配器和机器人应用必须实际具备接收群成员增加、离开事件的权限。
- `groups[].guildId` 必须填写 **QQ 群 OpenID**，不是普通 QQ 群号。

插件只消费适配器提供的标准 Koishi 事件，不解析 QQ WebSocket 原始数据，也不监听普通聊天消息。除用于开启/关闭当前群通知的管理指令外，仅监听带 `welcome-messge-qq:` 命名空间的 `interaction/button` 回调；其他插件的回调不会被接管。

## 启用方式

1. 在 Koishi 控制台安装并启用 `adapter-qq-crack`，确认 QQ 机器人已上线。
2. 在源码工作区修改本插件后，执行 `yarn yakumo esbuild welcome-messge-qq`，确保 `lib/index.js` 已生成；`package.json` 的运行时入口是该文件。
3. 添加并启用 `koishi-plugin-welcome-messge-qq`。
4. 先使用默认的 `scope: all` 在测试群验证事件；需要白名单时再改成 `configured` 并填写 `groups`。
5. `action.type: 2` 是 QQ 指令按钮；`action.type: 1` 回调按钮可使用 `welcome-messge-qq:reply:` 回复文本，或使用 `welcome-messge-qq:command:` 执行 Koishi 指令。

## 支持的事件

| QQ 成员事件 | Koishi 事件 | 插件行为 |
| --- | --- | --- |
| 成员加入群聊 | `guild-member-added` | 发送欢迎消息 |
| 成员离开群聊 | `guild-member-removed` | 发送中性离群消息 |

插件不处理 `guild-member-updated`。由于适配器可能不提供 `operatorId`，离群通知不会推断“主动退出”或“被管理员移出”。

## 全局配置

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `welcomeEnabled` | `boolean` | `true` | 是否发送入群欢迎消息 |
| `welcomeMessage` | `string` | `欢迎 {at} 加入群聊！` | 欢迎消息模板，支持多行 |
| `leaveEnabled` | `boolean` | `true` | 是否发送离群消息 |
| `leaveMessage` | `string` | `{at} 已离开群聊。` | 中性的离群消息模板，支持多行 |
| `messageFormat` | 单选 | 普通消息（推荐） | 选择“普通消息”即可像平常聊天一样填写；只有需要标题、引用、加粗等排版时才选择“Markdown 消息” |
| `scope` | 单选 | 全部 QQ 群（推荐） | “全部 QQ 群”会在机器人所在的所有群启用；“仅指定的 QQ 群”只处理下方群配置中已添加并启用的群 |
| `ignoreBots` | `boolean` | `true` | 忽略机器人自身及标记为机器人的成员事件 |
| `timeZone` | `string` | `Asia/Shanghai` | `{time}`、`{date}`、`{clock}` 使用的 IANA 时区；非法值无法通过 Schema，运行时也会回退并告警 |
| `closeCommandAuthority` | `number` | `1` | 开启/关闭当前群通知指令所需的 Koishi 权限等级 |
| `commandResponseFormat` | `text \| markdown` | `text` | 开启/关闭成功响应的格式；配置按钮时自动使用 Raw Markdown |
| `closeResponseMessage` | `string` | Markdown 关闭提示 | 默认提示已关闭，并引导点击“重新开启” |
| `closeResponseKeyboard` | `string(JSON)` | 内置“重新开启”按钮 | 关闭成功后的自定义 QQ 键盘 |
| `enableResponseMessage` | `string` | Markdown 开启提示 | 默认提示已开启，并引导点击“再次关闭” |
| `enableResponseKeyboard` | `string(JSON)` | 内置“再次关闭”按钮 | 开启成功后的自定义 QQ 键盘 |
| `welcomeKeyboard` | `string(JSON)` | 内置“关闭欢迎”按钮 | 可折叠多行文本框；填写欢迎消息专用 QQ 键盘 JSON |
| `leaveKeyboard` | `string(JSON)` | 内置“关闭欢迎 + 帮助菜单”按钮 | 可折叠多行文本框；填写离群消息专用 QQ 键盘 JSON |
| `groups` | `GroupConfig[]` | `[]` | 按 QQ 群 OpenID 设置覆盖规则 |

### 生效范围与优先级

配置优先级固定为：**群级显式配置 > 全局配置**。群级字段未填写时继承全局值；按钮 JSON 文本框留空也表示继承，`false`、空消息模板以及显式填写的 `{ "rows": [] }` 都是有效覆盖。

- `scope: all`：未出现在 `groups` 中的 QQ 群使用全局配置。
- `scope: configured`：只处理 `groups` 中存在且 `enabled !== false` 的群。
- `groups[].enabled: false`：无论全局配置如何，该群都不发送欢迎或离群消息。
- 重复填写同一个 `guildId`：使用数组中最后一项，并输出一次警告；每个事件仍最多发送一条消息。

## 开启/关闭当前群通知指令

关闭当前群的等价指令：

```text
/welcome-messge-qq.close
/关闭入退群消息
/关闭欢迎
```

开启当前群的等价指令：

```text
/welcome-messge-qq.enable
/开启入退群消息
/开启欢迎
```

关闭指令会立即把当前群写入 `groups` 并设置 `enabled: false`；开启指令会把对应项改为 `enabled: true`。两个指令都会立即刷新运行时状态，只影响当前群，其他群不受影响。

- 指令只能在 QQ 群聊中使用，私聊或其他平台不会生效。
- 开启与关闭默认都需要 Koishi 权限等级 `1`，可通过 `closeCommandAuthority` 统一调整。
- 插件会调用 Koishi 配置加载器写回配置文件，因此正常重启后仍保持最后一次开关状态。
- 如果运行环境没有可写入的 Koishi 配置加载器，当前运行期间仍会立即生效，但指令回复会明确提示重启后可能失效。
- 已关闭的群优先使用 `/开启入退群消息` 恢复；也可在控制台把对应 `groups[].enabled` 改回 `true`。
- 重复开启或重复关闭会直接回复当前状态，不重复写入配置。
- 此功能通过标准 Koishi 指令实现，不使用普通消息监听器或中间件。
- 按钮中可把 `action.data` 设置为 `/关闭入退群消息` 或 `/开启入退群消息`，权限校验仍由对应 Koishi 指令处理。

关闭和开启成功后的回复可以分别自定义正文与键盘。只要响应键盘中至少有一个有效按钮，插件会返回单个 `qq:rawmarkdown`，正文位于 `markdown.content`，按钮位于 `keyboard.content.rows`。

例如，关闭后显示 Markdown 并提供“重新开启”按钮：

```yaml
commandResponseFormat: markdown
closeResponseMessage: |-
  # 已关闭本群入退群通知
  > 点击下方按钮可以重新开启。
closeResponseKeyboard: |-
  {
    "rows": [
      {
        "buttons": [
          {
            "render_data": {
              "label": "重新开启",
              "style": 1
            },
            "action": {
              "type": 1,
              "permission": {
                "type": 1
              },
              "data": "welcome-messge-qq:command:/开启欢迎"
            }
          }
        ]
      }
    ]
  }
```

`enableResponseMessage` 与 `enableResponseKeyboard` 使用相同结构，可在开启成功后提供“再次关闭”按钮。正文和按钮数据支持 `{userId}`、`{username}`、`{guildId}`、`{guildName}`、`{time}`、`{event}`、`{eventType}` 等固定模板字段；关闭时 `{eventType}` 为 `close`，开启时为 `enable`。

## 群级配置

`groups` 每项支持：

| 字段 | 是否必填 | 说明 |
| --- | --- | --- |
| `guildId` | 是 | QQ 群 OpenID，唯一匹配键，不是普通群号 |
| `enabled` | 否 | 默认 `true`；设为 `false` 时完全禁用该群 |
| `welcomeEnabled` | 否 | 覆盖全局欢迎开关 |
| `welcomeMessage` | 否 | 覆盖全局欢迎模板；显式空白会跳过欢迎消息 |
| `welcomeKeyboard` | 否 | JSON 多行文本框；留空继承全局欢迎键盘，填写 `{ "rows": [] }` 表示不显示按钮 |
| `leaveEnabled` | 否 | 覆盖全局离群开关 |
| `leaveMessage` | 否 | 覆盖全局离群模板；显式空白会跳过离群消息 |
| `leaveKeyboard` | 否 | JSON 多行文本框；留空继承全局离群键盘，填写 `{ "rows": [] }` 表示不显示按钮 |
| `messageFormat` | 否 | 覆盖全局 `text` / `markdown` 格式 |

示例：只让两个群生效，其中一个群禁用离群通知：

```yaml
scope: configured
groups:
  - guildId: QQ_GROUP_OPENID_A
    enabled: true
    welcomeMessage: |-
      欢迎 {at}！
      加入时间：{time}
    leaveEnabled: false
  - guildId: QQ_GROUP_OPENID_B
    enabled: true
    messageFormat: markdown
```

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

时间变量基于 `session.timestamp`，只在时间戳缺失或非法时回退到 `Date.now()` 并告警。Markdown 模式只转义动态变量值，管理员写入的 Markdown 结构保持不变；`{at}` 在转义后作为受信任的 `<@OpenID>` 片段注入。

按钮命令中请用 `{userId}` 定位成员，不要使用 `{at}`。`${close.command}` 一类文本只有在外部配置系统事先替换时才会变化，本插件会按字面字符串保留。

## 消息格式示例

### 1. 普通文本，无按钮

```yaml
messageFormat: text
welcomeMessage: |-
  欢迎新成员 {username}！
  加入时间：{time}
```

当普通文本模板包含 `{at}` 时，插件会自动选择能保留 `<@OpenID>` 提及的 QQ Markdown 发送路径，并把其余文本安全转义。

### 2. QQ Markdown，无按钮

```yaml
messageFormat: markdown
welcomeMessage: |-
  # 欢迎 {at}
  > 加入时间：{time}
```

无有效按钮时，插件使用 `h('markdown', rendered)` 发送 QQ 原生 Markdown，正文放在元素子节点中。

### 3. Raw Markdown 与下挂原生按钮

下面是一个包含 `{at}`、`{time}` 和 `action.type: 2` 指令按钮的完整欢迎配置：

```yaml
messageFormat: markdown
welcomeMessage: |-
  # 欢迎 {at}
  > 用户：{username}
  > 入群时间：{time}
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

正文和按钮位于同一个 `qq:rawmarkdown` 元素中，不设置 `stream`，不会额外发送 `qq:button`、`h('button')` 或第二条键盘消息。

## 按钮结构

欢迎与离群按钮分别由 `welcomeKeyboard`、`leaveKeyboard` 管理。控制台中的两个字段均显示为**可折叠 JSON 多行文本框**，不会再展开成 `rows → buttons → render_data/action` 的多层表单。插件在每次事件中独立解析并创建发送对象，不会共享或串改配置。

插件不再把按钮限制为指令按钮或“所有人可点击”，会按 `adapter-qq-crack` 支持的 QQ 原生结构透传以下字段：

- 文本框内容必须是合法 JSON，顶层为对象；无法解析时忽略该键盘并记录警告日志，不影响正文发送。
- `rows`：键盘行数组；保持配置顺序。空数组表示不显示按钮。
- `buttons`：某一行的按钮数组。空行会被忽略。
- `id`：可选的按钮标识；未填写时按 `行号-列号` 自动生成（例如 `0-0`、`1-0`），避免 QQ 因缺少按钮 ID 拒绝或忽略键盘。
- `render_data.label`：显示文字，不能为空。
- `render_data.visited_label`：可选的点击后显示文字。
- `render_data.style`：按钮样式数字，未填写时默认 `2`。
- `action.type`：QQ 原生动作类型；`0` 为跳转、`1` 为回调、`2` 为指令。插件不再过滤非 `2` 类型，未填写时为兼容旧配置默认 `2`。
- `action.permission.type`：QQ 原生权限类型；`0` 为指定用户、`1` 为管理员、`2` 为所有人、`3` 为指定身份组。未填写时默认 `2`。
- `action.permission.specify_user_ids` / `specify_role_ids`：指定用户或身份组 OpenID 数组。
- `action.data`：动作数据，不能为空；插件只在这个字段中替换除 `{at}` 外的固定占位符。
- `action.enter`：未填写时默认 `true`。
- `action.reply`：未填写时默认 `false`。
- `action.anchor`、`click_limit`、`at_bot_show_channel_list`、`unsupport_tips`：存在且类型正确时原样透传。

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

## 最小手工验证

1. 将 `scope` 暂时设为 `all`，保持欢迎和离群开关开启。
2. 在测试群中让一个非机器人测试账号加入，确认只出现一条欢迎消息。
3. 让该账号离开，确认只出现一条中性的离群消息；不要据此判断主动退出或被移出。
4. 在模板中加入 `{at}`、`{time}`、`{userId}`，核对提及对象和事件时间。
5. 分别配置 `action.type: 0/1/2` 的跳转、回调和指令按钮；回调分别验证 `welcome-messge-qq:reply:` 文本回复与 `welcome-messge-qq:command:` 指令执行。
6. 分别验证 `permission.type: 0/1/2/3`、指定用户/身份组数组，以及 `enter: true/false`；再检查手机 QQ、Windows QQ 的 Markdown 与按钮显示。
7. 若正文正常但按钮缺失，先检查适配器请求日志中是否存在 `keyboard.content.rows`；若请求里没有 `keyboard`，检查 `welcomeKeyboard` / `leaveKeyboard` 是否为合法 JSON，插件会输出“按钮配置 JSON 解析失败”警告。若完全没有通知，再检查 `adapter-qq-crack` 是否实际收到并映射了 `GROUP_MEMBER_ADD` / `GROUP_MEMBER_REMOVE`，以及机器人应用是否具备相关事件权限。
8. 源码工作区运行时若提示找不到 `lib/index.js`，重新执行 `yarn yakumo esbuild welcome-messge-qq` 并重载插件。

### `adapter-qq-crack` 的实际发送链路

最新版 `adapter-qq-crack` 会把 `GROUP_MEMBER_ADD` 映射为 `guild-member-added`，把 `GROUP_MEMBER_REMOVE` 映射为 `guild-member-removed`，并把两类网关事件的 `input.id` 都写入 `session.messageId`。原始网关载荷仍保存在 `session.qq`。

因此入群和离群通知现在统一使用事件会话发送：

```ts
await session.send(message)
```

事件仍在有效时间内时，适配器的 `QQMessageEncoder` 会把 `session.messageId` 写入请求的 `msg_id`，并为同一事件生成从 `1` 开始递增的 `msg_seq`。成员加入和成员离开请求都不再依赖 `event_id`；`INTERACTION_CREATE` 等没有 `messageId` 的回调事件仍可使用网关事件 ID 作为 `event_id`。

如果 QQ 返回 `40034024`（`msg_id` 无效或越权）或 `40034027`（事件不能回复消息），插件会回退到 `session.bot.sendMessage(...)` 主动发送。其他网络或发送错误不会自动重发，避免产生重复通知。

无按钮 Markdown 必须把正文放在 `h('markdown', ...)` 的子节点中；该适配器从 `children` 读取 Markdown 正文，不读取 `attrs.content`。

## 日志与容错

- 非 QQ 平台的同名事件直接忽略。
- 缺少 `guildId`、`channelId` 或 `userId` 时告警并跳过。
- 机器人自身事件始终跳过；`ignoreBots: true` 时还会跳过 `event.user.isBot` 标记的成员。
- 空白模板不发送，并记录调试日志。
- 单次发送失败会记录群 OpenID、成员 OpenID、事件类型和错误信息，不会使插件崩溃或影响后续事件。
