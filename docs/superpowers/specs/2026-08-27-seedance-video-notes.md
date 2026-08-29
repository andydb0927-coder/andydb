# 火山方舟 Seedance 2.0 视频生成 API 接入笔记

日期：2026-08-27
用途：无线画布视频节点的首个火山方舟真实视频生成闭环。本文只固化官方接口契约；自动化测试必须拦截网络，不能调用真实 API。

## 1. 官方资料

- [视频生成 API 总览](https://www.volcengine.com/docs/82379/1520758)
- [创建视频生成任务](https://www.volcengine.com/docs/82379/1520757)
- [查询视频生成任务](https://www.volcengine.com/docs/82379/1521309)
- [查询视频生成任务列表](https://www.volcengine.com/docs/82379/1521675)
- [视频生成模型计费说明](https://www.volcengine.com/docs/82379/1544106)

## 2. 模型选择与账号开通边界（2026-08-29 复核）

官方模型广场当前仍将 Doubao-Seedance-2.0 的体验页指向 `doubao-seedance-2-0-260128`，因此没有证据支持把它机械替换为不存在的 `doubao-seedance-2-0-260628`。但体验页 ID 不等于当前账号已获得视频生成 API 权限。官方模型广场只对 Doubao-Seedance-2.5 标注“API 正式上线/全面开放”，其当前体验 ID 为 `doubao-seedance-2-5-260628`；本项目没有获得把 2.0 产品自动升级为 2.5 的授权，因此不擅自切换模型。

项目不再内置 Seedance 2.0 默认 Model ID。只有在账号的“开通管理/模型列表”确认可调用后，才把对应 Model ID 或 Endpoint ID 写入 `VITE_ARK_VIDEO_MODEL_ID`。未配置时 Provider 明确显示“待开通”，不会使用公共体验 ID 发起试错请求。

- [火山方舟模型广场](https://console.volcengine.com/ark/region:cn-beijing/model?view=DEFAULT_VIEW&groupType=ModelGroups)
- [Seedance 2.0 官方体验页（当前公开体验 ID）](https://console.volcengine.com/ark/region:cn-beijing/experience/gen_video?model=doubao-seedance-2-0-260128)
- [视频生成 API Explorer](https://api.volcengine.com/api-explorer/?action=CreateContentsGenerationsTasks&groupName=%E8%A7%86%E9%A2%91%E7%94%9F%E6%88%90API&serviceCode=ark&version=2024-01-01)

## 3. 创建任务

请求：

```http
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
Authorization: Bearer ${VITE_SEEDREAM_API_KEY}
Content-Type: application/json
```

最小请求体：

```json
{
  "model": "<账号已开通的 Seedance Model ID 或 Endpoint ID>",
  "content": [
    { "type": "text", "text": "清晨薄雾中的古桥，镜头缓慢向前推进" }
  ],
  "duration": 5,
  "ratio": "16:9",
  "resolution": "720p",
  "generate_audio": true,
  "watermark": false
}
```

首帧图通过 `content` 追加：

```json
{
  "type": "image_url",
  "image_url": { "url": "https://example.invalid/first-frame.png" },
  "role": "first_frame"
}
```

关键字段：

| 字段 | Seedance 2.0 约束 | 画布映射 |
| --- | --- | --- |
| `prompt` | 放在 `content[].type=text` 的 `text` 中 | 视频节点提示词 |
| 首帧图 | `content[].type=image_url`，`role=first_frame` | 图生视频的第一个图片引用 |
| `duration` | 整数 4–15 秒；官方也支持 `-1` 智能时长 | UI 使用明确的整数秒选项 |
| `ratio` | `16:9`、`4:3`、`1:1`、`3:4`、`9:16`、`21:9`、`adaptive` | “自适应”映射为 `adaptive` |
| `resolution` | `480p`、`720p`、`1080p`、`4k` | 视频清晰度选择器 |
| `generate_audio` | 布尔值，2.0 支持原生音画同步 | 声音开关 |
| `watermark` | 布尔值，默认关闭 | 当前阶段固定 `false` |

创建成功返回任务 ID：

```json
{ "id": "cgt-20260827-example" }
```

## 4. 查询与状态机

请求：

```http
GET https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{taskId}
Authorization: Bearer ${VITE_SEEDREAM_API_KEY}
```

实现按以下状态机处理：

```text
queued / pending / running
  ├─ succeeded  -> 读取 content.video_url，回填节点、项目资产和生成历史
  ├─ failed     -> 显示安全化中文错误
  └─ cancelled  -> 显示任务已取消
```

成功响应中的主要字段为 `status`、`content.video_url`、`duration`、`ratio`、`resolution`、`generate_audio` 和 `usage.completion_tokens`。官方结果 URL 有效期为 24 小时，因此成功后必须立即写入项目持久化链路；本阶段仍保存官方返回 URL，不新增对象存储。

轮询必须传递 `AbortSignal`。用户取消、组件卸载或超时后要立即停止等待与后续请求。

## 5. 计费口径

官方按成功任务的输出 token 计费，失败任务不计费。估算公式：

```text
(输入视频秒数 + 输出视频秒数) × 输出宽 × 输出高 × FPS / 1024
```

Seedance 2.0 无输入视频时的公开单价：

| 输出档位 | 元 / 百万输出 token |
| --- | ---: |
| 480p / 720p | 46 |
| 1080p | 51 |
| 4K | 26 |

带输入视频时分别为 28、31、16 元 / 百万输出 token。官方示例中，无输入视频、16:9、5 秒约为：480p 2.31 元、720p 4.97 元、1080p 12.39 元、4K 25.27 元。产品内“预计积分”仍由 Provider manifest 给出稳定演示值；真实账单核对以响应 `usage.completion_tokens` 和火山控制台为准。

## 6. 配置与安全边界

```dotenv
VITE_GENERATION_MODE=seedream-direct-dev
VITE_SEEDREAM_API_KEY=<仅本地开发验证使用>
VITE_SEEDREAM_API_BASE=https://ark.cn-beijing.volces.com/api/v3
VITE_ARK_VIDEO_MODEL_ID=<开通管理中账号可调用的 Seedance Model ID 或 Endpoint ID>
```

- 视频与图片复用火山方舟平台级 Key 和 API base。
- 缺少 Key 或账号可调用的 Model/Endpoint ID 时 Provider 保持禁用并显示明确原因，绝不静默回退 Mock，也不使用公共体验 ID 猜测调用。
- `VITE_` 变量会进入前端产物，只允许本地受控验证；生产部署必须改为服务端代理并由服务端注入 Key。
- 测试使用固定 fixture 与 `fetch` 拦截，不读取真实密钥、不产生真实费用。
