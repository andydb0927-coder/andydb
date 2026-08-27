# Ark 收尾批次5：能力核验与实施规格

日期：2026-08-27。仅阅读官方文档并使用 fixture 验证；不调用真实付费接口，不读取或修改 `.env.local`，不购买音色槽位。

## 1. 结论

| 能力 | 官方边界与本批决策 | 数据与费用 |
| --- | --- | --- |
| 音色克隆 | 官方支持，但为 openspeech 豆包语音体系；不是 Ark Bearer Key 接口。现有 Ark Key 未获证明可用于语音项目及复刻音色槽位，保持禁用占位。 | 不上传样本、不训练、不生成假音色；本批0费用。 |
| 主体视觉提取 | 复用现有豆包视觉模型 Chat API，图片输入，严格 JSON 输出名称、外貌、服装、标签。 | 创建主体时生成草稿；人工可改，保存后写本地主体 IndexedDB，不覆盖原图片。按实际 token 计费。 |
| Seedance 提示词优化 | 公开视频任务接口与提示词指南未提供独立“返回优化后的提示词”的接口契约。PromptPilot 是另一个调优工作流，不能当成 Seedance 单次优化 API。 | 保留本地规则版，0网络/0费用；AI 优化标待接入，不伪造端点。 |

## 2. 音色复刻：官方存在，但不满足本批同 Key 条件

本轮浏览器读取 [声音复刻使用指南](https://www.volcengine.com/docs/6561/1167802?lang=zh)、[音色训练 HTTP](https://www.volcengine.com/docs/6561/2534906?lang=zh)、[音色查询 HTTP](https://www.volcengine.com/docs/6561/2535742?lang=zh) 正文。

- 训练：`POST https://openspeech.bytedance.com/api/v3/tts/voice_clone`。
- 查询：`POST https://openspeech.bytedance.com/api/v3/tts/get_voice`。
- 新版头：`Content-Type: application/json`、`X-Api-Key`（语音控制台 API Key）、`X-Api-Request-Id`（UUID）。旧控制台另用 AppID/AccessToken 方案，不能混用 Ark 的 `Authorization: Bearer`。
- 训练主体字段：`speaker_id`，`audio.data`（base64），`audio.format`，可选 `language`、`extra_params.demo_text`（4–300字）、降噪等。样本最大10MB；支持 wav/mp3/ogg/m4a/aac/pcm，PCM需24k单声道。查询传 `speaker_id`。
- 状态：0不存在、1训练中、2成功、3失败、4激活；2/4可合成。返回剩余训练次数、`speaker_status[].model_type`（2.0为5）与 `demo_audio`（试听URL一小时有效）。
- 新版需在语音项目开通复刻模型；后付费还需开通音色服务。首次正式合成会收音色槽位费并固定音色；不能为了验证同Key擅自执行。
- [语音官方计费](https://www.volcengine.com/docs/6561/1359370)：复刻2.0按量合成3元/万字符；后付费槽位138元/音色；预付费首档0–50为138元/音色（其余阶梯与优惠以控制台为准）。不是仅有字符费。

实现采用隐藏的 `voice-clone-api` placeholder，音频节点显示「音色克隆」「待接入」与具体鉴权/槽位原因。没有可用凭证时不提供虚假上传、克隆、试听或TTS引用结果；既有TTS与音频工具不变。

## 3. 主体视觉提取

依据 [图片理解](https://www.volcengine.com/docs/82379/1362931?lang=zh)、[Chat API](https://www.volcengine.com/docs/82379/1494384?lang=zh)。官方同时支持 Responses 与 Chat；本批复用已验证的 Chat 传输。

```json
{
  "model": "doubao-seed-2-1-pro-260628",
  "messages": [
    { "role": "system", "content": "仅描述可见特征，输出严格 JSON，不推断真实身份。" },
    { "role": "user", "content": [
      { "type": "image_url", "image_url": { "url": "https://example.invalid/source.png" } },
      { "type": "text", "text": "提取用于创作的主体描述。" }
    ] }
  ],
  "stream": false,
  "thinking": { "type": "disabled" },
  "max_tokens": 1200,
  "temperature": 0.2
}
```

内部输出：`{name, appearance, clothing, tags}`。名称为可编辑创作称呼，不是人脸识别或真实身份判定；不推断健康、族裔、宗教等敏感属性。物品的服装填“不适用”。图片中的指令视为待描述数据，不作为系统指令。

- 复用 `VITE_SEEDREAM_API_KEY`、`VITE_SEEDREAM_API_BASE`、`VITE_ARK_TEXT_MODEL_ID`；只在 `ark-text-dev` 或 `seedream-direct-dev` 已配 Key 时启用。线上 mock 保留手动创建；不回退假AI结果。
- 支持 HTTPS 公网图或本地上传 base64。官方URL/base64单图小于10MB；本批只送一图，前端保守接受 PNG/JPEG/WebP/GIF；其他类型提示先转换。不把 blob/本地相对地址直接交给服务端。
- 新 provider 隐藏于普通模型下拉，仅供「创建主体」入口。首次进入时自动提取一次；严格模式不重复请求，关闭/切项目时取消。显式重试才会再次发请求。
- 草稿提取中可继续手写。返回仅补未编辑字段，不能覆盖用户已经改动的名称/描述/标签。失败显示安全中文错误，可直接手动保存。
- 保存主体同时保存结构化外貌/服装与来源模型/实际token用量，供审计；不改源节点版本，不创建虚假图片资产。提取费用是供应商token费，本地主体草稿不走节点生成积分流水。
- [官方模型价格](https://www.volcengine.com/docs/82379/1544106?lang=zh)：Seed 2.1 Pro常规在线推理输入6元/百万token、输出30元/百万token。示例2000输入+300输出约0.021元，不是固定每次单价；图片也折算输入token。沿用注册表估算，实际费用以账单为准。

## 4. 提示词优化

核对 [Seedance任务API](https://www.volcengine.com/docs/82379/1520757?lang=zh)、[Seedance 2.0提示词指南](https://www.volcengine.com/docs/82379/2222480?lang=zh)、[PromptPilot调优](https://www.volcengine.com/docs/82379/1399497?lang=zh)。本次没有获得同Key独立Seedance优化端点契约，不将文档没有列出写成“所有官方产品都不支持”。

本地规则版继续补镜头/光线/声音模板；按钮名称保留「本地优化提示词」，显示本地免费与AI待接入原因。图片接口中的 `optimize_prompt_options` 也不是视频提示词输出服务，不能冒用。

## 5. TDD / 验收契约

1. Provider：配置门、请求体/单图校验、结构化解析、token成本、错误安全化、取消与超时，全部 fake Key/fixture。
2. 对话框：一次自动提取、StrictMode无双请求、编辑保护、取消不写库、失败手动保存、提取成功后可编辑；保存失败后解除提取中状态，迟到响应不覆盖新草稿，图片格式/体积错误显示具体修复提示。
3. Repository：结构化数据与用量刷新可读，不影响原图片资产；旧的纯手动主体兼容。
4. 占位：已配置Ark仍不能克隆；提示词本地优化零网络，禁用原因可见。
5. E2E：图片创建主体→fixture回填→保存→刷新/跨项目复用，错误与取消；音色占位与视频本地优化。
6. 全量门禁顺序：typecheck → Vitest → build:mock → Playwright；不让 `.env.local` 污染静态产物，保留已有1262/75基线语义。

## 6. 操作卡

开发环境已有Ark配置时，选带结果或上传图的图片节点→右键「创建主体」→自动读取视觉草稿→检查/编辑→「保存到主体库」→角色库复用。进入该对话框会发送一张图片给配置的Ark模型并产生token费用；关闭会取消等待，但服务端已处理的用量可能仍计费。线上未配置时仍可手工创建。

音频「音色克隆」本批不可执行：需另行确认语音专用授权与槽位，不自动申请；视频「本地优化提示词」可用且不联网。

## 7. 验证结果

2026-08-27 最终验证（同一工作树，按下表顺序执行）：

| 门禁 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run test:run -- --reporter=json` | **1289/1289**，0失败、0跳过 |
| `npm run build:mock` | 通过；显式 mock 模式且清空构建用 Ark Key |
| `PLAYWRIGHT_OFFLINE_DIST=dist npx playwright test --workers=2` | **78/78**，约2.2分钟 |
| `git diff --check` | 通过 |

- TDD：先看到新增 Provider 缺失与主体对话框行为测试失败，再实现；另先复现“手工保存失败后仍显示提取中”及“图片校验原因被泛化”两项红测，再修复并通过全量门禁。
- 在1262/75基线上新增27个单元测试、3个E2E，不删除或跳过既有回归用例。专项7个E2E也单独通过。
- 验证了请求/返回结构、按token估费、401/403/429/500安全错误、超时/取消、StrictMode单请求、手工编辑保护、主体持久化及跨项目复用、源图片/资产/生成任务不被篡改、线上未配置禁用态、音色克隆不可执行与提示词本地优化零网络。
- 全部生成与分析请求由 fixture 拦截；额外屏蔽正式 volcengine/volces/byteplus/bytedance 域名。**没有真实账号调用，实际费用0元**；通过测试不代表已验证真实账号权限或图片分析质量。
- 既有非阻断提示仍在：构建大分块告警、路由初始水合告警，以及单测辅助 localhost:3000 连接提示；上述门禁均以成功退出且0失败确认。
