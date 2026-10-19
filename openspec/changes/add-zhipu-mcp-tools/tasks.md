# Tasks

## 1. MCP 客户端基础设施

- [x] 1.1 新建 `src/host/mcp.ts`：`createMcpSession` / `callMcpTool` / `contentText` / `parseMaybeDoubleEncoded`，每调用一会话（initialize protocolVersion `2024-11-05` → 响应头 `mcp-session-id` → notifications/initialized → tools/call → best-effort DELETE 5s），请求超时 60s 与外置 AbortSignal 合并，8MiB 流式上限，SSE `data:` 帧 + 整体 JSON 双解析。验证：`npm run build` 通过，且用本地 mock fetch 脚本冒烟确认 initialize→call→DELETE 帧序与会话头传递。

## 2. 错误码与类型

- [x] 2.1 扩展 `src/host/errors.ts`：新增 content-filter（固定中文文案）、repo-not-found（“仓库未被智谱收录。请改用其他方式访问 GitHub。”）、disabled、abort 四类错误码与上游 5xx 摘要后缀逻辑；`src/host/types.ts` 补搜索/读取/工具结果类型与 volatile 设置字段类型。验证：`npm run build` 通过。

## 3. 联网搜索后端

- [x] 3.1 新建 `src/host/web-search.ts`：provider（id `zhipu-web-search-prime`）同步 `available()` 门控（开关 + 凭据 ref 可解析，无网络请求），search 调 `web_search_prime{search_query}`，条目映射 link→url/content→snippet/publishedAt、空 url 过滤、按 maxResults 预截断且 `truncated:false`。验证：`npm run build` 通过 + mock 冒烟映射与截断。
- [x] 3.2 同文件加 agent 级影子工具 `web_search`：1–4 查询去重并发、轮转合并 URL 去重封顶 40、markdown 来源格式化（http(s) 限定、方括号转义）与引用提示、presentCall/presentResult 卡片；仅对 `tools.get('web_search', agent) === undefined`（本就可见）的 agent 注入。验证：`npm run build` 通过 + mock 冒烟多查询合并。

## 4. 网页读取后端

- [x] 4.1 新建 `src/host/web-reader.ts`：provider（id `zhipu-web-reader`）available 门控、fetch 调 `webReader{url, return_format:'markdown', retain_images:false, timeout:20}`、`parseMaybeDoubleEncoded` 解包、200,000 字符钳制（超限 `truncated:true`）、`body.kind:'text'` 且正文包裹中英双语不可信边界标记。验证：`npm run build` 通过 + mock 冒烟截断与边界标记。

## 5. zread 仓库工具

- [x] 5.1 新建 `src/host/zread.ts`：三工具 `github_search_doc`/`github_get_repo_structure`/`github_read_file` 映射 `search_doc`/`get_repo_structure`/`read_file`，参数用完整 JSON-Schema（`type:'object'`+`additionalProperties:false`+required），`REPO_NAME_PATTERN=/^[\w.-]+\/[\w.-]+$/` 前置校验（非法即中文报错、不发上游），output `{text}`、`timeoutMs:60_000`、`isConcurrencySafe:true`、presentCall 容忍历史坏参；配套 3 个 `tool:github_*` systemPrompt 章节（中英按 `zhPrompt`）。验证：`npm run build` 通过 + mock 冒烟非法 repo_name 不触上游。

## 6. 服务集成与热生效

- [x] 6.1 `src/host/service.ts`：Config 增加 volatile 字段 `search`(true)/`reader`(true)/`zread`(false)/`zhPrompt`(false)（`.volatile()` 退回 `meta.volatile`）；`static inject` 增加 `'web','tools','systemPrompt','agents'`；先以 `settings.describe()` 核实 web 行：实测该行非 volatile（`settings.mutate('web')` 抛 `Plugin entry "web" has no volatile fields`），故改用 `configEditor.edit()` 漂移改写 `searchProvider`/`fetchProvider`，仅当开关开启且 plan 凭据可解析时指向智谱 provider id，关闭/teardown 时还原继承值；host 服务用 `ctx.inject` 作用域注入而非 `static inject`（避免 web 行 remount 触发服务重启循环，见 design D2/D4）。验证：`npm run build` 通过，describe/entries 核实记录于 design D2 与 e2e 证据。
- [x] 6.2 同文件加生命周期：常驻注册两 provider（注册冲突 25ms×8 重试）；`refresh()` 按开关幂等挂载/卸载（zread 工具+prompt 章节、web 行指向）；监听 `loader/volatile-update`、`agent/created`、`agent/disposed`、`agent-preset/selected`（minimal 探测 `agentPresets.composedPreset` 异常按非 minimal，minimal 走 agent 级 `tools.restrict({deny})`）；`ctx.effect` 统一回收并恢复 web 行（恢复由 init 时 poller 重试完成以规避 HMR 事务嵌套，方法内 ctx 访问走 `ctx.root`）。验证：`npm run verify` 全绿 + 离线集成冒烟 `scripts/integration-smoke.mjs`。
- [x] 6.3 端到端冒烟（附加语义）：真实 profile 挂载后 ① 附加工具 `zhipu_web_search`/`zhipu_web_fetch` 出现在全局工具列表且调用返回来源/正文，内置 web_search/web_fetch 后端不变（web 行保持默认）；② settings 热切换 search=false 后 `zhipu_web_search` 立即卸载、重开立即回归；③ zread=true 后三工具可见、minimal agent 看不到任何已挂载附加工具；④ 卸载插件后无残留（web 行为默认值、附加工具全部消失）。验证：四项逐一观察记录。

  实测（2026-10-19，隔离 home `/tmp/e2e-dsh-home-v6` + probe 插件 18/18）：启动时清除旧构建残留的 web 行 zhipu 指向并回到默认 deepseek-official/http；默认开关下 `zhipu_web_search`/`zhipu_web_fetch` 全局挂载、`zread: true` 时三件 github 工具挂载；两工具调用均路由到智谱 MCP（假 key 下报 `ZHIPU_PROVIDER_ERROR: MCP initialize returned no mcp-session-id`），内置 web_search 仍报 DEEPSEEK_API_KEY 缺失；热切换 search=false→true、zread=false 即时卸载/回归且 web 行全程不动、内置工具目录集合不变；禁用 bundle 后重播种的残留被再次清除且全部附加工具注销。

- [x] 6.4 在插件设置页（Settings → 智谱套餐）增加「联网能力」卡片，暴露四个 volatile 开关（`search`/`reader`/`zread`/`zhPrompt`），经 shell 的 `remote.settings` 命名空间 `describe()`/`mutate()`（带 revision、冲突即重读）读写，卡片置于方案账户之上；验证：jsdom 渲染冒烟 + `npm run verify` 绿、安装到桌面 profile 后重启可见。

- [x] 6.5 附加能力改造（用户 m01527）：删除 web 行指向与影子 web_search 注入，改为全局附加工具 `zhipu_web_search`（原影子工具重命名，1–4 查询合并语义不变）与新增 `zhipu_web_fetch`（url 校验、markdown 正文、truncated 注记、web/fetch 卡片、60s 预算、并发安全）；web 行改为仅残留清理（wanted 恒 undefined，绝不指向、绝不清他人指针）；minimal deny 动态化为已挂载附加工具子集；配套 `tool:zhipu_web_*` prompt 章节（order 110，中英双语）。验证：build/verify 绿 + 重写后的 `scripts/web-providers-smoke.mts` 与 `scripts/integration-smoke.mjs`（33 项断言：残留清理、开关热挂载/卸载、minimal deny 动态、外指针不动、teardown 还原）全过。
- [x] 6.6 「联网能力」卡片 apple-design 重绘（用户 m01524）：iOS 分组列表式半透明卡片、整行 role=switch 按钮、28px 图标瓦片、按压缩放/即时反馈、reduced-motion/transparency/contrast 变体、乐观切换与错误回退，文案改为「附加工具，内置保持不变」语义（zh/en 96 键对齐，logic-freeze 重钉）。验证：`npm run build`/`verify` 绿 + `scripts/render-smoke.mjs` RENDER OK。

- [x] 6.7 两个视图改为 tab + 液态磨砂玻璃重绘（用户 m01934）：页面拆成「联网能力」/「套餐账户」两个视图，由本插件自有的 `src/client/SettingsTabs.tsx` 承载（`role=tablist`/`role=tab`/`role=tabpanel`，方向键/Home/End、`useId` 关联、视图首次选中后保持挂载以免丢状态与在途读取）；玻璃材质落在 `styles.ts`（`--dzp-glass*` 变量、`backdrop-filter: blur(26px) saturate(180%)`、sheen + 双层内高光、环境色场 `::before` 只承载光不叠表面、滑块单一元素位移而非交叉淡入、按下即缩放、reduced-motion/transparency/contrast 变体）。深色分支改用 `body[data-ds-dark-theme]`（应用以该属性切换调色板，而非 `prefers-color-scheme`）；卡片去掉与 tab 重复的标题。验证：`npm run build`/`verify` 绿（zh/en 97 键对齐）、`scripts/render-smoke.mjs` RENDER OK（新增 tab 断言）、`scripts/preview.mjs` + `preview-shots.mjs` 18 图（含 web-cn/web-en 双主题）目视确认。
- [x] 6.8 版面留白与用量区重绘（用户 m02354）：① 顶部留白 —— 宿主设置面板的滚动列是 `.options { padding: 0 24px 24px; overflow-y: auto }`，页面自身没有内边距，环境光场（`::before` 上溢 12px）与 tab 条上圆角被滚动列上缘裁切；改为 `.dzp-panel { padding: 16px 0 6px }`，光场与圆角在容器内完整可见。② 套餐账户下半部（用量趋势）按同一液态玻璃语言重绘：区间控制升级为玻璃轨道 + 单一滑块位移（`.dzp-rangeTabs`/`.dzp-rangeThumb`，`--dzp-range-index` 位移、按下即缩放、等待态保持原 `[data-loading]` 下划线）；整块读取结果承载于一块玻璃面（`.dzp-usagePanel`：16px 18px 内边距、16px 圆角、sheen + 内高光 + 三层阴影），与上方 hero/额度卡同级；模型与工具两张裸表格改为分块（`.dzp-usageBlock` + 细分隔线 + 计数行 `.dzp-usageTotal`）；活跃度由 6 行 label/value 列表改为自适应数字栅格（`.dzp-stats`/`.dzp-stat`/`.dzp-statLabel`/`.dzp-statValue`/`.dzp-statMeta`，数值 17px/600 等宽数字，解码速度整行小字），订阅沿用事实行并归入同一玻璃面。③ 新增字典键 `usageActivity`（活跃度 / Activity），zh/en 98 键对齐、logic-freeze 重钉；reduced-transparency 补 `.dzp-usagePanel` 实心、contrast 补边框、reduced-motion 保留既有降级（滑块不位移、内容仅淡入）。验证：`npm run build`/`verify` 绿（98 键）、`scripts/render-smoke.mjs` RENDER OK、`scripts/integration-smoke.mjs` 绿、`scripts/preview.mjs` + `preview-shots.mjs` 20 图目视确认；其中新增 `in-column` 预览帧，按宿主 `.panel`/`.header`/`.options` 几何 1:1 复刻设置面板滚动列，专门验证问题 ①。

## 7. 文档

- [x] 7.1 更新 README：三项能力、默认开关、凭据来源（复用 plan key ref，无新 ref）、硬限制（每查询 10 条、reader timeout 秒、双层编码防护）、web 行运行时改写与恢复语义。验证：文档段落存在且与实现一致。
- [x] 7.2 README 与 openspec 工件同步附加能力语义：能力清单改为附加工具（zhipu_web_search/zhipu_web_fetch/github_*）、「web 行从不改写、仅清理残留」说明、zhipu-web-tools spec 整体重写、zhipu-repo-tools minimal 要求动态化、design 变更记录（D2/D5/D6/D7 + 变更记录节）、proposal 同步。验证：文档/spec 与实现一致。
