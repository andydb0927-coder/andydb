# 无线画布第 3 阶段项目空间 TDD 实施计划

日期：2026-08-13

对应规格：`docs/superpowers/specs/2026-08-13-project-space-design.md`

## Task 1：项目空间数据模型与迁移

**文件**

- 新增 `app/src/features/projects/project-space-model.ts`
- 修改 `app/src/features/project/project-repository.ts`

**RED**

1. 数据库没有 `projectFolders` 和 `projectLocations` 表。
2. v8 数据库升级后既有项目必须保留。

**GREEN**

- 增加 v9 schema；
- 表类型使用稳定主键和必要索引；
- 不迁移或重写既有项目内容。

## Task 2：文件夹与分类仓储

**文件**

- 新增 `app/src/features/projects/project-space-repository.ts`
- 新增 `app/src/features/projects/project-space-repository.test.ts`

**RED**

1. 文件夹创建、去空格和稳定排序缺失。
2. 空名与大小写重复未拒绝。
3. 项目移动和移回未归类未持久化。
4. 不存在的项目或文件夹未被拒绝。

**GREEN**

- 使用 Dexie 事务完成校验与写入；
- 使用可注入 UUID 与时钟保证测试确定性；
- 暴露文件夹和位置读取接口。

## Task 3：独立项目空间页面

**文件**

- 新增 `app/src/features/projects/ProjectsPage.tsx`
- 新增 `app/src/features/projects/ProjectsPage.test.tsx`
- 修改 `app/src/styles/global.css`

**RED**

1. 缺少全部项目、文件夹和本地边界页面。
2. 标题/意图搜索和名称/更新时间排序缺失。
3. 创建文件夹、分类项目与移回未归类缺失。
4. 加载和写入失败没有可恢复反馈。

**GREEN**

- 注入项目仓储与项目空间仓储；
- 加载使用请求序号与卸载保护；
- 写入成功后重新读取仓储状态；
- 维持原项目打开路由。

## Task 4：路由、导航和路线图进度

**文件**

- 修改 `app/src/app/router.tsx`
- 修改 `app/src/app/App.test.tsx`
- 修改 `app/src/features/platform/PlatformShell.tsx`
- 修改 `app/src/features/platform/PlatformShell.test.tsx`
- 修改 `app/src/features/platform/platform-tasks.ts`
- 修改 `app/src/features/platform/platform-tasks.test.ts`
- 修改 `app/src/features/platform/platform-task-progress.test.ts`

**RED**

- `/projects` 未注册；“项目空间”仍错误指向首页；默认路线图仍停在第 3 阶段。

**GREEN**

- 懒加载项目空间页面；
- 导航活动状态正确；
- 第 1–3 阶段完成，第 4 阶段进行中，其余待开始；
- 保留用户已经保存的合法自定义状态。

## Task 5：阶段门禁与提交

```bash
npm run test:run -- src/features/projects src/app/App.test.tsx src/features/platform/PlatformShell.test.tsx src/features/platform/platform-tasks.test.ts src/features/platform/platform-task-progress.test.ts
npm run test:run
npm run typecheck
npm run build
git diff --check
```

全部通过后提交：

```text
feat: add local project space
```

提交后工作树必须干净，再开始第 4 阶段。

## 执行记录

- LibTV 只读证据：登录态 `/project` 的“全部项目”“新建文件夹”“开始创作”、项目卡片与更新时间；未复制任何用户私有值。
- RED：项目空间生产模块缺失、`/projects` 404、项目空间导航仍指向 `/`、路线图仍停在第 3 阶段；聚焦测试 6 个文件失败、13 项通过。
- 聚焦 GREEN：6 个文件 27/27 通过；相关页面与平台回归 9 个文件 57/57 通过。
- 首次全量回归：779/782 通过；3 项失败均为新增“查看全部项目”入口和阶段进度推进后的旧断言，更新契约后恢复。
- 最终全量 Vitest：86 个文件 782/782 通过。
- `npm run typecheck`：通过。
- `npm run build`：通过；`ProjectsPage` 独立 chunk 约 8.51 kB，最大入口 chunk 约 291 kB。
- 新增项目空间与仓储文件 Oxlint：0 warning / 0 error；其他触及文件只保留既有 Fast Refresh/Hooks 提示。
- `git diff --check`：通过。
