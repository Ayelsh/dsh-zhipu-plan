# add-zhipu-mcp-tools — 真实宿主 e2e 证据（任务 6.3）

日期：2026-10-19。宿主：deepseek-harness `0.2.0-rc.1`。
隔离环境：`DSH_HOME=/tmp/e2e-dsh-home-v6`，profile `zhipu-web-e2e`（dsh-base + dsh-web-app + dsh-zhipu-plan + 探针），未触碰用户桌面 profile。
凭据：`.credentials.yaml` 中伪造 `zhipu-plan/account` grant（deployment=bigmodel）+ `DSH_ZHIPU_PLAN_KEY=fake-plan-key` 环境变量，使 `planKeyFor` 可解析；**非真实 plan key**，因此上游只可能返回鉴权失败——恰好证明请求确实离开了宿主。

驱动器：临时探针插件 `/tmp/dsh-e2e-probe`（无 inject，`ctx.get` 惰性取服务；检查后 `process.exit`）。
启动：`DSH_HOME=/tmp/e2e-dsh-home-v6 DSH_ZHIPU_PLAN_KEY=fake-plan-key node apps/cli/lib/bin.js --profile zhipu-web-e2e --no-open --port 0`
日志：`/tmp/e2e-probe-v6.log`（18/18 PASS）。

## 附加能力语义的 18 项观察

| # | 观察 | 结果 |
| --- | --- | --- |
| 1 | 启动时清除旧构建残留：profile 预播种 `web` 行指向 `zhipu-web-search-prime` / `zhipu-web-reader`，启动后行恢复 `deepseek-official` / `http` | PASS |
| 2 | `web.searchProviderId` = `deepseek-official`（内置后端未被改写） | PASS |
| 3 | `web.fetchProviderId` = `http` | PASS |
| 4 | web 注册表仍含两个智谱 provider（手工指向依然可用） | PASS |
| 5 | `zhipu_web_search` 全局挂载 | PASS |
| 6 | `zhipu_web_fetch` 全局挂载 | PASS |
| 7 | `zread: true`（持久化在 profile patch）时三件 github 工具全局挂载 | PASS |
| 8 | `zhipu_web_search` 调用确实到达智谱 MCP：`ZHIPU_PROVIDER_ERROR: MCP initialize returned no mcp-session-id header` | PASS |
| 9 | `zhipu_web_fetch` 调用确实到达智谱 reader：同上（`web_reader` 端点） | PASS |
| 10 | 内置 `web_search` 仍报 `WEB_PROVIDER_CREDENTIAL_MISSING … DEEPSEEK_API_KEY`——没有被劫持 | PASS |
| 11 | 热切换 `search=false` → `zhipu_web_search` 卸载 | PASS |
| 12 | 同一切换中 `zhipu_web_fetch` 存活（开关各自独立） | PASS |
| 13 | 该切换全程 `web` 行未被动过 | PASS |
| 14 | 热切换 `search=true` → `zhipu_web_search` 回归 | PASS |
| 15 | 热切换 `zread=false` → 三件 github 工具卸载 | PASS |
| 16 | 全部切换前后内置工具目录集合不变 | PASS |
| 17 | 重新播种残留后 `pluginManager.setBundleEnabled('dsh-zhipu-plan', false)` → 残留被清除回默认 | PASS |
| 18 | 同一次卸载后全部附加工具注销 | PASS |

## 对照任务 6.3 四项

| 观察项 | 状态 | 证据 |
| --- | --- | --- |
| ① 附加工具出现在全局工具列表且调用返回来源/正文，内置后端不变 | 通过（路由部分） | 5/6/7 挂载；8/9 调用到达智谱；10 内置未被劫持。返回真实来源/正文需真实 plan key（当前 fake key 被上游拒绝），未执行 |
| ② 热切换 `search=false` 立即卸载、重开立即回归 | 通过 | 11/14（并观察 12/13 的独立性与零副作用） |
| ③ `zread=true` 三工具可见、minimal agent 看不到附加工具 | 部分 | 7 真实宿主确认三工具可见；minimal 掩蔽在离线冒烟 `scripts/integration-smoke.mjs` 中验证（真实 profile 未构造 minimal 会话） |
| ④ 卸载插件后无残留 | 通过 | 17/18（bundle 禁用即真实卸载路径） |

## 复现命令

```sh
cd /home/ayelsh/workspace/deepseek-harness
DSH_HOME=/tmp/e2e-dsh-home-v6 node apps/cli/lib/bin.js plugin --profile zhipu-web-e2e add \
  /tmp/e2e-pack/dsh-zhipu-plan-0.2.5-e2e4.tgz
DSH_HOME=/tmp/e2e-dsh-home-v6 DSH_ZHIPU_PLAN_KEY=fake-plan-key \
  node apps/cli/lib/bin.js --profile zhipu-web-e2e --no-open --port 0
```

探针、日志与打好的 tgz 都在 /tmp，不入库；本文件是观察结果的记录。
