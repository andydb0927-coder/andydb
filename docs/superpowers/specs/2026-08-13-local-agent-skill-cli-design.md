# 本地 Agent / Skill / CLI 扩展设计

## 目标与边界

在现有无线画布、AI 导演、工作流、专业时间线和本地工作区之上增加一个可扩展但完全本地的 Agent 层。所有执行必须是确定性函数：不调用外部 LibTV、不访问生成提供方、不消耗积分，也不声称具备云同步。

本阶段保留已有 AI 导演快捷命令；新增的技能中心负责浏览、启停和执行结构化技能。技能结果可以作为结果卡片显示，或显式写入一个文本画布节点。写入动作沿用项目 store 和 IndexedDB 持久化链路，不能绕过撤销/保存状态。

## Agent 与技能模型

`AgentSkillDefinition` 是注册表的唯一扩展契约：

- `id`、`name`、`description`、`version`、`category`
- JSON 兼容的 `inputSchema`，限定字段类型、必填项与枚举值
- `outputMode`，声明结果默认适合卡片还是画布节点
- `execute(input, context)`，只接收显式输入和只读本地上下文，返回结构化结果

注册表拒绝重复 id；执行前统一做 schema 校验和启用状态检查。启用状态保存在浏览器 localStorage，注册表本身不依赖 React。

内置五个技能：批量生成分镜提示词、素材整理报告、时间线时长统计、作品发布文案生成、项目备份检查。输出顺序稳定，测试可注入固定项目与时间线；任何时间字段来自项目数据而不是执行时随机生成。

## UI 与画布写入

新增 `/agents` 平台页和导航入口。页面由技能列表、启用开关、输入表单、执行按钮、结果卡片组成。不同技能只暴露 schema 中的输入字段。

结果卡片显示技能名、摘要和正文。用户可把最近一次结果写入当前选择项目；系统创建 `text` 节点，标题与 prompt 来自技能结果，位置按现有节点包围盒右侧确定性放置。没有项目时只显示卡片并禁用写入。页面明确标注“仅本地确定性逻辑”。

AI 导演面板增加“打开技能中心”入口，使原有命令与新 Agent 能力形成连续路径，不改变原命令确认语义。

## 本地工作区 CLI 兼容层

新增与外部 `libtv` 二进制隔离的 `/api/workspace/*` 本地只读接口。统一响应 envelope：

- 成功：`{ schemaVersion: 1, data }`
- 失败：`{ schemaVersion: 1, error: { code, message, details? } }`

导出命令清单由 `GET /api/workspace/manifest` 提供，包含稳定 command id、HTTP 方法、路径、输入/输出 schema id 和文件格式。首批命令：

- `workspace.project.export`：项目 JSON
- `workspace.project.import.validate`：只校验项目 JSON，不落盘
- `workspace.assets.manifest`：素材清单 JSON
- `workspace.timeline.edl`：CMX 3600 风格 EDL 文本

接口不读取浏览器 IndexedDB；调用方必须显式提交项目或时间线 payload，因此 server 无隐式本地数据访问。POST 限制 JSON、1 MiB 请求体和规范错误码：`METHOD_NOT_ALLOWED`、`UNSUPPORTED_MEDIA_TYPE`、`INVALID_CONTENT_LENGTH`、`PAYLOAD_TOO_LARGE`、`INVALID_JSON`、`SCHEMA_VALIDATION_FAILED`、`UNKNOWN_COMMAND`、`INTERNAL_ERROR`。Vite middleware 只拦截白名单路径，其余请求继续传递。

## 可扩展性

真实生成提供方继续通过现有 `GenerationAdapter` 边界接入；本地技能通过 registry loader 接入；云同步应实现新的 repository/sync adapter，不得改变项目 schema 的本地所有权。扩展指南记录目录、契约、测试、错误码和安全边界。

## 验收

- 五个技能执行结果确定、schema 校验有效、启停状态可持久化。
- Agent 页可执行技能、显示结果卡、将结果写入画布文本节点。
- manifest 与四个本地 CLI 命令契约可测试，项目导入只校验不写磁盘。
- 既有 LibTV bridge 行为不回归。
- Vitest、TypeScript typecheck、Vite build 全部通过；Chromium E2E 明确不运行。
