# Seedance 2.0 首次真实视频生成验证清单

日期：2026-08-27
范围：仅限本机 `localhost` 开发验证。自动化门禁只使用 fixture，真实验证必须另行明确执行。

## 配置

在已被 Git 忽略的 `app/.env.local` 中配置：

```dotenv
VITE_GENERATION_MODE=seedream-direct-dev
VITE_SEEDREAM_API_KEY=<临时、低额度、可撤销的火山方舟 Key>
VITE_SEEDREAM_API_BASE=https://ark.cn-beijing.volces.com/api/v3
VITE_ARK_VIDEO_MODEL_ID=doubao-seedance-2-0-260128
```

确认：

```bash
git check-ignore -v app/.env.local
git status --short -- app/.env.local
```

第二条命令正常应没有输出。不得记录或提交 Key、完整 `Authorization` 头、HAR 或完整防盗链 URL。

## 操作步骤

1. 修改环境变量后重启 Vite：`npm --prefix app run dev -- --host 127.0.0.1 --port 4173`。
2. 打开本机画布，创建或选中视频节点。
3. 模型选择“火山方舟 · Seedance 2.0 · 开发直连”。
4. 文生视频：选“文生视频”，输入安全的短提示词；图生视频：选“图生视频”，确认已引用一张首帧图。
5. 选择 4–15 秒、比例、清晰度和声音开关，核对预计成本。
6. 只点一次生成，观察“已提交 → 生成中 → 结果已保存到项目与生成历史”。
7. 播放节点结果，打开生成历史确认同一任务存在；刷新画布，确认结果、版本和历史仍在。

## 观测记录

| 项目 | 记录 |
| --- | --- |
| Git commit |  |
| 运行地址 | `http://127.0.0.1:4173/` |
| Provider | `seedance-api` |
| 模型 ID | `doubao-seedance-2-0-260128` 或覆盖值 |
| 模式 / 比例 / 时长 / 清晰度 / 声音 |  |
| 创建任务耗时 |  |
| 轮询次数与状态序列 |  |
| 结果可播放总时延 |  |
| `usage.completion_tokens` |  |
| 火山控制台实际费用 |  |
| 刷新后节点结果 / 历史是否仍在 |  |
| 脱敏错误码 |  |

## 停止与回退

- 遇到 401/403、429、持续 5xx、轮询超时、重复提交或费用异常立即停止，不连续重试。
- 将 `VITE_GENERATION_MODE` 改回 `mock`，或删除本机 `.env.local`，然后重启 Vite。
- 在火山方舟控制台撤销或轮换临时 Key。
- 再次确认 `.env.local` 未进入 Git。

接口契约、计费和安全说明见 [2026-08-27-seedance-video-notes.md](./2026-08-27-seedance-video-notes.md)。
