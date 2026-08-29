# 批次10终验证据

2026-08-29；对应HEAD `ba7b58451840f299dd56b4897bec1e6d919656d9`。

- `gate-results.json`：修复后最终有序门禁、退出码、基线与新增用例区分；是最终结果的权威摘要。
- `typecheck.log`、`vitest.log`、`build-mock.log`、`playwright.log`：首轮终验原始输出，作为修复前证据保留。
- `initial-diagnostics.tar.gz`：首次准备构建、端口权限、浏览器模块导入与trace堆上限诊断；不作为最终通过结果。
- `routes-links-console.json`：修复后43路由、518个可见链接，零失败、零浏览器warning。
- `viewport-console.json`：修复后55页面/视口组合；五档预览页document overflow均为0。
- `legacy-route-matrix.json`：原回归273个等效缩放组合；仅pageerror采集，不冒充console warn采集。
- `legacy-canvas-console.json`：既有节点面板专项错误采集。
- `in-app-navigation.json`、`in-app-menu-console.json`及`in-app-*.png`：首轮缺陷的修复前证据；没有使用用户原浏览器数据库。
- `route-*.png`、`preview-*.png`、`canvas-*.png`：修复后静态产物fixture截图；`broken-link-519.png`保留为修复前对照。

注意：预览fixture引用未随静态示例交付的`/demo/rain.mp3`，截图中音轨不可播放提示不计作真实服务回归。最终验收结论见[终验报告](../../final-acceptance-report.md)。
