# 无线画布第 13 阶段 Agent / Skill / CLI TDD 实施计划

日期：2026-08-13

对应规格：`docs/superpowers/specs/2026-08-13-agent-skill-cli-operations-design.md`

## Task 1：注册表执行契约

- 为取消前/后边界与非法技能输出写 RED；
- 增加 `AbortSignal`、稳定取消错误和输出校验；
- 保持现有五个内置技能结果不变。

## Task 2：页面运行生命周期

- 为异步技能取消、跨卡片去重、项目绑定和单次写入写 RED；
- 注入可测 runtime，以 run token + AbortController 屏蔽过期结果；
- 写入期间/写入后禁用重复操作。

## Task 3：CLI 状态面板

- 为合法 manifest、非法 envelope 和桥接不可用写 RED；
- 实现同源只读 client 及 `/agents` 状态面板；
- 不改变 server 命令白名单或执行边界。

## Task 4：路线图与最终门禁

- 第 13 阶段完成，路线图进度 13/13；
- 更新 README、CLI/扩展文档和执行记录；
- 运行聚焦/全量 Vitest、typecheck、build、Oxlint 和 diff-check。

通过后提交 `feat: complete agent skill cli operations`，然后做 13 阶段整体终检。

## 执行记录

- 基线审计：五个本地技能、注册/输入校验、结果节点和四个 workspace 命令已存在；取消、全局去重、输出校验、项目绑定、单次写入与 CLI 状态展示缺失。
- RED：Agent 聚焦套件记录 3 文件失败，覆盖取消、非法输出、跨技能去重、单次写入和 CLI 状态；路线图聚焦套件记录 5 项预期失败，证明默认仍停留在 12/13。
- GREEN：注册表加入稳定取消/输出错误；页面以 `AbortController` 与 run token 隔离过期结果，绑定原项目并阻止重复写入；同源 manifest client 严格校验后只展示命令摘要。
- 路线图：默认进度更新为 13/13，用户仍可在本地任务抽屉中调整并持久化任一阶段状态。
