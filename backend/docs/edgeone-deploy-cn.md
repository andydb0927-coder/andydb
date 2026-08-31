# EdgeOne 中国内地节点部署手册

本文是域名备案期间的预部署清单，目标平台是 **腾讯云 EdgeOne 中国大陆可用区**。无线画布后端仍通过服务端请求访问火山方舟北京端点；EdgeOne 只承载 Hono API、运行时配置与 EdgeKV，不会把供应商 Key 下发给浏览器。

本手册不执行生产发布。域名未完成 ICP 备案前，不得把站点切换到中国大陆可用区或全球可用区。

## 0. 上线前置门禁

- EdgeOne 账号已实名认证，并创建站点。
- 自定义域名已完成 ICP 备案；备案期间只准备函数、KV、变量与灰度规则。
- EdgeOne KV 已获开通权限。官方当前将 KV 作为需要申请的能力，控制台没有“KV 存储”时先申请，不用其他变量伪装绑定。
- KV 命名空间绑定变量必须命名为 `EDGEKV`，并确认运行时提供 `get`、`put`、`delete`、`list`。
- EdgeKV 属于最终一致存储，其他边缘节点最长可能在约 60 秒内读到旧值。灰度可验证项目和资产流程，但严格配额扣减、全局乐观锁与支付账本在采用强一致存储前不得全量上线。
- 构建、测试和灰度脚本均不调用 `/api/proxy/*`，不会产生真实模型费用。

## 1. 开通 EdgeOne

1. 登录腾讯云控制台，进入“边缘安全加速平台 EdgeOne”。
2. 创建或选择无线画布站点，接入模式按现有 DNS 管理方式选择 NS 或 CNAME。
3. 备案完成后，将加速区域设置为“中国大陆可用区”；备案完成前保持非大陆预览或不启用域名流量。
4. 确认套餐包含边缘函数与 KV 配额，并记录站点 ID，禁止把控制台 API Token 写入仓库。

## 2. 创建中国内地边缘函数

1. 在站点内进入“边缘函数”，创建函数 `wireless-canvas-api`。
2. 运行区域选择中国内地，优先北京；若控制台以站点加速区域自动决定节点，则保持站点为“中国大陆可用区”。
3. 在本地执行：

   ```bash
   cd backend
   npm ci
   npm run typecheck
   npm run test:run
   npm run build:edgeone
   ```

4. 上传单文件 `dist/index.js`。它同时保留默认 `fetch` 对象和 Service Worker `fetch` 监听入口。
5. 首次只创建草稿或预览版本，不直接绑定全量流量。

## 3. 绑定 EdgeKV

1. 在站点的“KV 存储”创建命名空间，建议名称 `wireless-canvas-cn`。
2. 将命名空间绑定到 `wireless-canvas-api`，变量名称必须填 `EDGEKV`。
3. 重新发布函数草稿；绑定修改不会自动进入已发布版本。
4. 灰度注册后检查以下键空间：

   - `v1:invite:*`
   - `v1:device:*`
   - `v1:user:{userId}:account`
   - `v1:user:{userId}:usage`
   - `v1:user:{userId}:project:*`
   - `v1:user:{userId}:asset:*`

5. 若运行时没有 `list({ prefix, cursor })`，停止上线并先补适配器；不要把健康检查通过等同于数据仓储可用。

## 4. 环境变量与 Secret

以 [`.env.edgeone.example`](../.env.edgeone.example) 为核对模板。模板只用于列出变量，真实 Secret 必须在 EdgeOne 控制台的加密变量或 Secret 管理中填写。

### Secret

| 名称 | 必需 | 说明 |
| --- | --- | --- |
| `DEVICE_TOKEN_SECRET` | 是 | 设备 token HMAC 高熵密钥 |
| `ADMIN_TOKEN` | 是 | 邀请码管理接口凭证 |
| `ARK_API_KEY` | 启用图片/视频/文本时 | 火山方舟服务端 Key |
| `OPENSPEECH_API_KEY` | 启用 TTS 时 | OpenSpeech 专用凭证，不可用 Ark Key 替代 |

### 普通环境变量

| 名称 | 推荐值或要求 |
| --- | --- |
| `ARK_API_BASE` | `https://ark.cn-beijing.volces.com/api/v3` |
| `OPENSPEECH_API_BASE` | `https://openspeech.bytedance.com/api/v3` |
| `SEEDREAM_MODEL_ID` | 当前账号已开通的 Seedream Endpoint/模型 ID |
| `SEEDANCE_MODEL_ID` | 当前账号已开通的 Seedance Endpoint/模型 ID |
| `ARK_TEXT_MODEL_ID` | 当前账号已开通的豆包文本 Endpoint/模型 ID |
| `OPENSPEECH_RESOURCE_ID` | 已授权的 TTS 资源 ID |
| `CORS_ALLOWED_ORIGINS` | 逗号分隔的 HTTPS 精确 origin，不含路径，不得使用 `*` |
| `DEVICE_TOKEN_TTL_SECONDS` | `86400` |
| `UPSTREAM_TIMEOUT_MS` | `30000` |
| `SNAPSHOT_KV_THRESHOLD_BYTES` | `65536` |
| `INVITE_CODES` | 兼容预览用；正式环境建议保持空并走邀请码仓储 |

变量配置完成后重新发布草稿。禁止将控制台导出的真实 `.env`、Secret 截图或部署日志提交到 Git。

## 5. 关联已备案域名

1. 备案通过后，在 EdgeOne 站点下添加 API 子域名，例如 `api.example.com`。
2. 完成域名归属校验，并按 NS/CNAME 接入方式更新 DNS。
3. 申请并启用 HTTPS 证书，强制 HTTP 跳转 HTTPS。
4. 把前端正式 origin 写入 `CORS_ALLOWED_ORIGINS`，不要填写 API 域名本身，除非前后端同源。
5. 域名备案失效时，中国大陆节点会停止服务；运维监控必须包含备案和证书到期提醒。

## 6. 配置 `/api/*` 触发规则

1. 在“规则引擎 / 边缘函数触发规则”新增规则。
2. 匹配 Host 为 API 子域名，URL Path 匹配 `/api/*`。
3. 执行动作为调用 `wireless-canvas-api` 当前灰度版本。
4. 规则优先级放在静态缓存和回源规则之前；API 响应禁止缓存。
5. 先按测试 IP、特定地域或低权重流量命中，不要直接全量。

## 7. 灰度发布与验收

1. 发布一个预览/灰度版本，初始权重建议 1%–5%，或仅允许测试 IP。
2. 准备一个已注册的灰度设备 token；脚本不会创建或修改邀请码。
3. 执行基础验收：

   ```bash
   EDGEONE_BASE_URL=https://api.example.com \
   EDGEONE_EXPECTED_ORIGIN=https://app.example.com \
   ./scripts/verify-edgeone-cn.sh
   ```

4. 执行完整数据读取验收：

   ```bash
   EDGEONE_BASE_URL=https://api.example.com \
   EDGEONE_EXPECTED_ORIGIN=https://app.example.com \
   EDGEONE_DEVICE_TOKEN='仅注入当前进程，不写入文件' \
   EDGEONE_VERIFY_LEVEL=full \
   ./scripts/verify-edgeone-cn.sh
   ```

5. 脚本必须全部输出中文 `PASS`；任何 `FAIL` 都停止扩量。脚本只检查健康、鉴权、CORS 和数据读取，不发真实生成请求。
6. 人工补验邀请注册、项目写入、资产写入、旧版本 409 冲突及跨地域传播，再按 5%→20%→50%→100% 逐级放量。

## 8. 回滚

1. 将 `/api/*` 触发规则切回上一函数版本，或把灰度权重降到 0。
2. 前端移除 `VITE_BACKEND_URL` / `cloud-proxy` 后重新构建，浏览器 IndexedDB 数据保留。
3. 不立即删除 EdgeKV 命名空间；先导出、核对版本并保留回滚观察期。
4. 只有发生安全事件时才轮换 `DEVICE_TOKEN_SECRET`，因为轮换会使全部现有设备 token 失效。
5. 回滚后保存失败时间、EdgeOne 请求 ID、函数版本、影响范围和恢复时间，不记录用户提示词或 Secret。

## 9. 官方参考

- [EdgeOne 使用限制与中国大陆备案要求](https://cloud.tencent.com/document/product/1552/104964)
- [EdgeOne 添加加速域名](https://cloud.tencent.com/document/product/1552/90433)
- [EdgeOne 边缘函数快速指引](https://cloud.tencent.com/document/product/1552/82012)
- [EdgeOne KV 操作指引](https://cloud.tencent.com/document/product/1552/130379)
- [EdgeOne KV 一致性说明](https://cloud.tencent.com/document/product/1552/127420)
- [EdgeOne 边缘函数灰度发布](https://cloud.tencent.com/document/product/1552/125862)
