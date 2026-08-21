# 可灵真实生成最小闭环设计（2026-08-21）

## 1. 文档状态

- 状态：设计完成，尚未实施。
- 本阶段只定义未来接入方案，不修改现有代码，不调用可灵 API，不消耗额度。
- 当前站点继续使用本地演示数据与现有 ProviderRegistry。
- 官方接口版本、模型标识、鉴权格式和请求字段在实施当天从可灵官方 API 文档与控制台再次确认，不能把仓库内 placeholder 端点当作上线依据。

## 2. 目标

建立一条可观察、可失败、可回退的最小链路：

> 用户在视频节点输入提示词并点击生成 → 调用可灵官方 API → 等待官方任务完成 → 取得首个结果 URL → 直接在当前节点播放器中显示。

首通范围固定为：

- 单供应商：可灵官方 API；
- 单模型：由 `KLING_MODEL_ID` / `VITE_KLING_MODEL_ID` 注入的一个已开通模型，不在代码中散落硬编码；
- 单能力：文生视频；
- 单结果：只取官方响应中的第一个视频结果；
- 单节点回填：只更新本次点击生成的当前节点；
- 固定的最小参数集合：提示词、画面比例、时长；具体可选值以实施时的官方模型 Schema 为准。

选择“文生视频”而不是“图生视频”的原因是本阶段明确排除对象存储。图生视频通常需要第三方服务能够读取的输入图片；文生视频只发送文本和参数，可以先验证鉴权、任务状态与结果直显这条核心链路。

## 3. 明确排除

本闭环不包含：

- 对象存储、CDN、媒体转存或 URL 永久化；
- 后端数据库、云端项目表、生成历史表或账单表；
- Redis、消息中间件、后台 Worker 或任何持久化任务队列；
- 多供应商路由、自动降级、模型比价或并发调度；
- 图生视频、首尾帧、角色参考、音频、批量生成；
- 正式积分扣费、会员额度、退款或发票；
- 结果下载后的云端归档与跨设备恢复；
- 生产发布与真实用户开放。

官方生成通常是异步任务。前端或代理在单次用户会话中执行“提交一次 + 定时查询状态”的轮询循环，不等于建设任务队列；页面刷新、关闭或超时后不恢复任务。

## 4. 关键设计决策

### 4.1 结果只在内存中直显

验证阶段的结果 URL 进入独立的内存态 `EphemeralGenerationResultStore`，以 `projectId + nodeId` 为键。节点渲染时优先显示该 URL，但不写入：

- IndexedDB 项目快照；
- 生成历史；
- Asset Repository；
- NodeVersion 持久化记录；
- localStorage 或 sessionStorage。

刷新页面后结果消失是本阶段的预期行为。这样才能严格满足“API 返回 URL 直接显示，验证阶段不存储”。

现有 `GenerationQueue.onSuccess → applyGenerationSuccess` 会把结果进入项目资产和版本记录，因此真实验证模式不能直接走该持久化成功回调。后续实施时应增加一条 `applyEphemeralGenerationResult` 路径；Mock 生成、现有历史与项目持久化行为保持不变。

### 4.2 复用接口，不扩大注册表职责

现有 `ModelProvider` / `ProviderRegistry` 继续负责：

- 根据能力列出模型；
- 暴露模型名、参数 Schema 与成本提示；
- 将生成请求分发给对应 Provider。

后续只把当前 `kling-api` 占位实现替换或并列注册为可显式启用的 live Provider。建议把 `ModelProvider.kind` 从 `demo | placeholder` 扩展为 `demo | placeholder | live`，但不改变 Mock Provider 的默认选择逻辑。

Provider 内部完成“创建任务 → 轮询 → 解析结果”，对画布仍返回统一的生成结果。确切的官方请求和响应字段只存在于 Kling Provider 适配器中，不能渗透到节点组件或 ProviderRegistry。

### 4.3 现有前端队列只作界面状态，不是后端队列

如为降低改造量而复用现有 `GenerationQueue`，它只表示当前标签页中的 `queued/running/succeeded/failed` 界面状态：

- 不跨页面刷新恢复；
- 不把 live 任务写入项目持久化；
- 不调度多个任务；
- 不承担重试保证；
- 不替代可灵官方任务状态。

第一版应限制同一节点同一时间只能有一个 live 请求。用户取消只终止本地轮询；除非官方 API 明确提供取消能力，否则不承诺取消远端任务。

## 5. 端到端流程

```text
点击生成
  → 前端资格校验
  → 读取 kling-live 单模型配置
  → 创建可灵生成任务
  → 获得 taskId
  → 定时查询该 taskId
  → 成功时提取首个 HTTPS 视频 URL
  → 写入当前页面内存态
  → 节点播放器立即显示结果
```

### 5.1 点击前资格校验

只有同时满足以下条件才允许发起：

1. 当前选中的是视频生成节点；
2. 提示词去除空白后非空且未超过节点既有上限；
3. `kling-live` Provider 被显式启用；
4. 单模型配置存在；
5. 成本或官方计费提示已展示并经用户确认；
6. 当前节点没有未完成的 live 请求；
7. 开发直连模式仅在 localhost 或受控开发环境中运行。

缺少配置时生成按钮应禁用，并显示“可灵开发验证配置未完成”；不得静默回退到 Mock 后仍让用户误认为调用了真实模型。

### 5.2 创建任务

Kling Provider 将通用请求映射为官方文生视频请求：

- 模型标识来自环境配置；
- 提示词来自当前节点；
- 比例、时长仅允许官方 Schema 中的值；
- 第一版不发送参考素材、声音、多结果或高级参数；
- 鉴权头由开发直连模块或生产代理生成；
- 日志只记录 requestId、taskId、状态码和耗时，不记录密钥或完整鉴权头。

创建成功必须返回可追踪的 `taskId`。如果官方响应结构不符合预期，立即失败，不猜测字段。

### 5.3 状态轮询

- 首次查询在创建成功后短暂等待再开始；
- 使用有上限的间隔与总超时，不做无限轮询；
- 每次查询受同一个 `AbortSignal` 控制；
- 只识别官方文档明确列出的进行中、成功和失败状态；
- 429 按响应中的限流提示延后下一次查询；
- 401/403、参数错误和明确失败状态不自动重试；
- 网络瞬断只允许少量有上限的查询重试；
- 达到总超时后停止轮询，并告诉用户“任务可能仍在可灵侧运行，本页未继续等待”。

轮询进度是界面反馈，不伪造可灵没有返回的精确百分比。可以显示“已提交 / 生成中 / 正在获取结果”三个阶段。

### 5.4 结果校验与直显

成功响应按官方 Schema 提取首个结果，并校验：

- URL 使用 HTTPS；
- URL 可作为视频媒体源；
- 结果属于本次 `taskId`；
- 当前节点仍然存在且本次请求仍是该节点的最新请求。

校验通过后把 URL 写入内存态，并在节点内使用现有播放器直显。不得自动下载、转存或写入生成历史。界面显示“临时结果，刷新后失效”，并允许用户在 URL 有效期内手动预览或下载。

## 6. 配置与密钥注入

### 6.1 默认与 Mock 模式

```dotenv
VITE_GENERATION_MODE=mock
```

默认值必须继续是 `mock`。静态 Preview 和 Production 在没有安全代理前都只能使用该模式。

### 6.2 本地开发直连，仅用于验证

```dotenv
VITE_GENERATION_MODE=kling-direct-dev
VITE_KLING_ACCESS_KEY=temporary-development-key
VITE_KLING_SECRET_KEY=temporary-development-secret
VITE_KLING_API_BASE=official-endpoint-confirmed-before-implementation
VITE_KLING_MODEL_ID=official-model-id-confirmed-before-implementation
```

约束：

- 只允许本机开发服务器使用；
- 只使用低额度、可立即撤销的临时凭证；
- `.env.local` 不提交 Git；
- 页面显著显示“开发直连 / 密钥可见 / 不可发布”；
- 不允许把这组变量配置到 Vercel、Netlify 或任何公开静态站点；
- 验证结束后立即撤销或轮换凭证。

`VITE_*` 不是秘密存储。Vite 会把变量内联到浏览器代码，任何访问页面的人都可能读取。该方案只用于证明 API 协议和结果映射，不是生产架构。

### 6.3 生产必须走服务端代理

浏览器只调用同源入口，例如：

```text
POST /api/generation/kling
GET  /api/generation/kling/:taskId
```

服务端代理或 Serverless Function 使用不带 `VITE_` 前缀的环境变量：

```dotenv
KLING_ACCESS_KEY=production-secret
KLING_SECRET_KEY=production-secret
KLING_API_BASE=official-endpoint-confirmed-before-implementation
KLING_MODEL_ID=official-model-id-confirmed-before-implementation
ALLOWED_ORIGINS=https://canvas.example.com
```

代理职责仅限：密钥保管、官方鉴权、请求字段白名单、来源校验、限流、超时和响应裁剪。它不保存项目、任务或结果，不引入数据库、对象存储和任务队列。

前端生产配置只保留可公开的代理地址：

```dotenv
VITE_GENERATION_MODE=kling-proxy
VITE_GENERATION_API_BASE=/api
```

## 7. 建议的内部契约

以下是项目内部的稳定契约，不等同于可灵官方 JSON 字段：

```ts
interface KlingMinLoopRequest {
  requestId: string
  nodeId: string
  prompt: string
  modelId: string
  aspectRatio: string
  durationSeconds: number
}

type KlingMinLoopStatus =
  | { status: 'submitted'; taskId: string }
  | { status: 'processing'; taskId: string }
  | { status: 'succeeded'; taskId: string; resultUrl: string }
  | { status: 'failed'; taskId?: string; code: string; message: string }

interface EphemeralGenerationResult {
  projectId: string
  nodeId: string
  requestId: string
  providerId: 'kling-live'
  modelId: string
  resultUrl: string
  receivedAt: string
}
```

官方字段只在适配器边界做一次映射。UI、节点模型与测试只依赖上述内部契约，从而在官方 API 版本变化时只修改一个适配层。

## 8. 错误与安全语义

| 场景 | 用户反馈 | 系统行为 |
| --- | --- | --- |
| 未配置模型或密钥 | 配置未完成，按钮禁用 | 不发请求，不回退 Mock |
| 401/403 | 鉴权失败，请检查开发配置 | 立即停止，日志不含密钥 |
| 429 | 请求过于频繁，请稍后再试 | 按官方限流提示等待或结束 |
| 参数不支持 | 当前模型不支持所选参数 | 保留节点输入，要求修正 |
| 网络中断 | 网络异常，本次等待已停止 | 有上限重试后结束 |
| 官方任务失败 | 展示官方安全化错误信息 | 清理运行态，保留提示词 |
| 总超时 | 页面停止等待，远端任务可能仍运行 | 停止轮询，不伪造取消 |
| 结果 URL 缺失/不安全 | 结果格式异常，无法展示 | 不写内存结果 |
| URL 过期 | 临时结果已失效，请重新生成 | 清除播放器临时源 |

所有错误信息必须经过安全化，不能把鉴权头、Secret、完整官方响应或内部堆栈展示给用户。开发日志也必须对 Access Key、Secret 与令牌做脱敏。

## 9. 测试方案（后续实施时）

### 9.1 单元与契约测试

1. ProviderRegistry 在 `mock` 模式下仍只默认选择演示 Provider；
2. 缺少开发配置时 `kling-live` 为禁用态并给出原因；
3. 通用请求只映射允许的最小字段；
4. 创建任务成功后按 taskId 查询，成功时正确提取首个 HTTPS URL；
5. 401、403、429、5xx、失败状态、超时、Abort 和非法 URL 都有确定结果；
6. 多次点击不会为同一节点产生并发 live 请求；
7. 过期请求不能覆盖同节点较新的结果；
8. 成功后 IndexedDB、Asset Repository、生成历史和 NodeVersion 均未新增记录；
9. 刷新或重建 Store 后临时结果不存在。

所有测试拦截网络并使用固定 fixture，绝不调用真实 API。

### 9.2 Playwright E2E

拦截创建与查询接口，模拟：

1. 选中视频节点并输入提示词；
2. 点击生成；
3. 界面依次显示已提交和生成中；
4. 查询接口返回成功 URL；
5. 当前节点出现播放器且 `src` 等于 fixture URL；
6. 生成历史没有新增项目；
7. 刷新后临时视频消失；
8. Mock 模式原有 E2E 保持全绿。

## 10. 验收标准

- 点击一次生成只创建一个可灵任务；
- 仅使用一个明确配置的可灵模型和文生视频能力；
- 运行状态清晰，不伪造进度；
- 官方成功结果的第一个 URL 在发起节点中直接播放；
- URL 不进入本地或远端持久化，刷新即消失；
- 不接对象存储、数据库和持久化任务队列；
- Mock 模式仍是默认模式，现有本地演示行为不变；
- 开发直连缺少配置时安全失败，不静默降级；
- 公开环境不包含任何 `VITE_KLING_*` 密钥；
- 生产方案明确使用同源服务端代理保管密钥。

## 11. 后续实施顺序（本阶段不执行）

1. 在可灵官方控制台确认已开通的单模型、最新文生视频端点、鉴权和 Schema；
2. 冻结一个最小请求/成功响应/失败响应 fixture；
3. 先写 Provider 合同、无持久化和错误路径失败测试；
4. 实现 `kling-live` Provider 与开发直连配置门；
5. 实现内存态结果回填，绕开项目持久化成功路径；
6. 用拦截网络的 Vitest 与 Playwright 完成全量门禁；
7. 经明确授权后，才使用临时低额度凭证做一次真实开发验证；
8. 生产前另行实现和审计服务端代理，静态站点不得直接携带密钥。

## 12. 官方资料与复核门

实施时只以可灵官方资料和已登录控制台为准：

- [可灵官方 API Reference：Text to Video](https://kling.ai/document-api/apiReference/model/textToVideo)
- [可灵官方 Video 2.6 Text to Video 文档](https://kling.ai/document-api/api/video/2-6/text-to-video)
- [可灵官方 Video 3.0 Omni Text to Video 文档](https://kling.ai/document-api/api/video/3-0-omni/text-to-video)
- [可灵官方 Video 3.0 模型接入说明](https://kling.ai/document-api/3-0/model-access/ai-video-generation)

最后复核日期：2026-08-21。官方 API 可能继续演进，因此本文刻意不冻结未经实时控制台验证的 URL 路径、模型 ID、鉴权签名细节和响应字段。
