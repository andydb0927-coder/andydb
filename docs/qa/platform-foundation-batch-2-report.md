# 第二阶段批次2：画布模块、图片预设与确认弹层

## 起点与范围

- 分支 `codex/platform-shell-phase`，起点 `8733236bccd84574d82ad71d79529d1f87469ed6`。
- 交接基线：152文件 / 1351 Vitest / 95 Playwright。
- 开工已有8张截图修改，单独备份，不纳入本批提交；不清理用户IndexedDB，不操作用户浏览器，不读取本机Key。
- 不增加依赖，不改数据库/存储字段、生成传输/轮询、计费算法、页面文案、节点操作或确认步骤。

## 1. 画布核心拆分

CanvasPage 从6353行减为5862行。状态、事件处理、队列、异步副作用仍由原页面控制；本批先抽离视图边界和纯函数，不重写尚在页面内的业务回调。

| 提取模块 | 职责 | 保持的契约 |
|---|---|---|
| CanvasProjectDialogs | 导出/导入/发布/创建主体弹层装配 | 原挂载条件、原DOM层级，位于平移缩放视口之外 |
| CanvasGenerationDialogs | 分析/图片编辑/续写/LibTV确认/删除弹层装配 | 原project/canvas校验、key、busy判断、回调与草稿生命周期 |
| CanvasNodeEditors | 新建节点、创意卡创建/编辑浮层 | 原位置、标题、key、草稿、素材与提交回调 |
| CanvasWorkflowTools | 空画布入口、工具坞与批量状态面板 | 按钮名称、disabled、资源面板入口、批量重试/完成行为 |
| CanvasWorkspacePanels | 故事板、资源、Agent、评论面板 | 同一项目对象、节点/资产名称、选择/重排/对白/资源回调 |
| canvas-generation-request | 请求构建、资格检查、可批量节点判断、强制演示执行 | 4个函数与起点AST等价 |
| canvas-media-creation | 素材节点创建、活动资产查找、加工素材记录 | 3个函数与起点AST等价 |

7个纯函数进行了AST级比较，除位置/导出修饰与格式外一致：[提取一致性记录](evidence/platform-foundation-batch-2/extraction-check.log)。本次并非bundle体积优化，也未把未整理的业务回调宣称已拆完。

## 2. 图片预设目录与manifest

- `image-creation-presets.ts` 统一15个入口的分组/顺序/名称/徽标，以及10个AI预设的供应商映射与提示词。旧 `prompt-assist` 导出保持兼容，但不重复维护定义。
- 模板菜单通过 `resolveImagePreset` 区分分析、待接入和本地工具；Slash读取同一目录。原名称“电影级光影校正”和供应商名称“电影级光影矫正”保留，不擅自修改UI文案。
- `image-analysis-parameters.ts` 从provider manifest编译出的schema读取默认值；分析工具声明为默认1.5K、count=1（一次整组），保持原界面默认值与逐组费用。
- 清晰度标准集复用 `standardImageResolutionTiers`。串行9/4/25张的既有模板、请求顺序与计费算法未改变；已保存参数优先恢复。
- 全量测试曾发现“schema覆盖但manifest未同步”的不一致，修正为先声明manifest再编译schema；原 `compiles all manifests` 断言未放宽。

## 3. 统一确认弹层

`ui/ConfirmDialog.tsx` 只拥有弹层容器、可访问属性、可配置的焦点循环、Escape、遮罩关闭和焦点恢复；不拥有网络、费用、草稿或提交权限。

| 使用者 | 本轮变化 | 保留 |
|---|---|---|
| 图片真实生成确认 | 使用共享alertdialog壳 | 3种多图策略文案、总成本、生成回调、原全局Escape和触发器焦点策略 |
| LibTV实际生成确认 | 使用共享dialog壳 | 初始取消按钮焦点、重复提交锁、费用/上传警告、显式焦点恢复 |
| 图片编辑 | 使用共享dialog壳 | 框选/尺寸/草稿校验、单价、提交锁 |
| 视频续写 | 使用共享dialog壳 | 源片校验、声音/时长/清晰度、费用、提交锁 |
| 图片/拉片分析 | 使用共享dialog壳 | 上传存活标记、维度校验、逐格提示词、整组费用、提交锁 |
| 普通视频/音频节点生成 | 无新增弹窗 | 仍通过原标准生成路径；不额外增加一次确认 |

保留各组件原class、div/section、dialog/alertdialog角色、portal位置与初始焦点；未改CSS和按钮名称。

## 4. 导演台边界审查

- `director-3d-scene.ts` 只依赖项目模型的类型；负责对象/相机的不可变数据操作与序列化，无React、Three.js、store或网络依赖。
- `Director3DViewport.tsx` 拥有Three.js渲染与OrbitControls，通过 `onChange`/`onExportViews` 回交数据。
- `DirectorComposer.tsx` 是Agent命令/本地偏好UI，不拥有3D场景；仅通过 `onExecute` 向画布提交命令。
- 边界本来已清晰，无需强行改生产代码。新增静态依赖测试及浏览器回归：添加/重命名3D道具、切相机、编辑并清空Agent草稿、关闭/刷新后场景与相机保持。

## 5. TDD与门禁

- 新模块先红：ConfirmDialog/预设目录、生成请求/弹层模块尚不存在时测试失败；再实现并转绿。
- 新增16个单测：共享确认3、预设/manifest3、请求纯函数2、生成层1、画布层5、导演台边界2。原1351项不删不放宽。
- 新增3个E2E：工具/资源/导出入口、721px预设/Slash确认、3D与Agent隔离。原95项保留原样。
- 新增E2E首跑有一次测试定位错误：实际面板名为“历史”，测试误写“生成历史”；修正测试后3/3通过，没有修改产品文案。

| 门禁 | 结果 | 记录 |
|---|---|---|
| typecheck | 通过，退出0 | [日志](evidence/platform-foundation-batch-2/typecheck.log) |
| test:run | 158文件，1367/1367通过，退出0 | [日志](evidence/platform-foundation-batch-2/vitest.log) |
| build:mock | 通过，退出0；显式mock且Seedream Key置空 | [日志](evidence/platform-foundation-batch-2/build-mock.log) |
| Playwright | 98/98通过，退出0，5.9分钟 | [日志](evidence/platform-foundation-batch-2/playwright.log) |

全站矩阵覆盖13个路由、273组视口/等效缩放组合，无页面异常；画布专项的页面异常与console error均为0。等效缩放通过CSS视口尺寸换算，不宣称操作了浏览器原生缩放设置。证据：[路由矩阵](evidence/platform-foundation-batch-2/route-matrix.json)、[画布控制台](evidence/platform-foundation-batch-2/canvas-console.json)。

已知非阻断告警：测试辅助localhost:3000连接的EPERM、Vite >500kB chunk、NO_COLOR/FORCE_COLOR冲突。原样记录，未调阈值或隐藏告警。

代码、规格、报告及JSON的`git diff --check`通过；原始工具日志中的尾部空格/空行保留，所以包含`.log`的全量空白检查会报告这些格式问题，未改写原始证据。

## 6. 安全、决策与回滚

- 自动化使用独立4187端口、新Playwright上下文、mock产物和fixture假Key，生成请求由拦截处理；不是本次真实供应商验收。
- 原8张截图修改已从本轮开工备份恢复；两个证据目录与备份逐文件比较完全一致。本批新验证日志与JSON单独存放，不覆盖前批证据。
- 凭据模式扫描检查606个跟踪/候选文本文件及50个mock产物文件，未发现高置信凭据模式、待提交私密env文件或mock产物非空凭据字段。仅为模式扫描，不代表完整密钥审计；未读取`.env.local`。[扫描记录](evidence/platform-foundation-batch-2/security-check.json)。
- 只提交本批代码/测试/规格/报告；不提交密钥、构建产物或原有截图。
- 不增加通用全局状态层，不改API，不强行把视频/音频普通生成改成两次点击；保留兼容导出，允许小步回滚。
- 回滚方式：revert本批提交；不需要数据迁移、清库或重新建项目。
