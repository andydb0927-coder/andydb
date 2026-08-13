# 无线画布第 7 阶段故事设定中心 TDD 实施计划

日期：2026-08-13

对应规格：`docs/superpowers/specs/2026-08-13-story-bible-design.md`

## Task 1：聚合模型与页面

**文件**

- 新增 `app/src/features/platform/StoryBiblePage.tsx`
- 新增 `app/src/features/platform/StoryBiblePage.test.tsx`
- 修改 `app/src/styles/global.css`

**RED**

1. 不存在跨项目创作卡聚合页。
2. 搜索不能匹配结构化正文和项目来源。
3. 类型筛选、图片预览和来源深链缺失。
4. 加载/失败/空状态缺失。

**GREEN**

- 使用 `ProjectRepository.listAll()` 聚合合法卡片；
- 稳定排序并派生摘要、图片和来源链接；
- 提供搜索、类型筛选和完整状态反馈。

## Task 2：路由与全局导航

**文件**

- 修改 `app/src/app/router.tsx`
- 修改 `app/src/features/platform/PlatformShell.tsx`
- 修改 `app/src/features/platform/PlatformShell.test.tsx`

**RED**

- 平台导航没有“故事设定”，路由也无法打开 `/story`。

**GREEN**

- 新增 lazy route 和全局导航项；
- 保持 workspace 画布路由和折叠导航行为不变。

## Task 3：阶段进度与门禁

**文件**

- 修改 `app/src/features/platform/platform-tasks.ts`
- 修改路线图测试与 `app/README.md`

**RED**

- 路线图第 7 阶段仍指向 `/workflows` 且保持进行中。

**GREEN**

- 第 7 阶段目标改为 `/story`；
- 第 1–7 阶段完成，第 8 阶段进行中。

## Task 4：阶段验证与提交

```bash
npm run test:run -- src/features/platform/StoryBiblePage.test.tsx src/features/platform/PlatformShell.test.tsx src/features/platform/platform-tasks.test.ts src/features/platform/PlatformTaskDrawer.test.tsx src/features/platform/platform-task-progress.test.ts
npm run test:run
npm run typecheck
npm run build
git diff --check
```

全部通过后提交：

```text
feat: add cross-project story bible
```

提交后工作树必须干净，再开始第 8 阶段。

## 执行记录

- 基线审计：三类卡的创建、编辑、字段验证、图片引用、版本、撤销、自动保存和下游失效已存在；平台级聚合页面缺失。
- Task 1/2 RED：新页面模块和“故事设定”导航均缺失；聚焦用例按预期失败。
- Task 1/2 GREEN：`StoryBiblePage` 与 `PlatformShell` 聚焦套件 2 文件 / 8 测试通过。
- Task 3 RED：路线图仍将第 7 阶段标记为进行中，3 文件中 6 失败 / 3 通过，均为预期进度和目标路由差异。
- Task 3 GREEN：本阶段聚焦套件 5 文件 / 17 测试通过。
- 最终门禁：全量 Vitest 90 文件 / 809 测试通过；`typecheck`、`build`、Oxlint 和 `git diff --check` 通过。Oxlint 仅报告项目已知的 Fast Refresh 提示。
