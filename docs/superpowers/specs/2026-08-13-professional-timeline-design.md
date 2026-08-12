# 无线画布步骤 4：专业剪辑模块设计规格

日期：2026-08-13  
状态：依据用户“不要询问用户，直接完成”执行  
范围：在现有画布、AI 导演、工作流执行与基础预览之上，增加浏览器内可持久化的专业剪辑工作区。

## 1. 现有基线与盘点

当前应用已经具备：

- `/project/:projectId/preview` 预览页、基础逐帧播放器、主视频顺序调整和演示导出面板；
- `Project.timeline` 的 `video | audio` 简单条目，随项目写入 Dexie；
- 视频节点上的“加入时间线”动作和 AI 导演的同名命令；
- 本地素材库的图片、视频、音频记录，以及画布节点到活动素材版本的引用；
- `WirelessCanvasDatabase` v4 的项目、素材库和工作流运行表。

现有入口是可复用的真实入口，不另建平行的画布按钮。当前限制是它只接受视频节点，且时间线条目无法表达轨道、入点/出点、分割、字幕或素材库来源。

## 2. 目标与非目标

### 2.1 目标

1. 将预览页升级为专业剪辑工作区，保留返回画布、连续性提示与既有逐帧能力。
2. 提供视频、音频、图片、字幕四种轨道；素材库记录和画布活动节点素材均可拖入或通过等价键盘按钮加入。
3. 片段支持选择、轨内前移/后移、入点/出点裁剪、在播放头处分割和删除。
4. 播放器支持播放/暂停、跳转、1/24 秒逐帧、时间刻度、当前帧预览、当前片段循环和相邻镜头对比。
5. 时间线选择和播放头驱动当前预览；返回画布链接携带来源节点 `focus`。
6. 新 `TimelineProject` 聚合写入 Dexie，刷新后恢复；加载时幂等吸收旧 `Project.timeline`，使画布“加入时间线”立即成为剪辑片段。
7. 提供版本化 JSON 和 CMX 3600 风格 EDL 下载。
8. 浏览器具备 `canvas.captureStream` 与 `MediaRecorder` 时允许录制播放器画布；不具备时明确显示降级说明。

### 2.2 非目标

- 不调用 LibTV、任何外部生成服务或积分接口。
- 不新增后端、上传、转码队列、云端存储或服务端依赖。
- 不实现 FFmpeg/WASM 合成、转场、调色、音频混音、波形分析或关键帧动画。
- 不承诺 MediaRecorder 输出为 MP4；容器和编码由浏览器支持能力决定。
- 不执行 Chromium E2E；验收门为 Vitest、TypeScript typecheck 和 Vite build。

## 3. 领域模型

`TimelineProject` 是独立、版本化的编辑聚合，以项目 id 作为主键：

```ts
type TimelineTrackKind = 'video' | 'audio' | 'image' | 'subtitle'

interface TimelineClip {
  id: string
  trackId: string
  kind: TimelineTrackKind
  name: string
  order: number
  startSeconds: number
  sourceInSeconds: number
  sourceOutSeconds: number
  source: {
    type: 'canvas-node' | 'library-asset' | 'subtitle'
    nodeId?: string
    assetId?: string
    url?: string
    mimeType?: string
  }
  text?: string
  legacyTimelineItemId?: string
}

interface TimelineProject {
  id: string
  projectId: string
  schemaVersion: 1
  frameRate: 24
  width: 1920
  height: 1080
  tracks: TimelineTrack[]
  createdAt: string
  updatedAt: string
}
```

每类默认一条轨道。片段时长等于 `sourceOutSeconds - sourceInSeconds`；轨内排序会连续重排 `startSeconds`。显式保存来源 URL、MIME 和素材 id，使素材库片段即使未挂到画布也能预览和导出编辑决策。

## 4. 旧时间线兼容与画布联动

- 首次打开剪辑页时，将每个旧 `Project.timeline` 条目转换为带 `legacyTimelineItemId` 的新片段。
- 每次加载都按该 id 做幂等合并，因此画布稍后新增的分镜/视频也会进入已有专业时间线，已裁剪的旧片段不会被覆盖。
- 分镜和视频节点只要活动版本引用图片或视频素材，就显示“加入时间线”；重复规则仍由旧项目时间线阻止。
- 对迁移自旧时间线的视频顺序进行调整时，同时调用现有项目 store 的重排并持久化项目，保持画布节点列表顺序和旧数据消费者一致。
- 片段的“返回画布”链接使用 `/project/:id?focus=:nodeId`。

## 5. 编辑规则

- 新素材放到其媒体类型对应轨道末尾；字幕由文本和默认 3 秒时长创建。
- 轨内前移/后移是不可变操作，并重新编号和连续排列片段。
- 裁剪要求 `0 <= in < out <= sourceDuration`；无可靠媒体时长时以当前片段可用范围为上限。
- 分割点必须严格位于片段内部；两个结果共享来源，前段终点和后段起点都落在分割源时间。
- 删除后重排同轨剩余片段；空轨保留。
- 所有有效编辑立即更新 UI，并通过串行保存链写入 Dexie，避免旧写入覆盖新状态。

## 6. 预览与录制

- 播放头以秒为单一事实源，逐帧步长固定为 `1 / 24`。
- 播放使用 `requestAnimationFrame`；不可用时使用定时器等价推进，抵达总时长后暂停。
- 当前视觉片段从视频/图片轨中按时间命中；当前字幕叠加到预览画布；活动音频元素跟随播放头同步。
- HTML 媒体是可见预览来源，同时尝试绘制到 1920×1080 比例的 canvas。录制仅在画布捕获和 MediaRecorder 同时可用时启用。
- MediaRecorder 录制的是当前预览画布流，不包含本阶段未实现的浏览器音频混音；UI 明示该限制。

## 7. Dexie 与导出

数据库升级到 v5：

```ts
timelineProjects: 'id, projectId, updatedAt'
```

`TimelineRepository` 提供 `load` 与 `save`。升级不重写、删除或迁移 v1–v4 数据。

- JSON：导出 `format`、`version`、项目设置、轨道和所有编辑字段。
- EDL：以帧率换算时间码，输出视觉轨片段的来源入点/出点与时间线入点/出点，并用注释保留名称、来源 id 与轨道类型。
- 下载使用浏览器 Blob/Object URL；缺少 Object URL 时退化到 data URL。

## 8. 可访问性与界面

- 素材条目具有 `draggable`，每条轨道是命名 drop zone，并提供“加入某轨”按钮作为键盘等价操作。
- 播放、跳转、逐帧、排序、裁剪、分割和删除控件均有稳定中文可访问名称。
- 当前片段使用 `aria-current`，播放时间使用 `output`，保存/导出/录制反馈使用 `aria-live`。
- 宽屏为播放器/检查器与下方时间线布局；窄屏纵向堆叠并保持轨道横向滚动。

## 9. 验收边界

自动化必须证明：

1. 四轨创建、旧时间线幂等迁移、素材加入、排序、裁剪、分割、删除与总时长计算正确。
2. Dexie v4 可升级，时间线聚合完整 round-trip，项目之间隔离。
3. JSON/EDL 内容、时间码和浏览器录制能力检测正确。
4. 编辑器可从素材库/画布加入片段，播放头与选择联动，编辑后持久化。
5. 现有逐帧、循环、对比、缺失片段、画幅提示、返回画布和旧顺序持久化回归通过。
6. 画布分镜/视频的一键加入入口可用且不调用任何生成或外部适配器。
7. 全量 Vitest、typecheck 和 build 通过；`git diff --check` 通过；不 commit。

