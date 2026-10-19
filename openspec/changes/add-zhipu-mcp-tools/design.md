# Design

## Context

本插件（dsh-zhipu-plan v0.2.4）当前是单一 cordis 服务架构：默认导出 `ZhipuPlanService`（[src/host/service.ts:285](../../../src/host/service.ts#L285)，`static inject = ['credentials','authorization','settings']`），由 Loader 用 `cordis.patch.yml` 里 `zhipu-plan` 行的 Config 实例化。已具备：浏览器登录流 → plan 凭据写入 `credentials`（每部署一个 ref，见 `planKeyEnvs`，默认 `DSH_ZHIPU_PLAN_KEY` / `DSH_ZHIPU_PLAN_KEY_ZAI`）、`syncProviderRoutes()`（[src/host/service.ts:594](../../../src/host/service.ts#L594)）用 `ctx.settings.mutate('llm-pi-ai', ops)` 运行时改写 pi-ai 路由的 `apiKeyEnv`、额度监控。构建为 `node scripts/build.mjs`（esbuild 打包，无新增依赖的余地与必要）。

智谱对外 MCP（探索阶段已实测确认，参照社区插件 deepseek-harness-zhipu_plan_tools@0.1.7 的验证实现）：

- 端点（mainland）：`https://open.bigmodel.cn/api/mcp/web_search_prime/mcp`、`.../web_reader/mcp`、`.../zread/mcp`；认证 = Coding Plan API key 作 `Authorization: Bearer`。
- Streamable-HTTP 会话：POST `initialize`（protocolVersion `2024-11-05`）→ 从**响应头** `mcp-session-id` 取会话 → `notifications/initialized`（fire-and-forget）→ `tools/call` → best-effort `DELETE`。
- 工具与参数：`web_search_prime{search_query,...}`（每查询**硬上限 10 条**，无 count 参数，`additionalProperties:false`）；`webReader{url, return_format:'markdown', retain_images:false, timeout:20}`（timeout 单位**秒**）；zread `search_doc{repo_name,query,language?}` / `get_repo_structure{repo_name,dir_path?}` / `read_file{repo_name,file_path}`。
- 已知坑：返回体可能**双层 JSON 编码**；content-filter 报错需映射为固定中文提示；zread 对未收录仓库报 repo not found；流式响应需 8MiB 上限防护。

## Goals / Non-Goals

**Goals:**

- 附加全局工具 `zhipu_web_search` / `zhipu_web_fetch` 走智谱 MCP，内置 `web_search` / `web_fetch` 保持默认后端不变；凭据零新增（复用 plan 凭据 ref）。
- zread 三工具对非 minimal agent 可用，参数错误与上游错误信息明确。
- 开关、语言等设置 volatile 热生效；卸载/关闭后无任何残留（web 行从不指向智谱，旧版构建残留被清理）。

**Non-Goals:**

- 不做禁用时的 DeepSeek 兜底搜索（社区插件有；本插件禁用即回 DSH 内置默认后端，语义更简单）。
- 不做 reader 的 SSRF 防护型 http 兜底 fetch（同理，禁用时走内置默认）。
- 不做自热更新（hmr.registerConfig）机制；沿用现有 build/reload 流程。
- 不做国际站（api.z.ai）MCP 的实测适配，仅把 origin 留为可配置项。

## Decisions

**D1. MCP 传输：每次调用一个短会话，不做长驻会话。** initialize → initialized → tools/call → DELETE，单请求超时 60s、DELETE 5s、外置 AbortSignal 合并。理由：无会话失效/续期问题，与已验证实现一致，失败重试天然安全。替代方案（长驻会话省 1 个 RTT）被否：会话 TTL、身份变更后的失效处理都是未验证面。

**D2. 内置 web 行后端指向：运行时通过 `configEditor.edit()` 改写 profile 配置层，不用 patch 行覆盖。** 实施前核实（0.2.0-rc.1）：`web` 行的 `searchProvider`/`fetchProvider` **不是 volatile 字段**，`settings.mutate('web', ops)` 会抛 `Plugin entry "web" has no volatile fields`；因此改用 host 的 `configEditor.edit(entry, (current, inherited) => next)`（与 Models 页同一条运行时写路径）：从 `entries()` 取 `id === 'web'` 的行，开启时把两个键指向本插件 provider id，关闭/卸载时把两个键还原为继承值；返回与 inherited 全等的对象即删除该 profile 行配置，回落到 bundle 默认行（`deepseek-official` / `http`）。编辑该行会 remount `web` 服务并丢弃 provider 注册，因此编辑后立即重新注册（重复注册视为成功）。仅当开关开启且 plan 凭据可解析时才写指针——host 对 configured-but-unavailable provider 直接报错、**不回落**，未登录时必须保持默认后端。`describe()` 中若未来出现 `'web'` 行（该行变为 volatile）则优先走 `settings.mutate('web', ops)` 作为前向兼容。理由：patch 覆盖行会 outlive 本 bundle，阻碍插件卸载；运行时编辑保持 `cordis.patch.yml` insert-only。
**变更（m01527，附加能力改造）：**「开启时指向」分支已废止——`reconcileWebBackends()` 的 wanted 恒为 `undefined`，web 行**只做残留清理**（旧版构建写入的本插件 id 指向还原为继承值，他人指针不动）；`settings.mutate('web')` 前向兼容分支保留但同样只清理。provider 常驻注册、`available()` 门控不变。
**D3. 凭据：复用 `planKeyEnvs` 的 ref，不引入新的 `ZAI_CODING_CN_API_KEY`。** provider/工具调用时按存储账户的 deployment 选 ref（`bigmodel` → mainland 端点；`zai` → 国际 origin，默认同 mainland 常量），`credentials.resolve` 取值；`available()` 同步门控 = 开关开 且（存储账户存在 或 credentials seam 可用）。理由：service 已把解析出的 plan key 写进这些 ref，双份凭据源只会造成漂移。

**D4. 挂载点：扩展 `ZhipuPlanService`，不另立插件入口；host 服务用作用域注入而非静态注入。** 不把 `'web','tools','systemPrompt','agents'` 加进 `static inject`：cordis 以每个注入服务的 impl fiber uid 构成 fiber epoch，静态注入 `'web'` 会让本服务在每次 web 行 remount 时整实例重启，与 D2 的"编辑行 → remount → 再次编辑"形成重启/恢复循环（0.2.0-rc.1 实测）。改为在 `[Service.init]` 内 `ctx.inject(['web'], scope => …)` / `ctx.inject(['tools','systemPrompt'], …)`：子 fiber 只在被注入服务替换时局部重载，provider 在其中常驻注册（`available()` 门控）；agent 级影子工具与 zread 工具按事件挂载/回收。后台收敛由 init 时创建的 100ms `setInterval` 驱动（token-free 异步上下文），确保 `configEditor.edit()` 不在 loader 的 HMR 事务内执行（事务嵌套会抛 `HMR transactions cannot be nested`）；teardown 的 web 行恢复也交给该 poller 重试，服务方法内对 `settings`/`configEditor` 的访问统一走 `ctx.root`，避免 inactive fiber 报 `cannot get required service`。理由：本包是"一行一服务"结构，Loader 按行实例化默认导出；新入口文件会破坏该约定。

**D5. 设置：既有 schemastery Config 上加 volatile 布尔字段。** `search`(默认 true)、`reader`(true)、`zread`(false)、`zhPrompt`(false)；`.volatile()` 不可用时退回 `meta.volatile = true`（社区已验证 host 读 meta）。监听 `loader/volatile-update` → 重读 config → `refresh()` 幂等挂载/卸载。理由：与现有 Config 校验链一致，避免运行时另设设置通道。**补充（用户要求可见 UI）：** 四个开关由浏览器半部渲染在「设置 → 智谱套餐」页顶部的「联网能力」卡片（`src/client/BackendSettings.tsx`），经 shell 的 `remote.settings` 命名空间 `describe()`/`mutate()`（携带 revision，冲突即重读）读写；DSH 只通过插件自己的设置页渲染 bundle 插入行的配置，不会自动生成通用 Config 表单，因此必须自带界面。**（m01524 apple-design 重绘：iOS 分组列表式半透明卡片、整行 role=switch 按钮、reduced-motion/transparency/contrast 变体，见 `src/client/BackendSettings.tsx`。）**

**D6. agent 作用域：事件驱动 + effect 回收；附加工具为全局注册，agent 面只做 minimal deny。** `agent/created`、`agent/disposed`、`agent-preset/selected` 安装/回收 per-agent 面；minimal 预设（`agentPresets.composedPreset(...) === 'minimal'`，异常按非 minimal）经 agent 级 `tools.restrict({deny})` 屏蔽**当前已挂载附加工具名的动态子集**（`zhipu_web_search` / `zhipu_web_fetch` / 三个 `github_*` 中挂载了哪些就 deny 哪些）；非 minimal agent 无任何 agent 级注册——附加工具全局可见，无需逐 agent 注入。**变更（m01527）：** 早期「影子 `web_search` 按 agent 同名替换注入」方案已删除，附加语义下内置 `web_search` 原样保留。注册冲突按 25ms×8 重试接管后放弃并 `console.error`。

**D7. 错误与输出契约：采纳已验证映射。** content-filter（`/content[\s_-]?filter/i`）→ 固定中文提示（引导收窄查询）；repo not found → “仓库未被智谱收录。请改用其他方式访问 GitHub。”；上游 5xx 保留 `(upstream HTTP -5xx)` 摘要后缀；zread 工具 `timeoutMs` 60s、`isConcurrencySafe: true`、output schema `{text}`；reader 正文 200k 字符钳制并包裹不可信边界标记；搜索结果按 `maxResults` 预截断（`truncated:false`），附加工具 `zhipu_web_search` 多查询（1–4）轮转合并、URL 去重、封顶 40；附加工具 `zhipu_web_fetch` 输出 `{url, statusCode, text, truncated?}`（markdown 正文 + 截断注记，`timeoutMs` 60s、并发安全），展示复用内置 web_fetch 的 web/fetch 卡片契约（presentCall generic/fetch、presentResult web/fetch）。

## Risks / Trade-offs

- [web 行命名空间/键名与假设不符] → 已核实：命名空间 `web`、键 `searchProvider`/`fetchProvider` 正确，但该行非 volatile，故改走 `configEditor.edit()`（见 D2）；若 `entries()` 里没有 `web` 行或 `configEditor` 不可用，保持 provider 注册但不改写指向，并只在日志警告一次（降级不炸）。
- [web_search_prime 单查询 10 条硬上限，无 count 参数] → 附加工具支持 1–4 查询扇出合并，prompt 章节明确教“聚焦查询”；不做虚假的 count 参数。
- [双层 JSON 编码返回] → `parseMaybeDoubleEncoded`（最多两次 JSON.parse）统一解包。
- [运行时改写 web 行与其他层并发写] → 附加语义下仅清理本插件旧版残留指向（还原为继承值而非写死 provider id），他人值永不动，冲突面最小。
- [静态注入 web 触发服务重启循环 / teardown 落在 HMR 事务内] → 作用域注入 + init 时 poller（100ms）驱动收敛与 teardown 重试；服务方法内 ctx 访问走 `ctx.root`。真实宿主 bundle 禁用冒烟已验证 web 行恢复默认。
- [minimal 预设探测在旧版 host 不可用] → try/catch 按非 minimal 处理（宁可多暴露工具，也不误伤普通 agent）。
- [国际站 MCP 未实测] → 默认 mainland origin；`zai` deployment 暂用同常量，Config 预留 origin 覆盖字段，待实测后再分端点。
- [大响应流] → 8MiB 内容上限（content-length 预检 + 累计计数），超限报错不截断（MCP 帧解析需要完整体）。

## Migration Plan

1. 合入后随下一次插件构建发布；Config 新字段全部带默认值，旧配置文件无需迁移。
2. 首次生效时按 默认 search+reader=on / zread=off 挂载附加工具，并清理旧版构建可能写入的 web 行残留指向。
3. 回滚：卸载或关闭开关 → teardown 通过 `configEditor.edit()` 还原继承层，web 行回默认后端；极端情况下可手工从 profile 配置移除 `web` 行的 `searchProvider`/`fetchProvider`。

## Open Questions

- 国际站（api.z.ai）的 MCP 端点路径与工具名是否与 mainland 完全一致（不阻塞：默认 mainland，origin 可配）。
- `web` 行默认（未改写时）的 searchProvider/fetchProvider 具体值是否为空（影响 unset 语义的验证方式；`op:'unset'` 即恢复，无需知道默认值）。

## 变更记录

- **m01527（用户指令）：附加能力改造。** MCP 能力从「替换内置 `web_search`/`web_fetch` 后端」改为「额外附加工具」：新增全局 `zhipu_web_search`（原影子工具重命名，扇出/合并语义不变）与 `zhipu_web_fetch`（新增读取工具）；web 行不再指向智谱（仅残留清理）；影子注入删除，minimal deny 动态化为已挂载附加工具子集。spec delta `zhipu-web-tools` 整体重写为附加语义，`zhipu-repo-tools` 的 minimal 要求同步改为动态子集。
- **m01524（用户指令）：「联网能力」卡片按 apple-design 重绘**（iOS 分组列表、半透明材质、整行开关、reduced-* 变体），文案改为「附加工具，内置保持不变」语义（zh/en 96 键对齐）。
