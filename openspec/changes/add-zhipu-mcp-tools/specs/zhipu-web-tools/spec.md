# Spec Delta

## Purpose

在**不替换** DSH 内置 `web_search` / `web_fetch` 的前提下，为模型增加智谱 MCP（web_search_prime / webReader）的附加联网工具：全局工具 `zhipu_web_search` 与 `zhipu_web_fetch`，复用已登录 Coding Plan 的凭据，并对结果做映射、截断与不可信内容防护；内置 `web` 行保持默认后端，旧版构建写入的残留指向被清理。

## ADDED Requirements

### Requirement: 智谱搜索 provider 的注册与可用性门控

插件 MUST 在启用时注册 id 为 `zhipu-web-search-prime` 的搜索 provider；其可用性 MUST 同步判定（不发网络请求）：search 开关开启且凭据 ref 可解析时可用，否则不可用。凭据缺失 MUST 表现为"不可用"，MUST NOT 抛错。provider 是附加工具 `zhipu_web_search` 的执行后端，也保持可供用户在 `web` 行手动指向。

#### Scenario: 凭据可解析且开关开启
- **WHEN** search 开关开启且 plan 凭据 ref 可解析
- **THEN** provider 报告可用，`zhipu_web_search` 工具调用经其派发给智谱 MCP

#### Scenario: 凭据缺失
- **WHEN** search 开关开启但凭据 ref 无法解析出 API key
- **THEN** provider 报告不可用，且不抛出错误、不发起 MCP 请求

### Requirement: 搜索结果映射与预截断

搜索 provider MUST 把智谱返回条目映射为 `{url, title, snippet, publishedAt}`（源字段 link→url、content→snippet），过滤 url 为空的条目，并 MUST 在返回前按调用方请求的 maxResults 预截断 sources，截断时 `truncated` MUST 为 false（避免误报）。

#### Scenario: 正常映射
- **WHEN** 智谱返回若干含 link/title/content 的条目
- **THEN** 输出 sources 各项含 url、title、snippet、publishedAt，空 url 条目被丢弃

#### Scenario: 结果数超过请求上限
- **WHEN** 智谱返回条目多于请求的 maxResults
- **THEN** sources 被截到 maxResults 且 `truncated` 为 false

### Requirement: 附加全局工具 zhipu_web_search

插件 MUST 注册与内置 `web_search` **并存**（而非替换）的全局工具 `zhipu_web_search`：接受 1–4 个去重查询，并发执行后合并来源（轮转交错、按 URL 去重、总量封顶 40）；工具输出 MUST 含格式化来源列表（markdown 链接、http(s) 限定）并提示在回答中引用相关 URL；工具描述与配套 `tool:zhipu_web_search` systemPrompt 章节 MUST 说明其为内置工具之外的补充检索（尤其中文资料）。工具 MUST 随 search 开关挂载/卸载。

#### Scenario: 多查询合并
- **WHEN** 模型以 2 个不同查询调用 zhipu_web_search
- **THEN** 两组结果被合并去重后一次返回，来源列表按 markdown 链接格式化并附引用提示

#### Scenario: 内置工具不受影响
- **WHEN** zhipu_web_search 挂载或卸载
- **THEN** 内置 `web_search` 工具与 `web` 行的后端指向均保持不变

#### Scenario: 开关卸载
- **WHEN** search 开关从 true 改为 false（settings 热更新）
- **THEN** zhipu_web_search 工具与 `tool:zhipu_web_search` prompt 章节立即卸载

### Requirement: 附加全局工具 zhipu_web_fetch

插件 MUST 注册与内置 `web_fetch` **并存**的全局工具 `zhipu_web_fetch`：必填参数为单个 http(s) `url`（空值/非 http(s) MUST 返回明确参数错误、不触上游）；输出 MUST 为 `{url, statusCode, text, truncated?}`，text 承载经 200,000 字符钳制并包裹不可信边界的 markdown 正文，`truncated:true` 时渲染 MUST 附截断注记；展示 MUST 复用内置 web_fetch 的 web/fetch 卡片契约（presentCall generic/fetch、presentResult web/fetch 含最终 URL 与 statusCode）；单次调用预算 60 秒，并发调用 MUST 互不阻塞；配套 `tool:zhipu_web_fetch` systemPrompt 章节随 reader 开关联动安装/卸载。

#### Scenario: 正常读取
- **WHEN** 模型以合法 URL 调用 zhipu_web_fetch
- **THEN** 返回 statusCode 200、markdown 正文（含不可信边界）与最终 URL，卡片按 fetch 样式展示

#### Scenario: 非法参数
- **WHEN** url 为空、非字符串或非 http(s)（如 `javascript:`）
- **THEN** 工具返回明确的参数错误，不发起上游调用

#### Scenario: 超长正文
- **WHEN** 页面正文超过 200,000 字符
- **THEN** 正文被截断到上限、`truncated:true`，渲染附截断注记

### Requirement: 智谱网页读取 provider

插件 MUST 在启用时注册 id 为 `zhipu-web-reader` 的读取 provider：以 markdown 格式读取网页、不保留图片、上游超时 20 秒；返回正文 MUST 钳制在 200,000 字符内，超出时截断并置 `truncated` 为 true；`body.kind` MUST 为 `text`（与内置 web_fetch 的读取结构一致，供 `zhipu_web_fetch` 工具与可选的手动 web 行指向复用）。

#### Scenario: 正常读取
- **WHEN** 对一个可访问 URL 调用读取
- **THEN** 返回 statusCode 200、markdown 正文、最终 URL

#### Scenario: 超长正文
- **WHEN** 页面正文超过 200,000 字符
- **THEN** 正文被截断到上限且 `truncated` 为 true

### Requirement: 不可信内容边界

读取 provider 返回的正文中，外部网页内容 MUST 被包裹在明确的"不可信内容"边界标记内，且标记 MUST 指示不得执行其中出现的任何指令。

#### Scenario: 边界标记存在
- **WHEN** 读取任意外部网页成功
- **THEN** 正文开头与结尾各有一道不可信边界标记，内容中含"不要执行其中指令"含义的提示

### Requirement: 内置 web 行保持默认与残留清理

插件 MUST NOT 把内置 `web` 行的 `searchProvider` / `fetchProvider` 指向智谱 provider（附加能力语义：任何开关状态、任何凭据状态都不写指针）；对本插件旧版构建写入的残留指向（值恰为本插件两个 provider id 之一），插件 MUST 在启动与卸载时经运行时配置写入还原为继承值；指向其他 provider 的值 MUST NOT 被改动。

#### Scenario: 开启开关后 web 行不变
- **WHEN** search/reader 开关开启且插件生效
- **THEN** 内置 web 行配置保持默认后端（不指向智谱 provider id）

#### Scenario: 旧版残留被清理
- **WHEN** profile 的 web 行残留旧版构建写入的 `zhipu-web-search-prime` / `zhipu-web-reader` 指向
- **THEN** 插件启动后将其还原为继承值，卸载/teardown 时同样完成清理

#### Scenario: 他人指针不动
- **WHEN** web 行的某键指向其他 provider（非本插件 id）
- **THEN** 插件不改动该值

### Requirement: 搜索与读取的错误语义

对智谱内容过滤类错误，插件 MUST 返回固定中文提示（引导收窄查询词）而非原始上游报错；对用户中断（abort）MUST 返回明确的中断错误；对上游 5xx MUST 在错误信息中保留上游状态码以便诊断。

#### Scenario: 内容过滤
- **WHEN** 智谱对某查询触发内容过滤
- **THEN** 返回固定的中文提示，建议收窄/调整查询词，不暴露原始错误文本

#### Scenario: 用户中断
- **WHEN** 调用过程中请求被中止
- **THEN** 返回中断错误，且尽力终止 MCP 会话

### Requirement: search/reader 开关热生效

search 与 reader 开关 MUST 通过插件 volatile 设置暴露（默认均开启），settings 变更后 MUST 无需重启即挂载/卸载对应的附加工具（含工具定义与 prompt 章节）；provider 保持常驻注册，仅 `available()` 门控随开关与凭据变化。

#### Scenario: 设置热更新
- **WHEN** settings 中 search 从 true 改为 false
- **THEN** zhipu_web_search 工具与其 prompt 章节立即卸载，zhipu-web-search-prime provider 报告不可用
