# 无线画布 v1 交付候选报告

- 日期：2026-08-31（Asia/Shanghai）
- 分支：`codex/platform-shell-phase`
- 本轮基线：`75e801b`
- 交付定义：本地优先的 AI 影视创作工作台静态安全 v1
- 结论：**本地静态 v1 READY；真实模型与云端生产 NOT READY，不在本次交付范围。**

## 1. 可交付内容

- 首页、项目、作品、Skills、挑战赛、教程、会员和帮助等平台路由。
- 无限画布的节点、连线、分组、本地素材、生成历史、导演台、故事板、时间线和工作流导入导出。
- 图片、视频和音频的本地处理、版本恢复与离线导出；测试里的生成结果全部来自 fixture/请求拦截。
- 本地作品发布、只读查看、分享链接拷贝、PNG/JSON 导出。这些都不等于公网发布或访问控制。
- GitHub Pages 子路径产物位于 `app/dist`；Vercel/Netlify 的根路径 Mock 构建也已单独验证。

153 项当前功能行的状态统计：

| 状态 | 数量 | v1 口径 |
| --- | ---: | --- |
| REAL_LOCAL | 110 | 当前浏览器内真实执行 |
| LIVE_API | 14 | 已有适配器代码，本次未配置、未对供应商实调 |
| MOCK | 3 | 开发演示/样例内容；公开生成选择器不提供 Mock 模型 |
| STATIC | 8 | 静态内容和目录 |
| PARTIAL | 8 | 只交付表内列明的局部能力 |
| PLACEHOLDER | 8 | 待服务或资质 |
| NOT_IMPLEMENTED | 2 | 多人实时协作、云端发布/跨设备访问 |
| BROKEN | 0 | 当前自动化范围内无已知失效项 |

`LIVE_API` 只表示代码契约存在，不表示当前项目已接通真实模型。

## 2. 本轮收口

- 移除首页、教程、社区和画布里的 SD2.5、Seedance 2.5、Minimax H3 过时宣传，改为本地链路或“需配置”状态。
- “在 LibTV 上发布”统一为“发布到本地作品”，帮助中心与实际 UI 一致。
- 补齐缺失的本地 WAV fixture，避免预览页把测试素材缺失显示为播放错误。
- 画布 composer 不再跟随 React Flow 放大；图片参数弹层限制在可视区并可滚动。参数对话框打开时暂时隐藏底部工具栏，关闭后恢复，避免工具栏遮挡“2张/4张”。
- 公开构建强制 Mock **安全构建模式**，但不向用户提供 Mock 生成模型；真实模型全部禁用且不伪造结果。构建禁止读取 `.env.local`，并仅允许 `VITE_GENERATION_MODE` 进入客户端环境。
- 后端默认拒绝跨域，不接受 `*`；邀请码、模型 ID、语音资源 ID 和 Secrets 默认全空。
- 交付审计曾在旧的本地 `dist` 中发现一个非空 Kling 浏览器端 Key。本轮未推送/未部署，不安全产物已被安全重建覆盖；根因已用 `envDir: false` + 收窄 `envPrefix` + 产物扫描修复。当前 `dist` 独立复扫通过，旧 Key 仍必须在供应商侧轮换。

## 3. 权威门禁

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| 前端类型 | `npm run typecheck` | 通过 |
| 前端单元/集成 | `npm run test:run` | **205 文件，1631/1631** |
| 静态产物 | `npm run build:mock` | 通过；构建阶段检查 68 个文本资产，生成 SPA 404 fallback 后独立复扫 69 个，均无敏感客户端配置 |
| 浏览器 | `PLAYWRIGHT_OFFLINE_DIST=dist npx playwright test --workers=2` | **139/139**，11.5 分钟 |
| 后端类型 | `npm run typecheck` | 通过 |
| 后端单元/集成 | `npm run test:run` | 9 文件，77/77 |
| 根路径产物 | `VITE_PUBLIC_BASE=/ npm run build:mock` | 通过，`index.html` 资源路径为 `/assets/...` |

浏览器验收中，`public-model-catalog` 和 `final-acceptance` 读取精确的本地静态 `dist`；其余用例运行在隔离开发服务器与新 BrowserContext，并使用 fixture 请求拦截。全套没有发送付费生成请求；测试名中的 `live`、`Seedream`、`Seedance` 不代表供应商实调。Vitest 日志保留了对未启动 `localhost:3000` 辅助服务的 `ECONNREFUSED` 分支探测，命令退出码为 0；Playwright dev server 记录过一次 `ResizeObserver loop` 布局噪声，但页面 console/pageerror 断言及 139 项用例均通过。Vite 另有大于 500 kB 的分块性能提醒。

## 4. 屏幕与交互承诺

- 桌面端交付尺寸：1440、1280、1024、800 和 721 px 宽度。
- 721 窄屏及约 200% 等效布局：关键操作可达，composer 在最大画布缩放下保持屏幕尺寸。
- 390 px：只承诺基础渲染和直接访问不白屏，不承诺完整导航、画布编辑或手机剪辑工作流。
- 图片参数弹层在 1280×720、1024×900、721×778 及 200% 等效布局中均通过真实指针命中、Escape 与焦点回归验证。

## 5. 明确不交付

- 任何真实模型的账号权限、准确 Model/Endpoint ID、费用、输出质量或供应商可用性。
- 真实支付、公网作品分享、云存储生产可用性、多设备同步、多人实时协作。
- 后端生产安全认证。当前 Worker 只是技术预览，尚需限流、完整会话/令牌策略、所有权覆盖、离线删除和边缘一致性验证。
- 公网部署和 Git 推送。本轮只准备本地可回滚交付候选。

## 6. 运行、产物与回滚

本地开发：

```bash
cd app
npm run dev
```

可公开的静态安全产物：

```bash
cd app
npm run build:mock
```

产物目录为 `app/dist`。该产物已恢复为 GitHub Pages 子路径 `/andydb/` 基线；根域名部署使用仓库中的 Vercel/Netlify 构建命令。

本轮没有数据库 schema 迁移，回滚可以回到基线 `75e801b`。回滚前建议先在界面导出工作流 JSON，不应通过清理浏览器存储来回滚代码。

仓库中既有 `docs/qa/evidence` 和 `design-qa-evidence` 图片修改未纳入交付源码批次，不回退用户证据。其中旧的 `zoom-200-reachability.png` 仍包含过时模型文案与重叠画面，**不作为本轮 READY 证据**；本轮可达性判定只引用新增 Playwright reachability 用例。

## 7. 后续入口

真实模型由项目负责人之后按 [真实模型 API 对接清单](../real-model-api-integration-checklist.md) 执行。未完成清单前，应继续使用 `build:mock`，不得把适配器存在描述为真实模型可用。
