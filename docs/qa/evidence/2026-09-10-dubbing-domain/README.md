# 出海转绘领域层验收证据

实施日期：2026-09-09 至 2026-09-10。前置提交：`9bb6b80`，分支 `codex/platform-shell-phase`。

| 文件 | 实际结果 |
| --- | --- |
| logs/red.log | 三个领域实现不存在，三个套件按预期报红 |
| logs/hardening-red.log | 数字例外与损坏返修记录测试报红，38 通过 / 2 失败 |
| logs/targeted-green.log | 新增领域单测 40/40 通过 |
| logs/vitest-concurrent-timeout.log | 与外部浏览器套件同时运行时，现有尺寸用例超时；1681 通过 / 1 失败；保留不覆盖 |
| logs/typecheck.log | 独立重跑类型检查，退出 0 |
| logs/vitest.log | 独立重跑全量单测，209 文件 / 1682 通过，退出 0 |
| logs/build-mock.log | mock 构建及 68 个文本产物敏感配置检查通过，退出 0 |
| logs/playwright.log | fixture 浏览器全量 146/146，11.7 分钟，退出 0 |
| playwright-last-run.json | 浏览器最终 passed，failedTests 为空 |
| logs/bundle-compatibility.log | 前置提交构建的 73 个文件逐一 SHA-256 校验通过 |

类型检查、全量单测、mock 构建、浏览器回归按序执行。独立端口 4193、全新 BrowserContext，不清用户数据、不调用付费 API。新增领域文件没有产品入口，沿用全部现有 E2E 做兼容回归，不伪造新 UI 截图。

归档日志仅清理行尾空白与文件尾多余空行，以通过仓库空白检查；失败、诊断与计数均保留。

日志包含 localhost:3000 连接拒绝、构建 chunk 大小、NO_COLOR 以及一条 ResizeObserver 布局通知错误。本批最终测试通过，但不是“全站控制台零错误”结论。原有及并行验收证据在本轮结束后按事前备份恢复，不混入领域层提交。

完整规则与边界见 `docs/superpowers/specs/2026-09-05-dubbing-export-domain.md`。客户 PDF 是需求来源，本目录不发布原件；检查方式字段不代表自动检查已经执行。
