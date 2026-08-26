# 真实生成最小闭环设计（历史入口）

原 2026-08-21 单供应商验证方案已经被当前火山方舟统一接入取代。旧 Provider、旧环境变量和旧测试契约均已删除，不能再作为实现依据。

当前有效设计：

- 图片：火山方舟 Seedream 5.0 Pro；
- 视频：火山方舟 Seedance 2.0；
- 文本：火山方舟豆包；
- 开发验证三者复用 `VITE_SEEDREAM_API_KEY` 与 `VITE_SEEDREAM_API_BASE`；
- 视频模型可用 `VITE_ARK_VIDEO_MODEL_ID` 覆盖；
- 真实结果写入节点版本、项目资产与生成历史；
- 公开静态部署保持 Mock，生产密钥必须由服务端代理保管。

视频接口、参数、状态机与计费的现行依据见 [2026-08-27-seedance-video-notes.md](./2026-08-27-seedance-video-notes.md)，首次人工验证步骤见 [2026-08-27-seedance-video-first-run-checklist.md](./2026-08-27-seedance-video-first-run-checklist.md)。
