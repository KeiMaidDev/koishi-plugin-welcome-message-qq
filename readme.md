# koishi-plugin-welcome-messge-qq

面向 QQ 群的 Koishi 入群欢迎与离群通知插件。插件监听标准 `guild-member-added` / `guild-member-removed` 事件，可配置普通文本、QQ 原生 Markdown，以及与正文同一条发送的 QQ 原生命令按钮。

> 插件名中的 `messge` 为当前包名的一部分：`koishi-plugin-welcome-messge-qq`。

## 前置条件

- Koishi 4.18.7 或兼容版本。
- 必须使用能够上报 QQ 群成员事件的 `adapter-qq-crack`。
- 适配器和机器人应用必须实际具备接收群成员增加、离开事件的权限。
- `groups[].guildId` 必须填写 **QQ 群 OpenID**，不是普通 QQ 群号。

插件只消费适配器提供的标准 Koishi 事件，不解析 QQ WebSocket 原始数据，也不监听普通聊天消息。除用于开启/关闭当前群通知的管理指令外，不注册按钮回调或其他额外命令。

## 启用方式

1. 在 Koishi 控制台安装并启用 `adapter-qq-crack`，确认 QQ 机器人已上线。
2. 在源码工作区修改本插件后，执行 `yarn yakumo esbuild welcome-messge-qq`，确保 `lib/index.js` 已生成；`package.json` 的运行时入口是该文件。
3. 添加并启用 `koishi-plugin-welcome-messge-qq`。
4. 先使用默认的 `scope: all` 在测试群验证事件；需要白名单时再改成 `configured` 并填写 `groups`。
5. 如果配置按钮，请确保 `action.data` 指向的 Koishi 命令已经由其他插件注册。

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
| `welcomeMessage` | `string` | `欢迎 {at} 加入群聊！\n入群时间：{time}` | 欢迎消息模板，支持多行 |
| `leaveEnabled` | `boolean` | `true` | 是否发送离群消息 |
| `leaveMessage` | `string` | `{username} 已离开群聊。\n离群时间：{time}` | 中性的离群消息模板，支持多行 |
| `messageFormat` | `text \| markdown` | `text` | 普通文本或 QQ 原生 Markdown |
| `scope` | `all \| configured` | `all` | 所有 QQ 群生效，或仅已配置群生效 |
| `ignoreBots` | `boolean` | `true` | 忽略机器人自身及标记为机器人的成员事件 |
| `timeZone` | `string` | `Asia/Shanghai` | `{time}`、`{date}`、`{clock}` 使用的 IANA 时区；非法值无法通过 Schema，运行时也会回退并告警 |
| `closeCommandAuthority` | `number` | `3` | 开启/关闭当前群通知指令所需的 Koishi 权限等级 |
| `welcomeKeyboard` | `string(JSON)` | `{ "rows": [] }` | 可折叠多行文本框；填写欢迎消息专用 QQ 键盘 JSON |
| `leaveKeyboard` | `string(JSON)` | `{ "rows": [] }` | 可折叠多行文本框；填写离群消息专用 QQ 键盘 JSON |
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
- 开启与关闭默认都需要 Koishi 权限等级 `3`，可通过 `closeCommandAuthority` 统一调整。
- 插件会调用 Koishi 配置加载器写回配置文件，因此正常重启后仍保持最后一次开关状态。
- 如果运行环境没有可写入的 Koishi 配置加载器，当前运行期间仍会立即生效，但指令回复会明确提示重启后可能失效。
- 已关闭的群优先使用 `/开启入退群消息` 恢复；也可在控制台把对应 `groups[].enabled` 改回 `true`。
- 重复开启或重复关闭会直接回复当前状态，不重复写入配置。
- 此功能通过标准 Koishi 指令实现，不使用普通消息监听器或中间件。
- 按钮中可把 `action.data` 设置为 `/关闭入退群消息` 或 `/开启入退群消息`，权限校验仍由对应 Koishi 指令处理。

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

无有效按钮时，插件使用 `h('markdown', { content })` 发送 QQ 原生 Markdown。

### 3. Raw Markdown 与下挂按钮

下面是一个包含 `{at}`、`{time}` 和普通命令按钮的完整欢迎配置：

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

- 文本框内容必须是合法 JSON，顶层为对象；无法解析时忽略该键盘并记录调试日志，不影响正文发送。
- `rows`：键盘行数组；保持配置顺序。空数组表示不显示按钮。
- `buttons`：某一行的按钮数组。空行会被忽略。
- `render_data.label`：显示文字，不能为空。
- `render_data.style`：按钮样式数字，默认 `2`。
- `action.type`：固定为 `2`，表示发送普通命令消息，不使用回调按钮。
- `action.permission.type`：固定为 `2`，默认允许当前会话用户点击。
- `action.data`：点击后发送的完整命令文本，不能为空，可使用除 `{at}` 外的固定占位符。
- `action.enter`：默认 `true`；为 `false` 时只填入输入框。
- `action.reply`：可选，默认 `false`；控制是否以回复形式发送。

空行、空按钮、空 `label`、空 `action.data` 或不支持的按钮类型会被局部忽略，不会阻断正文和其他有效按钮发送。按钮只负责让 QQ 生成普通命令消息；目标命令必须由其他 Koishi 插件注册，本插件不监听 `interaction/button`。

不同 QQ 客户端对 Markdown 换行、按钮宽度和样式的显示可能不同，建议至少在手机 QQ 与 Windows QQ 各验证一次。

## 最小手工验证

1. 将 `scope` 暂时设为 `all`，保持欢迎和离群开关开启。
2. 在测试群中让一个非机器人测试账号加入，确认只出现一条欢迎消息。
3. 让该账号离开，确认只出现一条中性的离群消息；不要据此判断主动退出或被移出。
4. 在模板中加入 `{at}`、`{time}`、`{userId}`，核对提及对象和事件时间。
5. 配置一个 `action.type: 2`、`permission.type: 2` 的按钮，点击后确认目标 Koishi 命令收到普通命令消息。
6. 分别测试 `enter: true` 与 `enter: false`，并检查手机 QQ、Windows QQ 的 Markdown 与按钮显示。
7. 若完全没有通知，先检查 `adapter-qq-crack` 是否实际收到并映射了 `GROUP_MEMBER_ADD` / `GROUP_MEMBER_REMOVE`，以及机器人应用是否具备相关事件权限。
8. 源码工作区运行时若提示找不到 `lib/index.js`，重新执行 `yarn yakumo esbuild welcome-messge-qq` 并重载插件。

### `adapter-qq-crack` 的实际发送链路

`adapter-qq-crack` 会把 `GROUP_MEMBER_ADD` 映射为 `guild-member-added`，并把 `group_openid` 写入 `session.guildId` / `session.channelId`。本插件调用：

```ts
await session.bot.sendMessage(
  session.channelId,
  message,
  session.event.referrer,
)
```

成员加入/离开是通知事件，其网关事件 ID 不能用于被动回复。因此这里故意不传 `{ session }`；否则 `adapter-qq-crack` 会把 `session.qq.id` 写入 `event_id`，QQ 将返回 `40034027`（“请求参数 event_id 对应事件不能回复消息”）。本插件会将成员通知作为主动群消息发送。

无按钮 Markdown 必须把正文放在 `h('markdown', ...)` 的子节点中；该适配器从 `children` 读取 Markdown 正文，不读取 `attrs.content`。

## 日志与容错

- 非 QQ 平台的同名事件直接忽略。
- 缺少 `guildId`、`channelId` 或 `userId` 时告警并跳过。
- 机器人自身事件始终跳过；`ignoreBots: true` 时还会跳过 `event.user.isBot` 标记的成员。
- 空白模板不发送，并记录调试日志。
- 单次发送失败会记录群 OpenID、成员 OpenID、事件类型和错误信息，不会使插件崩溃或影响后续事件。
