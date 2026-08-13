# 无线画布第 11 阶段创作者主页 TDD 实施计划

日期：2026-08-13

对应规格：`docs/superpowers/specs/2026-08-13-creator-profile-design.md`

## Task 1：创作者聚合页

- 新增 `CreatorProfilePage.tsx` 及聚焦测试；
- 读取已发布作品，精确筛选作者并派生认证、互动和标签统计；
- 完成加载、未找到和失败状态。

## Task 2：社区深链

- 修改 `WorkCard` 与 `WorkDetailPage` 作者文字为可访问链接；
- 新增 lazy `/discover/creator/:author` 路由；
- 保持认证标识和既有作品互动行为不变。

## Task 3：路线图与门禁

- 第 11 阶段完成，第 12 阶段进行中；
- 更新 README 和进度测试；
- 运行聚焦/全量 Vitest、typecheck、build、lint 和 diff-check。

通过后提交 `feat: add community creator profiles`，再开始第 12 阶段。

## 执行记录

- 基线审计：作品流、搜索/标签/排序、详情预览、浏览/点赞/收藏、推荐和我的作品已完整；创作者主页与作者深链缺失。
- RED：主页模块缺失，作品卡和详情页作者链接缺失；路线图仍停留在第 11 阶段。
- GREEN：创作者聚合、认证/指标/标签派生、双入口深链与可用状态已实现；路线图推进到第 12 阶段。
- 聚焦门禁：6 个文件、19 项测试通过。
- 全量门禁：Vitest 93 个文件 / 825 项通过；`typecheck` 和 `build` 通过；Oxlint 退出 0，仅保留既有 hooks / Fast Refresh 提示；`git diff --check` 通过。
