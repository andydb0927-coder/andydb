# 无线画布（Wireless Canvas）

AI 驱动的无限画布短视频创作平台。从一句创作意图出发，整理剧本、角色、世界观，编排分镜，
通过本地演示生成、工作流执行与专业时间线剪辑，最终发布为社区作品。

**当前为纯本地版本**：数据全部保存在浏览器 IndexedDB（Dexie），无需后端服务；
LibTV 真实生成已预留可插拔边界，默认使用本地演示适配器，不消耗任何积分。

## 快速开始

```bash
cd app
npm install
npm run dev        # 开发服务器，默认 http://localhost:5173
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | TypeScript 检查 + 生产构建（输出到 `dist/`） |
| `npm run typecheck` | 仅 TypeScript 类型检查 |
| `npm run test:run` | 全量 Vitest 单测（当前 817 项） |
| `npm run e2e` | Playwright Chromium E2E（当前 26 项） |

## 功能地图

| 模块 | 路由 | 说明 |
|------|------|------|
| 平台首页 | `/home` | 编辑推荐内容、创作者认证展示 |
| 项目启动 | `/` | 从创作意图创建项目（三种配方） |
| 创作画布 | `/project/:id` | 无限画布：分镜/视频/图片/文本节点、连线、剧本卡/角色卡/世界观卡、AI 导演、工作流运行面板、节点评论 |
| 素材与历史 | `/assets` | 本地素材库：上传、SHA-256 去重、搜索筛选、跨项目复用 |
| 预览 / 专业剪辑 | `/preview/:id` | 四轨时间线（视频/音频/图片/字幕）、裁剪/分割/排序、预览播放器、JSON/EDL 导出、MediaRecorder 预览录制 |
| 工作流与模板 | `/workflows` | 分镜序列编排为生成任务：串行/并行、进度/日志、失败重试、断点续跑 |
| 发现与作品 | `/discover` | 作品墙：标签/搜索筛选、最新/最热排序、点赞/收藏/浏览、作品详情、相关推荐、个人作品管理 |
| 模型能力 | `/models` | 模型目录与远程画布选择（LibTV 目录只读预览，真实调用需确认） |
| Agent 技能 | `/agents` | 5 个内置本地技能：分镜提示词、素材报告、时间线统计、发布文案、备份检查 |
| 本地工作区 | `/account` | 个人中心：会员等级（本地模拟）、协作者管理、项目统计、导出/导入备份 |

## 架构要点

- **技术栈**：React + TypeScript + Vite + React Router + React Flow（画布）+ Dexie（本地库）+ Vitest + Playwright
- **数据层**：Dexie 数据库按模块分表（项目/素材库/时间线/作品/会员/评论/技能状态），版本化 schema 幂等迁移
- **生成边界**：`GenerationAdapter` 可插拔接口；默认 `DemoGenerationAdapter` 本地确定性产物（视频节点用 PNG 视觉缩略图）；`LibTvGenerationAdapter` 已实现但每次调用必须经用户确认，服务端桥接（`app/server`）默认禁止写入，CLI 一律参数数组 + `shell: false`
- **工作区 CLI/API**：`/api/workspace/manifest` + `/api/workspace/execute`（版本化 envelope、1 MiB 上限、规范错误码），与 `/api/libtv/*` 完全隔离
- **扩展点**：技能注册表（`/agents`）、生成 provider、CLI 命令、云同步适配器均有文档化契约，见 `docs/superpowers/extensions.md`

## 文档

- 设计规格与实施计划：`docs/superpowers/specs/`、`docs/superpowers/plans/`（每阶段一份）
- CLI 文档：`docs/superpowers/local-workspace-cli.md`
- 扩展指南：`docs/superpowers/extensions.md`
- 设计 QA：`design-qa.md`、`design-qa-evidence/`

## 已知边界（本地版）

- 不包含真实 FFmpeg/WASM 视频合成；导出为时间线 JSON/EDL + 预览录制
- 共享链接携带完整 JSON，大体积素材建议改用项目包文件导入
- 协作/会员为本地模拟（UI 已标注），无真实账号、支付或多人实时协作
- 页面已使用路由级动态导入；首次进入尚未加载的页面时会短暂显示中文加载状态

## 部署上线

项目是使用 `BrowserRouter` 的纯前端 SPA。托管平台应从仓库根目录执行构建，并发布
`app/dist`：

```bash
npm --prefix app ci
npm --prefix app run test:run
npm --prefix app run build
```

### Vercel

1. 导入仓库，项目根目录保持为仓库根目录。
2. 根目录 `vercel.json` 已将构建命令设为 `npm --prefix app run build`，将
   `outputDirectory` 设为 `app/dist`。
3. 部署；`rewrites` 会把包括深层路由在内的所有请求回退到 `/index.html`。

### Netlify

1. 从仓库根目录创建站点。
2. 根目录 `netlify.toml` 已将构建命令设为 `npm --prefix app run build`，发布目录设为
   `app/dist`。
3. 部署；`[[redirects]]` 使用 `from = "/*"`、`to = "/index.html"`、`status = 200`
   提供 SPA fallback。

SPA fallback 是 `BrowserRouter` 深层链接正常工作的必要条件。例如直接访问或刷新
`/discover` 时，静态托管必须返回 `index.html`，再由前端路由渲染对应页面，而不是返回
托管平台的 404 页面。

### 环境变量

- `WIRELESS_CANVAS_ENABLE_LIBTV_WRITES`：LibTV 服务端写入门禁，仅值为 `1` 时开启，默认关闭。
- 该变量只对 Vite dev/preview 的 LibTV 服务端桥接中间件有意义。纯静态托管没有该
  中间件，不应通过设置此变量来尝试启用 LibTV 写入。

### 静态托管已知限制

- LibTV 桥接（`/api/libtv/*`）与 workspace CLI（`/api/workspace/*`）是 dev/preview
  中间件，在 Vercel、Netlify 等纯静态托管不可用。
- 前端已对这些 API 不可用的情况优雅降级，并显示可操作的中文错误；本地 IndexedDB、
  Demo 生成、画布编辑和其他纯前端能力仍可使用。
