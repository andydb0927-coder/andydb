# 无线画布 LibTV 13 功能域 TDD 实施计划

日期：2026-08-13

对应规格：`docs/superpowers/specs/2026-08-13-libtv-platform-roadmap-design.md`

执行原则：严格按 1→13 顺序；每个任务先记录 RED，再做最小 GREEN；每阶段自检和独立提交后才进入下一阶段。已有阶段提交只复核，不重写历史。

## 0. 基线审计

- [x] 确认工作分支为 `codex/platform-shell-phase`。
- [x] 确认 `audit-2026-08-06/` 不在本工作树和提交范围。
- [x] 盘点既有阶段规格、实现与提交。
- [x] 识别未提交的路由按需加载和静态部署配置，保留不覆盖。

## 1. 平台骨架与任务编排

### Task 1.1：任务目录与安全持久化

**新增文件**

- `app/src/features/platform/platform-tasks.ts`
- `app/src/features/platform/platform-task-progress.ts`
- 对应测试文件

**RED**

1. 13 个阶段 id、顺序、标题、目标路由稳定。
2. 默认状态反映当前可验证能力。
3. localStorage 缺失、损坏、版本错误和未知字段时安全回退。
4. 状态更新只写已知阶段，刷新后可恢复。

**GREEN**

- 实现只读任务目录、快照校验、读写和订阅；
- 不在模块加载时访问 `window`，确保测试和构建安全；
- 存储键固定为 `wireless-canvas:platform-task-progress:v1`。

**验证**

```bash
npm run test:run -- src/features/platform/platform-tasks.test.ts src/features/platform/platform-task-progress.test.ts
```

### Task 1.2：340px 任务编排抽屉

**新增/修改文件**

- 新增 `app/src/features/platform/PlatformTaskDrawer.tsx`
- 新增 `app/src/features/platform/PlatformTaskDrawer.test.tsx`
- 修改 `app/src/features/platform/PlatformShell.tsx`
- 修改 `app/src/features/platform/PlatformShell.test.tsx`
- 修改 `app/src/styles/global.css`

**RED**

1. 初次渲染只显示“打开阶段任务”，抽屉不可见。
2. 打开后出现“平台完善路线图”、13 个阶段与总进度。
3. 改变阶段状态后持久化，重新挂载仍恢复。
4. Escape 关闭并把焦点归还“打开阶段任务”。
5. 工作区壳层展开时设置任务列，关闭时移除；画布边界读取同一壳层变量。

**GREEN**

- 使用非模态 `<aside>`；
- 桌面网格列宽 `340px`，不使用覆盖画布的 fixed overlay；
- 受控开合、错误边界和 storage 同步；
- 状态按钮与阶段目标链接可键盘访问。

**验证**

```bash
npm run test:run -- src/features/platform/PlatformTaskDrawer.test.tsx src/features/platform/PlatformShell.test.tsx src/app/App.test.tsx
```

### Task 1.3：提交既有路由性能和部署闭环

**已有未提交文件**

- `app/src/app/router.tsx`
- `app/src/app/route-loading.test.ts`
- `app/src/app/deployment-config.test.ts`
- `app/src/styles/global.css`
- `app/README.md`
- `vercel.json`
- `netlify.toml`

**验证**

- 路由级 lazy chunk 和中文 loading status；
- Vercel/Netlify SPA fallback 与输出目录；
- README 明确静态托管时桥接能力边界。

### Task 1.4：第 1 阶段总门禁与提交

```bash
npm run test:run
npm run typecheck
npm run build
git diff --check
```

提交顺序：

1. `docs: define libtv platform roadmap`
2. `feat: add platform task orchestration drawer`
3. `perf: lazy-load platform routes`（保留既有未提交改动，验证后独立提交）

### 第 1 阶段执行记录

- RED：4 个聚焦测试文件失败；3 个生产模块缺失，2 个壳层交互断言找不到“打开阶段任务”。
- GREEN：任务目录、进度持久化、抽屉、壳层与布局契约 5 个文件 14/14 通过。
- 平台集成：13 个文件 60/60 通过。
- 全量 Vitest：83 个文件 765/765 通过。
- TypeScript：`npm run typecheck` 通过。
- 生产构建：`npm run build` 通过；路由级拆分后最大入口 chunk 约 291 kB。
- 差异检查：`git diff --check` 通过。

## 2. 账号、个人空间与团队入口

- 复核本地工作区、会员权益和协作仓库已有提交；
- RED：身份缺失时明确为本地模式；越权操作不发生；权益门禁可验证；
- 若接真实账号，新增服务端身份、会话与权限测试，不使用 localStorage 作为身份源；
- 通过全门禁后独立提交。

## 3. 项目首页

- 复核平台首页、最近项目、配方创建、空白项目和恢复流程；
- RED：失败重试、并发创建、深链和最近项目刷新；
- GREEN：只保存真实项目，不生成虚假最近记录；
- 通过全门禁后独立提交。

## 4. 无限画布与依赖工作流

- 复核节点创建、拖动性能、连线、显示/隐藏、删除、撤销、焦点与依赖影响；
- RED：高频拖动不触发同步持久化、缩放下交互命中稳定、隐藏边不可选择；
- GREEN：帧级 UI 更新、释放后原子持久化；
- 通过全门禁后独立提交。

## 5. 模型中心与真实生成

- 复核目录发现、版本、能力约束、生成门禁、计费确认、取消和失败恢复；
- RED：桥接关闭、非法参数、重复提交、项目切换与过期回调；
- GREEN：默认只读/演示，真实写入必须显式门禁和二次确认；
- 通过全门禁后独立提交。

## 6. 素材库与版本历史

- 复核上传、去重、跨项目复用、版本、来源和错误恢复；
- RED：并发去重、失效对象 URL、素材引用和回滚；
- GREEN：索引与字节分离，结构引用完整；
- 通过全门禁后独立提交。

## 7. 剧本、角色与世界观

- 复核三类结构化创意卡和画布节点编辑；
- RED：领域字段、旧项目兼容、卡片连接、持久化与撤销；
- GREEN：领域模型独立于展示组件；
- 通过全门禁后独立提交。

## 8. 工作流与模板执行

- 复核模板目录、运行图、任务进度、失败重试和恢复；
- RED：依赖拓扑、原子应用、取消、项目切换和中断恢复；
- GREEN：任务状态可追踪且不重复生成；
- 通过全门禁后独立提交。

## 9. 时间线与专业编辑

- 复核轨道、播放头、帧步进、排序、持续时间和工程持久化；
- RED：非法时长、来源变化、重排、刷新恢复和媒体 seek；
- GREEN：时间线模型和 UI 行为一致；
- 通过全门禁后独立提交。

## 10. 导出、发布与分享

- 复核 JSON/EDL、预览录制、项目包导入导出和静态部署边界；
- RED：取消、错误恢复、文件名、版本兼容和不可用桥接；
- GREEN：未接真实转码/发布时明确说明，不伪造成功；
- 通过全门禁后独立提交。

## 11. 发现、作品与社区

- 复核作品列表、详情、我的作品、筛选、搜索和示例数据；
- RED：空态、错误、筛选组合、详情缺失和发布状态；
- GREEN：本地示例与用户作品严格区分；
- 通过全门禁后独立提交。

## 12. 协作、权限与会员

- 复核评论、成员角色、项目包、权益门禁和本地模拟标签；
- RED：权限矩阵、评论删除/编辑、并发变更和包校验；
- GREEN：真实多人/支付未接入时不得显示为在线成功；
- 通过全门禁后独立提交。

## 13. Agent、Skill 与 CLI

- 复核技能注册、输入验证、结果节点、工作区 API 与 CLI 文档；
- RED：未知技能、参数错误、取消、重复执行、桥接不可用和命令输出；
- GREEN：命令边界稳定，浏览器端不持有敏感凭据；
- 通过全门禁后独立提交。

## 最终验收

- 逐阶段提交可追溯，工作树干净；
- 全量 Vitest、typecheck、build 通过；
- 核心创建→画布→生成→时间线→导出路径保持回归；
- 规格中明确本地、演示、真实桥接和未接入能力；
- 不触碰受保护目录，不自动合并主分支，不自动发布到外部平台。
