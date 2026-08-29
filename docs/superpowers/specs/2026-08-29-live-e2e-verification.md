# 火山方舟真实端到端修复验证记录

- 修复复验时间：2026-08-29 15:21:56–15:22:20（Asia/Shanghai）
- 运行模式：`seedream-direct-dev`
- API Base：`https://ark.cn-beijing.volces.com/api/v3`
- 密钥来源：`app/.env.local`（仅确认已读取；未输出、未复制、未写入本文）
- 总预算：¥15.00；累计费用达到 ¥14.00 时停止发起新请求
- 执行纪律：每项调用前打印预估；每项只执行一次；失败不重试；依赖失败时不发后续依赖请求

## 1. 查证结论与代码修正

### 1.1 Seedream 400

官方图片生成接口仍为 `POST /api/v3/images/generations`，使用 Ark Bearer API Key；模型字段可填写模型 ID 或推理接入点 ID：

- [火山方舟图片生成 API 文档](https://api.volcengine.com/api-docs/view?action=ImageGenerations&serviceCode=ark&version=2024-01-01)
- [火山引擎开发者社区：Seedream 5.0 Pro 当前模型](https://developer.volcengine.com/articles/7670063057116889098)

项目在 2026-08-26 的[历史实测](./2026-08-26-seedream-live-test-report.md)中使用 `doubao-seedream-5-0-260128` 成功生成过图片；但该 ID 已不能代表当前 Seedream 5.0 Pro。当前 Pro 精确模型 ID 为：

```text
doubao-seedream-5-0-pro-260628
```

修正内容：

1. `seedream-live-provider` 默认模型改为 `doubao-seedream-5-0-pro-260628`。
2. 为兼容用户现有 `.env.local`，如果仍配置历史 ID `doubao-seedream-5-0-260128`，Provider 在内存中迁移为当前 Pro ID；不修改用户环境文件。
3. 请求端点和已验证合法的 1K `1424x800` 尺寸保持不变。
4. Fixture、合同测试和部署示例同步到当前 Pro ID。

修正后的真实请求成功，确认本次 400 根因是过期/不匹配的模型 ID，而不是提示词或尺寸。

### 1.2 TTS 401

豆包语音合成 2.0 使用独立 Speech/OpenSpeech 产品域名和资源授权，不是 Ark 图片/视频/文本 API：

- [豆包语音合成 2.0 接口概述](https://www.volcengine.com/docs/6561/2228192?lang=zh)
- [豆包语音合成 2.0 音色与资源说明](https://www.volcengine.com/docs/6561/1257544?lang=zh)
- [豆包语音计费说明](https://www.volcengine.com/docs/6561/1359370?lang=zh)

首次验证把 Ark Key 直接提交给 `openspeech.bytedance.com`，服务返回 401，证明当前 Ark Key 不能直接授权 Speech TTS。修正内容：

1. `ark-tts-provider` 不再读取或复用 `VITE_SEEDREAM_API_KEY`。
2. 只读取专用的 `VITE_ARK_TTS_API_KEY`；缺少时禁用并显示“豆包语音合成待专用资源授权：请配置 Speech API Key”。
3. 本次复验在配置门处停止，未向 TTS 发请求、未伪装成功、未回退 Mock。

## 2. 修复复验汇总

| 步骤 | 调用前预估 | 状态 | 实际费用估算 | 耗时 | 结论 |
| --- | ---: | --- | ---: | ---: | --- |
| 1. Seedream 图片 | ¥0.30 | 成功 | ¥0.300000 | 18.578 秒 | 返回 PNG，1424×800，与请求/UI 摘要一致 |
| 2. Seedance 视频 | ¥4.97 | 失败 | ¥0.000000 | 0.119 秒 | 创建任务返回 HTTP 404；未重试 |
| 3. 豆包 TTS | ¥0.0144 | 配置门跳过 | ¥0.000000 | 0 秒 | 缺专用 Speech API Key，未发请求 |
| 4. 豆包 LLM 图生文 | ¥0.10（保守） | 成功 | ¥0.011184 | 4.530 秒 | 返回有效中文图片描述 |

累计实际费用估算：**¥0.311184**。没有触发 ¥14.00 停止线。

## 3. 步骤 1：Seedream 图片

### 请求摘要

```json
{
  "endpoint": "POST /images/generations",
  "model": "doubao-seedream-5-0-pro-260628",
  "prompt": "古风女子持团扇立于月洞门前，青白瓷色调，侧逆光",
  "size": "1424x800",
  "response_format": "url",
  "output_format": "png",
  "watermark": false,
  "count": 1
}
```

### 实际结果

- 状态：成功
- 端到端耗时：18.578 秒
- 实际图片尺寸：**1424×800**
- Provider 返回尺寸：1424×800
- MIME：`image/png`
- URL：返回了带 24 小时有效期的火山对象存储签名 URL；为避免把临时签名写入仓库，本文不记录完整查询串
- 参数一致性：真实输出尺寸与请求和 UI 摘要一致
- 费用估算：¥0.30

## 4. 步骤 2：Seedance 视频

### 请求摘要

```json
{
  "endpoint": "POST /contents/generations/tasks",
  "model": "doubao-seedance-2-0-260128",
  "first_frame": "步骤1返回的临时图片URL",
  "duration": 5,
  "ratio": "16:9",
  "resolution": "720p",
  "generate_audio": false,
  "watermark": false
}
```

### 实际结果

- 状态：失败
- 耗时：0.119 秒
- 中文原因：`火山方舟 Seedance 请求失败（404）`
- 创建任务 ID：无
- 轮询：未开始
- 实际分辨率/时长：无
- 费用：¥0.00（未创建任务）
- 重试：**未重试**

本次新发现的 404 与 Seedream/TTS 两项修复无关。响应未提供可区分“模型未开通、模型 ID 失效或账号路由不可用”的结构化细节，因此不能在没有新授权的情况下通过改 ID 试错。该项保留为后续单独查证事项。

## 5. 步骤 3：豆包 TTS

### 计划摘要

```json
{
  "endpoint": "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
  "resource_id": "seed-tts-2.0",
  "characters": 48,
  "estimated_cost_cny": 0.0144
}
```

### 实际结果

- 状态：配置门跳过
- 原因：`豆包语音合成待专用资源授权：请配置 Speech API Key`
- 真实网络请求：**0 个**
- 费用：¥0.00
- 降级行为：没有静默回退 Mock；模型在 UI 中保持禁用并显示原因

## 6. 步骤 4：豆包 LLM 图生文

### 请求摘要

```json
{
  "endpoint": "POST /chat/completions",
  "model": "doubao-seed-2-1-pro-260628",
  "image_url": "步骤1返回的临时图片URL",
  "max_tokens": 500,
  "temperature": 0.2,
  "thinking": "disabled",
  "stream": false
}
```

### 实际结果

- 状态：成功
- 耗时：4.530 秒
- 输入 token：1379
- 输出 token：97
- 总 token：1476
- 输入费用：1379 × ¥6 / 1,000,000 = ¥0.008274
- 输出费用：97 × ¥30 / 1,000,000 = ¥0.002910
- 合计：**¥0.011184**

模型输出：

> 这张图以中式园林圆洞门为框，采用框景构图。主体是一位年轻女子，梳古风发髻，簪淡绿花饰，着淡青薄纱汉服，双手持素面团扇，侧脸望向左方，神态沉静。背景是白墙黛瓦的江南园林，有曲枝绿树、置石灌丛。整体色调清柔冷绿，自然光柔和，逆光给发丝镶上亮边，氛围清雅静谧。

## 7. 预算与请求审计

1. 每一步都在调用或配置检查前打印预估费用。
2. 修复复验发出 3 个真实请求：Seedream 1 个、Seedance 创建任务 1 个、图生文 1 个；TTS 为 0 个。
3. 所有失败项均只发生一次，没有自动重试或参数试探。
4. 累计实际费用估算 ¥0.311184；失败请求是否产生极小请求费用，以火山控制台最终账单为准。
5. 全程未打印或提交 API Key；临时签名媒体 URL 未写入仓库。

## 8. 当前结论

- Seedream：**已修复并真实验证通过**。
- 豆包图生文：**真实验证通过**。
- 豆包 TTS：**待专用 Speech 资源授权**；当前禁用提示准确，无假成功。
- Seedance：创建任务 404，**本轮如实失败且未重试**；需独立查证当前账号可用的精确模型/接入点后再安排一次获批验证。
