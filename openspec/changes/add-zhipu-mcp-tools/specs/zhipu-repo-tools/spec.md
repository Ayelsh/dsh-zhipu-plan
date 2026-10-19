# Spec Delta

## Purpose

让模型通过智谱 zread MCP 阅读 GitHub 开源仓库：搜索仓库文档、获取目录结构、读取文件内容；包含参数校验、minimal 预设排除、中英双语提示与明确的错误语义。

## ADDED Requirements

### Requirement: 仓库阅读三工具

插件 MUST 注册三个全局工具，分别映射 zread MCP 的对应工具：`github_search_doc`→`search_doc`（参数 repo_name、query，可选 language）、`github_get_repo_structure`→`get_repo_structure`（repo_name，可选 dir_path）、`github_read_file`→`read_file`（repo_name、file_path）。必填参数缺失时 MUST 返回明确的参数错误。

#### Scenario: 搜索仓库文档
- **WHEN** 模型调用 github_search_doc，repo_name=`zai-org/ZCode`、query=`mcp auth`
- **THEN** 返回该仓库与查询相关的文档/代码片段文本

#### Scenario: 读取仓库文件
- **WHEN** 模型调用 github_read_file，repo_name 与 file_path 合法
- **THEN** 返回该文件内容文本

#### Scenario: 获取目录结构
- **WHEN** 模型调用 github_get_repo_structure，repo_name 合法
- **THEN** 返回该仓库（或指定 dir_path 子目录）的结构文本

### Requirement: repo_name 形态校验

三个工具的 repo_name MUST 匹配 `owner/repo` 形态（`^[\w.-]+\/[\w.-]+$`）；不匹配时 MUST 返回明确的中文参数错误，MUST NOT 发起上游调用。

#### Scenario: 非法 repo_name
- **WHEN** repo_name 传入 `ZCode`（缺 owner）或含空格的字符串
- **THEN** 工具返回参数错误并说明需要 `owner/repo` 形态，不调用上游

### Requirement: 工具输出与展示

三个工具的输出 MUST 为 `{text}` 文本结构，卡片展示为 generic/fetch 风格；对历史回放中无法解析的调用参数，展示层 MUST 静默降级而非抛错。

#### Scenario: 输出结构
- **WHEN** 任一工具调用成功
- **THEN** 工具返回 text 字段承载正文，前端按 fetch 卡片展示

#### Scenario: 历史参数回放
- **WHEN** 展示层收到无法解析的旧调用参数
- **THEN** 卡片降级展示而不抛出异常

### Requirement: minimal 预设 agent 排除

任一附加工具（github_*、zhipu_web_search、zhipu_web_fetch）挂载期间，对 minimal 预设的 agent，插件 MUST 通过该 agent 作用域的工具 restrict（deny 当前已挂载的附加工具名子集）将其排除，MUST NOT 改变其他 agent 的工具视图。

#### Scenario: minimal agent 看不到工具
- **WHEN** 任一附加工具挂载（如 zread 开启）且某 agent 的组合预设为 minimal
- **THEN** 该 agent 的工具视图中不出现任何已挂载的附加工具（含三个 github_*）

#### Scenario: 非 minimal agent 不受影响
- **WHEN** zread 开启且 agent 预设非 minimal
- **THEN** 该 agent 正常看到三个 github_* 工具

### Requirement: zread 开关与 prompt 章节热生效

zread 开关 MUST 通过插件 volatile 设置暴露（默认关闭），且 MUST 随开关联动安装/卸载三个配套 systemPrompt 章节（`tool:github_*`，中英双语按设置选择）；settings 变更后无需重启即生效。

#### Scenario: 默认关闭
- **WHEN** 插件首次生效且用户未改设置
- **THEN** 三个 github_* 工具未注册、prompt 章节未安装

#### Scenario: 开启后联动
- **WHEN** zread 开关从 false 改为 true
- **THEN** 三个工具与配套 prompt 章节立即注册；语言设置切换时章节文本随之切换

### Requirement: zread 错误语义

上游返回“仓库未找到/未被收录”时，工具 MUST 返回明确中文报错（提示改用其他方式访问 GitHub）；工具禁用状态下被调用时 MUST 返回明确的 ZHIPU_DISABLED 类错误；单次调用超时上限 60 秒，且并发调用 MUST 互不阻塞。

#### Scenario: 仓库未被收录
- **WHEN** 上游对某 repo_name 返回 repo not found 类错误
- **THEN** 工具返回中文报错“仓库未被智谱收录，请改用其他方式访问 GitHub”

#### Scenario: 禁用状态调用
- **WHEN** zread 开关关闭期间工具因历史会话被调用
- **THEN** 返回 ZHIPU_DISABLED 类明确错误而非静默失败

#### Scenario: 超时
- **WHEN** 上游单次调用超过 60 秒
- **THEN** 工具返回超时错误并终止 MCP 会话
