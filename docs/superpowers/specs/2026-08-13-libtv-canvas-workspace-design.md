# Liblib 风格画布工作台开发方案

日期：2026-08-13  
目标路由：`/project/:projectId`

## 1. 目标

在不替换现有节点模型、生成队列、项目持久化、预览和导出能力的前提下，把项目页升级为 Liblib 风格的沉浸式 AI 创作工作台：

- 建立清晰的项目级、画布级、资源级和生成级信息架构。
- 让工作流与故事板在同一页面内切换。
- 把高频创建动作收纳到中下工具坞，减少长期遮挡。
- 让节点列表、资产、历史和帮助共享左侧工作面板。
- 将 AI Director 提升为可收缩右侧 Agent 工作区。
- 补齐小地图、吸附网格、缩放与连线显示等视图能力。
- 保持演示数据本地化，不调用 Liblib API，不消耗第三方资源。

## 2. 非目标

- 不复制 Liblib 品牌、图标、文案或私有模型接口。
- 不实现真实付费、积分结算、发布平台、外部分享或云资产同步。
- 不把故事板伪装成已经实现的专业剪辑时间线。
- 不重写已验证的项目 Store、生成队列、React Flow 节点和依赖策略。

## 3. 设计原则

1. **保留能力，重组入口**：现有功能通过新壳层重新编排，不另造平行状态源。
2. **中心让给内容**：固定控件贴边，工具坞默认紧凑，侧栏可收起。
3. **一次一个主面板**：左侧资源面板和右侧 Agent 可独立开关；同侧面板互斥。
4. **安全生成**：本地演示仍明确标识；所有生成保留现有确认与队列语义。
5. **无障碍优先**：按钮有可读名称、切换用 `aria-pressed`，弹层处理 Escape 与焦点回归。
6. **响应式**：721×778 和 200% 浏览器缩放下关键操作完整可达。

## 4. 页面结构

```text
CanvasPage
├── CanvasWorkspaceTopBar
│   ├── ProjectIdentity
│   ├── CanvasSwitcher
│   ├── WorkspaceModeSwitch
│   └── PlatformActions / AgentToggle
├── WorkspaceBody
│   ├── WorkspaceSidePanel (optional, left)
│   ├── WorkflowCanvas | CanvasStoryboardView
│   │   ├── ReactFlow
│   │   ├── SelectionContextBar
│   │   ├── CanvasCreationDock
│   │   └── CanvasViewControls
│   └── CanvasAgentPanel (optional, right)
└── Existing dialogs / generation queue / comments / preview links
```

## 5. 状态设计

工作台状态属于 UI 层，不进入项目内容撤销历史：

```ts
type WorkspaceMode = 'workflow' | 'storyboard'
type WorkspacePanel = 'nodes' | 'assets' | 'history' | 'shortcuts' | 'help' | undefined

interface CanvasWorkspacePreferences {
  minimapVisible: boolean
  snapToGrid: boolean
  connectionsVisible: boolean
}
```

- `workspaceMode`：页面内切换，项目数据保持不变。
- `workspacePanel`：左侧只允许一个主面板。
- `agentOpen`：默认关闭；打开后右侧占位，不覆盖节点交互。
- 视图偏好按浏览器本地持久化，并在项目切换时保留；当前项目内容不因偏好变化而标记为未保存。
- 选中节点仍由现有 Store 管理，确保上下文工具、节点列表与 Agent 引用同步。

## 6. 核心组件

### 6.1 CanvasWorkspaceTopBar

- 可编辑项目名与保存状态。
- 画布切换器使用本地演示菜单，提供新建/重命名/复制/删除占位，并明确“本地演示”。
- 工作流/故事板为真正的分段控件。
- 保留撤销、重做、预览、导出入口。
- 发布/分享仅展示本地演示说明，不产生外部行为。
- Agent 按钮控制右侧面板。

### 6.2 CanvasCreationDock

- 将文本、脚本、角色卡、世界观、图片、分镜、视频等动作收纳到“添加节点”。
- 保留选择、连接、分组等模式操作。
- 增加资产、历史、快捷键、帮助入口。
- 菜单打开不应改变画布工具状态；选择操作后关闭并恢复焦点。

### 6.3 WorkspaceSidePanel

- 节点：复用当前节点数据，支持筛选、选择和定位。
- 资产：本地演示卡片，可将素材作为图片/视频节点加入画布。
- 历史：从项目生成 job/result 派生，支持定位结果节点。
- 快捷键：展示现有真实快捷键，不宣称未实现组合键。
- 帮助：产品引导、节点连接说明和本地演示边界。

### 6.4 CanvasStoryboardView

- 从当前项目节点派生文本、图片、视频三组。
- 空状态清晰；卡片可返回工作流并选中来源节点。
- 不引入第二份故事板数据源。
- “加入时间线”继续使用现有时间线逻辑，故事板仅作汇总视图。

### 6.5 CanvasAgentPanel

- 复用现有 DirectorComposer 和生成动作。
- 提供新对话、历史、设置、关闭等工作台外壳。
- 默认宽度约 340px，并限制最小/最大宽度。
- 窄屏变为底部抽屉；不能覆盖选中节点的主要动作。

### 6.6 CanvasViewControls

- 小地图开关、连线显示、吸附网格、适配视图和缩放显示。
- React Flow `snapToGrid`、`MiniMap` 与现有连接可见状态直接受控。
- 切换按钮使用 `aria-pressed`；小视口下保持完整矩形和可点击中心。

### 6.7 SelectionContextBar

- 图片节点显示“多角度、打光、分镜模板、高清、宫格拆分”等本地工具入口。
- 第一版为可验证的参数面板/节点创建预览，不调用外部模型。
- 只有用户点击“创建配置节点”后才写入项目，避免 Liblib 当前直接创建带来的误操作。

## 7. 交互与数据流

```text
顶部模式切换 ───────→ 工作流 / 故事板
左侧资源面板 ───────→ 新建节点 / 选择节点
画布选中节点 ───────→ 上下文工具 / Agent @上下文
生成队列结果 ───────→ 画布节点 / 历史面板 / 故事板
视频结果 ───────────→ 既有时间线 / 预览 / 导出
视图偏好 ───────────→ localStorage（不进入项目历史）
```

## 8. TDD 实施顺序

### Task 1：工作台顶栏与模式切换

RED：新增组件测试，证明当前缺少画布切换器、工作流/故事板、Agent 开关。  
GREEN：实现顶栏并接入 `CanvasPage`；保留撤销、重做、保存、预览、导出。  
VERIFY：模式键盘切换、项目切换重置、既有顶栏测试。

### Task 2：创建工具坞与左侧面板

RED：测试“添加节点”菜单、资产/历史/快捷键入口和面板互斥。  
GREEN：重组现有创建按钮并实现 `WorkspaceSidePanel`。  
VERIFY：新建节点仍走现有动作；Escape 关闭并回焦。

### Task 3：故事板

RED：测试按节点类型派生三个区块、空状态和返回来源节点。  
GREEN：实现 `CanvasStoryboardView` 并接入模式切换。  
VERIFY：切换不修改项目数据；返回工作流后正确选择节点。

### Task 4：Agent 面板

RED：测试默认关闭、打开/关闭、340px 语义和 DirectorComposer 复用。  
GREEN：实现右侧工作面板与窄屏抽屉布局。  
VERIFY：生成仍走现有确认/队列；关闭后焦点回到 Agent 按钮。

### Task 5：视图控制

RED：测试小地图、吸附、连线与适配视图。  
GREEN：将受控状态接入 React Flow 并持久化偏好。  
VERIFY：偏好变化不写项目历史，不破坏连线创建。

### Task 6：图片上下文工具

RED：测试仅图片节点出现工具、配置预览不写项目、确认后才创建。  
GREEN：实现本地参数面板和演示配置节点。  
VERIFY：取消无副作用，确认可撤销，项目刷新后保留。

### Task 7：集成与回归

- 运行相关 focused Vitest。
- 运行全部 Vitest。
- 运行 `npm run typecheck`。
- 运行 `npm run build`。
- `git diff --check` 与状态检查。
- 检查 1440×1024、721×778；实际 200% 只能在可验证的真实浏览器缩放下声明通过。

## 9. 验收标准

1. `/project/:projectId` 进入后显示新工作台骨架，核心画布仍可拖动、连接、生成、撤销和持久化。
2. 工作流/故事板可切换，故事板内容来自当前项目。
3. 添加节点菜单能够创建现有所有核心节点类型。
4. 左侧面板能够展示节点、资产、历史、快捷键和帮助，且不同时堆叠多个弹层。
5. Agent 默认收起；打开后约 340px，不遮挡主要画布操作。
6. 小地图、连线、吸附和适配视图可操作并有正确无障碍状态。
7. 图片上下文工具先预览、后创建，取消无副作用。
8. 不调用 Liblib 私有接口，不产生外部发布或付费行为。
9. Vitest、TypeScript 类型检查和生产构建全部通过。

## 10. 后续扩展

- 云端素材库、角色主体库与上传任务。
- 模型中心、积分估算和队列资源治理。
- Skill 市场与 Agent 多轮执行日志。
- 多画布服务端同步与协作权限。
- 真实发布/分享流程。
- 专业多轨时间线、音频和字幕编辑。

本阶段的实现以“可运行的工作台骨架 + 现有能力贯通”为完成标准，后续功能域在该结构上逐项增量，不再扩张单个巨型页面组件。
