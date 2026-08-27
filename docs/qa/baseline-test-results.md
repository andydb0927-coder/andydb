# 稳定化原始测试基线

- 日期：2026-08-27；起始提交：`f1e098d71b7a047ddc95321ae83df835b7e217fb`。
- 分支：`codex/current-product-stabilization`；以下结果在修改任何产品代码前取得。
- 工作树原有三张 QA 截图已备份，测试完成后恢复，不能混入修复提交。
- 测试使用 Playwright 新建隔离浏览器上下文和 fixture Key；不读取用户浏览器 IndexedDB、不调用付费 API。

| 顺序 | 原始命令 | 结果 | 原始输出 |
|---|---|---|---|
| 1 | `npm run typecheck` | 通过 | [日志](evidence/baseline/typecheck.log) |
| 2 | `npm run test:run -- --reporter=default --reporter=json --outputFile.json=../docs/qa/evidence/baseline/vitest.json` | 145 个文件；1289/1289 通过 | [日志](evidence/baseline/vitest.log)、[JSON](evidence/baseline/vitest.json) |
| 3 | `npm run build:mock` | 通过 | [日志](evidence/baseline/build-mock.log) |
| 4 | `PLAYWRIGHT_OFFLINE_DIST=dist npx playwright test --workers=2` | **77/78 通过，1 项失败，约 2.3 分钟** | [日志](evidence/baseline/playwright.log) |

## 原始失败（先登记，尚未修复）

`e2e/hosted-batch-5.spec.ts:16`：通知中心生成完成及已读持久化测试，在第 22 行等待“确认生成 1 张图片”按钮超过 30 秒。失败快照中图片生成按钮处于 active，确认弹窗未出现，画布仍正常渲染。需要进一步区分输入就绪时序、触发器与弹窗行为；不能仅增加超时或删除该测试。

## 额外观察

1. `vite preview` 默认启动后，`/andydb/assets/*.js` 被回退为 HTML，页面白屏（BUG-001）。暂用命令行 `--base /andydb/` 隔离审计，未提前修改产品代码。
2. 创建项目路由产生 `Matched leaf route ... does not have an element`、`No HydrateFallback` 警告，待实际检查路由加载和异常状态。
3. 单测有 React `act` 警告及测试环境辅助连接 `ECONNREFUSED`；构建有大 chunk 提醒。需与真实浏览器错误区分，不将警告冒充失败。

## 安全扫描范围

扫描 HEAD 的 576 个跟踪文件、环境文件提交记录和常见私钥/token/硬编码凭据特征：未发现被跟踪的 `.env.local`、环境密钥文件或匹配的真实凭据。未读取本机密钥文件。该结论仅覆盖所述扫描，不声称完成所有历史对象的专业泄漏检测。

原始基线固定保留，修复后的结果单独写入 `final-test-results.md`。
