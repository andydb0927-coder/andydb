# 火山引擎豆包语音与音频生成 API 核对笔记

日期：2026-08-27
范围：只核对官方公开文档；实现与测试只使用本地 fixture，不发送真实请求。

## 1. 结论

火山引擎当前提供两条可用于画布音频节点的正式接口，并且新版接口都使用 `X-Api-Key` 单头鉴权：

1. 豆包语音合成模型 2.0：`seed-tts-2.0`，适合旁白、对白和有声内容。
2. 豆包音频生成模型 1.0：`seed-audio-1.0`，适合自然语言生成音效、音乐、人声混合音频，也支持参考音频或参考图片。

两条接口属于“豆包语音”产品，官方域名是 `openspeech.bytedance.com`，不是火山方舟文本/图片/视频的 `ark.cn-beijing.volces.com/api/v3`。项目继续复用已有 `VITE_SEEDREAM_API_KEY`；当 `VITE_SEEDREAM_API_BASE` 是 Ark 官方域名时，音频 Provider 会自动切换到官方语音基址；测试或代理传入自定义基址时原样使用。生产环境应通过服务端代理保存 Key，`VITE_` 变量仅用于开发验证。

## 2. TTS：豆包语音合成模型 2.0

官方文档：

- [单向流式语音合成 HTTP](https://www.volcengine.com/docs/6561/2528925?lang=zh)
- [豆包语音合成模型 2.0 音色列表](https://www.volcengine.com/docs/6561/1257544?lang=zh)

### 2.1 端点与鉴权

- `POST https://openspeech.bytedance.com/api/v3/tts/unidirectional`
- `X-Api-Key: <API Key>`
- `X-Api-Resource-Id: seed-tts-2.0`
- `X-Api-Request-Id: <UUID>`
- `Content-Type: application/json`

推荐默认模型/资源 ID：`seed-tts-2.0`。理由：这是官方当前推荐的豆包语音合成 2.0 资源，支持指令遵循、多语种、字幕时间戳以及丰富的 2.0 音色；旧 V1 HTTP 接口不作为新接入目标。`VITE_ARK_TTS_MODEL_ID` 可覆盖资源 ID。

### 2.2 请求体

```json
{
  "req_params": {
    "text": "清晨的古桥被薄雾包围。",
    "speaker": "zh_female_vv_uranus_bigtts",
    "audio_params": {
      "format": "mp3",
      "sample_rate": 24000,
      "speech_rate": 0,
      "loudness_rate": 0
    }
  }
}
```

字段映射：

| 画布字段 | 官方字段 | 规则 |
| --- | --- | --- |
| 文本/提示词 | `req_params.text` | 必填 |
| 音色 | `req_params.speaker` | 使用官方 `voice_type` |
| 语速 | `audio_params.speech_rate` | `-50..100`，分别对应 `0.5x..2.0x` |
| 音量 | `audio_params.loudness_rate` | `-50..100`，分别对应 `0.5x..2.0x` |
| 采样率 | `audio_params.sample_rate` | mp3/wav/pcm 支持 8000、16000、22050、24000、32000、44100、48000；ogg_opus 仅 48000 |
| 输出格式 | `audio_params.format` | `mp3` / `pcm` / `ogg_opus` / `wav` |

画布首批官方音色映射采用音色表中的真实 ID：Vivi 2.0、云舟 2.0、少年梓辛 2.0、解说小明 2.0。

### 2.3 响应

HTTP Chunked 响应的每个 JSON 数据块包含：

- `code` / `message`
- `data`：Base64 音频分片
- `sentence`：可选字幕/时间戳
- `usage.text_words`：计费字符数

Provider 将所有 Base64 分片按字节拼接为持久化 `data:audio/...;base64` URL，避免把临时 Blob URL 写入项目。

## 3. 音效/音乐：豆包音频生成模型 1.0

官方文档：[音频生成 HTTP](https://www.volcengine.com/docs/6561/2550782?lang=zh)

### 3.1 端点与鉴权

- `POST https://openspeech.bytedance.com/api/v3/tts/create`
- `X-Api-Key: <API Key>`
- `X-Api-Request-Id: <UUID>`（建议）
- 默认模型：`seed-audio-1.0`
- `VITE_ARK_AUDIO_MODEL_ID` 可覆盖模型 ID。

推荐 `seed-audio-1.0` 的理由：官方当前公开的通用音频生成模型，覆盖音效、音乐、配音与混合场景，支持纯文本、参考音频、参考图片，单次最长 120 秒。

### 3.2 请求体

```json
{
  "model": "seed-audio-1.0",
  "text_prompt": "生成约 12 秒的雨夜石板路环境音，远处有低沉钟声。",
  "audio_config": {
    "format": "mp3",
    "sample_rate": 44100,
    "speech_rate": 0,
    "loudness_rate": 50,
    "pitch_rate": 0,
    "enable_subtitle": false
  },
  "watermark": {}
}
```

官方没有独立的 `duration` 数字字段；时长通过 `text_prompt` 自然语言控制，因此画布的时长选择会以“生成约 N 秒音频”写入提示词。音频生成还支持 `references`，本批次保留接口映射能力，但 UI 先完成纯文本闭环。

### 3.3 响应

- `audio`：Base64 音频
- `url`：有效期 2 小时的临时音频 URL
- `duration`：后处理后时长
- `original_duration`：原始时长，也是计费依据
- `subtitle`：开启字幕时返回

Provider 优先把 `audio` 转为可持久化 Data URL；只有响应缺少 Base64 时才使用经过 HTTPS 校验的临时 URL。

## 4. 计费

官方计费页：[豆包语音计费说明](https://www.volcengine.com/docs/6561/1359370?lang=zh)

按调用后付费的公开价格（2026-08-20 文档版本）：

- 豆包语音合成模型 2.0：3 元 / 万字符。
- 豆包音频生成模型 1.0：1 元 / 分钟，按 `original_duration` 精确到毫秒计费；变速不改变计费时长。

项目内部仍以演示积分展示确认成本，同时在 Provider `usage.estimatedCostCny` 保存官方口径的人民币估算，账单以服务端最终计量为准。

## 5. 开发配置与安全

```dotenv
VITE_GENERATION_MODE=seedream-direct-dev
VITE_SEEDREAM_API_KEY=仅用于本地开发验证的豆包语音新版APIKey
VITE_SEEDREAM_API_BASE=https://ark.cn-beijing.volces.com/api/v3
VITE_ARK_TTS_MODEL_ID=seed-tts-2.0
VITE_ARK_AUDIO_MODEL_ID=seed-audio-1.0
```

- 默认 Mock 模式不访问网络。
- 缺 Key 时两个 Provider 均禁用并展示明确原因，不静默降级到 Mock。
- 浏览器直连仅适合本地验证；生产必须由服务端代理注入 Key，避免凭据进入前端构建产物。
- 本任务所有自动化测试使用固定 fixture 拦截，不调用真实 API、不产生费用。
