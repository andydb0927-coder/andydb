# 全站冒烟清单

日期：2026-08-27。使用全新Chromium上下文；本地fixture开发页与mock dist分别验证。下列“既有E2E”在最终全量门禁实际重跑，不把读源码当浏览器操作。

| 域 | 真实操作/断言 | 对应证据或测试 |
|---|---|---|
| 首页 | 导航、标题、浅深系统偏好、新建 | stabilization-audit；home及heading截图 |
| 项目 | 新建、连续双击、搜索、刷新、切回旧项目 | stabilization-audit；project-a-reloaded、rapid-create |
| 作品 | 列表、发布本地作品、分享、只读view、无数据提示 | publication；missing-share矩阵 |
| Skills | 分类搜索、模型禁用原因、运行本地Skill、窄屏 | platform-shell；stabilization-audit |
| 挑战赛 | 列表、详情、规则奖项、去创作带赛事标签 | hosted-batch-3；challenge-detail矩阵 |
| 教程 | 分类、详情、上下篇、画布抽屉 | hosted-batch-3；tutorial-detail矩阵 |
| 积分会员 | 本地余额流水、支付待接入禁用 | hosted-batch-5；membership矩阵 |
| 帮助 | FAQ展开和AutoLink搜索 | hosted-batch-5；help矩阵 |
| 异常页 | 不存在路径中文恢复、返回首页、loader错误边界 | RouteErrorPage单测；unknown-route截图 |
| 画布创建 | 双击/工具坞/右键节点类型、上传媒体 | creation-flow与stabilization-audit |
| 画布面板 | 工具箱、资产管理、素材库、角色库、历史、快捷键、教程、Agent开关 | stabilization-audit；canvas面板截图 |
| 交互 | 节点拖动、框选、连线命中/新增/拒绝/删除/中点插入、撤销 | node-connections；creation-flow |
| 输入焦点 | 提示词输入Home/Delete不触发节点删除或移动 | stabilization-audit宽度矩阵 |
| 缩放控件 | 放大/缩小/适配图标普通和悬停态可读 | stabilization-audit对比度回归及zoom-controls截图 |
| 持久化 | 图片提示词及21:9/2张刷新保持；项目甲与乙隔离 | stabilization-audit |
| 多画布 | 新建、切换、重命名、删除、独立节点/连线/视口 | p0-b-interactions |
| 图片 | 参数、4张结果、编辑确认、镜像、切分、标注、全景与工具条 | creation-flow、ark-image-edit、ark-analysis、managed-canvas |
| 视频 | 模型模式联动、资格禁用、播放器、抽帧/裁剪、续作确认 | seedance-video-mode、creation-flow、ark-video-continue |
| 文本/脚本/音频 | 模型选择、内容回填、章节、音量语速、音频工具占位原因 | creation-flow、ark-text-llm、ark-audio |
| 导演台/智能剪辑/拉片 | 3D对象树、四视图导出、禁用服务原因、拉片报告 | creation-flow、ark-analysis、stabilization-audit |
| 分镜组 | 格数、序号字幕、排版、4K导出、整组演示执行 | managed-canvas |
| 评论/主体 | 评论编辑解决删除确认；主体本地保存跨项目复用 | collaboration单测、ark-final、stabilization-audit |
| 时间线 | 加入时间线、片段变速、入出点、画中画、刷新与返回画布 | p0-b-interactions；stabilization-audit |
| 导出 | PNG/SVG范围、工作流JSON结构/导入冲突、本地发布快照 | canvas-export、publication |
| 通知 | 完成通知、全部已读、刷新保持 | hosted-batch-5；基线偶发失败另列台账 |

## 视口矩阵与限制

- 一级及详情共13条路径，1440/1280/1024/800/721 × 100/125/150/200%，加390×100%，共273个路径/布局组合。每次均等待标题和路由加载完成，监听pageerror。
- 缩放用CSS视口`round(宽/倍数)`、`round(900/倍数)`实现布局等效；不声称验证浏览器工具栏缩放、真实触控板、Safari或Quark差异。
- 画布另测1440×900、1280×900、1024×900、800×778、721×778、720×450；390×844只判定不白屏。时间线另测1440/1024/721/720。
- 滚动页面允许滚动到操作项；不将可滚动长页面误判为遮挡。390不承担桌面全功能可用标准。
- 源码归类不等于逐按钮全组合穷举。极大项目、真实API质量、URL长期有效性、系统剪贴板权限、音视频硬件编码和真实多人协作不在本阶段证明范围。
