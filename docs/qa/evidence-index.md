# 证据索引

所有图片来自本地测试页面，不包含真实Key或用户线上项目数据。before是修复前，after是修复后重跑；没有用生成图片替代测试截图。

| 内容 | before | after |
|---|---|---|
| 默认preview白屏 | before/BUG-001-preview-white.png | after/BUG-001-preview-home.png |
| 未知路由 | before/unknown-route.png | after/unknown-route.png |
| 连续新建 | before/rapid-create.png | after/rapid-create.png |
| 浅色系统标题 | before/heading-light.png | after/heading-light.png |
| Skills721 | before/skills-721-100.png | after/skills-721-100.png |
| 空视频生成 | before/empty-video-generation.png | after/empty-video-generation.png |
| 缩放控件低对比度 | before/BUG-010-controls.png及BUG-010-red.log | after/zoom-controls-*.png及BUG-010-green.log |
| 缩放控件遮挡 | before/BUG-011-controls-overlap.png及BUG-011-red.log | after/zoom-controls-720-minimap.png |
| 窄屏引导区覆盖视图栏 | before/BUG-012-starter-overlap.png及BUG-012-red.log | after/zoom-controls-720-minimap.png |
| 多结果被提示词面板覆盖 | before/BUG-013-image-results-overlap.png及BUG-013-red.log | after/image-four-results.png及BUG-013-green.log |

以上路径均相对`docs/qa/evidence/`。

## 全站与画布

- `before/route-matrix.json`及`after/route-matrix.json`：273组合的页面名、宽度、等效缩放、实际CSS宽度、横向溢出和标题；附pageerror数组。
- `before|after/{home,projects,works,skills,challenges,tutorials,membership,help,tutorial-detail,challenge-detail,work-detail,creation-process,missing-share}-{1440,721,390}-100.png`：各页面代表性首屏。
- `before|after/canvas-*-1440.png`和`canvas-*-721.png`：工具箱、资产管理、素材库、角色库、历史、快捷键、教程打开状态。
- `before|after/canvas-image-<width>x<height>.png`：选中图片参数区与输入后状态。
- `after/project-a-reloaded.png`：项目甲刷新恢复；`after/timeline-*.png`：时间线滚动到核心编辑区后的可操作状态。
- `after/image-four-results.png`、`after/canvas-comments.png`、`after/node-*.png`：fixture多结果及其他节点面板。
- `after/canvas-console.json`：专项画布未处理错误与console.error记录。最终门禁日志不省略失败或警告。
- `after/in-app-final-canvas.png`与`after/in-app-final-console.json`：内置浏览器默认mock预览与无警告/错误日志。

## 日志

- `baseline/`：不可改写的原始typecheck、Vitest、build:mock、Playwright输出及通知失败上下文。
- `final/`：最终四道门禁日志、Vitest JSON和安全/差异检查摘要。
- Playwright原始trace留在临时备份或app/test-results，不把大体积trace当日常源码提交；关键失败信息已写入台账与基线文档。
