# 无线画布线上版全站浏览验收

> 终验索引（2026-08-29）：下文是历史线上验收，不能代替当前构建结果。本轮不部署生产；当前HEAD的本地mock产物、隔离浏览器及完整回归见[全站终验报告](../../qa/final-acceptance-report.md)。

> 本地稳定化补记（2026-08-27，起点f1e098d）：下文为先前线上验收记录。本轮没有访问用户线上项目、没有推送部署；本地mock构建与隔离fixture回归另见[稳定化报告](../../qa/current-product-stabilization-report.md)和[当前功能状态](../../qa/current-feature-status.csv)。不能把本轮本地通过写成线上已经修复。

- 验收时间：2026-08-27（Asia/Shanghai；文件名按任务约定）
- 线上地址：<https://andydb0927-coder.github.io/andydb/>
- 运行模式：GitHub Pages / mock 模式
- 主验收视口：1440 × 1024；画布补充检查：721 × 778
- 检查方法：逐路由直接访问、可见 DOM 与交互核对、截图、控制台 error/warn、破图与横向溢出检查

## 一级页面

| 页面 | 路由 | 状态 | 发现 | 截图 |
| --- | --- | --- | --- | --- |
| 首页 | `/` | 通过 | Hero、创意输入、Skill、产品特性、最近项目和社区作品正常；无破图、白屏、溢出或控制台错误。 | [01-home.png](./evidence/2026-08-28-site-acceptance/01-home.png) |
| 项目 | `/projects` | 通过 | 空状态正常；新建项目后列表即时出现本地项目卡，打开入口可达。 | [02-projects.png](./evidence/2026-08-28-site-acceptance/02-projects.png) |
| 作品 | `/works` | 通过 | 本地演示作品卡、封面、标签、浏览量和点赞数正常；作品详情可打开。 | [03-works.png](./evidence/2026-08-28-site-acceptance/03-works.png) |
| Skills | `/agents` | 通过 | 模型/生成模式输入区、分类筛选、搜索和 Skill 卡片网格正常。 | [04-skills.png](./evidence/2026-08-28-site-acceptance/04-skills.png) |
| 挑战赛 | `/challenges` | 通过 | 三张挑战赛卡片、状态筛选和详情入口正常；首个详情页的时间线、赛道、规则、奖项和示例作品均渲染。 | [05-challenges.png](./evidence/2026-08-28-site-acceptance/05-challenges.png) |
| 教程 | `/tutorials` | 通过 | 入门、图片创作、视频创作、高级四类教程正常；`/tutorials/create-project` 详情页可达，步骤与上一篇/下一篇结构正常。 | [06-tutorials.png](./evidence/2026-08-28-site-acceptance/06-tutorials.png) |
| 积分会员 | `/membership` | 通过 | 本地积分余额、三档套餐和积分流水空状态正常；支付入口明确标记“支付待接入”。 | [07-membership.png](./evidence/2026-08-28-site-acceptance/07-membership.png) |
| 帮助 | `/help` | 通过 | 24 条 FAQ、五类分组和本地搜索入口正常；“查看完整教程”可达。 | [08-help.png](./evidence/2026-08-28-site-acceptance/08-help.png) |

## 画布工作台与托管五批功能

| 检查项 | 状态 | 结果与证据 |
| --- | --- | --- |
| 新建项目进入画布 | 通过 | 一键创建后进入 `/project/:projectId`；项目保存状态、工作流/故事板、工具坞、视图控制均正常。[画布截图](./evidence/2026-08-28-site-acceptance/09-workspace.png) |
| 多画布 | 通过 | “画布 1”菜单可展开，包含新建、重命名、切换、删除及“每个画布独立保存节点、连线与视口”说明。 |
| 图片节点与 Slash | 通过 | 图片 composer、模型、参数摘要、成本和生成按钮正常；Slash 面板含预设、工具命令、参数预览，键盘提示完整。[Slash 截图](./evidence/2026-08-28-site-acceptance/11-image-slash.png) |
| 图片结果与全景入口 | 通过 | mock 图片生成成功并回填节点；结果工具条出现“全景预览”，查看器支持拖拽、缩放和重置视角。[全景截图](./evidence/2026-08-28-site-acceptance/12-panorama.png) |
| 视频节点 | 通过 | 模型、生成模式、比例/时长/清晰度/声音、成本与高级设置正常；待接 API 状态有明确原因。[视频节点](./evidence/2026-08-28-site-acceptance/13-video-node.png) |
| 文本节点 | 通过 | 文本编辑、快捷尝试、模型选择与生成区正常。[文本节点](./evidence/2026-08-28-site-acceptance/14-text-node.png) |
| 音频节点 | 通过 | 音频模型、提示词、音色、语速、音量、格式、采样率、时长与成本正常；待接能力有原因文案。[音频节点](./evidence/2026-08-28-site-acceptance/15-audio-node.png) |
| 导演台 3D | 通过 | 3D 基础视口、对象树、几何体/人形素模、透视/正交与四视图控制正常；轨迹入口按规范禁用并显示待接原因。[导演台](./evidence/2026-08-28-site-acceptance/16-director-3d.png) |
| 主体库 | 通过 | 角色库内“本地主体”区域、跨项目复用说明、筛选和角色卡正常；当前浏览器为 0 个本地主体时空状态正确。[主体库](./evidence/2026-08-28-site-acceptance/17-subject-library.png) |
| 分镜组 | 通过 | 左键框选可一次选中 5 个节点；组合操作出现“整组执行”和“转换为分镜组”；设置弹窗支持 2x2、2x3、3x3、自定义，容量不足的 2x2 正确禁用。[分镜组](./evidence/2026-08-28-site-acceptance/18-storyboard-group.png) |
| 教程详情与帮助中心 | 通过 | 教程详情、分类导航、操作步骤及前后篇入口正常；帮助中心 FAQ 与搜索正常。[教程详情](./evidence/2026-08-28-site-acceptance/10-tutorial-detail.png) |

## 路由与控制台

- 八个一级路由均通过 GitHub Pages 直接访问验证，SPA 回退正常。
- 补充验证 `/tutorials/create-project`、`/activity/director-master`、`/detail/demo-work-frost-river`，均可正常渲染，无死链。
- 全部页面与上述交互期间，控制台 `error` / `warn` 为 0；未发现破图、白屏或桌面视口横向溢出。
- 721 × 778 下画布无横向页面溢出，添加节点、Agent 与 Fit View 保持可见；更窄的手机级视口不是本次桌面画布验收基线。

## 结论

本次线上 mock 版全站浏览验收通过。未发现需要修改代码的页面报错、白屏、明显样式崩坏或死链，因此未执行代码修复、全量门禁、提交或推送；本次仅新增验收报告与截图证据。
