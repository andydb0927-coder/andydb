# 无线画布第 10 阶段交付与发布中心 TDD 实施计划

日期：2026-08-13

对应规格：`docs/superpowers/specs/2026-08-13-delivery-center-design.md`

## Task 1：交付聚合页

- 新增 `DeliveryCenterPage.tsx` 与聚焦测试；
- 并行读取 projects/timelines/works，派生最新导出、发布与剪辑状态；
- 新增搜索、发布状态过滤和固定加载/错误/空状态。

## Task 2：安全本地分享

- 仅已发布作品显示复制按钮；
- 复制依赖可注入，测试确认精确 URL、成功/失败反馈与无自动写入。

## Task 3：导航、路由与进度

- lazy 路由和导航新增 `/delivery`；
- 第 10 阶段目标改为 `/delivery`，完成后将第 11 阶段设为进行中；
- 更新 README 和路线图测试。

## Task 4：验证与提交

```bash
npm run test:run -- src/features/platform/DeliveryCenterPage.test.tsx src/features/platform/PlatformShell.test.tsx src/features/platform/platform-tasks.test.ts src/features/platform/PlatformTaskDrawer.test.tsx src/features/platform/platform-task-progress.test.ts
npm run test:run
npm run typecheck
npm run build
git diff --check
```

通过后提交 `feat: add delivery and publishing center`，再开始第 11 阶段。

## 执行记录

- 基线审计：JSON/EDL/预览录制、导出任务模型、本地发布/下架/重新发布和作品详情已存在；统一交付页与本地分享动作缺失。
- Task 1–3 RED：交付页模块和导航缺失；路线图套件后续 3 文件中 6 失败 / 3 通过，均为第 10/11 阶段差异。
- Task 1/2 GREEN：交付页和导航 2 文件 / 8 测试通过，包括显式复制的无自动写入证明。
- Task 3 GREEN：本阶段聚焦套件 5 文件 / 17 测试通过。
- 最终门禁：全量 Vitest 92 文件 / 821 测试通过；`typecheck`、`build`、Oxlint 和 `git diff --check` 通过。Oxlint 仅报告已知 Fast Refresh 提示。
