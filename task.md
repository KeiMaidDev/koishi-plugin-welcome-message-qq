# QQ 群组欢迎 / 退群消息插件任务文档

## 目标

在当前 Koishi 插件 `koishi-plugin-welcome-messge-qq` 中实现一个只面向 QQ 平台的群成员变动通知插件：管理员可在插件配置中自定义入群欢迎消息、离群消息及其 QQ 原生按钮，并可按 QQ 群 OpenID 覆盖内容、按钮或限制生效范围。

本任务只使用 `adapter-qq-crack` 已提供的标准 Koishi 事件和消息元素，不直接解析 QQ WebSocket 原始事件，也不监听普通聊天消息。

## 已确认的适配器契约

- QQ 原始事件 `GROUP_MEMBER_ADD` 映射为 Koishi 事件 `guild-member-added`。
- QQ 原始事件 `GROUP_MEMBER_REMOVE` 映射为 Koishi 事件 `guild-member-removed`。
- QQ 群事件中：
  - `session.guildId` 与 `session.channelId` 均为群 OpenID。
  - `session.userId` 为发生变动的成员 OpenID。
  - 用户显示名优先读取 `session.event.user?.name`，缺失时必须回退到成员昵称或 `session.userId`。
  - `session.operatorId` 可能为 `undefined`，因此退群消息不得擅自区分“主动退出”与“被管理员移出”。
- `h('markdown', { content })` 在该适配器中等价于不带键盘的 QQ 原生 Markdown。
- 只要存在有效自定义按钮，就必须使用单个 `h('qq:rawmarkdown', { markdown, keyboard })` 元素发送，并把按钮下挂到同一消息的 `keyboard.content.rows`；不得把按钮拆成独立消息，通知也不启用 `stream`。

## 不在本次范围

- 不处理 `guild-member-updated`。
- 不监听普通消息，不增加中间件；仅注册用于开启/关闭当前群入退群通知的显式 Koishi 管理指令。
- 不根据 `operatorId` 推断退群原因。
- 不加入数据库、历史记录、统计面板或 Web 管理页面。
- 不实现 Markdown 模板 ID、Ark 消息或流式消息。
- 自定义按钮只使用 `action.type = 2` 的普通命令按钮，不实现 `interaction/button` 回调处理。
- 不使用独立 `qq:button`、`h('button')` 或“正文一条、按钮一条”的分开发送方式。
- 不改动 `adapter-qq-crack` 的事件映射与发送逻辑。

---

## 任务 1：定义配置结构与生效优先级

目标文件：`src/index.ts`

- [x] 完善 `Config` 接口和 `Config` Schema，至少提供以下全局配置：
  - [x] `welcomeEnabled: boolean`：是否发送入群欢迎消息，默认开启。
  - [x] `welcomeMessage: string`：默认欢迎消息，支持多行文本。
  - [x] `leaveEnabled: boolean`：是否发送离群消息，默认开启。
  - [x] `leaveMessage: string`：默认离群消息，支持多行文本。
  - [x] `messageFormat: 'text' | 'markdown'`：发送普通文本或 QQ 原生 Markdown，给出明确默认值。
  - [x] `scope: 'all' | 'configured'`：对所有 QQ 群生效，或仅对已配置群生效。
  - [x] `ignoreBots: boolean`：是否忽略机器人成员事件，默认开启。
  - [x] `timeZone: string`：`{time}`、`{date}`、`{clock}` 的时区，默认 `Asia/Shanghai`，使用 IANA 时区名称并校验非法值。
  - [x] `welcomeKeyboard`：欢迎消息的自定义按钮 JSON，多行文本框默认填写 `{ "rows": [] }`。
  - [x] `leaveKeyboard`：离群消息的自定义按钮 JSON，多行文本框默认填写 `{ "rows": [] }`。
- [x] 增加 `groups` 数组配置，每项至少包含：
  - [x] `guildId: string`：QQ 群 OpenID，作为唯一匹配键。
  - [x] `enabled: boolean`：该群是否启用通知。
  - [x] 可选的 `welcomeEnabled`、`welcomeMessage`、`welcomeKeyboard`、`leaveEnabled`、`leaveMessage`、`leaveKeyboard`、`messageFormat` 覆盖项。
- [x] 在配置说明中明确：群标识必须填写 OpenID，不是普通 QQ 群号。
- [x] 定义并实现稳定的配置优先级：群级显式配置 > 全局配置；群级字段未填写时继承全局值。
- [x] 明确范围规则：
  - [x] `scope = all` 时，未出现在 `groups` 中的群使用全局配置。
  - [x] `scope = configured` 时，只处理 `groups` 中 `enabled !== false` 的群。
  - [x] 群级 `enabled = false` 时，无论全局配置如何都跳过该群。
- [x] 对重复 `guildId` 给出可预测行为，建议使用最后一项覆盖，并记录一次警告，避免同一事件重复发送。
- [x] 默认文案使用中性表述，例如：
  - [x] 欢迎：`欢迎 {at} 加入群聊！\n入群时间：{time}`
  - [x] 离群：`{username} 已离开群聊。\n离群时间：{time}`

### 验收标准

- [x] Koishi 控制台可以正确显示和保存全部配置项。
- [x] 未填写群级覆盖项时不会把全局内容或按钮配置覆盖为空值。
- [x] `scope`、群级禁用和事件类型开关的组合行为有明确且唯一的结果。

---

## 任务 2：实现安全、可预测的消息模板渲染

目标文件：`src/index.ts`；如果模板逻辑明显膨胀，可拆分到 `src/template.ts`。

- [x] 支持以下固定占位符，不执行 JavaScript 表达式，不使用 `eval` 或 `new Function`：
  - [x] `{at}`：真正提及本次入群/退群成员；QQ Markdown / Raw Markdown 中生成 `<@成员OpenID>`，该值属于受信任的结构化片段，不能再做 Markdown 转义。
  - [x] `{userId}`：成员 OpenID。
  - [x] `{username}`：成员显示名；按 `session.event.user?.name`、`session.event.member?.nick`、`session.username`、`session.userId` 的顺序回退。
  - [x] `{guildId}`：群 OpenID。
  - [x] `{guildName}`：群名称；缺失时回退到 `guildId`。
  - [x] `{time}`：事件发生时间，格式固定为 `YYYY-MM-DD HH:mm:ss`，使用配置的 `timeZone`。
  - [x] `{date}`：事件发生日期，格式固定为 `YYYY-MM-DD`。
  - [x] `{clock}`：事件发生时刻，格式固定为 `HH:mm:ss`。
  - [x] `{timestamp}`：事件时间的 Unix 秒级时间戳，便于传入命令或日志。
  - [x] `{event}`：中文事件描述；入群为 `加入群聊`，退群为 `离开群聊`。
  - [x] `{eventType}`：稳定的机器可读事件值；入群为 `join`，退群为 `leave`。
  - [x] `{botId}`：当前 QQ 机器人 ID，即 `session.selfId`；缺失时替换为空字符串并记录调试日志。
- [x] 对消息正文和按钮 `action.data` 中允许使用的同一占位符进行全量替换，而不是只替换第一次出现的位置。
- [x] `{at}` 只允许用于消息正文；按钮 `action.data` 中需要定位成员时使用 `{userId}`，避免把 Markdown 提及标签塞入普通命令参数。
- [x] 未识别的占位符保持原样，便于发现配置拼写错误；在调试日志中记录相关提示，但不阻断发送。
- [x] `messageFormat = markdown` 时，只对普通动态变量值做 Markdown 特殊字符转义，保留管理员编写的 Markdown 格式；`{at}` 必须在转义完成后作为 `<@userId>` 注入，防止被转义成普通文本。
- [x] `messageFormat = text` 且没有有效按钮时按普通字符串发送；存在按钮时按任务 3 的要求转义正文并统一走 `qq:rawmarkdown`。
- [x] 模板包含 `{at}` 时，即使没有按钮，也必须选择能够保留 `<@userId>` 提及语法的 QQ Markdown 发送路径；不得先把完整渲染结果统一转义。
- [x] `{time}`、`{date}`、`{clock}` 和 `{timestamp}` 必须基于 `session.timestamp`；仅当时间戳缺失或非法时才回退到 `Date.now()`，同时记录警告。
- [x] 时间格式化使用 `Intl.DateTimeFormat` / `formatToParts` 或等价的确定性实现，不依赖宿主系统的默认时区和本地化字符串格式。
- [x] 渲染后仅包含空白字符的消息视为未配置，跳过发送并输出调试日志。
- [x] 不提供 `{operatorId}`、`{leaveReason}` 等可能误导管理员判断退群原因的占位符。
- [x] 按钮 `action.data` 可以使用同一组固定占位符，但插件不得执行 `${...}`、JavaScript 表达式、`eval` 或 `new Function`；配置系统未预先解析的 `${close.command}` 应按字面字符串处理。

### 验收标准

- [x] 中文、英文、换行和同一变量重复出现均能正确渲染。
- [ ] `{at}` 在最终 Raw Markdown 中保持为 `<@成员OpenID>`，在 QQ 客户端实际显示为对本次事件成员的提及，而不是普通字符串。
- [x] 入群事件的 `{time}` 使用入群事件时间，退群事件的 `{time}` 使用退群事件时间；二者不得使用插件启动时间或消息发送完成时间。
- [x] 指定不同时区后，`{time}`、`{date}` 和 `{clock}` 的日期跨日结果正确。
- [x] 用户昵称包含 `*`、`[`、`]`、`(`、`)`、`#` 等字符时，不会破坏 Markdown 消息结构。
- [x] 用户名、群名缺失时仍能以 OpenID 生成可发送消息，不出现字符串 `undefined` 或 `null`。

---

## 任务 3：新增自定义 QQ 原生按钮配置

目标文件：`src/index.ts`；如类型和校验逻辑较多，可拆分到 `src/button.ts`。

- [x] 欢迎消息与离群消息分别维护独立按钮配置，禁止两类事件意外复用或串改同一个数组对象。
- [x] 全局 `welcomeKeyboard`、`leaveKeyboard` 以及群级覆盖均使用参考 `jrys-prpr` 的可折叠 JSON 多行文本框；文本内容采用与适配器一致的 `rows -> buttons` 结构。
- [x] 至少支持以下按钮字段：
  - [x] `render_data.label: string`：按钮显示文字，不能为空。
  - [x] `render_data.style: number`：按钮样式，示例值支持 `2`。
  - [x] `action.type: 2`：固定使用普通命令按钮，不走回调按钮。
  - [x] `action.permission.type: 2`：默认允许当前会话用户点击执行。
  - [x] `action.data: string`：点击后发送的完整命令文本，例如 `/关闭欢迎`。
  - [x] `action.enter: boolean`：是否自动发送，默认 `true`。
  - [x] `action.reply?: boolean`：是否以回复形式发送，默认 `false`。
- [x] 在 Schema 中以可折叠的 JSON 多行文本框配置完整键盘，避免把 `rows -> buttons -> render_data/action` 展开成多层表单；提供中文格式说明与空键盘默认值。
- [x] 对配置执行防御性规范化：忽略空行、空按钮、空 `label` 或空 `action.data`，不能因为一个无效按钮导致整条欢迎/离群消息发送失败。
- [x] 不修改管理员配置对象本身；渲染变量或补默认值时创建新的键盘对象，避免后续事件沿用上一次成员的数据。
- [x] 群级键盘覆盖遵循明确规则：JSON 文本框未填写或仅包含空白时继承全局键盘；显式配置 `{ "rows": [] }` 时表示该群不显示按钮。
- [x] 未配置按钮时可按正文格式使用普通文本或 `h('markdown', { content })`；只要存在至少一个有效按钮，整条通知必须改用以下 Raw Markdown 下挂键盘结构：

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

- [x] 自定义按钮以用户提供的结构作为兼容示例：

```json
{
  "rows": [
    {
      "buttons": [
        {
          "render_data": {
            "label": "关闭欢迎",
            "style": 2
          },
          "action": {
            "type": 2,
            "permission": {
              "type": 2
            },
            "data": "/${close.command}",
            "enter": true
          }
        }
      ]
    }
  ]
}
```

- [x] 文档和实现必须说明：上例中的 `${close.command}` 只有在外部配置系统预先完成替换时才会变成实际命令；本插件自身只负责固定 `{userId}` 等占位符，不执行任意表达式。
- [x] 只要配置中存在有效按钮，就以按钮需求优先并固定走 `qq:rawmarkdown`：`messageFormat = text` 时先把整个正文转义为安全的 Markdown 文本，再作为 `markdown.content` 发送，不能丢弃按钮。
- [x] 按钮必须与正文一起放在同一个 `qq:rawmarkdown` 元素内发送；禁止额外发送 `qq:button`、`h('button')` 或第二条键盘消息。
- [x] 按钮点击后由 QQ 发送普通命令消息，交给 Koishi 已注册命令处理；本插件不监听点击回调。除本插件提供的群通知开启/关闭指令外，其他按钮目标命令仍由对应 Koishi 插件实现。

### 验收标准

- [x] 欢迎消息和离群消息可以分别配置不同按钮。
- [x] JSON 多行文本框中的多行、多按钮配置能保持原始顺序发送。
- [x] 无效按钮被局部忽略，有效正文和其他有效按钮仍可发送。
- [x] `action.type = 2`、`permission.type = 2`、`enter` 和 `reply` 的最终发送结构符合配置与默认值。
- [x] 按钮命令中的 `{userId}`、`{guildId}`、`{timestamp}`、`{eventType}` 等普通字段按当前事件独立渲染，不会残留上一次事件的数据；`{at}` 不进入按钮命令。
- [ ] 点击按钮会在 QQ 中生成普通命令消息，并由目标 Koishi 命令正常接收。

---
## 任务 4：监听 QQ 群成员事件并发送通知

目标文件：`src/index.ts`

- [x] 注册 `ctx.on('guild-member-added', ...)`，调用统一处理函数发送欢迎消息。
- [x] 注册 `ctx.on('guild-member-removed', ...)`，调用同一处理链发送离群消息。
- [x] 在处理函数入口执行以下过滤：
  - [x] `session.platform !== 'qq'` 时立即返回。
  - [x] 缺少 `session.guildId`、`session.channelId` 或 `session.userId` 时不发送，并记录包含事件类型的警告。
  - [x] 事件成员是机器人自身，或 `ignoreBots` 开启且 `session.event.user?.isBot` 为真时跳过。
  - [x] 根据 `scope` 和 `groups` 解析当前群的最终配置；未命中或被禁用时跳过。
  - [x] 根据入群/离群事件检查对应的 `welcomeEnabled` 或 `leaveEnabled`。
- [x] 将“选择配置、提取变量、渲染模板、构造消息、发送消息”拆成职责明确的小函数，避免两个事件监听器复制逻辑。
- [x] 普通文本模式直接发送渲染后的字符串。
- [x] Markdown 模式无有效按钮时使用 `h('markdown', { content: rendered })` 发送。
- [x] 存在有效按钮时，无论正文原配置为文本还是 Markdown，都使用单个 `h('qq:rawmarkdown', { markdown: { content }, keyboard: { content: { rows } } })` 发送。
- [x] Raw Markdown 按钮路径不设置 `stream`，且不得额外发送第二条正文或第二条按钮消息。
- [x] 优先使用事件会话发送到当前 `session.channelId`，确保消息进入发生成员变动的 QQ 群，而不是私聊或其他频道。
- [x] 捕获单次发送异常并通过 `ctx.logger('welcome-messge-qq')` 记录群 OpenID、成员 OpenID 和事件类型；不得让异常中断其他事件处理。
- [x] 成功发送只记录调试级日志，避免正常运行时刷屏。
- [x] 离群消息统一使用“离开群聊”等中性描述，不输出“主动退群”或“被踢出”。

### 验收标准

- [x] 一次 `guild-member-added` 事件最多发送一条欢迎消息。
- [x] 一次 `guild-member-removed` 事件最多发送一条离群消息。
- [x] 非 QQ 平台的同名 Koishi 事件不会触发本插件发送。
- [x] 欢迎和离群开关互不影响。
- [x] 一个群发送失败不会导致插件崩溃，也不会影响后续群成员事件。

---

## 任务 5：添加群内开启/关闭通知指令

目标文件：`src/index.ts`

- [x] 注册标准 Koishi 关闭指令 `welcome-messge-qq.close`，并提供中文别名 `关闭入退群消息`、`关闭欢迎`。
- [x] 注册对称的开启指令 `welcome-messge-qq.enable`，并提供中文别名 `开启入退群消息`、`开启欢迎`。
- [x] 两个指令只允许在 QQ 群聊中生效；缺少 `session.guildId`、私聊或其他平台返回明确提示且不修改配置。
- [x] 使用 `closeCommandAuthority` 统一控制开启/关闭指令权限，默认权限等级为 `3`。
- [x] 关闭后立即把当前群的最终覆盖规则设置为 `enabled: false`，同时停止该群的欢迎和离群消息，不影响其他群。
- [x] 开启后立即把当前群的最终覆盖规则设置为 `enabled: true`，使后续入群、退群事件恢复发送。
- [x] 已存在相同 `guildId` 时只修改最后一项，保持既有“最后一项覆盖”规则；需要显式覆盖时新增群级配置项。
- [x] `scope: configured` 下对未配置群执行开启指令时新增 `enabled: true`；`scope: all` 下未配置群本就开启时不写入冗余覆盖。
- [x] 每次状态变更后更新运行时群配置索引，无需等待插件重启。
- [x] 在 Koishi 配置加载器可用时写回配置文件，使 `enabled: false/true` 在正常重启后继续生效。
- [x] 配置加载器不可用或写回失败时仍保持当前运行期间状态，并在指令回复与日志中明确提示重启后可能失效。
- [x] 重复关闭或重复开启时返回“已经处于当前状态”，不重复写入配置。
- [x] 不通过普通消息监听器或中间件识别指令文本，只使用 Koishi 指令系统。

### 验收标准

- [x] 关闭后，同一群的 `guild-member-added` 与 `guild-member-removed` 事件均不再发送消息。
- [x] 开启后，同一群的两个成员事件均恢复发送消息。
- [x] 配置源中的对应群可从 `enabled: false` 持久化为 `enabled: true`，其他群配置保持不变。
- [x] 重复群配置仍只修改最后一项，原配置对象不会被辅助函数意外修改。
- [x] 真实 Koishi `Context` 中两个标准指令与四个中文别名会随插件销毁注销，并在重新加载后恢复。
- [ ] 在真实 QQ 群中分别输入关闭与开启指令，确认机器人回复成功，并验证真实入群、退群通知会停止后再恢复。

---
## 任务 6：补全插件说明与包信息

目标文件：`readme.md`、`package.json`

- [x] 在 `readme.md` 说明插件用途、依赖条件和启用方式：必须使用能够上报群成员事件的 `adapter-qq-crack`。
- [x] 列出支持的事件、全部配置字段、默认行为、群 OpenID 获取要求和群级覆盖优先级。
- [x] 列出 `{at}`、`{userId}`、`{username}`、`{guildId}`、`{guildName}`、`{time}`、`{date}`、`{clock}`、`{timestamp}`、`{event}`、`{eventType}`、`{botId}` 的含义、格式、适用位置和回退行为。
- [x] 分别给出普通文本、无按钮 Markdown、带自定义按钮 Markdown 配置示例。
- [x] 明确无按钮 Markdown 可以使用 `h('markdown')`；只要有按钮就必须使用单个 `h('qq:rawmarkdown')`，通过 `keyboard.content.rows` 下挂按钮，并且不使用流式发送。
- [x] 文档逐项解释 `rows`、`buttons`、`render_data`、`action`、`permission`、`data`、`enter` 和可选 `reply`。
- [x] README 至少给出一个包含 `{at}`、`{time}` 和 Raw Markdown 下挂按钮的完整欢迎消息示例。
- [x] 说明按钮是普通命令按钮，目标命令必须已在 Koishi 中注册，并解释 `${...}` 不由本插件执行。
- [x] 提醒不同 QQ 客户端的 Markdown 和按钮显示可能存在差异。
- [x] 明确退群事件无法可靠区分主动退出与被移出，示例文案不得暗示原因。
- [x] 在 README 中加入最小手工验证步骤，便于管理员确认适配器是否实际收到成员事件。
- [x] 为 `package.json` 补充准确的 `description` 和与 QQ 群欢迎消息相关的关键词；不要无关地调整依赖或覆盖已有用户改动。

### 验收标准

- [x] 新用户仅阅读 README 就能完成全局配置、指定群配置、模板变量和自定义按钮使用。
- [x] README 中的字段名、默认值和代码实现完全一致。
- [x] 文档没有把普通 QQ 群号误写为群 OpenID。

---

## 任务 7：静态检查、构建与真实 QQ 验证

### 6.1 仓库静态检查

在工作区根目录 `C:\koishi-app` 执行：

```powershell
yarn tsc -p external/welcome-messge-qq/tsconfig.json --pretty false

$OutFile = Join-Path $env:TEMP 'welcome-messge-qq-check.mjs'
yarn esbuild external/welcome-messge-qq/src/index.ts `
  --bundle `
  --platform=node `
  --format=esm `
  --external:koishi `
  --outfile=$OutFile
Remove-Item -LiteralPath $OutFile -ErrorAction SilentlyContinue

git diff --check -- external/welcome-messge-qq
```

- [x] TypeScript 声明构建通过。
- [x] esbuild 能完成运行时代码打包，证明不存在仅类型通过但运行时无法解析的问题。
- [x] `git diff --check` 无空白错误。
- [x] 检查 `git status --short`，确认没有误改适配器源码、工作区配置或其他插件。
- [x] 清理验证产生的 `lib`、`dist`、`*.tsbuildinfo` 等临时产物；只有明确需要提交的发布产物才保留。
- [x] 可选执行工作区 `yarn build`；若其他无关包失败，应单独记录失败包，不得用无关失败否定本插件的局部验证结果。

### 6.2 配置行为验证

- [x] `scope = all`：未配置群级规则的 QQ 群能使用全局欢迎/离群消息。
- [x] `scope = configured`：未列入 `groups` 的 QQ 群完全不发送。
- [x] 群级覆盖只覆盖已填写字段，其余消息和按钮字段继续继承全局配置。
- [x] 群级 `enabled = false` 时入群、离群消息都不发送。
- [x] 分别关闭欢迎和离群开关，确认另一类事件仍正常工作。
- [x] 空白模板不发送消息，并留下可诊断日志。

### 6.3 真实 QQ 端到端验证

在一个测试群中使用真实 QQ 开放平台机器人和 `adapter-qq-crack`：

- [ ] 新成员加入后，目标群只收到一条欢迎消息。
- [ ] 成员离开后，目标群只收到一条中性离群消息。
- [ ] 文案中的 `{at}`、`{userId}`、`{username}`、`{guildId}`、`{guildName}`、`{time}`、`{date}`、`{clock}`、`{timestamp}`、`{event}`、`{eventType}`、`{botId}` 均被正确替换。
- [ ] 入群欢迎消息中的 `{at}` 真正提及新成员；退群消息中的 `{at}` 使用本次离群成员 OpenID，并记录 QQ 客户端对已离群成员提及的实际显示结果。
- [ ] 人工构造固定 `session.timestamp`，核对 `{time}`、`{date}`、`{clock}` 和 `{timestamp}` 输出，避免测试只验证当前时间。
- [ ] 用户名缺失时回退到成员 OpenID，不出现空白名称。
- [ ] 普通文本模式在 QQ 客户端显示正确。
- [ ] Markdown 模式在手机 QQ 与 Windows QQ 至少各检查一次，确认换行、按钮排列和按钮样式可接受。
- [ ] 分别验证欢迎按钮与离群按钮，确认二者使用各自配置。
- [ ] 点击 `action.type = 2` 的按钮后，QQ 会发送配置的 `action.data` 普通命令，目标 Koishi 命令能够接收。
- [ ] `enter = true` 时自动发送；`enter = false` 时仅填入输入框，行为与配置一致。
- [ ] `permission.type = 2` 的按钮可由测试成员正常点击；无效按钮配置不会阻断正文发送。
- [ ] 抓取或记录最终元素结构，确认正文位于 `markdown.content`、按钮位于同一元素的 `keyboard.content.rows`，且发送链路中不存在独立 `qq:button` / `h('button')`。
- [ ] 适配器未提供 `operatorId` 时，插件仍正常发送，且不推断离群原因。
- [ ] 重启 Koishi 后配置仍可加载，两个事件监听器不会重复注册或重复发送。

## 完成定义

只有同时满足以下条件才算完成：

- [x] 配置、扩展模板字段、真实成员提及、事件时间格式化、群级覆盖、自定义按钮、群内开启/关闭指令和两个成员事件处理均已实现。
- [x] 非 QQ 事件、缺失字段、机器人事件和发送失败均有明确处理。
- [x] 文档与实现一致，明确 OpenID、Raw Markdown 下挂普通命令按钮和退群原因限制。
- [x] 插件局部 TypeScript 与 esbuild 检查通过。
- [ ] 至少完成一次真实 QQ 入群、一次真实 QQ 退群和一次按钮点击命令执行的端到端验证，并记录实际结果。
---

## 当前执行记录（2026-07-21）

### 已完成的本地验证

- [x] `yarn tsx --test external/welcome-messge-qq/tests/index.spec.ts`：26 项测试通过。
- [x] 测试覆盖全部固定占位符、固定事件时间、跨时区日期、OpenID 回退、群级继承、显式空键盘、事件开关、机器人过滤、发送失败、畸形按钮配置，以及开启/关闭指令的即时切换、递归配置写回、`scope` 边界和重复执行。
- [x] 使用 `adapter-qq-crack` 的真实 `parseQQMarkdownElement()` 解析生成元素，确认正文位于 `markdown.content`，按钮位于同一请求的 `keyboard.content.rows`。
- [x] 针对真实入群不发送问题对照 `adapter-qq-crack` 的 `adaptSession()` 与 `QQMessageEncoder`：确认 `GROUP_MEMBER_ADD` 会映射为 `guild-member-added`，`session.qq.id` 会作为 `event_id` 发送；修复了无按钮 Markdown 误把正文放在 `attrs.content` 导致适配器从空 `children` 读取到空消息的问题。
- [x] 成员通知现直接调用 `session.bot.sendMessage(session.channelId, message, session.event.referrer, { session })`，保留适配器事件上下文并让发送异常进入本插件日志。
- [x] 已执行 `yarn yakumo esbuild welcome-messge-qq` 生成运行时必需的 `lib/index.js`，并用 `require.resolve('koishi-plugin-welcome-messge-qq')` 确认 Koishi 可解析插件入口。
- [x] 使用真实 Koishi `Context` 完成插件加载、监听器与开关指令销毁、重新加载测试，确认重启路径不会残留旧监听器、重复发送或残留指令别名。
- [x] 使用真实 Koishi `NodeLoader` 启动临时配置，依次调用已注册的关闭与开启指令处理函数，确认回复“已关闭本群的入群与退群消息”和“已开启本群的入群与退群消息”，且临时 YAML 最终实际写回 `guildId: TEST_ENABLE_GUILD` 与 `enabled: true`；临时探针、配置与构建产物均已清理。
- [x] 使用仅包含 `server`、`console`、`config` 与本插件的临时 Koishi 配置启动本地控制台：全局欢迎/离群按钮及群级覆盖均显示为参考 `jrys-prpr` 的可折叠 JSON 多行文本框，不再显示 `rows -> buttons -> render_data/action` 多层表单；通过控制台修改按钮 JSON 并点击应用，临时 YAML 成功写回“控制台 JSON 保存验证”且插件完成重载。此前发现并修复的 `Schema.transform` 时区控件问题仍由带 IANA 时区白名单正则的字符串 Schema 处理。
- [x] `yarn tsc -p external/welcome-messge-qq/tsconfig.json --pretty false` 通过。
- [x] `yarn esbuild external/welcome-messge-qq/src/index.ts --bundle --platform=node --format=esm --external:koishi` 通过。
- [x] 已按补充要求在 `C:\koishi-app` 执行 `yarn build`；工作区构建在 `external/adapter-onebot` 的 4 个既有 TypeScript 类型错误处中断（`utils.ts` 的 `subsubtype` 两处、`ws.ts` 的 WebSocket 类型与协议泛型两处），输出中没有本插件错误。本插件随后独立执行测试、TypeScript 与 esbuild 均通过。
- [x] 插件仓库内 `git diff --check` 通过；工作区根目录不是 Git 仓库，因此不能从 `C:\koishi-app` 执行原文中的根级 Git 路径检查。
- [x] 声明构建与打包产生的临时文件已清理。

### 仍需真实 QQ 环境完成

当前 `C:\koishi-app\koishi.yml` 已配置 `adapter-qq-crack`，但尚未配置本插件，且检查时没有正在运行的 Koishi 进程；仓库环境也没有可自动控制的测试群成员账号。因此以下结果仍不能标记为完成：

- [ ] 真实 QQ 成员加入后只收到一条欢迎消息。
- [ ] 真实 QQ 成员离开后只收到一条中性离群消息，并记录已离群成员 `{at}` 的客户端显示。
- [ ] 在手机 QQ 与 Windows QQ 检查 Markdown、换行和按钮排列。
- [ ] 实际点击按钮，分别验证 `enter = true`、`enter = false`、`permission.type = 2` 和目标 Koishi 命令执行。

未对 `C:\koishi-app\koishi.yml`、`adapter-qq-crack` 源码或真实机器人配置进行修改，也未在没有指定测试群的情况下主动连接机器人或发送外部消息。
