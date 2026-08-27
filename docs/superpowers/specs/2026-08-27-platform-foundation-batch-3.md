# 第二阶段批次3：时间线、路由与导演输入边界

## 起点与约束

- 起点 `d58675bc84330ea44c301070368dc81fe9a1d841`，分支 `codex/platform-shell-phase`；基线158文件 / 1367单测 / 98 E2E。
- 开工已有10张截图改动，按本轮现场备份并在门禁后恢复；不使用上一批备份覆盖。
- 纯结构整理：不改UI文案、数据格式、任务执行、API、导出格式或持久化策略，不调用真实服务。

## 设计与决策

1. 时间线：`PreviewPage`继续拥有时间线、游标和选中片段；`TimelineEditor`保持受控，局部字幕草稿不提升为全局状态。提取纯类型、时长计算、素材解析与选择器；原`timeline-project`保留兼容导出。JSON/EDL序列化与浏览器下载/录制分层，格式、文件名和通知保持原样。
2. 路由：保持现有路由树形状、PlatformShell两个模式和basename。加载与恢复策略集中在`route-boundaries`，沿用`RouteErrorPage`统一中文恢复界面。不把“项目不存在/分享不存在”等业务状态错误地当成路由异常。保留各路由原错误捕获范围。
3. 导演输入：提取受控`DirectorInput`，只发输入、引用、附件和提交事件；`DirectorComposer`继续持有草稿、建议和人工执行权限，`director-command`持有解析/说明。输入组件不得调用provider、store或3D。
4. 大文件抽查：优先提取`timeline-project`的纯解析函数，以及`CanvasPage`的选择一致性/下游遍历。其他大文件记录后续边界，不为了行数机械拆散异步生命周期。

## TDD与验证

- 先写新边界测试并观察缺模块/缺导出失败，再机械搬移函数，尽可能比较搬移前后AST。
- 覆盖来源解析、活动片段、变速时长、JSON/EDL导出内容、路由加载/404/异常恢复、导演输入不自行执行、依赖环遍历。
- 新E2E覆盖时间线编辑刷新与双格式导出、深层路由返回、导演建议→依赖删除确认→取消。
- 按序执行typecheck → test:run → build:mock → `PLAYWRIGHT_OFFLINE_DIST=dist`全量Playwright。独立端口、新BrowserContext、fixture拦截。
- 只提交本批改动；记录第二阶段已统一和仍需后续处理的底座。单提交可revert，无数据迁移。
