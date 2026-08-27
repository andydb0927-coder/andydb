# 音频后处理批次 3：Ark 能力边界与实施记录

核对日期：2026-08-27。范围：现有 `VITE_SEEDREAM_API_KEY / VITE_SEEDREAM_API_BASE` 的火山方舟（Ark）接入；仅浏览官方文档、fixture 测试，不发送真实处理请求，不查看或修改密钥。

## 1. 结论

| 能力 | 现有 Ark API / 模型支持情况 | 火山其他产品的真实能力 | 本批处理 |
| --- | --- | --- | --- |
| 人声 / 背景音源分离 | 在已查 Ark 模型、API 目录中未找到对应公开端点或模型 | AI MediaKit 有异步分离 API，输出独立音轨；不是 Ark `/api/v3` 协议 | **不支持，占位保持（限当前 Ark 接入范围）**；补齐音频节点禁用入口与具体原因 |
| 音频智能断句切分 | 未找到将现有音频按语义切成独立音频文件的 Ark API | 豆包语音 ASR 可返回语义分句文字及时间戳，但不输出裁切音频文件 | **不支持，占位保持（限当前 Ark 接入范围）**；保留本地手动截取 / 变速 |

“不支持”不是说整个火山引擎没有能力，也不是说现有 Key 必然无效。MediaKit 支持专用 Key 和具备权限的 IAM 通用 Key，豆包语音有自己的鉴权与资源 ID；不能仅凭 `VITE_SEEDREAM_API_KEY` 变量名推断其跨产品权限。本批未验证 Key 类型、未开通新服务、未将 Key 自动转发到新域名。

现有 TTS 与音频生成是**合成新音频**，不能充当源分离或语义切分。其既有实现与配置本批不变。Ark 范围核对依据：[Ark 文档/API 目录](https://www.volcengine.com/docs/82379)、[Ark 模型列表](https://www.volcengine.com/docs/82379/1330310?lang=zh)。这是对已公开文档的能力边界判断，不是厂商对所有未来能力的否定承诺。

## 2. 人声 / 背景音分离：独立 MediaKit 服务，不冒充 Ark Provider

来源：[提交人声背景音分离任务 API](https://www.volcengine.com/docs/6448/2386113?lang=zh)、[分离开发指南](https://www.volcengine.com/docs/6448/2606673)、[鉴权与任务基础概念](https://www.volcengine.com/docs/6448/2300661?lang=zh)、[任务查询 API](https://www.volcengine.com/docs/6448/2278532?lang=zh)。

- 创建：`POST https://mediakit.cn-beijing.volces.com/api/v1/tools/separate-voice`，`Authorization: Bearer <MediaKit 专用或已授权 IAM 通用 Key>`。
- 核心请求字段：`audio_url` 或 `video_url`；`scene` 默认 `Audio`，可选 `Music / Drama / Narrate`；`output_format` 默认 `aac`，可选 `mp3 / wav / m4a / flac`。不是 Ark 的 `model + content[]`。
- 接收响应包含 `success / task_id / request_id`，失败有 `error`；按任务 ID 查询 `GET /api/v1/tasks/{task_id}`，完成状态 `completed`，失败状态 `failed`。
- `Audio / Music` 结果：`voice_audio_url / background_audio_url` 两轨；`Drama / Narrate`：`voice_audio_url / music_audio_url / sfx_audio_url` 三轨；另有输入 `duration`。
- 默认 URL 24 小时有效；若将来接入，必须下载各轨为本地持久化资产，不能只把临时 URL 当永久文件。`media_output_destination` 可指定 VOD/TOS，但需额外授权，不在本批范围。
- 输入可以是公网 URL 或 MediaKit/VOD/TOS 资源；浏览器 `blob:` 地址不能直接作为远端可下载文件。输出下载、CORS、上传和权限均需后续验证。
- 服务不要求在上述请求中指定一个 Ark 音频分离模型 ID，本批不伪造 ID。

计费：[AI MediaKit 音频工具计费](https://www.volcengine.com/docs/6448/2486469?lang=zh)公布源分离 **0.07 元 / 输入分钟**，10 分钟示例为 0.70 元。这是独立服务参考价，不是本项目已接入单价；不将其转换成虚构 Ark 积分。

## 3. 智能断句：ASR 时间戳不等于已裁切音频

来源：[豆包语音识别能力](https://www.volcengine.com/docs/6561/1354871?lang=zh)、[录音文件识别标准版 HTTP](https://www.volcengine.com/docs/6561/1354868?lang=zh)。

- 提交：`POST https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit`；查询：`POST https://openspeech.bytedance.com/api/v3/auc/bigmodel/query`，查询体 `{}`。
- 新控制台鉴权为 `X-Api-Key`，还需 `X-Api-Resource-Id / X-Api-Request-Id`，提交有 `X-Api-Sequence: -1`。2.0 资源 ID 为 `volc.seedasr.auc`；旧控制台另用 App ID / Access Token。不能据此认定 Ark 专用 Key 可用。
- 请求核心字段：`audio.url / audio.format`，`request.model_name: bigmodel`、`show_utterances: true`。文档声明 `vad_segment` 默认 `false`，默认语义分句；改用 VAD 或设置强制判停窗口会改变切分语义。
- 提交成功状态在响应头；查询返回 JSON，`result.utterances[]` 含 `text / start_time / end_time`（毫秒）。返回的是转写数据，不是音频 URL 列表；说话人聚类标签也不是人声/伴奏分离音轨。
- 如将来批准接入：先确认语音服务授权与可用 Key，再校验时间戳范围并让用户预览边界，按原音频裁切每段 WAV，逐段入资产库与历史。不要用文本字符数、等时长切割或静音检测冒充语义断句。

计费：[豆包语音计费说明](https://www.volcengine.com/docs/6561/1359370?lang=zh)列出录音文件识别模型 **2.0 后付费 0.8 元 / 输入小时**；旧大模型标准版 **2.3 元 / 小时**。按实际采用的资源与版本结算，不能把 ASR 单价直接称为“完整语义切分价格”。本批未接入或收费。

## 4. 实施范围与不变项

1. 保留 `vocal-background-separation-api`、`audio-sentence-segmentation-api` 两个 `kind: placeholder` 的注册项，不改为可执行 `live`，不建立未经确认的 `/audio/separate` 等假端点。
2. 音频节点同时显示两项禁用工具、统一“待接入”标识和可访问的具体原因；即使 Ark 开发配置齐全也不能激活它们。
3. 视频音频分离菜单的人声分离使用同一注册表原因；现有**音视频分离**（抽出原始混合音轨）继续可用，明确不等于人声/背景分轨。
4. 保留本地音频波形、入出点、0.5–2x 变速、试听、WAV 截取导出、下载与资产持久化。它们无需此次后处理 API。
5. 原注册表 8 / 4 积分仅为历史占位估算，保留以兼容既有配置；工具处标注非官方报价、未接入不扣费。不能让占位动作成功回调、写假结果或产生消费。
6. 不新增假的“已接”Provider，不新增环境变量，不改变现有 TTS / 音频生成 / Seedream / Seedance 请求协议。

## 5. TDD 与验收

- 先写失败断言：两项 Ark 边界说明、音频节点缺失的人声分离入口、配置齐全仍不可执行、禁用工具不触发参数更新或生成。
- fixture 护栏：拦截所有生成网络；验证注册表/执行器拒绝占位、无队列副作用与成功回填、AbortSignal 保持取消语义。
- E2E：在 fixture TTS 结果节点核对两个禁用项、下载/本地处理仍可用；重开后结果、资产、历史不因占位操作改变。
- 门禁顺序：`typecheck → vitest → build:mock → playwright`。生产静态产物仅 mock 配置，不读取真实开发凭据作为生成配置。
- 本批不会将 fixture 通过表述为真实 API 调用成功。

## 6. 操作卡与费用

- 打开音频节点：可看到“人声/背景音分离”“音频智能断句切分”，两者均禁用，并解释当前 Ark 范围限制。
- 已有音频仍可试听、下载、设置入出点和速度并导出 WAV；既有 TTS/音频生成链路不变。
- 本批真实调用 **0 次、真实费用 0 元**。没有可对用户收取的 Ark 后处理单价；MediaKit 0.07 元/分钟、ASR 2.0 0.8 元/小时仅是后续独立服务选型参考。
- 若后续选择 MediaKit / ASR，应另行确认服务权限、凭据种类、费用与生产代理；本批不要求用户提供 Key、不自动开通。

## 7. 验收记录

| 检查 | 结果 |
| --- | --- |
| TDD 红阶段 | 5 个预期失败：缺少音频人声分离按钮、注册表与音视频菜单缺具体 Ark 边界原因 |
| 聚焦单测 | 3 文件，45 / 45 通过 |
| 音频专项 E2E | 2 / 2 通过；包括 fixture TTS 结果、下载、刷新恢复与禁用项 |
| `npm run typecheck` | 通过 |
| `npm run test:run` | 142 文件，1223 / 1223 通过（原 1215 项全部保留） |
| `npm run build:mock` | 通过；mock 模式、空 Seedream Key，未改 `.env.local` |
| 全量 Playwright | 72 / 72 通过；失败 0、跳过 0、flaky 0，约 124 秒（原 71 项全部保留） |
| `git diff --check` | 通过 |
| 真实生成或音频处理请求 | 0；没有新增收费任务 |

全量 E2E 命令：`PLAYWRIGHT_OFFLINE_DIST=dist PLAYWRIGHT_JSON_OUTPUT_NAME=/private/tmp/ark-audio-post-full-e2e.json npx playwright test --workers=2 --reporter=json`。

专项初跑发现 Playwright 对原生 `option` 的 `toBeDisabled()` 判断与其 `disabled` 属性不一致；改用 `toHaveJSProperty('disabled', true)` 校验原生契约后通过，未放宽按钮禁用断言。沙箱不允许监听 4174 的首轮启动失败，获准本地监听后完成浏览器验证。

已有非失败警告仍在：本地 3000 端口探测、React Router 初始 hydration / redirect 提示、构建大分包提示。本批未扩大范围修改它们。

提交目标分支：`codex/platform-shell-phase`。原有三张 `design-qa-evidence` 截图改动不纳入本批。GitHub 推送仍受既有明确目标授权限制，未执行；需用户明确授权 `andydb0927-coder/andydb` 的 `codex/platform-shell-phase`，不能将本地提交当作已推送或已部署。
