# 无线画布第 4 阶段画布分组 TDD 实施计划

日期：2026-08-13

对应规格：`docs/superpowers/specs/2026-08-13-canvas-groups-design.md`

## Task 1：分组模型与领域变更

**文件**

- 修改 `app/src/features/project/model.ts`
- 修改 `app/src/features/project/project-store.ts`
- 修改 `app/src/features/project/project-store.test.ts`

**RED**

1. 新项目没有分组容器。
2. 两个有效节点不能形成单一分组历史项。
3. 少于两个节点、未知分组不能保持 no-op。
4. 重新组合和删除节点会留下单成员分组。
5. 分组/取消分组的 undo/redo 缺失。

**GREEN**

- 新增可选 `CanvasGroup` 项目字段和 Store 方法；
- 所有成员校验、旧组清理与新组写入在一次 commit 中完成；
- 不改变 edges、timeline、assets 和 jobs。

## Task 2：分组边界与覆盖层

**文件**

- 新增 `app/src/features/canvas/canvas-group.ts`
- 新增 `app/src/features/canvas/canvas-group.test.ts`
- 新增 `app/src/features/canvas/CanvasGroupOverlay.tsx`
- 新增 `app/src/features/canvas/CanvasGroupOverlay.test.tsx`

**RED**

1. 成员节点没有稳定的包围边界。
2. 缺失节点和未测量节点没有安全退化。
3. 覆盖层缺少选择整组和取消分组语义。

**GREEN**

- 使用节点 Map 与测量 Map 计算 flow-space 边界；
- 容器 pointer-events 透明，仅操作按钮可交互；
- 使用 viewport portal 与画布缩放/平移保持一致。

## Task 3：工具栏与 CanvasPage 集成

**文件**

- 修改 `app/src/features/canvas/CanvasToolbar.tsx`
- 修改 `app/src/features/canvas/CanvasToolbar.test.tsx`
- 修改 `app/src/features/canvas/CanvasPage.tsx`
- 修改 `app/src/features/canvas/CanvasPage.test.tsx`
- 修改 `app/src/styles/global.css`

**RED**

1. 分组按钮始终禁用。
2. 多选后无法建立或取消分组。
3. 分组标题不能恢复整组选中。
4. 画布拖动预览不会更新分组边界。

**GREEN**

- 根据选中数量和精确组选中派生 toolbar action；
- 在 `ViewportPortal` 渲染视觉分组；
- 选择组复用现有 Set selection 和批量拖动；
- 状态反馈沿用画布提示优先级。

## Task 4：阶段进度与回归

**文件**

- 修改 `app/src/features/platform/platform-tasks.ts`
- 修改相关路线图测试与 `app/README.md`

**RED**

- 默认路线图仍显示第 4 阶段进行中。

**GREEN**

- 第 1–4 阶段完成，第 5 阶段进行中；其余待开始；
- 不覆盖用户已保存的合法自定义进度。

## Task 5：阶段门禁与提交

```bash
npm run test:run -- src/features/project/project-store.test.ts src/features/canvas/canvas-group.test.ts src/features/canvas/CanvasGroupOverlay.test.tsx src/features/canvas/CanvasToolbar.test.tsx src/features/canvas/CanvasPage.test.tsx src/features/platform/platform-tasks.test.ts
npm run test:run
npm run typecheck
npm run build
git diff --check
```

全部通过后提交：

```text
feat: add undoable canvas groups
```

提交后工作树必须干净，再开始第 5 阶段。

## 执行记录

- 基线审计：节点创建、依赖连线、框选/批量拖动、撤销/重做、自动保存与工作流运行已存在；工具栏“分组”仍硬编码为后续版本。
- RED：7 个聚焦文件失败，10 项失败 / 133 项通过；准确覆盖生产模块缺失、分组 Store API 缺失、工具栏永久禁用、CanvasPage 不写分组及路线图未推进。
- 聚焦 GREEN：7 个文件 147/147 通过。
- CanvasPage 拖动预览补强：97/97 通过，确认分组框使用实时 preview position，而非只读已提交坐标。
- 全量 Vitest：88 个文件 790/790 通过。
- `npm run typecheck`：通过。
- `npm run build`：通过；CanvasPage chunk 约 252.22 kB，最大入口 chunk 约 291.22 kB。
- 变更 TypeScript/TSX Oxlint：0 warning / 0 error。
- `git diff --check`：通过。
