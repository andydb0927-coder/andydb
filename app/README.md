# 无线画布（Wireless Canvas）

AI 影视创作无限画布。从一句创作意图出发，整理剧本、角色、世界观，编排分镜，
在画布和时间线中管理本地素材、处理媒体并导出工作流，最终发布为本地作品。

**当前为纯本地版本**：数据全部保存在浏览器 IndexedDB（Dexie），无需后端服务；
真实模型生成已预留可插拔边界；公开构建中的真实模型全部禁用，不会回退为 Mock 伪造结果，也不消耗任何积分。

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
| `npm run build:mock` | 强制 mock，禁用 `.env.local` 加载并仅向浏览器暴露 mock 模式，完成产物敏感配置检查后生成 404 fallback |
| `npm run typecheck` | 仅 TypeScript 类型检查 |
| `npm run test:run` | 全量 Vitest 单测 |
| `npm run e2e` | Playwright Chromium E2E；离线模型目录用例要求先执行 `build:mock` |
| `npm run verify` | 完整门禁：typecheck → Vitest → build:mock → Playwright |

公开静态部署和离线产物验收使用 `build:mock`，不要使用会继承 `.env.local` 的普通
`build`。`PLAYWRIGHT_OFFLINE_DIST=dist` 供公开模型目录和路由/五视口终验用例读取精确静态产物；
其余 E2E 仍使用独立开发服务器、fixture Key 和网络拦截，不调用真实 API。

## 功能地图

| 模块 | 路由 | 说明 |
|------|------|------|
| 平台首页 / 项目启动 | `/` | 推荐内容、快速配方与从创作意图创建项目 |
| 项目 | `/projects` | 本地项目搜索、排序、分组、新建与恢复 |
| 创作画布 | `/project/:projectId` | 无限画布、节点连线、素材/角色/历史工具坞、导演台、故事板与工作流 |
| 预览 / 时间线 | `/project/:projectId/preview` | 多轨时间线、预览播放、本地合成和 JSON/EDL 导出 |
| 作品 | `/works` | 本地作品搜索筛选、收藏、可见性标记、详情和导出 |
| Skills | `/agents` | 内置本地技能、执行状态、输出契约和同源 CLI 桥接状态 |
| 挑战赛 / 教程 | `/challenges`、`/tutorials` | 静态活动与教程目录，包含详情页 |
| 会员 / 帮助 | `/membership`、`/help` | 本地积分展示、帮助搜索和能力边界说明 |

## 架构要点

- **技术栈**：React + TypeScript + Vite + React Router + React Flow（画布）+ Dexie（本地库）+ Vitest + Playwright
- **数据层**：Dexie 数据库按模块分表（项目/素材库/时间线/作品/会员/评论/技能状态），版本化 schema 幂等迁移
- **生成边界**：`GenerationAdapter` 保留可插拔接口；`DemoGenerationAdapter` 只供开发/自动化 fixture，公开模型选择器不暴露 Mock 模型。`LibTvGenerationAdapter` 每次写入必须确认，服务端桥接（`app/server`）默认禁止写入，CLI 一律参数数组 + `shell: false`
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
npm --prefix app run verify
```

### Vercel

1. 导入仓库，项目根目录保持为仓库根目录。
2. 根目录 `vercel.json` 已将构建命令设为 `VITE_PUBLIC_BASE=/ npm --prefix app run build:mock`，将
   `outputDirectory` 设为 `app/dist`。
3. 部署；`rewrites` 会把包括深层路由在内的所有请求回退到 `/index.html`。

### Netlify

1. 从仓库根目录创建站点。
2. 根目录 `netlify.toml` 已将构建命令设为 `VITE_PUBLIC_BASE=/ npm --prefix app run build:mock`，发布目录设为
   `app/dist`。
3. 部署；`[[redirects]]` 使用 `from = "/*"`、`to = "/index.html"`、`status = 200`
   提供 SPA fallback。

SPA fallback 是 `BrowserRouter` 深层链接正常工作的必要条件。例如直接访问或刷新
`/works` 时，静态托管必须返回 `index.html`，再由前端路由渲染对应页面，而不是返回
托管平台的 404 页面。

### 环境变量

- `WIRELESS_CANVAS_ENABLE_LIBTV_WRITES`：LibTV 服务端写入门禁，仅值为 `1` 时开启，默认关闭。
- 该变量只对 Vite dev/preview 的 LibTV 服务端桥接中间件有意义。纯静态托管没有该
  中间件，不应通过设置此变量来尝试启用 LibTV 写入。

### 静态托管已知限制

- LibTV 桥接（`/api/libtv/*`）与 workspace CLI（`/api/workspace/*`）是 dev/preview
  中间件，在 Vercel、Netlify 等纯静态托管不可用。
- 前端已对这些 API 不可用的情况优雅降级，并显示可操作的中文错误；本地 IndexedDB、
  画布编辑、媒体本地处理和导出仍可使用，生成模型保持禁用且不会回退为 Mock 结果。
