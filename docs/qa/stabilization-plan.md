# 全站稳定化计划

起点：`f1e098d71b7a047ddc95321ae83df835b7e217fb`。工作分支：`codex/current-product-stabilization`。不部署、不推送生产，不改已接真实API传输/Provider代码，不读取 `.env.local`。

## 执行边界

- 基线先运行 typecheck → test:run → build:mock → PLAYWRIGHT_OFFLINE_DIST=dist Playwright。先记录失败，不立即修复。
- 使用全新 Playwright BrowserContext、测试端口和fixture；浏览器可视化复核使用独立本地端口。不得访问用户线上项目、清空用户 IndexedDB/localStorage。
- 1440/1280/1024为主验；800/721覆盖缩放与操作可达性；390仅保证不白屏。100/125/150/200%按等效CSS布局视口验证并明确记录，不把设备像素比当浏览器缩放。
- 未接真实API、明确Mock、清楚标注的待接入不是BUG。P0数据风险/阻断、P1核心流程不可用、P2明显体验问题、P3仅记录。
- 修复遵守最小差异；回归测试先红后绿；不删失败测试、不用any、不吞异常、不隐藏功能、不用!important叠补丁。
- 起始三个已修改的 `design-qa-evidence/*.png` 已备份到临时目录，门禁后恢复原字节，不纳入本批提交。

## 11个交付文件（docs/qa根目录）

1. `stabilization-plan.md`：范围与验收约定。
2. `baseline-test-results.md`：原始门禁结果及原始日志链接。
3. `current-product-bug-ledger.csv`：BUG分级、复现、根因、修复、证据。
4. `current-feature-status.csv`：按源码核实的功能状态。
5. `site-smoke-checklist.md`：全站冒烟与操作清单。
6. `regression-test-matrix.md`：视口/缩放/交互/测试映射。
7. `decision-log.md`：范围决策与不修原因。
8. `rollback-plan.md`：提交级回滚和兼容性。
9. `evidence-index.md`：before/after截图与日志索引。
10. `final-test-results.md`：最终门禁与基线对照。
11. `current-product-stabilization-report.md`：A–I最终报告。

证据、日志放 `evidence/` 子目录，不计为根目录交付文档；三份旧审计保留历史正文并加当前勘误/状态入口。

## 最终报告A–I

A范围与分支；B安全与基线；C审计覆盖；D分级结果；E修复与回归；F功能状态；G最终门禁；H限制与遗留；I交付与回滚。
