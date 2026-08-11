# 无线画布第 2A 阶段：本地素材库与生成提供方边界设计规格

日期：2026-08-11

状态：已确认，待实施

范围：建立独立、可跨项目复用的本地素材库，并解除画布对演示生成适配器的硬编码；不调用外部 LibTV，不消耗远程额度。

## 1. 目标

把第 1 阶段的“素材与历史”只读视图升级为可持续使用的本地素材库。用户可以上传图片、视频和音频，搜索与筛选素材，了解素材来源和项目引用，并把图片或视频直接加入指定项目后进入画布继续创作。

同时保留现有 `GenerationAdapter` 与 `GenerationQueue`，让 `CanvasPage` 接受可注入的生成适配器。默认行为仍是 `DemoGenerationAdapter`，但后续真实提供方不再需要改写画布页面。

## 2. 约束与保护边界

- 不调用 `libtv upload`、`libtv project create`、`libtv node create` 或任何远程生成命令。
- 不新增令牌、Cookie、账号或会员配置界面。
- 不删除素材，不增加具有破坏性的批量操作。
- 不迁移或重写现有 `Project` 记录；既有项目继续保存自己的 `Asset[]` 快照。
- `/`、`/assets`、`/project/:projectId` 和 `/project/:projectId/preview` 保持兼容。
- 现有节点、连线、生成队列、版本、预览、导出、持久化与键盘可访问性必须保持。
- `audit-2026-08-06/` 不得读取、改动、删除、暂存或提交。
- 单文件上传上限为 20 MiB，只接受 MIME 类型以 `image/`、`video/` 或 `audio/` 开头的文件。

## 3. 方案比较与选定方案

### 3.1 扫描所有项目临时聚合

优点是无需数据库升级。缺点是未加入项目的素材无法存在，重复素材无法稳定识别，上传、跨项目复用和后续集合能力都缺少主数据。拒绝。

### 3.2 独立本地素材表，项目保留快照

新增独立 `libraryAssets` 表作为素材目录；项目继续嵌入既有 `Asset[]`，从而不破坏当前画布、版本和预览读取链路。素材库记录保存名称、来源、创建时间、文件大小和内容指纹，项目只复制渲染所需的 `Asset` 字段。选定。

### 3.3 以 LibTV 远程素材为主数据源

能直接对齐远程工作区，但会引入登录、额度、网络失败、远程写入与数据归属语义。留给真实生成阶段，不在本阶段实施。

## 4. 数据模型与持久化

Dexie 数据库升级到版本 2，保留 `projects: 'id, updatedAt'`，新增：

```ts
libraryAssets: 'id, createdAt, kind, source, name, fingerprint'
```

素材库记录定义为：

```ts
type LibraryAssetSource = 'upload' | 'generated' | 'project' | 'built-in'

interface LibraryAssetRecord {
  id: string
  name: string
  kind: Asset['kind']
  mimeType: string
  url: string
  createdAt: string
  source: LibraryAssetSource
  fingerprint?: string
  byteSize?: number
  width?: number
  height?: number
  durationSeconds?: number
}
```

`AssetLibraryRepository` 与 `ProjectRepository` 使用同一个 `WirelessCanvasDatabase` schema：

- `list()` 按 `createdAt` 倒序返回独立素材记录。
- `load(id)` 返回单条素材。
- `importFile(file)` 验证 MIME 与 20 MiB 上限，计算 SHA-256 内容指纹，将文件保存为 data URL；相同指纹返回已有记录而不重复写入。
- `save(record)` 保存明确构造的素材记录。
- `ProjectRepository.save(project)` 在同一事务中保存项目，并为项目内尚未入库的素材补充目录记录；已有素材库元数据不会被降级覆盖。

从旧项目补入素材库时，名称优先取引用该素材的节点标题，创建时间优先取节点版本时间。若生成任务引用该素材，来源为 `generated`；内置 `/demo/` 资源为 `built-in`；其余旧记录为 `project`。

## 5. 素材导入与重复处理

`asset-import.ts` 负责纯验证和浏览器文件读取：

1. MIME 不受支持时返回“仅支持图片、视频或音频文件”。
2. 文件超过 20 MiB 时返回“单个素材不能超过 20 MiB”。
3. 文件内容使用 `crypto.subtle.digest('SHA-256', bytes)` 生成指纹。
4. data URL 与元数据同时保存到 IndexedDB。
5. 指纹已存在时返回 `{ status: 'existing', record }`；新写入返回 `{ status: 'created', record }`。

上传失败不会改动项目，也不会清空当前筛选条件。成功或重复命中会通过 `role="status"` 给出明确反馈。

## 6. 素材与历史页面

`/assets` 保持单一路由和一级标题“素材与历史”，页面分为两个真实区域：

### 6.1 素材库

- 上传入口：支持键盘触发的文件选择控件。
- 搜索：按素材名称进行不区分大小写的包含匹配。
- 类型筛选：全部、图片、视频、音频。
- 列表：显示名称、类型、来源、创建时间、文件大小或媒体尺寸。
- 项目目标：从最近项目中选择一个目标项目。
- 使用操作：图片和视频可以“添加到项目并打开画布”；音频显示“将在专业剪辑阶段使用”，本阶段不创建音频节点。

### 6.2 项目历史

保留第 1 阶段已有的项目选择、节点版本、生成任务和导出记录。素材清单改为展示当前项目对素材库记录的引用，不删除任何现有信息。

## 7. 跨项目使用

纯函数 `attachLibraryAssetToProject(record, project, environment)` 返回更新后的项目与新节点：

- 素材已存在于目标项目时复用同一 `Asset`，不重复添加。
- 图片创建 `image` 节点，视频创建 `video` 节点。
- 节点标题使用素材名称，首个版本提示词为“来自素材库：{名称}”。
- 节点位置放在当前最右侧节点右方 340px；纵向按同列冲突每次增加 220px。
- 保存成功后激活更新后的项目，并导航到 `/project/:projectId?focus=:nodeId`。
- 保存失败时停留在素材页并显示错误，不产生内存中的假成功状态。

重复点击同一素材仍会创建新的画布节点，但项目内只保留一份 `Asset` 数据；这是“多次使用同一素材”，不是重复导入。

## 8. 生成提供方边界

`CanvasPageProps` 新增：

```ts
generationAdapter?: GenerationAdapter
```

未传入时使用 `DemoGenerationAdapter`。`GenerationQueue` 使用该 prop 构建，生命周期和任务恢复规则不变。测试使用自定义内存适配器证明画布能消费注入结果；生产路由不注入远程适配器。

模型能力页继续明确显示“本地演示适配器”和“真实提供方未配置”，不增加无效的连接按钮。

## 9. 错误与可访问性

- 上传类型、大小、读取和持久化错误使用 `role="alert"`。
- 上传成功、重复素材与添加到项目成功使用 `role="status"`。
- 搜索和类型筛选使用真实 label、input 与 radio；不以仅图标控件承载必要语义。
- 素材操作按钮包含素材名称，避免读屏用户遇到重复的“使用”按钮。
- 加载和保存期间禁用相应按钮并使用 `aria-busy`。
- 页面错误不影响历史区域读取；历史读取错误不丢失已加载素材库。

## 10. 测试与完成定义

所有生产行为必须先有失败测试，并确认失败原因为目标行为缺失。

1. `AssetLibraryRepository`：Dexie v1 到 v2 兼容、导入、指纹去重、项目保存补录和元数据不降级。
2. `asset-import`：允许类型、拒绝类型、20 MiB 边界与稳定 SHA-256。
3. `attachLibraryAssetToProject`：图片/视频节点、资产去重、位置冲突和音频拒绝。
4. `AssetsHistoryPage`：上传、搜索、筛选、重复反馈、目标项目选择、跨项目使用和错误状态。
5. `CanvasPage`：注入适配器的结果进入版本、素材和持久化链路。
6. 浏览器关键路径：创建项目、进入素材页、上传本地图片、筛选、加入目标项目、进入聚焦画布、打开预览；控制台无错误。
7. 门禁：focused Vitest、全量 Vitest、typecheck、build、全量 Playwright、`git diff --check` 和提交范围审查。

## 11. 非目标与后续入口

本阶段不实现素材删除、集合、复杂标签、批量操作、云同步、远程 URL 导入、音频节点、远程模型选择、真实生成、额度展示或 LibTV 账户绑定。

完成后下一阶段从真实生成提供方开始：以本阶段的 `GenerationAdapter` 注入点连接受控运行时，并单独设计模型参数、任务轮询、取消、成本确认、凭据隔离和远程失败恢复。
