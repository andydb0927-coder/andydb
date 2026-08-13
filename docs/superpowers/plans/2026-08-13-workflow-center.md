# 无线画布第 8 阶段工作流与模板中心 TDD 实施计划

日期：2026-08-13

对应规格：`docs/superpowers/specs/2026-08-13-workflow-center-design.md`

## Task 1：全局运行索引

**文件**

- 修改 `app/src/features/workflow/workflow-repository.ts`
- 修改 `app/src/features/workflow/workflow-repository.test.ts`

**RED**

- 仓库只能按项目列出运行，无法为平台中心提供稳定全局索引。

**GREEN**

- 新增 `listAll()`，按 `updatedAt`、`createdAt`、`id` 降序。

## Task 2：模板图与运行中心

**文件**

- 修改 `app/src/features/platform/WorkflowsPage.tsx`
- 修改 `app/src/features/platform/WorkflowsPage.test.tsx`
- 修改 `app/src/styles/global.css`

**RED**

1. 模板卡没有可访问的任务图。
2. 平台页无法读取、解析或过滤运行记录。
3. 读取失败、无记录、无匹配状态缺失。

**GREEN**

- 模板卡增加角色、场景、分镜任务图；
- 页面并行加载项目和运行数据；
- 呈现稳定的运行摘要、过滤器、来源链接和完整状态。

## Task 3：路线图进度

**文件**

- 修改 `app/src/features/platform/platform-tasks.ts`
- 修改相关任务进度测试
- 修改 `app/README.md`

**RED**

- 第 8 阶段仍为进行中。

**GREEN**

- 第 1–8 阶段完成，第 9 阶段进行中。

## Task 4：阶段门禁与提交

```bash
npm run test:run -- src/features/workflow/workflow-repository.test.ts src/features/platform/WorkflowsPage.test.tsx src/features/platform/platform-tasks.test.ts src/features/platform/PlatformTaskDrawer.test.tsx src/features/platform/platform-task-progress.test.ts
npm run test:run
npm run typecheck
npm run build
git diff --check
```

全部通过后提交：

```text
feat: add workflow operations center
```

提交后工作树必须干净，然后开始第 9 阶段。

## 执行记录

- 基线审计：画布内已具备任务图、串/并行、取消、失败重试、中断恢复和 Dexie 持久化；平台层的任务图预览与跨项目运行索引缺失。
- Task 1/2 RED：核心套件 2 文件中 5 失败 / 3 通过；失败分别覆盖 `listAll()`、任务图、运行聚合、过滤和安全错误状态。
- Task 1/2 GREEN：核心套件 2 文件 / 8 测试通过。
- Task 3 RED：路线图套件 3 文件中 6 失败 / 3 通过，均为第 8/9 阶段默认状态差异。
- Task 3 GREEN：本阶段聚焦套件 5 文件 / 17 测试通过。
- 类型自检：首次 `typecheck` 发现测试辅助函数将 runs 推断为仅接受 `failed`；显式收窄边界为 `WorkflowRun[]` 后页面聚焦 4/4 和 `typecheck` 通过。
- 最终门禁：全量 Vitest 90 文件 / 813 测试通过；`typecheck`、`build`、Oxlint 和 `git diff --check` 通过。
