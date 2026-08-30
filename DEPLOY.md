# 静态部署说明

## 1. 部署目标与边界

当前版本是可直接静态托管的 Vite 单页应用。部署产物为 `app/dist`，可发布到 Vercel、Netlify 或任何支持 SPA 路由回退的静态托管服务。

公开静态部署默认保持 Mock 模式；配置 Cloudflare Worker 后可显式开启云存储与服务端生成代理。本地开发环境仍可单独开启火山方舟 Seedream、Seedance 与豆包的短期直连验证：

- 未配置开发验证模式时，真实模型禁用并显示配置未完成，模型菜单不再提供演示模型；
- `seedream-direct-dev` 仅供本机短期验证，不能用于公开静态部署；
- 未配置 `VITE_BACKEND_URL` 时项目只保存在当前浏览器；配置后仍先写 IndexedDB，再与云端 D1/KV 合并同步；
- 云端不可用会自动回退本地，项目页可用“迁移到云端”逐项目重试，不删除失败项目；
- 本地开发专用的 LibTV bridge 依赖 Vite 开发服务器，静态部署不提供该 bridge，线上预览保持 mock 构建、真实生成禁用。

## 2. 构建契约

### 环境要求

- Node.js：建议在本地和 CI 固定同一 LTS 主版本；当前验证环境为 Node.js 22。
- npm：使用仓库内的 `app/package-lock.json` 锁定依赖。
- 构建入口：仓库根目录。
- 构建输出：`app/dist`。

### 安装与构建

在仓库根目录执行：

```bash
npm --prefix app ci
npm --prefix app run build:mock
```

`build:mock` 执行 TypeScript 项目构建、强制 `VITE_GENERATION_MODE=mock` 的 `vite build` 和 404 fallback，输出仍为 `app/dist`。同时将构建进程中的 `VITE_SEEDREAM_API_KEY` 置空，防止本机 `.env.local` 的开发 Key 写入公开产物；不修改 `.env.local`。部署时应上传 `app/dist` 的完整内容，而不是只上传 `index.html`。

普通 `build` 保留开发验证用途，会继承 `.env.local`，不能用于本节公开部署与离线验收。

### 部署前本地门禁

```bash
npm --prefix app run typecheck
npm --prefix app run test:run
npm --prefix app run build:mock
PLAYWRIGHT_OFFLINE_DIST=dist npm --prefix app run e2e
```

也可直接执行 `npm --prefix app run verify`，顺序与 GitHub Actions 一致。首次运行前安装 Chromium：在 `app` 目录执行 `npx playwright install chromium`（CI 使用 `--with-deps`）。

`PLAYWRIGHT_OFFLINE_DIST` 是相对于 `app` 的 mock 构建目录，也可传绝对路径。它仅供 `public-model-catalog.spec.ts` 读取静态产物，不再关闭开发测试服务器。生成链路 E2E 仍使用原有 fixture Key 和拦截网络；不能把它们切换为禁用生成的 mock 静态站点。

如需检查最终静态产物：

```bash
cd app
npx serve dist -l 4173
```

## 3. SPA 路由回退

项目使用 BrowserRouter。`/projects`、`/agents`、`/challenges`、`/project/:projectId` 等深层路径在刷新时必须由托管平台回退到 `/index.html`，否则会出现 404。

仓库已包含：

- `vercel.json`：构建命令为 `npm --prefix app run build`，输出目录为 `app/dist`，并将所有路径重写到 `/index.html`；
- `netlify.toml`：发布目录为 `app/dist`，并使用状态码 200 将所有路径回退到 `/index.html`。

其他静态托管服务必须配置等价规则：真实文件优先，其余请求返回 `/index.html`，HTTP 状态码为 200。

GitHub Pages 不支持任意重写规则，因此生产构建还会把最终 `index.html` 复制为 `app/dist/404.html`。直接访问 `/andydb/projects`、`/andydb/project/:projectId` 等深层路径时，Pages 会返回同一份应用入口，React Router 再根据当前 URL 渲染对应页面。

## GitHub Pages

预期站点地址：<https://andydb0927-coder.github.io/andydb/>。

仓库已包含 `.github/workflows/deploy.yml`，工作流行为如下：

1. push 到 `codex/platform-shell-phase` 时触发，也可在 Actions 页面手动运行；
2. 使用 Node.js 22 和 `app/package-lock.json` 安装锁定依赖；
3. 安装 Playwright Chromium，按 typecheck → Vitest → `build:mock` → Playwright 顺序验收，不调用真实模型 API；
4. 生成 `app/dist/index.html`、同内容的 `app/dist/404.html`，静态资源路径以 `/andydb/` 开头；
5. 将 `app/dist` 发布到孤立的 `gh-pages` 分支。

首次启用需要在 GitHub 仓库中打开 **Settings → Pages**，将 Source 设为 **Deploy from a branch**，分支选择 `gh-pages`、目录选择 `/(root)`。后续每次 push 到 `codex/platform-shell-phase` 都会自动更新该分支。

本地模拟 Pages 根路径：

```bash
cd app
npm run build:mock
npx serve dist -l 4173
```

打开 <http://localhost:4173/> 可检查入口和静态资源；深层路由回退由构建产物中的 `404.html` 提供。线上访问时使用 `/andydb/` 前缀。

## 4. Vercel 部署步骤

1. 在 Vercel 导入 Git 仓库，Root Directory 保持仓库根目录。
2. 安装命令设置为 `npm --prefix app ci`。
3. 仓库内 `vercel.json` 已声明构建命令与输出目录；若控制台需要手动填写，使用：
   - Build Command：`npm --prefix app run build`
   - Output Directory：`app/dist`
4. 当前静态演示版不配置任何真实供应商密钥。
5. 创建 Preview Deployment，完成第 8 节清单后再考虑绑定正式域名。

## 5. Netlify 部署步骤

1. 在 Netlify 导入 Git 仓库，Base directory 保持仓库根目录。
2. 使用仓库内 `netlify.toml` 的构建与回退规则。
3. 确认：
   - Build Command：`npm --prefix app run build`
   - Publish Directory：`app/dist`
4. 如果站点没有在构建前自动安装 lockfile 依赖，将命令改为 `npm --prefix app ci && npm --prefix app run build`。
5. 当前静态演示版不配置任何真实供应商密钥。

## 6. 任意静态托管步骤

1. 在 CI 中执行 `npm --prefix app ci` 和 `npm --prefix app run verify`。
2. 上传 `app/dist/` 内的全部文件。
3. 配置 HTTPS、正确的 JavaScript/CSS/图片/音视频 MIME 类型，以及第 3 节的 SPA 回退。
4. 缓存建议：
   - `/assets/*` 等带内容哈希的文件可使用长期不可变缓存；
   - `/index.html` 使用不缓存或短缓存，避免新版本发布后仍加载旧入口。
5. 如果托管平台支持 Range Requests，建议为演示视频和音频开启，以便拖动播放进度。

## 7. 环境变量预留

### 当前静态演示部署

当前版本无需环境变量即可构建和运行。以下变量用于静态演示和可选的 Worker 接入：

```dotenv
VITE_APP_ENV=preview
VITE_PUBLIC_SITE_URL=https://canvas-preview.example.com
VITE_GENERATION_MODE=mock
VITE_GENERATION_API_BASE=/api
# 可选；未配置时保持纯本地 IndexedDB
VITE_BACKEND_URL=https://canvas-api.example.workers.dev
# 仅限受控预览邀请码；VITE_ 变量会进入公开前端产物，不能当生产秘密
VITE_BACKEND_INVITE_CODE=preview-invite
```

只有可以公开给浏览器的配置才能使用 `VITE_` 前缀。Vite 会在构建时把这些值写入浏览器可下载的 JavaScript，不能把长期有效的生产密钥放入任何 `VITE_*` 变量。

### 真实生成的本地开发验证预留

火山方舟 Seedream 5.0 Pro 文生图、Seedance 2.0 视频与豆包文本在本机开发验证时复用 Ark Key。豆包 TTS 属于独立 Speech/OpenSpeech 产品，必须单独开通语音资源并配置 Speech API Key，不能复用 Ark Key：

```dotenv
VITE_GENERATION_MODE=seedream-direct-dev
VITE_SEEDREAM_API_KEY=temporary-development-api-key
VITE_SEEDREAM_API_BASE=https://ark.cn-beijing.volces.com/api/v3
VITE_SEEDREAM_MODEL_ID=doubao-seedream-5-0-pro-260628
VITE_ARK_VIDEO_MODEL_ID=<开通管理中账号可调用的 Seedance Model ID 或 Endpoint ID>
VITE_ARK_TEXT_MODEL_ID=<控制台已开通的豆包文本模型或接入点 ID>
VITE_ARK_TTS_API_KEY=<开通豆包语音资源后签发的专用 Speech API Key>
VITE_ARK_TTS_MODEL_ID=seed-tts-2.0
VITE_ARK_AUDIO_MODEL_ID=seed-audio-1.0
```

启用后，模型菜单的“官方 API 已接（开发直连）”分组会开放 Seedream 5.0 Pro 与已配置的豆包文本模型；Seedance 还必须配置账号在“开通管理/模型列表”中确认可调用的 Model ID 或 Endpoint ID。公开体验页中的模型 ID 不作为代码默认值，也不能证明当前账号已经获得 API 权限。只有另行配置 `VITE_ARK_TTS_API_KEY` 时才开放豆包语音合成 2.0。图片调用 `/images/generations`，视频调用 `/contents/generations/tasks` 并轮询任务；语音调用 `openspeech.bytedance.com/api/v3/tts/*`。成功结果写入节点版本、项目资产和生成历史。未配置对应 Key/模型 ID 时真实模型保持禁用并显示明确原因，不会回退为 Mock 伪装成功。

这些变量只允许使用低额度、可随时撤销的开发凭证；不得提交到 Git，不得配置到公开 Preview/Production 静态站点。验证完成后应立即撤销或轮换。

### Cloudflare Worker 云存储与生产代理

前端通过以下配置启用 Worker：

```dotenv
VITE_BACKEND_URL=https://canvas-api.example.workers.dev
VITE_BACKEND_INVITE_CODE=<受控预览邀请码>
VITE_GENERATION_MODE=cloud-proxy
```

- 项目读写使用 `/api/data/projects`；本地 IndexedDB 永远先写，云端失败不会阻断保存或刷新恢复。
- 图片、视频、文本生成分别使用 `/api/proxy/image`、`/api/proxy/video`、`/api/proxy/text`；视频轮询使用 `/api/proxy/video/:taskId`。
- 首次云端请求调用 `/api/auth/device`，设备 token 只保存在该浏览器 `localStorage`，后续请求统一携带 `Authorization: Bearer ...`。
- “迁移到云端”按项目串行执行，已迁移且未变化的项目会跳过；失败项目保留在本地并显示原因。
- `VITE_BACKEND_INVITE_CODE` 适合当前简单设备准入和受控 Preview，不是秘密。正式账号体系上线后应改为用户输入/登录签发，不能把长期有效的生产邀请码嵌入公开静态包。

`cloud-proxy` 模式不读取浏览器中的 Ark/OpenSpeech Key。供应商密钥、模型 ID、D1/KV 绑定和设备 token 签名密钥只配置在 `backend/` 对应的 Worker Secrets/Bindings，详见 `backend/README.md`。

### 生产服务端 Secrets

生产环境必须由同源服务端代理或 Serverless Function 保管密钥；这些变量不带 `VITE_` 前缀，也不得返回给浏览器：

```dotenv
ARK_API_KEY=production-secret
ARK_API_BASE=https://ark.cn-beijing.volces.com/api/v3
ARK_IMAGE_MODEL_ID=doubao-seedream-5-0-pro-260628
ARK_VIDEO_MODEL_ID=<服务端账号已开通的视频 Model ID 或 Endpoint ID>
ARK_TEXT_MODEL_ID=<控制台已开通的豆包文本模型或接入点 ID>
SPEECH_API_KEY=<豆包语音资源专用 Key>
ARK_TTS_MODEL_ID=seed-tts-2.0
ARK_AUDIO_MODEL_ID=seed-audio-1.0
ALLOWED_ORIGINS=https://canvas.example.com
```

纯静态前端无法安全保管第三方 API 密钥。因此当前静态上线准备只发布演示模式；真实生成进入生产前，必须先增加服务端代理。

## 8. 预览域名建议

推荐按环境分离：

- 首选：`canvas-preview.<自有域名>`；
- 备选：`preview-canvas.<自有域名>`；
- 临时验收：Vercel/Netlify 自动分配的分支 Preview 域名；
- 后续生产：`canvas.<自有域名>`，不得与 Preview 共用第三方密钥或本地数据预期。

Preview 页面应明显标注“演示”或“Preview”，避免用户把本地数据和 Mock 生成误认为正式云端能力。

## 9. 上线前验收清单

- [ ] 按 `typecheck` → Vitest → `build:mock` → Playwright 顺序全绿；
- [ ] 首页、项目页、Skills、挑战赛可直接打开并刷新；
- [ ] 新建项目后 `/project/:projectId` 可直接打开并刷新；
- [ ] 双击创建节点、节点编辑、连线、故事板、Agent 面板和导出入口可用；
- [ ] 模型菜单只显示未配置的真实供应商与待接入项，生成禁用且不请求真实第三方 API；
- [ ] 同一浏览器刷新后本地项目仍存在，换浏览器不承诺同步；
- [ ] 控制台无未处理错误，静态资源无 404；
- [ ] 不存在 `VITE_SEEDREAM_API_KEY` 或其他真实密钥；
- [ ] 深链回退、HTTPS、缓存和音视频加载正常。

## 10. 回滚

静态产物应按提交或部署版本保留。发现问题时直接将托管平台切回上一份通过验收的不可变构建，不修改或迁移浏览器本地数据。回滚后再次验证深链刷新与静态资源版本一致。
