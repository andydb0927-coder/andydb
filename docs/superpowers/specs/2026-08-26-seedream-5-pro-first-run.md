# Seedream 5.0 Pro 首次真实文生图验证

## 目标与边界

验证路径为：图片节点选择 `Seedream 5.0 Pro` → 输入提示词 → 调用火山方舟图片生成 API → 返回临时 HTTPS 图片 URL → 当前节点直接显示。

- 官方接口：`POST https://ark.cn-beijing.volces.com/api/v3/images/generations`
- 默认模型 ID：`doubao-seedream-5-0-260128`
- 鉴权：`Authorization: Bearer <API Key>`
- 当前实现支持文生图与最多四张参考图输入；首次验证固定单张输出。
- 返回 URL 为临时资源，只进入内存态，不写项目资产、历史、版本或 IndexedDB。
- 此模式仅供本机开发验证。生产环境必须使用服务端代理保管密钥。

官方接口参数与响应以[火山方舟图片生成 API](https://api.volcengine.com/api-docs/view?action=ImageGenerations&serviceCode=ark&version=2024-01-01)为准。

## 本地配置

在 `app/.env.local` 中配置，文件已被 `.gitignore` 排除：

```dotenv
VITE_GENERATION_MODE=seedream-direct-dev
VITE_SEEDREAM_API_KEY=<短期、低额度、可撤销的火山方舟 API Key>
VITE_SEEDREAM_API_BASE=https://ark.cn-beijing.volces.com/api/v3
VITE_SEEDREAM_MODEL_ID=doubao-seedream-5-0-260128
```

修改环境变量后必须重启 Vite；运行中的开发服务器不会自动重新读取 `.env.local`。

## 首次验证步骤

1. 在 `app` 目录启动 `npm run dev -- --host 127.0.0.1 --port 4173`。
2. 打开一个项目画布并创建图片节点。
3. 选中节点，在“图片模型”中选择“官方 API 已接（开发直连）”分组里的 `Seedream 5.0 Pro`。
4. 确认参数摘要为 `16:9 · 2K · 1张`，界面徽标为“开发直连”。
5. 输入测试提示词；首次建议使用无真人身份、无品牌、无敏感内容的普通场景描述。
6. 点击“生成图片，预计成本 18”。
7. 观察状态依次显示“生成任务已提交”“Seedream 5.0 Pro生成中”，成功后节点直接显示真实图片。
8. 刷新页面，确认临时结果消失；项目资产与生成历史中不应出现该临时 URL。

## 错误定位

| 提示 | 含义 | 处理 |
| --- | --- | --- |
| Seedream 开发验证配置未完成 | 模式或 API Key 缺失 | 检查 `.env.local` 后重启 Vite |
| Seedream 鉴权失败（401） | API Key 无效或已撤销 | 重新创建短期 Key |
| Seedream 访问被拒绝（403） | 账号或模型权限未开通 | 在火山方舟确认模型权限 |
| Seedream 请求过于频繁或额度不足（429） | 并发、配额或余额受限 | 降低频率并检查额度 |
| Seedream 提示词未通过安全检查（400） | 输入内容审核未通过 | 更换普通测试提示词 |
| Seedream 结果 URL 无效 | 上游返回非 HTTPS 或格式异常 | 记录时间与响应请求 ID 后停止验证 |

## 回退

1. 将 `VITE_GENERATION_MODE` 改回 `mock`。
2. 删除 `VITE_SEEDREAM_*` 配置。
3. 重启 Vite。
4. 在火山方舟撤销或轮换本次临时 API Key。
