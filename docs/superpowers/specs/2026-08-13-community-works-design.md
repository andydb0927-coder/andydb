# 无线画布步骤 5：社区作品模块设计规格

日期：2026-08-13  
状态：依据用户“不要询问用户，直接完成”执行  
范围：在现有平台导航、项目、专业时间线与本地 Dexie 之上，增加纯本地的发现、作品详情、互动与个人作品管理。

## 1. 现有基线与盘点

当前应用已经具备：

- 平台导航中的 `/discover`“发现与作品”入口；
- `/discover` 内置示例项目占位页，但没有作品领域数据、筛选、互动、详情或个人管理；
- `/project/:projectId/preview` 专业时间线页，以及可独立复用的受控 `PreviewPlayer`；
- `TimelineProject` 四轨编辑聚合与 Dexie v5 `timelineProjects` 表；
- 项目、素材库、工作流和时间线均为本地持久化，无需后端。

现有入口继续保留并升级，不新增平行的“社区”一级导航，也不改变画布与生成链路。

## 2. 目标与非目标

### 2.1 目标

1. 将 `/discover` 升级为作品墙，展示封面、标题、作者、标签、时长、浏览、点赞和收藏数据。
2. 支持关键词、标签筛选，以及最新/最热排序；筛选和排序只作用于已发布作品。
3. 作品卡可进入 `/discover/:workId` 详情页；详情页复用专业时间线 `PreviewPlayer`，并提供点赞、收藏、浏览计数和相关推荐。
4. `/discover/mine` 提供个人作品管理：列出本地时间线项目及其发布状态，支持填写作者/标签后发布、重新发布、下架，并查看数据。
5. 所有作品、互动和浏览计数写入 Dexie；首次空库幂等预置少量演示作品，便于离线展示。
6. 发布采用不可变快照：保存作品元数据、项目快照和时间线快照，使详情预览不依赖原项目是否仍存在，也不被后续编辑静默改变。

### 2.2 非目标

- 不调用 LibTV、任何外部 API、生成适配器、积分或计费接口。
- 不新增账号系统、真实多用户身份、评论、关注、分享链接、云同步、审核或推荐算法服务。
- 不上传媒体、不复制 Blob 到服务器；本地 Blob URL 的寿命仍受浏览器本地数据边界约束。
- 不执行 Chromium E2E；验收门为 Vitest、TypeScript typecheck 和 Vite build。

## 3. 领域模型

`PublishedWork` 是 Dexie 中的发布快照：

```ts
type WorkStatus = 'published' | 'unlisted'

interface PublishedWork {
  id: string
  projectId: string
  title: string
  author: string
  tags: string[]
  coverUrl: string
  durationSeconds: number
  status: WorkStatus
  publishedAt: string
  updatedAt: string
  projectSnapshot: Project
  timelineSnapshot: TimelineProject
  metrics: { views: number; likes: number; favorites: number }
  viewer: { liked: boolean; favorited: boolean }
}
```

- 一个本地项目最多对应一个作品记录，`projectId` 建唯一索引；重新发布覆盖快照和元数据，但保留既有互动数据与首次发布时间。
- 封面取时间线第一个有 URL 的视觉片段；没有可预览视觉片段的时间线不可发布。
- 时长由 `getTimelineDuration` 计算，标签去空、去重并限制数量与单项长度。
- 下架只把状态改为 `unlisted`，不删除数据；作品墙和相关推荐不再显示，个人列表仍可查看与重新发布。
- “最热”使用稳定的本地加权分数：`views + likes * 4 + favorites * 6`，同分时以发布时间倒序。

## 4. Dexie 与仓储

数据库升级到 v6：

```ts
publishedWorks: 'id, &projectId, status, publishedAt, updatedAt'
```

`CommunityRepository` 提供：

- `ensureDemoWorks()`：仅在作品表为空时原子写入演示作品；重复调用不重复插入；
- `listPublished(filter)`：按关键词/标签过滤并按最新/最热排序；
- `get(id)` 与 `listMine()`；
- `publish(project, timeline, input)` 与 `setStatus(id, status)`；
- `recordView(id)`、`toggleLike(id)`、`toggleFavorite(id)`，计数不会降到零以下。

所有更新使用 Dexie 事务读取当前记录再写回，避免快速互动导致读改写覆盖。

## 5. 页面与路由

### 5.1 `/discover` 作品墙

- 页头保留“发现与作品”，增加“我的作品”入口。
- 搜索框匹配标题、作者和标签；标签筛选由当前已发布作品聚合生成。
- 最新/最热用单选或等价可访问控件切换。
- 卡片展示封面、时长、作者、标签、三项互动数据，并以整卡详情链接进入作品页。
- 加载失败显示可重试错误；无匹配结果显示空状态。

### 5.2 `/discover/:workId` 作品详情

- 成功载入已发布作品时，将其快照解析为 `ResolvedTimelineProject` 并交给现有 `PreviewPlayer`。
- 首次详情挂载记录一次浏览；React Strict Mode 或依赖变化不得造成重复计数。
- 点赞/收藏按钮展示本地访客状态和即时计数。
- 相关推荐取同标签的已发布作品，排除当前作品，最多 3 条；不足时用其它已发布作品补齐。
- 不存在或已下架作品显示不可用状态，并提供返回作品墙链接。

### 5.3 `/discover/mine` 个人作品

- 联合读取本地 `timelineProjects`、对应项目和作品记录。
- 时间线具备至少一个视觉片段时可发布；发布表单提供标题、作者和逗号分隔标签，默认标题来自项目。
- 已发布作品可下架；已下架作品可重新发布；所有状态显示浏览、点赞和收藏数据。
- 项目或时间线缺失时不猜测/补造，显示明确状态并保留其它可用条目。

## 6. 演示数据

- 空库预置 3 个本地演示作品，使用仓库已有 `/demo/*.png`，不发起网络请求。
- 演示作品包含不同作者、标签、发布时间和互动数，以便直接验证搜索、标签、最新/最热和相关推荐。
- 演示数据仍是普通 `PublishedWork`，互动后按同一仓储规则持久化；不自动创建到“我的作品”项目列表。

## 7. 可访问性与界面

- 搜索、标签、排序、点赞、收藏、发布和下架均有稳定中文可访问名称。
- 互动按钮用 `aria-pressed` 表达状态；加载/保存反馈使用 `role=status` 或 `role=alert`。
- 卡片封面提供与作品标题一致的替代文本；时长和计数使用可读中文。
- 宽屏作品墙使用响应式网格，窄屏变为单列；详情播放器和信息栏纵向堆叠，避免水平溢出。

## 8. 验收边界

自动化必须证明：

1. 发布快照、封面/时长/标签归一化、重新发布与不可发布条件正确。
2. Dexie v5 可升级，演示种子幂等，作品 round-trip、项目唯一性、下架和互动持久化正确。
3. 作品墙关键词/标签筛选、最新/最热排序和详情导航正确。
4. 详情页复用 `PreviewPlayer`、浏览只计一次、点赞/收藏切换和相关推荐正确。
5. 个人列表可从真实本地时间线发布、下架、重新发布并查看数据。
6. 路由与平台导航回归通过，不调用外部服务或积分链路。
7. 全量 Vitest、typecheck 和 build 通过；`git diff --check` 通过；不 commit。
