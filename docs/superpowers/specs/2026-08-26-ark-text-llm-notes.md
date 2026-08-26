# 火山方舟文本 LLM 接入核对笔记

日期：2026-08-26
范围：无线画布文本节点、脚本节点的开发直连验证；不在测试中调用真实 API。

## 1. 官方资料

- [火山方舟文档中心](https://www.volcengine.com/docs/82379)
- [对话（Chat）API](https://www.volcengine.com/docs/82379/1494384)
- [Base URL 及鉴权](https://www.volcengine.com/docs/82379/1298459)
- [模型列表](https://www.volcengine.com/docs/82379/1330310)
- [深度思考](https://www.volcengine.com/docs/82379/1449737)
- [模型价格](https://www.volcengine.com/docs/82379/1544106)

以上页面于 2026-08-26 使用登录态浏览器逐项核对。Chat API 页面最近更新时间显示为 2026-08-20，模型列表显示为 2026-08-24。

## 2. 接口契约

### 2.1 端点与鉴权

- Base URL：`https://ark.cn-beijing.volces.com/api/v3`
- Chat Completions：`POST /chat/completions`
- 完整地址：`https://ark.cn-beijing.volces.com/api/v3/chat/completions`
- 请求头：`Authorization: Bearer <ARK_API_KEY>`、`Content-Type: application/json`

本项目复用方舟平台级 `VITE_SEEDREAM_API_KEY` 与 `VITE_SEEDREAM_API_BASE`。前端直连仅用于本地开发验证，生产部署必须改为服务端代理，避免浏览器暴露 Key。

### 2.2 推荐模型

默认选择 `doubao-seed-2-1-pro-260628`。

理由：官方最新模型列表将其列为推荐的文本生成与深度思考通用模型，支持文本生成、多模态理解、工具调用、结构化输出，256K 上下文；Seed 1.6 系列在当前目录中已标记“即将下线”，不适合作为新接入默认值。创作文本与剧本生成优先稳定效果，因此选择 Pro，而非更偏吞吐和成本的 Turbo。

可通过 `VITE_ARK_TEXT_MODEL_ID` 覆盖默认模型 ID。

### 2.3 非流式请求与响应

最小请求：

```json
{
  "model": "doubao-seed-2-1-pro-260628",
  "messages": [
    { "role": "system", "content": "你是影视创作助手。" },
    { "role": "user", "content": "写一段雨夜重逢的场景。" }
  ],
  "stream": false,
  "max_tokens": 1200,
  "temperature": 0.7,
  "thinking": { "type": "disabled" }
}
```

正文位于 `choices[0].message.content`；用量位于 `usage.prompt_tokens`、`usage.completion_tokens`、`usage.total_tokens`。

### 2.4 SSE 流式请求与响应

请求体设置 `stream: true`。响应为 `text/event-stream`，每个 `data:` 事件携带 `chat.completion.chunk`：正文增量位于 `choices[0].delta.content`；结束事件包含 `finish_reason: "stop"`，最后为 `data: [DONE]`。

本项目 Provider 同时支持两种模式：默认非流式；请求参数 `stream=true` 时读取 SSE、逐块拼接正文，并在读流过程中报告进度。两种模式共享相同的安全错误映射与结果持久化契约。

## 3. 生成参数

- `max_tokens`：最大回答长度，官方 Chat API 默认 4096；项目默认 1200，允许 1–4096。
- `temperature`：采样温度，官方默认 1.0；项目创作默认 0.7，允许 0–2。
- `thinking.type`：`enabled` 强制开启、`disabled` 强制关闭、`auto` 由模型判断。当前默认模型 `doubao-seed-2-1-pro-260628` 官方支持 `enabled` 与 `disabled`，不支持 `auto`，项目默认 `disabled` 以降低首次验证延迟和费用。
- `reasoning_effort`：`none|minimal|low|medium|high|xhigh|max`。默认模型官方默认 `high`；传入 `minimal` 可关闭思考，`xhigh/max` 会映射为 `high`。本次最小闭环不在 UI 暴露该字段，避免与 `thinking.type` 形成重复控制。

## 4. 计费口径

官方模型价格页给出的 `doubao-seed-2.1-pro` 在线推理常规价：

- 非音频输入：6 元 / 百万 token
- 缓存命中：1.2 元 / 百万 token
- 输出：30 元 / 百万 token
- 缓存存储：0.017 元 / 百万 token / 小时

按 token 后付费。未使用缓存时，本功能的估算公式为：

`费用 = 输入 token × 6 / 1,000,000 + 输出 token × 30 / 1,000,000`

示例：约 500 输入 token + 1,000 输出 token，费用约 `0.003 + 0.03 = 0.033 元`。实际账单以火山方舟控制台为准。产品 UI 继续沿用本地“积分”预算语义，Provider 同时声明官方 token 单价，不能将积分显示误称为方舟现金账单。

## 5. 配置门与安全边界

- 显式启用：`VITE_GENERATION_MODE=ark-text-dev`
- 兼容现有方舟开发模式：`VITE_GENERATION_MODE=seedream-direct-dev` 时也启用
- 必填：`VITE_SEEDREAM_API_KEY`
- Base URL：`VITE_SEEDREAM_API_BASE`，缺省为 `https://ark.cn-beijing.volces.com/api/v3`
- 模型覆盖：`VITE_ARK_TEXT_MODEL_ID`
- 缺配置时显示“火山方舟文本开发验证配置未完成”，绝不静默回退 Mock
- Mock 仍为默认模型；测试一律注入 `fetchFn` 或使用 Playwright 路由拦截，不调用真实 API

## 6. 内部结果契约

- 文本 Provider 返回 `text/plain` 项目资产、节点版本中的 `textContent`、模型身份及 token 用量。
- 生成队列写入项目 `jobs`，成功后写节点版本、项目资产、生成历史；刷新后可恢复。
- 文本节点把 `textContent` 回填到 `details.content`。
- 脚本节点优先解析约定 JSON（`chapters[{title,summary}]`），解析失败时按段落生成可编辑章节，避免丢失模型正文。
