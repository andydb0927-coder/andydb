# 本地 Agent / Skill / CLI 实施计划

1. 先写技能 registry、schema 校验、五个内置技能与启停存储的失败测试，再实现最小领域层。
2. 先写 Agent 页组件测试（浏览、启停、执行、结果卡、写入画布），再接入路由、平台导航和 AI 导演入口。
3. 先写本地工作区 CLI manifest、导出器、HTTP handler 与 Vite middleware 测试，再实现 schema 化协议和错误码。
4. 编写 `docs/superpowers/extensions.md`，记录技能、provider、sync 和 CLI 扩展点。
5. 分组运行新增 Vitest；再运行全量 Vitest、typecheck、build，修复全部失败并核对未提交 diff。

## 自检清单

- [ ] 所有 Agent 执行为同步或本地 Promise，未调用 fetch/LibTV/generation adapter。
- [ ] 禁用技能无法执行，输入错误返回稳定错误。
- [ ] 写入节点经过 project store，且不会覆盖现有节点。
- [ ] workspace API 只接收显式 payload，未知路径不拦截。
- [ ] 响应 envelope、schema version、错误码一致。
- [ ] 文档包含后续真实 provider 与云同步接入约束。
- [ ] 无 commit；不运行 Chromium E2E。
