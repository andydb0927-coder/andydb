# 火山方舟图片编辑：官方核对与批次 1 接入规格

核对日期：2026-08-27。在登录态内置浏览器阅读官方正文与折叠字段；未点击调试、未调用生成 API、未读取或修改本地 Key。

## 1. 官方依据与能力边界

| 核对项 | 官方实测文档结论 | 本批落地 |
| --- | --- | --- |
| 编辑端点 | [图片生成 API](https://www.volcengine.com/docs/82379/1541523?lang=zh) 统一使用 `POST /api/v3/images/generations`，没有独立的 `/images/edits` | 独立工具 Provider，复用现有 Ark 传输、返回解析及队列 |
| 输入 | `model`、`prompt`、`image`（公开可访问 URL 或 data URL，也可数组）、`size`；Bearer API Key | 本批只接受一张源图，防止选错多图对象；支持 PNG/JPEG/WebP |
| 局部编辑 | [交互编辑指南](https://www.volcengine.com/docs/82379/2582775?lang=zh) 将坐标写入 prompt：`<point>x y</point>` / `<bbox>x1 y1 x2 y2</bbox>`，范围 0–999 | 擦除面板框选/数值调整区域，提交归一化 bbox + 擦除描述；不伪造 `mask` 字段 |
| 扩图 | [图片生成教程](https://www.volcengine.com/docs/82379/1824121?lang=zh) 支持图文生图、改变背景/视角/尺寸；参数表没有 outpainting、padding、expand 等专用字段 | **提示词扩图**：输入原图 + 扩展方向指令 + 目标尺寸；不是保证原像素不变的拼接扩图 |
| 擦除 | 图像元素增删与框选编辑可表达局部消除，但没有像素级 mask 接口 | **AI 局部擦除**，明确不保证框外像素完全不变；原图版本保留，便于对比/恢复 |
| 高清/超分 | Ark 当前图片接口没有独立超分端点、2x/4x、保真开关。高分辨率生成不等于超分 | 禁用“高清/图片高清”，阻断旧高清工具节点的生成；不实现虚构的 `ark-image-upscale-provider.ts` |
| 抠像/背景移除 | `background: transparent` 仅适用输入**一张已带透明通道的图片**，输出 PNG；不能据此承诺自动抠像 | “抠像”保持禁用，说明当前 Ark API 无独立自动抠像契约。火山其他产品不等于本 Ark Key 已开通 |
| 输出 | `data[]` 含 `url` / `size`，URL 24 小时有效 | 写入现有节点版本、项目资产、生成历史；这保存的是 URL 引用，不宣称永久托管 |

### 模型身份特别纠正

官方当前交互编辑模型为 **`doubao-seedream-5-0-pro-260628`**。教程明确 `doubao-seedream-5-0-260128` 是 Lite 的兼容 ID，不能据其名称假设具有 Pro 坐标编辑能力。本批编辑 Provider 固定默认到官方 Pro ID；不修改用户 `.env.local`，不顺带切换既有文生图配置。编辑 Provider 不混入普通模型下拉或预设模型列表。

## 2. 请求、尺寸与成本

```json
{
  "model": "doubao-seedream-5-0-pro-260628",
  "image": ["https://example.invalid/input.png"],
  "prompt": "擦除图1 <bbox>100 200 600 800</bbox> 内的路牌，补全自然背景，尽量保持区域外内容不变。",
  "size": "2816x1584",
  "response_format": "url",
  "output_format": "png",
  "watermark": false
}
```

- 输出档位：1K / 1.5K / 2K，不支持 Pro 4K；自定义像素范围 921600–4624220，宽高比 1/16–16。沿用现有声明式 `sizePolicy` 与 `ImageSizeResolver`。
- 不发送 `mask`、`upscaleScale`、`quality`、`editStrength`、`outpainting` 等未确认字段；显式要求不支持的操作在发网前报错，不静默降级。
- 本批支持单张或串行 2/4 张（Pro 普通图片生成不支持一次组图），保留完整 `data[]`。UI 首批固定一张，确认层列明真实尺寸、预计人民币与项目积分。
- [官方模型价格](https://www.volcengine.com/docs/82379/1544106?lang=zh)（页面更新 2026-08-25）：单图生成输出 **≤261 万像素 ¥0.30/张，>261 万像素 ¥0.60/张**；第一张输入图免费，第 2 张起 ¥0.02/张。本批单源图无额外输入图费用。未成功输出不计费，最终以官方账单为准。
- 图层拆分属于独立场景：输出对应像素档位 ¥0.15/¥0.30，每个图层分别计费；**本批不调用图层拆分**，不套用其低价。
- 项目现有积分沿用 18/张，属于本地估算，不与人民币等价；2K 常见尺寸预计 ¥0.60，1K/1.5K 常见尺寸预计 ¥0.30。自动尺寸无法预知准确像素时按较高档估算，结果后按实际返回尺寸记录。

## 3. 实施与 TDD 验收

1. 冻结 `.invalid` fixture 与合同测试：输入图片、编辑指令、bbox、尺寸、串行结果、鉴权/限流/审核/畸形响应/非法 URL/超时/取消/未配置/不支持字段。
2. `ark-image-edit-provider.ts` 只组织编辑语义并委托已验证的 Seedream 传输，独立 Pro 模型 ID、工具专用不可选 Provider；返回 `persistence: project`。
3. 图片结果工具栏新增“扩图”“擦除”草稿弹窗；关闭/Escape/取消均不写数据、不请求。明确确认后复用 `GenerationQueue → applyGenerationSuccess`；并发任务期间禁用重复提交，失败留原图。
4. 高清/自动抠像明示未支持；遗留高清节点不得通过普通生成或快捷键偷跑重绘。
5. 单测和 E2E 一律网络拦截，验证版本/资产/历史及刷新恢复、错误不新增结果；保留模型目录、其他生成入口和前端处理能力。
6. 门禁：typecheck → Vitest → build:mock → Playwright；mock 产物不携带开发 Key。
7. 编辑请求与失败重试固定到 Ark 编辑 Provider，不受遗留 LibTV 全局偏好改写；重试保留原任务的源图、区域和尺寸配置。图片工具条在原生连线拖拽期间隐藏，避免新增入口遮挡目标端口，结束后自动恢复。

## 4. 操作卡

- 本地已有 `VITE_GENERATION_MODE=seedream-direct-dev`、`VITE_SEEDREAM_API_KEY`、`VITE_SEEDREAM_API_BASE=https://ark.cn-beijing.volces.com/api/v3` 时编辑功能启用；Key 需具有上述 Pro 模型权限。本批不更改 Key、不自动开通模型。
- 启动 dev → 图片结果节点 → 工具条“扩图”或“擦除” → 输入描述、调整输出尺寸（擦除需框选或填坐标）→ 检查费用与请求摘要 → 确认生成。
- 观察任务状态、结果新版本、资产和历史；错误不会伪造成功。线上 mock 构建显示配置未完成，不能真实生成。
- `VITE_` Key 会进入开发客户端，只用于本地验证；生产仍需服务端代理，静态部署不可注入 Key。
- 回退：关闭弹窗或切回 mock 并重启；不要将 `.env.local`、Key 或真实图 URL 提交到 Git。

## 5. 本批自检结果

| 门禁 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run test:run` | 139 个文件、1169/1169 通过 |
| `npm run build:mock` | 通过，包含 SPA fallback；未使用开发 Key 构建 |
| `PLAYWRIGHT_OFFLINE_DIST=dist npx playwright test --workers=2` | 69/69 通过，0 失败、0 跳过、0 flaky |
| `git diff --check` | 通过 |

- Provider/弹窗/运行时分发均先观察失败测试再实现。新 E2E 覆盖取消不请求、扩图请求契约、结果与历史刷新恢复，以及 721×778 下框选擦除参数、401 保留原图、刷新后使用原编辑配置重试。
- 全量回归曾发现加长工具条遮挡连线端口，已修实现并全量重跑通过，没有放宽端口命中断言。
- 本次测试中仍有非阻断日志：本地 `localhost:3000` 探测连接失败、React Router 初始化提示、大于 500KB 构建分包提示；测试进程均正常成功退出。
- **没有进行付费真实生成**，因此不宣称已验证账号的 Pro 模型权限、实际编辑质量或实账金额。以上为官方契约与 fixture 端到端验证；待用户自行或另行授权执行操作卡中的真实验证。
