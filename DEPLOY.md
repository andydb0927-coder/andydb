# 静态部署说明

## 1. 部署目标与边界

当前版本是可直接静态托管的 Vite 单页应用。部署产物为 `app/dist`，可发布到 Vercel、Netlify 或任何支持 SPA 路由回退的静态托管服务。

本阶段只做上线准备，不执行实际部署，也不改变现有运行模式：

- 生成能力继续使用本地演示数据和现有 ProviderRegistry；
- 不接入可灵或其他第三方真实生成 API；
- 不新增后端、数据库、对象存储或远端任务队列；
- 项目数据保存在当前浏览器的本地存储中，不提供跨浏览器、跨设备同步；
- 本地开发专用的 LibTV bridge 依赖 Vite 开发服务器，静态部署不提供该 bridge，线上预览应保持演示供应商模式。

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
npm --prefix app run build
```

构建命令内部执行 TypeScript 项目构建和 `vite build`。部署时应上传 `app/dist` 的完整内容，而不是只上传 `index.html`。

### 部署前本地门禁

```bash
npm --prefix app run typecheck
npm --prefix app run test:run
npm --prefix app run build
```

如需检查最终静态产物：

```bash
cd app
npm exec vite preview -- --host 127.0.0.1 --port 4173
```

## 3. SPA 路由回退

项目使用 BrowserRouter。`/projects`、`/agents`、`/challenges`、`/project/:projectId` 等深层路径在刷新时必须由托管平台回退到 `/index.html`，否则会出现 404。

仓库已包含：

- `vercel.json`：构建命令为 `npm --prefix app run build`，输出目录为 `app/dist`，并将所有路径重写到 `/index.html`；
- `netlify.toml`：发布目录为 `app/dist`，并使用状态码 200 将所有路径回退到 `/index.html`。

其他静态托管服务必须配置等价规则：真实文件优先，其余请求返回 `/index.html`，HTTP 状态码为 200。

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

1. 在 CI 中执行 `npm --prefix app ci` 和 `npm --prefix app run build`。
2. 上传 `app/dist/` 内的全部文件。
3. 配置 HTTPS、正确的 JavaScript/CSS/图片/音视频 MIME 类型，以及第 3 节的 SPA 回退。
4. 缓存建议：
   - `/assets/*` 等带内容哈希的文件可使用长期不可变缓存；
   - `/index.html` 使用不缓存或短缓存，避免新版本发布后仍加载旧入口。
5. 如果托管平台支持 Range Requests，建议为演示视频和音频开启，以便拖动播放进度。

## 7. 环境变量预留

### 当前静态演示部署

当前版本无需环境变量即可构建和运行。以下变量是后续接入时的命名预留，不代表现有代码已经读取它们：

```dotenv
VITE_APP_ENV=preview
VITE_PUBLIC_SITE_URL=https://canvas-preview.example.com
VITE_GENERATION_MODE=mock
VITE_GENERATION_API_BASE=/api
```

只有可以公开给浏览器的配置才能使用 `VITE_` 前缀。Vite 会在构建时把这些值写入浏览器可下载的 JavaScript，不能把长期有效的生产密钥放入任何 `VITE_*` 变量。

### 真实生成的本地开发验证预留

后续最小闭环可在仅限本机、短期验证的环境中临时使用：

```dotenv
VITE_GENERATION_MODE=kling-direct-dev
VITE_KLING_API_KEY=temporary-development-api-key
VITE_KLING_API_BASE=official-endpoint-confirmed-before-implementation
VITE_KLING_MODEL_ID=kling-2.6
```

这些变量只允许使用低额度、可随时撤销的开发凭证；不得提交到 Git，不得配置到公开 Preview/Production 静态站点。验证完成后应立即撤销或轮换。

### 生产服务端代理预留

生产环境必须由同源服务端代理或 Serverless Function 保管密钥；这些变量不带 `VITE_` 前缀，也不得返回给浏览器：

```dotenv
KLING_API_KEY=production-secret
KLING_API_BASE=official-endpoint-confirmed-before-implementation
KLING_MODEL_ID=kling-2.6
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

- [ ] `typecheck`、Vitest 和 `build` 全绿；
- [ ] 首页、项目页、Skills、挑战赛可直接打开并刷新；
- [ ] 新建项目后 `/project/:projectId` 可直接打开并刷新；
- [ ] 双击创建节点、节点编辑、连线、故事板、Agent 面板和导出入口可用；
- [ ] 演示供应商标识可见，生成操作不请求真实第三方 API；
- [ ] 同一浏览器刷新后本地项目仍存在，换浏览器不承诺同步；
- [ ] 控制台无未处理错误，静态资源无 404；
- [ ] 不存在 `VITE_KLING_API_KEY` 或其他真实密钥；
- [ ] 深链回退、HTTPS、缓存和音视频加载正常。

## 10. 回滚

静态产物应按提交或部署版本保留。发现问题时直接将托管平台切回上一份通过验收的不可变构建，不修改或迁移浏览器本地数据。回滚后再次验证深链刷新与静态资源版本一致。
