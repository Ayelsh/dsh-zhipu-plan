# Proposal

## Why

dsh-zhipu-plan 已管理智谱 Coding Plan 的登录与额度，但智谱套餐自带的 MCP 能力（联网搜索 web_search_prime、网页读取 webReader、开源仓库阅读 zread）尚未接入，DSH 内置的 `web_search` / `web_fetch` 走默认后端，模型也无法阅读 GitHub 仓库。接入后可用已登录的 plan key 直接复用这三项能力，无需额外付费 API。

## What Changes

- 新增精简 Streamable-HTTP MCP 客户端（每调用一个会话：initialize → notifications/initialized → tools/call → best-effort DELETE），Bearer 认证复用本插件已解析的 plan key 凭据（ref 沿用 `planKeyEnvs`：`DSH_ZHIPU_PLAN_KEY` / `DSH_ZHIPU_PLAN_KEY_ZAI`）。
- 联网搜索：注册 `WebSearchProvider`（id `zhipu-web-search-prime`）供 web 服务手动指向；新增**附加全局工具** `zhipu_web_search`（不动内置 `web_search`）：1–4 查询并发合并、来源格式化与引用提示，配套 `tool:zhipu_web_search` prompt 章节。
- 网页读取：注册 `WebFetchProvider`（id `zhipu-web-reader`）供手动指向；新增**附加全局工具** `zhipu_web_fetch`（不动内置 `web_fetch`）：markdown 输出、内容钳制、不可信内容边界包裹，配套 `tool:zhipu_web_fetch` prompt 章节。
- 仓库阅读：注册 3 个全局工具 `github_search_doc` / `github_get_repo_structure` / `github_read_file`（zread MCP 的 `search_doc` / `get_repo_structure` / `read_file`），完整 JSON-Schema 参数，minimal 预设 agent 以动态 deny（当前已挂载附加工具子集）排除。
- 设置：插件 Config 增加 volatile 开关（search / reader / zread，默认 search+reader 开、zread 关），settings 变更热生效；配套 systemPrompt 章节（中英双语）。
- web 行保持默认：附加能力而非替换，内置 `web` 行从不指向智谱；旧版构建写入的残留指向经 `configEditor.edit()` 运行时还原为继承值（不覆盖 patch 行，保持 insert-only 卸载语义）。
- 错误语义：智谱内容过滤错误映射为固定中文提示（引导收窄查询）；zread “仓库未被收录” 映射为明确中文报错；MCP 超时与中断（abort）语义明确。

## Capabilities

### New Capabilities

- `zhipu-web-tools`: 智谱 MCP 附加联网工具 —— `zhipu_web_search` / `zhipu_web_fetch` 的挂载与门控、搜索/读取 provider 的注册（可选手动指向）、多查询合并/截断/来源格式化、不可信内容边界、内置 web 行保持默认与残留清理。
- `zhipu-repo-tools`: 基于 zread MCP 的 GitHub 仓库阅读工具三件套 —— 参数校验（owner/repo 形态）、三个工具的行为与输出、minimal agent 动态排除、配套 prompt 章节。

### Modified Capabilities

（无 —— 项目当前没有任何既有 spec。）

## Impact

- 新增 `src/host/mcp.ts`（MCP 客户端）、`src/host/web-search.ts`、`src/host/web-reader.ts`、`src/host/zread.ts` 及配套 prompt/常量；扩展 `src/host/service.ts`（注册、设置、事件监听、teardown）与 `src/host/types.ts` / `errors.ts`。
- 客户端「联网能力」卡片（`src/client/BackendSettings.tsx`）：四个开关的可视化读写（apple-design 重绘，zh/en 96 键文案对齐）。
- 复用既有接缝：`web.registerSearchProvider` / `web.registerFetchProvider` / `tools.register` / `tools.restrict` / `systemPrompt.section` / `credentials.resolve`；不新增第三方依赖。
- 凭据：ref 沿用 `planKeyEnvs`（`DSH_ZHIPU_PLAN_KEY` / `DSH_ZHIPU_PLAN_KEY_ZAI`），与 service.ts 已写入的 provider 路由 `apiKeyEnv` 同源；凭据缺失时 provider 报不可用而非报错，内置后端与附加工具挂载不受影响。
- 智谱 MCP 硬限制（按 2026-09 实测记录于 design）：web_search_prime 每查询上限 10 条、无 count 参数；webReader timeout 单位为秒；返回可能双层 JSON 编码。
