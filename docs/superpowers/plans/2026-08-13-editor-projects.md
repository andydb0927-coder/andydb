# 无线画布第 9 阶段剪辑项目中心 TDD 实施计划

日期：2026-08-13

对应规格：`docs/superpowers/specs/2026-08-13-editor-projects-design.md`

## Task 1：剪辑项目页

- 新增 `app/src/features/platform/EditorProjectsPage.tsx`
- 新增 `app/src/features/platform/EditorProjectsPage.test.tsx`
- 修改 `app/src/styles/global.css`

RED：无跨项目剪辑索引、统计、搜索、过滤和状态。

GREEN：并行聚合 projects/timelines，派生剪辑摘要，只读呈现并链接专业编辑器。

## Task 2：导航与路由

- 修改 `app/src/app/router.tsx`
- 修改 `app/src/features/platform/PlatformShell.tsx`
- 修改 `app/src/features/platform/PlatformShell.test.tsx`

RED：平台导航和路由中没有“剪辑项目”。

GREEN：新增 lazy `/editor` 路由与全局导航。

## Task 3：路线图与门禁

- 第 9 阶段目标设为 `/editor`，完成后将第 10 阶段设为进行中；
- 更新进度测试与 `app/README.md`。

## Task 4：验证与提交

```bash
npm run test:run -- src/features/platform/EditorProjectsPage.test.tsx src/features/platform/PlatformShell.test.tsx src/features/platform/platform-tasks.test.ts src/features/platform/PlatformTaskDrawer.test.tsx src/features/platform/platform-task-progress.test.ts
npm run test:run
npm run typecheck
npm run build
git diff --check
```

通过后提交 `feat: add professional editor projects center`，再开始第 10 阶段。

## 执行记录

- 基线审计：专业编辑器已覆盖多轨、素材、字幕、裁剪、分割、删除、逐帧、持久化和导出；平台剪辑项目页与正确导航缺失。
- Task 1/2 RED：新页面模块无法解析，“剪辑项目”导航缺失；既有导航 3/4 回归仍通过。
- Task 1/2 GREEN：页面与导航聚焦套件 2 文件 / 8 测试通过。
- Task 3 RED：路线图套件 3 文件中 6 失败 / 3 通过，均为第 9/10 阶段状态或目标路由差异。
- Task 3 GREEN：本阶段聚焦套件 5 文件 / 17 测试通过。
- 最终门禁：全量 Vitest 91 文件 / 817 测试通过；`typecheck`、`build`、Oxlint 和 `git diff --check` 通过。Oxlint 仅保留项目已知 Fast Refresh 提示。
