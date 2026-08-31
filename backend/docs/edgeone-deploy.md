# EdgeOne / 火山边缘函数部署手册

本文用于把 `backend/` 的 Hono API 部署到国内边缘函数，并把项目、资产、账号、邀请码和用量改由 `EDGEKV` 持久化。本文不包含生产部署操作，也不保存任何真实密钥。

## 0. 部署前兼容性门禁

本批代码接受名为 `EDGEKV` 的 **KVNamespace-like 绑定**，最小接口为：

```ts
get(key, 'text')
put(key, value)
delete(key)
list({ prefix, cursor })
```

默认导出 `{ fetch(request, env, executionContext) }`，同时注册 `addEventListener('fetch')`，因此兼容 Cloudflare 模块 Worker 与 Service Worker 形态的边缘函数入口。

火山引擎当前公开文档中的边缘 KV 示例为全局 `KV.get(storage, key, options)`，不等同于 KVNamespace 绑定；只有目标控制台已提供上述 `EDGEKV` 绑定或已配置等价适配器时，才可继续部署。若控制台只有全局 `KV` API，应先增加并验证运行时适配层，禁止直接上线。本批不伪造该平台能力。

边缘 KV 是最终一致存储。仓储值包含 `version`，并在单个边缘实例内串行化同一 key 的写入，能稳定检测同实例并发冲突；跨边缘节点没有原子 CAS 保证，写后传播窗口内仍可能读到旧值。严格全局一致的配额扣减和项目写入，后续应迁移到平台提供的事务型存储或集中式锁服务。

官方参考：

- [火山引擎边缘函数产品功能](https://www.volcengine.com/docs/6454/2178961)
- [火山引擎边缘 KV 快速入门](https://www.volcengine.com/docs/6454/2179281)
- [火山引擎边缘函数 CLI 安装](https://www.volcengine.com/docs/6454/2179403)
- [火山引擎边缘 KV CLI](https://www.volcengine.com/docs/6454/2179417)
- [火山引擎环境变量说明](https://www.volcengine.com/docs/6499/174217)

## 1. 本地质量门禁

```bash
cd backend
npm ci
npm run typecheck
npm run test:run
```

测试使用内存 `Map` 模拟 EdgeKV，不访问真实边缘 KV、火山方舟或 OpenSpeech，不产生费用。

## 2. 开通边缘函数

1. 登录火山引擎控制台，进入 CDN / 边缘函数。
2. 确认账号已开通边缘函数和中国内地节点能力。
3. 创建函数，例如 `wireless-canvas-api`。
4. 关联已备案且已接入 CDN 的 API 域名。
5. 配置域名触发规则，让 `/api/*` 请求进入该函数。

官方运行时以 `fetch` 事件触发。当前 `backend/src/index.ts` 已同时支持事件监听入口与默认 `fetch` 导出，无需复制两份业务代码。

## 3. 创建并绑定 EdgeKV

### 控制台

1. 进入“边缘 KV”，单击“创建存储空间”。
2. 名称建议使用 `wireless-canvas-edgekv`，项目选择与边缘函数相同的项目。
3. 数据区域选择中国内地；不要设置自动过期 TTL。
4. 在函数的“绑定 / 扩展服务”中把该存储空间绑定为变量 `EDGEKV`。
5. 在函数预览环境确认 `EDGEKV.get/put/delete/list` 均存在。

### CLI（可选）

```bash
npm i --save-dev @volcengine/nest
npx nest config set -g cloud.access_key '<ACCESS_KEY_ID>'
npx nest config set -g cloud.secret_key '<SECRET_ACCESS_KEY>'
npx nest kv namespace create wireless-canvas-edgekv -p default --cn
npx nest kv namespace list
```

Access Key 只写入本机 CLI 配置，不写入仓库。官方说明调试环境可能不支持边缘 KV 运行时 API，因此 KV 联调必须在灰度或正式边缘环境完成。

## 4. 配置环境变量和 Secrets

生产函数至少配置：

| 类型 | 变量 | 说明 |
| --- | --- | --- |
| Secret | `DEVICE_TOKEN_SECRET` | 设备 token HMAC 密钥，使用高熵随机值 |
| Secret | `ADMIN_TOKEN` | 邀请码管理接口凭证 |
| Secret | `ARK_API_KEY` | 火山方舟服务端 Key |
| Secret | `OPENSPEECH_API_KEY` | OpenSpeech 专用凭证；未开通可暂不启用 TTS |
| 普通变量 | `ARK_API_BASE` | `https://ark.cn-beijing.volces.com/api/v3` |
| 普通变量 | `OPENSPEECH_API_BASE` | `https://openspeech.bytedance.com/api/v3` |
| 普通变量 | `SEEDREAM_MODEL_ID` | 当前账号已开通的 Seedream 接入点 ID |
| 普通变量 | `SEEDANCE_MODEL_ID` | 当前账号已开通的 Seedance 接入点 ID |
| 普通变量 | `ARK_TEXT_MODEL_ID` | 当前账号已开通的豆包文本接入点 ID |
| 普通变量 | `OPENSPEECH_RESOURCE_ID` | 已授权的 TTS 资源 ID |
| 普通变量 | `CORS_ALLOWED_ORIGINS` | 逗号分隔的前端精确 origin；未配置时拒绝所有跨域请求 |
| 普通变量 | `DEVICE_TOKEN_TTL_SECONDS` | 建议 `86400` |
| 普通变量 | `UPSTREAM_TIMEOUT_MS` | 建议 `30000` |
| 普通变量 | `SNAPSHOT_KV_THRESHOLD_BYTES` | 建议 `65536` |

修改环境变量后重新发布函数才会生效。禁止把上述 Secret 写进代码、`nest.json`、提交记录或日志。

`CORS_ALLOWED_ORIGINS` 必须写完整 origin（例如 `https://canvas.example.com`），不能使用 `*`，不能附带路径。只有前后端同源部署时才可保持为空；跨域预检仅允许项目实际使用的 HTTP 方法以及 `Authorization`、`Content-Type` 请求头。

## 5. 构建与上传

EdgeOne / 火山边缘函数需要上传浏览器 Worker 兼容的单文件包。可在隔离的构建环境执行：

```bash
cd backend
npm ci
npm exec --package esbuild -- \
  esbuild src/index.ts \
  --bundle \
  --format=esm \
  --platform=browser \
  --target=es2022 \
  --outfile=dist/index.js
```

上传 `dist/index.js`，入口指向该文件。若目标控制台只接受 Service Worker 脚本，使用同一产物；脚本会自行注册 `fetch` 监听器。先发布灰度版本，不要直接全量。

## 6. 灰度验证

按顺序验证：

1. `GET /api/health` 返回 `{"status":"ok"}`。
2. 管理端创建邀请码，确认 EdgeKV 出现 `v1:invite:*`。
3. 设备换 token 并注册，确认出现：
   - `v1:user:{userId}:account`
   - `v1:user:{userId}:usage`
   - `v1:device:{deviceId}`
4. 创建项目和资产，确认出现：
   - `v1:user:{userId}:project:{projectId}`
   - `v1:user:{userId}:asset:{assetId}`
5. 用旧 `version` 更新同一项目，必须返回 HTTP 409 `VERSION_CONFLICT`。
6. 验证邀请注册、用量查询和上游失败回滚；不要先跑高成本视频生成。
7. 从至少两个国内地区重复读取，观察最终一致传播；若业务要求立即一致，停止上线并改用强一致存储。

## 7. 前端切换

灰度 API 验证完成后，前端生产环境配置：

```text
VITE_BACKEND_URL=https://<api-domain>
VITE_GENERATION_MODE=cloud-proxy
```

前端仍保留 IndexedDB 本地回退。先迁移一个测试项目，确认刷新恢复、资产读取和生成历史正常，再迁移用户数据。

## 8. 回滚

1. 前端把 `VITE_BACKEND_URL` 切回旧 Worker 或移除，重新构建；本地 IndexedDB 不清理。
2. 边缘函数回滚到上一个发布版本或移除 `/api/*` 触发规则。
3. 不删除 EdgeKV 命名空间；导出或备份后再处理。
4. 轮换 `DEVICE_TOKEN_SECRET` 会使现有设备 token 全部失效，只在确有安全事件时执行。
