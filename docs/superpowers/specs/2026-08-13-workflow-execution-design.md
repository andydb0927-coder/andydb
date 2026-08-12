# 无线画布步骤 3：工作流执行模块设计规格

日期：2026-08-13  
状态：已批准，依据用户“不要询问用户，直接完成”执行  
范围：在现有项目画布、节点生成和 AI 导演之上，增加可持久化、可恢复的多节点工作流执行能力。

## 1. 现有基线与边界

当前应用已具备：

- `GenerationAdapter` 统一生成接口，`DemoGenerationAdapter` 在 1,200ms 后返回本地演示素材，并支持 `AbortSignal`；
- `GenerationQueue` 管理单个生成任务的入队、取消和重试，但不表达多节点运行、串并行或断点；
- `ProjectStore` 负责将单节点生成结果原子地挂回画布；
- `WirelessCanvasDatabase` v3 持久化项目和素材库；
- React Flow 已维护多选节点集合，可作为创建工作流的输入。

工作流不调用 `RuntimeGenerationAdapter` 或 `LibTvGenerationAdapter`，不读取 provider 偏好，不发起外部请求，不消耗积分。

## 2. 目标与非目标

### 2.1 目标

1. 从画布多选图片、分镜或视频节点，创建串行或并行运行。
2. 依据选中子图的依赖关系做稳定拓扑排序；无依赖时以画布位置作为可视顺序。
3. 运行和节点任务都使用 `pending | running | succeeded | failed | cancelled` 状态机，节点记录 0–100 进度、尝试次数、时间和错误。
4. 运行面板显示队列、模式、总进度、每节点进度、日志、取消和失败节点重试。
5. 生成成功后将新 `Asset` / `NodeVersion` 和成功的 `GenerationJob` 原子地挂回原节点，不新建替代节点。
6. 工作流运行记录写入 Dexie；刷新后将原 `running` 节点恢复为 `pending` 并续跑，已成功节点不重复执行。
7. 串行运行在首个失败处暂停；单节点重试成功后继续后续 `pending` 节点。并行运行等待各分支终态后汇总。

### 2.2 非目标

- 不实现服务端队列、分布式 worker、跨设备恢复或多人协作。
- 不实现工作流模板编辑器、条件分支、循环、参数映射或定时触发。
- 不修改现有单节点生成 provider 选择和 LibTV 确认流程。
- 不将文本、卡片、预览或参考节点直接作为本阶段可执行节点。

## 3. 领域模型

```ts
type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

type WorkflowExecutionMode = 'serial' | 'parallel'

interface WorkflowNodeRun {
  id: string
  nodeId: string
  nodeTitle: string
  order: number
  status: WorkflowStatus
  progress: number
  attempt: number
  request: GenerationRequest
  startedAt?: string
  finishedAt?: string
  error?: string
}

interface WorkflowRun {
  id: string
  projectId: string
  mode: WorkflowExecutionMode
  status: WorkflowStatus
  nodes: WorkflowNodeRun[]
  logs: WorkflowLogEntry[]
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
}
```

`GenerationRequest` 作为运行快照持久化，确保续跑使用创建任务时的 prompt 和参考素材，不受后续画布编辑影响。

## 4. 编排与状态机

### 4.1 创建

- 只接受 `image | storyboard | video` 节点，忽略其它被选中节点。
- 所有可执行节点的 operation 为 `regenerate`，以便结果回写原节点；`video` 的 target kind 为 `video`，其余为 `image`。
- 对选中节点的边构建子图并做 Kahn 拓扑排序；同一入度下按 x、y、title、id 排序。
- 没有可执行节点时不创建空运行。

### 4.2 执行

- `pending -> running -> succeeded | failed | cancelled`。
- 任务进度在启动时为 10，本地等待期分段提升但不超过 90，成功时为 100。
- 串行：每次只启动第一个 `pending` 节点；失败即停，保留后续 `pending`。
- 并行：同时启动全部 `pending` 节点，不因单分支失败取消其它分支。
- 取消运行：中止全部本次 active adapter，将 `pending/running` 节点置为 `cancelled`，已成功结果保留。

### 4.3 重试与恢复

- 只有 `failed` 节点可单独重试；重试时 attempt + 1，错误和结束时间清空，状态回到 `pending`。
- 重试后从当前运行续跑；任何 `succeeded` 节点均跳过。
- 从 Dexie 恢复时，仅对运行状态为 `pending/running` 的记录续跑；持久化的 `running` 节点是上一页面中断的本地任务，恢复为 `pending` 后重新执行。

## 5. 原子结果回写

每个成功结果必须同时满足：

- 项目与节点仍存在；
- asset id 与 version id 未冲突；
- `version.assetId === asset.id`；
- 回写新资产、新版本、active version 和成功 job 在同一次 store 更新中完成；
- 失败的回写不能将 workflow node 标记成功。

工作流更新是执行状态，不进入画布 undo/redo 历史；生成结果的项目变更会触发现有自动保存。

## 6. Dexie 持久化

`WirelessCanvasDatabase` 升级到 v4，新增：

```ts
workflowRuns: 'id, projectId, updatedAt, status'
```

`WorkflowRepository` 提供 `save`、`load`和 `listByProject`。执行器对同一运行的写入串行化，防止进度回调把较新终态覆盖为旧状态。

## 7. 运行面板

- 面板固定在画布右上，不改写现有顶栏、工具栏或 AI 导演结构。
- 头部显示当前可执行选中数，串/并行 select 和“创建运行”。
- 运行按更新时间倒序，展示状态、总进度和取消按钮。
- 节点行展示序号、标题、状态、attempt、progress 和失败重试。
- 日志用可展开 `details`，新日志使用 `aria-live="polite"`；按钮、select 和 progress 均有明确名称。
- 小屏幕下面板宽度收缩并限制高度，不遮挡底部 AI 导演的主输入。

## 8. 验收边界

自动化必须证明：

1. 可执行节点过滤、拓扑/位置顺序和请求快照正确。
2. 串行无并发，并行可并发，成功结果回写原节点。
3. 失败、单节点重试、后续续跑、跳过成功节点和取消正确。
4. Dexie v1/v3 数据库可升级，运行可完整 round-trip，刷新恢复不丢记录。
5. 运行面板的进度、日志、取消和重试交互可由 Vitest + Testing Library 验证。
6. CanvasPage 多选后能创建运行，只使用注入或默认的 Demo adapter，且水合后自动续跑。
7. 全量 Vitest、TypeScript typecheck 和 Vite production build 全部通过。Chromium E2E 在当前沙箱明确不执行。

## 9. 受保护内容

`audit-2026-08-06/` 不得读取、改动、删除、暂存或提交。本阶段不执行 commit。
