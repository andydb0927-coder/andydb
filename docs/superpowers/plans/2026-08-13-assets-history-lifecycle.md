# 无线画布第 6 阶段素材历史与安全生命周期 TDD 实施计划

日期：2026-08-13

对应规格：`docs/superpowers/specs/2026-08-13-assets-history-lifecycle-design.md`

## Task 1：原子引用检查与删除

**文件**

- 修改 `app/src/features/assets/asset-library-repository.ts`
- 修改 `app/src/features/assets/asset-library-repository.test.ts`

**RED**

1. 仓库没有删除未引用目录记录的 API。
2. 直接删除无法阻止项目资产或历史版本悬空。
3. 重复删除不能幂等返回。

**GREEN**

- 在 `projects + libraryAssets` 单一事务内检查全部引用；
- 未引用时删除，已引用时返回去重项目 ID，缺失时返回 missing；
- 不修改任何项目数据。

## Task 2：删除确认交互

**文件**

- 新增 `app/src/features/assets/AssetDeleteDialog.tsx`
- 新增 `app/src/features/assets/AssetDeleteDialog.test.tsx`
- 修改 `app/src/features/platform/AssetsHistoryPage.tsx`
- 修改 `app/src/features/platform/AssetsHistoryPage.test.tsx`
- 修改 `app/src/styles/global.css`

**RED**

1. 素材卡没有删除入口和显式确认。
2. 未引用素材无法从目录和页面移除。
3. 被项目引用素材没有安全阻止与数量反馈。
4. Escape/取消不能恢复触发按钮焦点。

**GREEN**

- 引入可访问确认对话框和单次提交保护；
- 页面按 repository 结果更新卡片或错误反馈；
- 保持上传/加载竞态下的 ID 去重。

## Task 3：完整版本历史

**文件**

- 修改 `app/src/features/platform/AssetsHistoryPage.tsx`
- 修改 `app/src/features/platform/AssetsHistoryPage.test.tsx`

**RED**

1. 每个节点只显示当前版本。
2. 历史版本的提示词、时间、素材和任务来源不可见。

**GREEN**

- 展开每个节点全部版本并最新优先；
- 显示当前/历史标记和来源元数据；
- 保留来源节点画布链接。

## Task 4：阶段进度

**文件**

- 修改 `app/src/features/platform/platform-tasks.ts`
- 修改路线图测试与 `app/README.md`

**RED**

- 默认路线图仍显示第 6 阶段进行中。

**GREEN**

- 第 1–6 阶段完成，第 7 阶段进行中；其余待开始；
- 不覆盖用户已保存的合法自定义进度。

## Task 5：阶段验证与提交

```bash
npm run test:run -- src/features/assets/asset-library-repository.test.ts src/features/assets/AssetDeleteDialog.test.tsx src/features/platform/AssetsHistoryPage.test.tsx src/features/platform/platform-tasks.test.ts src/features/platform/PlatformTaskDrawer.test.tsx src/features/platform/platform-task-progress.test.ts
npm run test:run
npm run typecheck
npm run build
git diff --check
```

全部通过后提交：

```text
feat: add safe asset lifecycle history
```

提交后工作树必须干净，再开始第 7 阶段。

## 执行记录

- 基线审计：上传、限制、哈希去重、搜索筛选、跨项目复用、项目资产快照、当前版本和生成/导出任务记录已存在；完整版本浏览和安全删除缺失。
- 核心 RED：3 个文件失败，5 项失败 / 19 项通过；准确覆盖缺失仓库 API、缺失确认对话框、缺失页面删除入口和只显示当前版本。
- 核心 GREEN：3 个文件 26/26 通过。
- 路线图 RED：3 个文件失败，6 项失败 / 3 项通过；证明默认进度尚未推进到结构化创作卡。
- 自检竞态 RED：删除已导入素材后，较早的目录快照会将其重新显示；加入本次页面会话删除 tombstone 后定点 GREEN。
- 最终聚焦 GREEN：6 个文件 37/37 通过。
- 全量 Vitest：89 个文件 805/805 通过。
- `npm run typecheck`：通过。
- `npm run build`：通过；AssetsHistoryPage chunk 约 16.67 kB，CanvasPage chunk 约 252.29 kB，最大入口 chunk 约 291.23 kB。
- 变更 TypeScript/TSX Oxlint：0 warning / 0 error。
- `git diff --check`：通过。
