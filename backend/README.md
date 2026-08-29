# 无线画布 Cloudflare Workers 后端骨架

本目录是与 `app/` 完全独立的 Hono + TypeScript Cloudflare Worker。当前包含设备鉴权、四类上游 API 安全代理，以及 D1 + Workers KV 数据存储层；不会在源码、配置文件或响应中暴露供应商密钥。

## 本地启动

```bash
cd backend
npm install
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply wireless-canvas --local
npm run dev
```

`npm run dev:mock` 可直接以假密钥启动本地 Worker，用于验证路由、鉴权和中文错误映射；假密钥请求真实上游会得到安全化的鉴权错误，不会产生费用。`.dev.vars` 已被忽略，禁止提交真实密钥。

质量门禁：

```bash
npm run typecheck
npm run test:run
```

## 路由表

| 方法 | 路径 | 鉴权 | 用途 | 上游 |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | 无 | Worker 存活检查 | 无 |
| POST | `/api/auth/device` | 邀请码 | 以 `deviceId + inviteCode` 换取短期设备 token | 无 |
| POST | `/api/proxy/image` | Bearer 设备 token | 图片生成请求白名单与代理 | Ark Seedream `/images/generations` |
| POST | `/api/proxy/video` | Bearer 设备 token | 视频任务创建请求白名单与代理 | Ark Seedance `/contents/generations/tasks` |
| POST | `/api/proxy/text` | Bearer 设备 token | 文本对话请求白名单与代理 | Ark 豆包 `/chat/completions` |
| POST | `/api/proxy/tts` | Bearer 设备 token | 语音合成请求白名单与代理 | OpenSpeech `/tts/unidirectional` |
| GET/POST | `/api/data/projects` | Bearer 设备 token | 当前设备的项目列表、创建项目 | D1 + KV |
| GET/PUT/DELETE | `/api/data/projects/:id` | Bearer 设备 token | 读取、乐观锁更新、删除项目 | D1 + KV |
| GET/POST | `/api/data/assets` | Bearer 设备 token | 资产元数据列表、创建资产 | D1 |
| GET/PUT/DELETE | `/api/data/assets/:id` | Bearer 设备 token | 读取、乐观锁更新、删除资产元数据 | D1 |

第一批视频路由只代理“创建任务”；任务查询会在前端正式迁移后补充，避免本批改变现有 `app/` 行为。四条路由均拒绝客户端传入上游 Key、上游 URL或模型 ID；这些值只从 Worker Bindings 读取。

## 鉴权方案

1. 客户端生成并长期保存一个非敏感 `deviceId`（8–128 位字母、数字或 `._:-`）。
2. 首次访问向 `/api/auth/device` 提交 `deviceId` 与邀请码。
3. Worker 用 `INVITE_CODES` 校验邀请码，再用 `DEVICE_TOKEN_SECRET` 对 `{deviceId, issuedAt, expiresAt}` 做 HMAC-SHA256 签名。
4. 客户端后续使用 `Authorization: Bearer v1.<payload>.<signature>` 调用代理；默认 24 小时过期。
5. 邀请码、签名密钥与供应商密钥均为 Worker Secret。响应与日志只返回安全化中文错误，不回显上游正文或密钥。

这是第一阶段的轻量准入机制，不等同于正式账号体系。生产阶段应增加邀请码状态存储、token 撤销、速率限制、滥用审计和可选的账号登录。

数据路由中的 `user_token` 实际保存已验证设备 token 里的 `deviceId` 所有者键，不保存完整 Bearer token，也不保存邀请码。

## Worker 配置与 Secrets

`wrangler.toml` 只保存非敏感端点、模型/接入点 ID、超时和 token 有效期。以下值必须使用 Secret：

```bash
npx wrangler secret put DEVICE_TOKEN_SECRET
npx wrangler secret put INVITE_CODES
npx wrangler secret put ARK_API_KEY
npx wrangler secret put OPENSPEECH_API_KEY
```

其中 Seedance 必须把 `SEEDANCE_MODEL_ID` 换成当前账号已开通的模型或推理接入点 ID；OpenSpeech Key 是语音资源凭证，不能用 Ark Key 冒充。

## D1 与 KV 初始化

先在 Cloudflare 创建资源，并把返回的真实 ID 替换进 `wrangler.toml`：

```bash
npx wrangler d1 create wireless-canvas
npx wrangler kv namespace create SNAPSHOT_CACHE
npx wrangler d1 migrations apply wireless-canvas --remote
```

本地开发使用 Wrangler 的本地 D1/KV，不会连接生产资源：

```bash
npx wrangler d1 migrations apply wireless-canvas --local
npm run dev:mock
```

迁移文件位于 `migrations/`。D1 会在 `d1_migrations` 表记录已应用版本；绑定名分别为 `DB` 和 `SNAPSHOT_CACHE`。

## 错误契约

所有错误统一为：

```json
{
  "error": {
    "code": "UPSTREAM_ACCESS_DENIED",
    "message": "上游服务拒绝访问，请确认资源已开通。"
  }
}
```

上游 `401/403/404/408/429` 分别映射为安全中文错误；超时返回 HTTP 504，其余供应商错误返回 HTTP 502。上游原始错误正文不会透传，避免泄露账户、模型和请求细节。

## 数据模型与快照策略

| 表 | 主键 | 核心字段 | 当前职责 |
| --- | --- | --- | --- |
| `projects` | `id` | `user_token/name/data_json/snapshot_kv_key/version/updated_at` | 项目元数据和权威画布快照索引 |
| `projects_nodes` | `(project_id,id)` | `user_token/name/data_json/updated_at` | 预留节点级索引；权威数据仍是项目快照，避免破坏旧格式 |
| `assets` | `id` | `user_token/project_id/name/data_json/version/updated_at` | 图片、视频、音频、文本资产元数据 |
| `history` | `id` | `user_token/project_id/name/data_json/updated_at` | 预留生成与操作历史持久化 |

`data_json` 原样保存现有 IndexedDB `Project`/资产对象，因此旧节点、连线、多画布、版本、任务和新增字段都能向后兼容。API 不拆解或重写画布内容。

- 小于 64 KiB 的项目快照直接写入 D1。
- 大快照先写唯一版本 KV key，再把元数据和 `snapshot_kv_key` 写入 D1。
- KV 写入失败时明确回退到 D1 `data_json`，API 响应的 `storage` 为 `d1-fallback`。
- KV 引用存在但内容不可读时返回 `SNAPSHOT_UNAVAILABLE`，不会伪造空画布。
- 更新请求必须携带当前 `version`；D1 使用条件更新，过期写入返回 HTTP 409 和最新版本号。
- 每次并发写使用不同 KV key，失败写入只清理自己的临时快照，避免误删胜出版本。

KV 适合作为大体积快照的读取层，但具有最终一致性；项目版本与所有权判断始终以 D1 为准。供应商原始 Key 永不入库。

## 测试隔离

Vitest 通过 `createApp({ fetchFn, dataRepository, snapshotStore })` 注入内存 fixture，覆盖代理错误、数据 CRUD、设备隔离、乐观锁并发冲突、D1 映射和 KV 回退，不会访问火山方舟、OpenSpeech 或 Cloudflare 远程资源，也不会产生费用。

## 官方参考

- [Hono on Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Cloudflare Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Cloudflare 本地 Secrets 与 `.dev.vars`](https://developers.cloudflare.com/workers/local-development/environment-variables/)
- [Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare D1 Workers Binding API](https://developers.cloudflare.com/d1/worker-api/)
- [Cloudflare Workers KV bindings](https://developers.cloudflare.com/kv/concepts/kv-bindings/)
