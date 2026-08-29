# 无线画布 Cloudflare Workers 后端骨架

本目录是与 `app/` 完全独立的 Hono + TypeScript Cloudflare Worker。第一批只提供设备鉴权和四类上游 API 安全代理，不保存项目数据，也不在源码、配置文件或响应中暴露供应商密钥。

## 本地启动

```bash
cd backend
npm install
cp .dev.vars.example .dev.vars
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

第一批视频路由只代理“创建任务”；任务查询会在前端正式迁移后补充，避免本批改变现有 `app/` 行为。四条路由均拒绝客户端传入上游 Key、上游 URL或模型 ID；这些值只从 Worker Bindings 读取。

## 鉴权方案

1. 客户端生成并长期保存一个非敏感 `deviceId`（8–128 位字母、数字或 `._:-`）。
2. 首次访问向 `/api/auth/device` 提交 `deviceId` 与邀请码。
3. Worker 用 `INVITE_CODES` 校验邀请码，再用 `DEVICE_TOKEN_SECRET` 对 `{deviceId, issuedAt, expiresAt}` 做 HMAC-SHA256 签名。
4. 客户端后续使用 `Authorization: Bearer v1.<payload>.<signature>` 调用代理；默认 24 小时过期。
5. 邀请码、签名密钥与供应商密钥均为 Worker Secret。响应与日志只返回安全化中文错误，不回显上游正文或密钥。

这是第一阶段的轻量准入机制，不等同于正式账号体系。生产阶段应增加邀请码状态存储、token 撤销、速率限制、滥用审计和可选的账号登录。

## Worker 配置与 Secrets

`wrangler.toml` 只保存非敏感端点、模型/接入点 ID、超时和 token 有效期。以下值必须使用 Secret：

```bash
npx wrangler secret put DEVICE_TOKEN_SECRET
npx wrangler secret put INVITE_CODES
npx wrangler secret put ARK_API_KEY
npx wrangler secret put OPENSPEECH_API_KEY
```

其中 Seedance 必须把 `SEEDANCE_MODEL_ID` 换成当前账号已开通的模型或推理接入点 ID；OpenSpeech Key 是语音资源凭证，不能用 Ark Key 冒充。

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

## 数据模型草案

本批不创建数据库；以下是后续 D1/R2/Queues 接入时的稳定边界：

| 实体 | 建议主键 | 核心字段 | 存储候选 |
| --- | --- | --- | --- |
| Device | `device_id` | `created_at/status/last_seen_at` | D1 |
| Invite | `code_hash` | `status/max_uses/used_count/expires_at` | D1 |
| Project | `project_id` | `owner_device_id/title/snapshot_version/updated_at` | D1 + R2 |
| Asset | `asset_id` | `project_id/kind/mime_type/r2_key/metadata` | D1 + R2 |
| GenerationTask | `task_id` | `provider/kind/status/request_hash/cost/error_code` | D1 + Queues |
| DeviceTokenRevocation | `token_hash` | `device_id/expires_at/revoked_at` | KV 或 D1 |

供应商请求和响应只保存必要的任务元数据；原始 Key 永不入库。项目快照继续采用现有前端格式，后续同步层必须保持向后兼容和幂等写入。

## 测试隔离

Vitest 通过 `createApp({ fetchFn })` 注入内存 fixture，覆盖每条代理的未鉴权、参数校验、上游 `401/403/404` 与超时，不会访问火山方舟或 OpenSpeech，也不会产生费用。

## 官方参考

- [Hono on Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Cloudflare Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Cloudflare 本地 Secrets 与 `.dev.vars`](https://developers.cloudflare.com/workers/local-development/environment-variables/)
- [Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)
