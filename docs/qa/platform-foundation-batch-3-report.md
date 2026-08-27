# 第二阶段批次3：时间线、路由与导演输入边界（收官）

## 1. 起点与范围

- 分支：`codex/platform-shell-phase`；起始提交：`d58675bc84330ea44c301070368dc81fe9a1d841`。
- 交接基线：158个测试文件 / 1367项Vitest / 98项Playwright。
- 本批为结构整理，不改生成Provider、请求/计费、数据库schema、项目资产与节点字段、页面样式和交互文案；不添加依赖。
- 开工已有10张截图改动已单独备份，门禁后按本轮现场恢复，不纳入提交。自动化只使用隔离测试上下文与4188端口，不操作用户浏览器或清用户数据。

## 2. 时间线职责整理

| 模块 | 整理后的职责 | 兼容边界 |
|---|---|---|
| `timeline-types.ts` | 轨道、片段、来源、布局与持久化类型 | 13项声明逐字一致；`timeline-project`保留原type导出 |
| `timeline-math.ts` | 变速后的片段时长计算 | 旧导出仍指向同一函数 |
| `timeline-sources.ts` | 节点/资产来源、轨道归类、缺失来源回退、片段解析 | 视频节点的媒体类型特例与原排序不变 |
| `timeline-selectors.ts` | 全部片段、候选素材、当前片段选择 | PreviewPage与TimelineEditor共用；不增加store或副作用 |
| `timeline-project.ts` | 创建/迁移/增删/排序/分割/变速/布局等不可变操作 | 原15个操作函数体不变；624行缩至418行 |
| `TimelineClipCard.tsx` | 片段显示、选中、移动与来源链接 | 原DOM、可访问名称和事件不变 |
| `timeline-serialization.ts` | JSON/EDL序列化及统一下载描述 | 原format/version、EDL时码、文件名/MIME/反馈不变 |
| `shared/browser-download.ts` | 文件名安全化、浏览器下载、对象URL回收 | 不再依赖时间线领域；旧`timeline-export`兼容导出保留 |
| `timeline-export.ts` | MediaRecorder能力与录制会话 | 录制算法、开始/停止和返回值不变 |

状态审查：PreviewPage继续拥有时间线、播放头、选中项与保存队列；TimelineEditor仅保留字幕输入草稿；TimelineExportPanel继续持有录制会话与反馈。预览页的“是否支持录制”和面板的“当前录制会话”不是重复状态，不强行合并。

`serializeTimelineJson`仍读取原导出时间，浏览器下载仍有DOM副作用；这里是职责分层，不把这两者宣称为纯函数。JSON/EDL导出描述集中，画布快照导出与时间线导出保持不同格式。

## 3. 路由层整理

- `router.tsx`只维护页面目录、lazy加载、loader和basename；`route-boundaries.tsx`集中加载占位、Suspense及统一错误边界注入。
- 原五处重复的`errorElement`配置通过同一策略装配。保持两个PlatformShell及三个沉浸式路由原捕获范围；不改变路由树形状、children对象、404通配路由或显式专用边界。
- `RouteErrorPage`继续负责统一中文恢复画面。不把“作品暂不可用”等业务空状态合并为技术异常。
- 深层loader的404/500单测验证中文恢复、不显示异常正文、不清本地状态；原加载测试改为实际渲染验证，不再依赖组件必须写在router文件里。
- 新E2E实际访问教程、挑战赛、制作过程、缺失分享、未知深层路径，并返回已有项目验证节点仍在。GitHub Pages离线路由与basename继续由原公开目录E2E覆盖。

## 4. AI导演与大文件审查

- 新`DirectorInput`是受控输入组件，仅接收文本、引用/资产面板状态、ref和事件回调。不引用provider、项目store或Three.js。
- `DirectorComposer`保留偏好、附件、草稿、建议、执行权限；修改草稿仍作废旧建议，提交仍不等于执行。
- `describeCommand`从组件移入`director-command.ts`，与命令解析同域；解析器和中文文案不变。
- E2E验证“输入删除→提交建议→人工执行→下游影响确认→取消→焦点回归”，节点与连线不变，生成请求数为0。
- 从CanvasPage抽出`sameSelection`与`downstreamConsumers`至`canvas-page-selectors.ts`，覆盖身份六字段、依赖环、去重与原节点顺序。CanvasPage从5862行减至5818行；没有重写事件回调和异步生命周期。

抽查的其他大文件包括project-store、ImageNodeDetails、SpecializedNodeDetails、CanvasWorkspace、AssetNode、CanvasResourcePanels、model-provider-registry、AgentsPage、VideoNodeDetails、libtv-generation-adapter、project/model、browser-media-processing、canvas-workflow-export。剩余的大状态组件、媒体生命周期、传输与兼容数据契约不在本轮机械拆分，避免扩大回归面。

## 5. TDD、门禁与证据

- 新增4个测试文件共12项单测：时间线4、路由4、导演输入2、画布纯选择器2。先跑红（新模块不存在），再实现转绿。原1367项测试保留，仅原加载测试调整为渲染同一契约。
- 新增3项E2E：时间线变速/布局/JSON+EDL/刷新；深层路由恢复；导演输入与依赖确认。原98项未删除或放宽。
- 新E2E首跑发现两处测试预期不符原行为：下载文件名会把冒号安全化为连字符、首页使用独立首页布局而非画布的“平台导航”。按原实现修正新测试，同时将EDL条目断言对准节点名“分镜 01”（而非控件名“图片 01”）；没有修改产品行为来迁就测试。
- [搬移一致性记录](evidence/platform-foundation-batch-3/extraction-check.log)：24个搬移函数体、13项类型声明、15个保留的时间线操作函数与起点一致。另核对CanvasPage、TimelineEditor、三个录制相关函数体，以及PreviewPage的状态/副作用语句，均与起点一致。

| 门禁 | 实测结果 | 日志 |
|---|---|---|
| `npm run typecheck` | 通过，退出0 | [typecheck](evidence/platform-foundation-batch-3/typecheck.log) |
| `npm run test:run` | 162文件，1379/1379通过，退出0 | [Vitest](evidence/platform-foundation-batch-3/vitest.log) |
| `npm run build:mock` | 通过，退出0；显式mock且Seedream Key置空 | [build:mock](evidence/platform-foundation-batch-3/build-mock.log) |
| `PLAYWRIGHT_OFFLINE_DIST=dist PLAYWRIGHT_PORT=4188 npx playwright test --workers=2` | 101/101通过，退出0，5.7分钟；未启用重试 | [Playwright](evidence/platform-foundation-batch-3/playwright.log) |

定向验证记录：[首次红测](evidence/platform-foundation-batch-3/red-boundaries.log)、[21文件90项定向单测](evidence/platform-foundation-batch-3/focused-first.log)、[新E2E首跑](evidence/platform-foundation-batch-3/e2e-focused.log)、[新E2E三项通过](evidence/platform-foundation-batch-3/e2e-focused-green.log)。

全量[浏览器矩阵](evidence/platform-foundation-batch-3/route-matrix.json)覆盖13个路由、273组视口/等效缩放组合，页面异常0，记录的最大横向溢出0。[画布专项](evidence/platform-foundation-batch-3/canvas-console.json)的页面异常与console error均为0。等效缩放通过CSS视口换算，未宣称设置了浏览器原生缩放。

已知非阻断日志包括辅助localhost:3000连接EPERM、Vite大chunk提示、NO_COLOR/FORCE_COLOR冲突；未调整阈值、隐藏日志或添加重试。原始日志保留工具输出格式，代码/人工文档/JSON另行执行空白检查，不改写日志来掩盖告警。

## 6. 第二阶段完成总结

| 批次 | 已统一的底座 | 保持不变 |
|---|---|---|
| 第一批 | TaskStatus与状态判断；中文安全错误及错误码表；素材域规则与IndexedDB实现分层；项目保存/恢复/事务回归 | 原状态语义、持久化schema、生成成本与调用流程 |
| 第二批 | 画布弹层/工具栏/资源面板边界；图片预设目录与manifest默认值；共用ConfirmDialog；3D场景与Agent职责校验 | 输入/焦点/确认步骤、生成权限、场景数据 |
| 第三批 | 时间线类型/计算/素材解析/序列化/浏览器下载边界；路由加载与错误策略；受控导演输入；画布纯选择器 | UI、导出格式、保存与录制生命周期、命令执行流程 |

第二阶段解决的是结构一致性与可测试边界，不表示所有大文件或媒体能力已完成重写。以下留待独立任务，不能混入本批“无行为变化”的提取：

1. **保存失败的可观测性**：PreviewPage仍有既有保存Promise链及捕获后继续排队路径；需要单独设计失败提示、重试与卸载竞态回归。本批只验证成功保存刷新，不声称已补全该失败体验。
2. **媒体生命周期与交付**：录制中卸载的资源回收、真正音轨混流与成片合成需要独立设计；当前MediaRecorder仍仅录制预览画布。
3. **大组件继续拆分**：CanvasPage业务回调、project-store动作、图片/视频详情与媒体编辑流程仍较大；后续按状态所有权拆分，而不是按行数切割。
4. **来源链接与部署路径抽查**：TimelineClipCard保留了旧原生`/project/...`来源链接，在子路径部署下的basename处理仍需独立回归，不在纯提取中暗改跳转方式。
5. **未使用模板与体积**：未引用的旧`src/App.tsx`模板及大chunk可另做死代码/打包优化；本轮没有添加依赖或更改构建阈值。

## 7. 安全、决策与回滚

- 测试使用fixture假Key和网络拦截；不读取本机`.env.local`，不发真实API请求。fixture通过不等于真实供应商验收。
- 两个旧证据目录均已从本轮开工备份恢复，`diff -qr`比较完全一致；原10张截图修改保留且不纳入本批提交。
- [安全扫描](evidence/platform-foundation-batch-3/security-check.json)涵盖跟踪/候选文本及mock产物：没有私密env候选文件、高置信凭据模式命中或mock产物非空凭据字段。仅为模式扫描，不等于完整密钥泄漏审计。
- 源代码、测试、人工文档与JSON的差异空白检查通过。没有改动已有98项E2E、provider/资产仓储/项目存储实现、CSS、依赖清单或CI工作流。
- 决策：保留旧type/function入口；不提升局部草稿为全局状态；不强制统一业务空状态；不重写录制、保存与执行权限；新增用例按真实旧契约定位。
- 本批可单独revert，不需要数据迁移、清库或重新建项目。提交仅包含本批源代码、测试、规格与验证证据。
