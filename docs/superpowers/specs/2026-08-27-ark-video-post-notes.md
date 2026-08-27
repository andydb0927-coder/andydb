# 火山方舟视频后处理：Seedance 能力核对与接入方案

核对日期：2026-08-27。仅阅读官方文档；实现与验收使用网络 fixture，不发起真实生成、不读取或修改本地 Key。

## 1. 官方依据与能力边界

- [创建视频生成任务](https://www.volcengine.com/docs/82379/1520757?lang=zh)：页面更新于 2026-08-21，已展开“模型能力”“视频信息”“音频信息”“duration”“omni_reference_task_type”，并查看“编辑视频”“延长视频”示例。
- [查询视频生成任务](https://www.volcengine.com/docs/82379/1521309?lang=zh)：任务状态、结果与用量。
- [官方模型定价](https://www.volcengine.com/docs/82379/1544106?lang=zh)：Seedance 2.0 含视频输入价格与最低 token 用量规则。
- [Seedance 2.0 官方介绍](https://developer.volcengine.com/articles/7606009619928449070)：说明参考视频编辑及延长能力；接口实现以当前 API 参考为准，不以宣传描述推导未定义字段。
- [视频点播字幕擦除说明](https://www.volcengine.com/docs/4/1555155?lang=en)：属于另一产品，并非本次 Ark/Seedance 同 Key 接口，不擅自接入。

| 用户功能 | 官方实测文档结论 | 本批实施 |
| --- | --- | --- |
| 智能续写 | Seedance 2.0 全模态参考支持视频延长。用文本描述续拍内容，输入视频的 `role=reference_video`。不是把视频塞进 `first_frame` 字段 | 接通真实 Provider；提交前展示源片、目标输出时长、声音、清晰度与成本，用户确认后才入队 |
| 尾帧续作 | 图片 `role=first_frame` 可用于图生视频；提取尾帧后再生成只是另一条流程，不等于输入完整视频续写 | 保留现有真实截尾帧及图生视频，不自动替代整段视频续写 |
| 片段重拍（指定时间区间） | 支持提示词驱动的视频编辑，但未提供 `start/end`、时间区间或区域锁定参数，不能保证区间外原片逐帧不变 | **官方不支持本任务要求的精确时间区间重拍契约，占位保持**；不把整段重生成伪装为局部重拍 |
| 字幕擦除（视频局部修复） | 当前 Seedance 端点无字幕检测/擦除、时序 mask、字幕区域参数。泛化的编辑提示词不构成专用字幕修复契约 | **官方不支持该专用契约，占位保持**；不接其他视频点播/视觉服务 |

这里的“不支持”限定为本次核对的 **Ark Seedance 2.0 API 契约**，不表示火山旗下所有产品均无此能力。

## 2. 版本区别与请求映射

保持现有 `doubao-seedance-2-0-260128`，不擅自升级 2.5。当前文档示例已更新为 2.5，但“模型能力”仍明确列出 2.0 的编辑/延长支持。`omni_reference_task_type=reference/edit/extend` 是 **2.5 专属**；本批 2.0 不传该字段，只使用提示词与参考视频。

```http
POST {VITE_SEEDREAM_API_BASE}/contents/generations/tasks
Authorization: Bearer <VITE_SEEDREAM_API_KEY>
Content-Type: application/json
```

```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "延长@视频1，从视频结尾继续：镜头缓缓推向古桥。保持主体、场景与运动衔接。" },
    { "type": "video_url", "video_url": { "url": "https://media.fixture.invalid/source.mp4" }, "role": "reference_video" }
  ],
  "duration": 5,
  "ratio": "adaptive",
  "resolution": "720p",
  "generate_audio": true,
  "watermark": false
}
```

`duration` 表示请求的**生成视频时长**，不是本地合成后的总长；返回的 `duration` 才是实际结果时长。新结果原样显示并新增版本；不保证 API 返回仅新增尾段，不自动裁切、拼接或覆盖原版本。

| content 类型 | 字段 / role | 限制 |
| --- | --- | --- |
| 提示词 | `type=text, text` | 续写意图在提示词中表达；不虚构 `extend/start/end/mask` 参数 |
| 视频 | `type=video_url, video_url.url, role=reference_video` | 官方接受公网 URL 或 `asset://` 素材 ID；未声明视频 Base64。本批仅接受 HTTPS 源视频，不暗中上传本地素材 |
| 音频 | `type=audio_url, audio_url.url, role=reference_audio` | 官方支持公网 URL / Base64 / 素材 ID；2.0 不可仅音频输入，需搭配视频或图片。本批续写只传一段源视频，声音开关控制生成音频，不额外上传音轨 |
| 图片 | `type=image_url`；`first_frame/last_frame/reference_image` | 首帧、首尾帧、全模态参考是互斥场景，不把 `first_frame` 与 `reference_video` 混用 |

Seedance 2.0 视频参考约束：单个 2–15 秒，最多 3 个且合计不超过 15 秒；MP4/MOV，单个 ≤200MB；FPS 24–60；宽高比 0.4–2.5；边长 300–6000；像素总数 407696–8295044。本批限定一段视频，优先使用现有结果 URL，校验时长/URL/MIME 和已知尺寸；编码、帧率、体积及可访问性由官方最终校验，界面明确提示。人物素材还需满足官方肖像授权规则。

输出参数：2.0 时长 4–15 秒整数（官方也支持 -1，本批界面不开放智能时长）；480p/720p/1080p/4k；比例自适应源视频；声音开关。若覆盖成其他型号，本批续写禁用并说明尚未核对其契约，不沿用 2.0 参数/单价冒充兼容。

## 3. 状态、错误、保存与取消

复用现有 Seedance 创建/轮询，不重新实现网络协议：`POST → id → GET /contents/generations/tasks/{id}`。`queued/running` 显示进度；`succeeded` 读取 HTTPS `content.video_url`；`failed/cancelled/expired` 显示安全中文错误。401/403/429、无效 JSON/URL、网络错误与等待超时都有测试，不回显 Key、原始响应或用户素材 URL。

- 续写 Provider 仅由结果工具入口调用，不混入普通模型选择器。
- 打开、编辑、取消草稿不产生请求；确认时检查项目、源版本和进行中任务，避免双击重复提交。
- 成功沿现有队列写节点版本、项目资产与生成历史；失败保留原视频。刷新后可见，重试使用任务保存的原始参数与源引用。
- 结果是 URL 引用持久化，不是视频二进制永久备份；官方结果 URL 有有效期，应及时下载。
- AbortSignal 贯穿创建与轮询；本地取消/超时停止请求与回填，不宣称已取消远程任务或免除费用。不要自动重发可能收费的 POST；不明结果先核查控制台。

## 4. 单价与费用提示

Seedance 2.0 在线推理，**输入包含视频**：

| 输出档位 | 元 / 百万输出 token |
| --- | ---: |
| 480p / 720p | 28 |
| 1080p | 31 |
| 4K | 16 |

按成功任务计费；失败任务不收费。估算 token =（输入视频时长 + 输出视频时长）× 输出宽 × 输出高 × FPS ÷ 1024，含输入视频还受最低 token 用量限制，不能仅按公式声称精确总价。界面展示档位单价及此说明；完成后以 `usage.completion_tokens × 单价 / 1000000` 记录人民币估算。

官方表中 16:9、720p、输出 5 秒、输入 2–15 秒的示例约 **¥5.44–12.10/条**。本地 manifest 的 **135 积分/次** 是产品额度，不是人民币兑换比例，也不是官方固定每次价格。具体账单以火山控制台为准。

## 5. TDD 与操作卡

1. 先冻结创建/queued/running/成功/失败/过期/非法 URL 的 fixture；红测覆盖角色映射、成本、取消、持久化、禁用门与重复提交。
2. 新增 `ark-video-continue-provider.ts`，复用 Seedance 传输；修正公共传输的 video/audio role 和含视频输入单价。
3. 视频结果工具条“智能续写”打开独立草稿确认层。重拍/字幕擦除保留禁用与原因，现有剪辑/裁剪/音视频分离不变。
4. fixture E2E：取消不请求 → 确认 → 查看状态和结果 → 刷新/历史；失败保留原片 → 原契约重试；窄视口可达。
5. 门禁：`npm run typecheck` → `npm run test:run` → `npm run build:mock` → `PLAYWRIGHT_OFFLINE_DIST=dist npx playwright test`。

本地受控验证配置（本批不写入）：

```dotenv
VITE_GENERATION_MODE=seedream-direct-dev
VITE_SEEDREAM_API_KEY=<已有火山方舟Key>
VITE_SEEDREAM_API_BASE=https://ark.cn-beijing.volces.com/api/v3
VITE_ARK_VIDEO_MODEL_ID=doubao-seedance-2-0-260128
```

打开带 HTTPS 视频结果的节点 → 智能续写 → 填写后续动作 → 选择输出时长/清晰度/声音 → 阅读费用 → 确认续写并生成。Key 或模式未配置时禁用；线上 mock 构建不启用。`VITE_` 会进入前端产物，仅供本地开发验证，生产必须走服务端代理。本批只运行 fixture，零真实生成、零费用。

## 6. 本批验收记录

2026-08-27 按顺序完成：

| 门禁 | 结果 |
| --- | --- |
| typecheck | 通过 |
| Vitest | 141 文件、1215/1215 通过（原基线 1169，新增 46 项） |
| build:mock | 通过；显式关闭 live 模式并清空构建用的 Seedream Key |
| Playwright | 71/71 通过（原基线 69，新增续写 2 项）；失败 0、跳过 0、flaky 0；约 123 秒 |
| git diff --check | 通过 |

新增 E2E 验证：取消草稿零 POST；确认后使用 `reference_video`，不传虚构区间/mask 字段；保留原视频版本；新结果、用量、历史刷新后恢复；401 不泄露原始错误；721×778 下确认按钮可达；刷新后以原续写参数/源视频重试。单测还覆盖创建/轮询错误、过期/超时、AbortSignal、配置禁用、尺寸/时长/格式校验、人民币档位与 IndexedDB 资产入库。

浏览器视频夹具 `app/e2e/fixtures/video-continue-source.mp4` 为本地合成的 5 秒纯色视频（1280×720、24fps、无人物），符合续写输入尺寸与帧率限制。所有生成请求被 fixture 拦截，未使用真实 Key，未调用付费 API，也未声称经过真实生成效果验收。

非阻断日志：既有本地 3000 端口探测失败、React Router `/projects/new` hydration 提示及大于 500KB 的构建分块警告仍存在；不属于本批新增测试失败。
