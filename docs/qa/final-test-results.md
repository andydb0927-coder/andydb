# 稳定化最终门禁

日期：2026-08-27。分支：`codex/current-product-stabilization`。起点：`f1e098d71b7a047ddc95321ae83df835b7e217fb`。

## 最终顺序与实测

| 顺序 | 命令（app目录） | 结果 | 证据 |
|---|---|---|---|
| 1 | `npm run typecheck` | 通过 | [typecheck.log](evidence/final/typecheck.log) |
| 2 | `npm run test:run`（加日志与JSON reporter） | 147个文件；1295/1295通过 | [vitest.log](evidence/final/vitest.log)、[vitest.json](evidence/final/vitest.json) |
| 3 | `npm run build:mock` | 通过；显式mock且Seedream Key置空 | [build-mock.log](evidence/final/build-mock.log) |
| 4 | `PLAYWRIGHT_OFFLINE_DIST=dist npx playwright test --workers=2` | 95/95通过；5.3分钟 | [playwright.log](evidence/final/playwright.log) |

以上来自BUG-013图片网格修复后的最后一次完整门禁，整体退出码为0；没有用单跑或修复前的全量结果替代。原78项E2E全部保留并通过。

## 与原始基线对照

- 原始：1289/1289单测；77/78 E2E，通知用例一次超时。没有把预期78/78改写为实测。
- 单测新增6项：并发创建/失败重试2项、错误路由2项、视频空输入资格1项、节点列表标准生成动作1项；不删除原测试。
- E2E原78项保留，新增17项稳定化测试；其中一项包含13路径×21种视口/等效缩放组合，即273组合。
- 控件补查前的一次完整门禁已经1295/1295、94/94通过；仍重新跑完整门禁，而非将定向通过冒充最终全量。该轮保留于[前一轮E2E日志](evidence/final/playwright-before-controls-fix.log)。
- 图片网格补查前另一轮95/95通过，但截图暴露了“数量断言通过、实际被遮挡”的遗漏；增加不重叠与实际命中断言，修复后再次全量运行并通过。该轮保留于[网格修复前E2E日志](evidence/final/playwright-before-grid-fix.log)。
- 测试开发阶段曾发现Testing Library断言错误传入`exact`字段，typecheck先失败，已修正测试签名并重新从第一道门禁执行；记录在[typecheck首次尝试](evidence/final/typecheck-attempt-1.log)。

## 审计与安全边界

- 浏览器：全新Playwright上下文；内置浏览器仅访问独立本地mock预览端口。没有清用户IndexedDB或访问线上用户项目。
- mock产物由公开模型目录测试离线拦截读取；其余既有生成测试使用fixture开发服务器和假Key、拦截网络。这不是用mock产物冒充真实API验证。
- `app/src/features/generation/`、数据库schema/迁移、本机`.env*`不改。API费用为0；没有真实生成调用。
- `act`、测试辅助连接拒绝、SVG测试环境及构建大chunk告警仍记录为P3；不关闭检查、不提高告警阈值掩盖问题。
- [安全检查摘要](evidence/final/security-check.json)覆盖跟踪文本、QA输出及mock产物的常见高置信凭据格式；未读取本机Key，不把模式扫描等同于完整密钥泄漏审计。
- 初始失败通知用例未修改；额外原样单跑3次、并发12次通过。偶发原因未唯一确认，继续观察。
- 提交前`git diff --cached --check`提示原始工具日志/error-context带尾随空格及末尾空行。为保留证据不改写原始日志；排除`docs/qa/evidence/`后对代码和人工文档执行同一空白检查，通过。此项不影响四道门禁结果，也未隐藏测试/构建告警。
