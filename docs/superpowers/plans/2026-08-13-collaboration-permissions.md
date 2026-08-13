# 无线画布第 12 阶段协作权限 TDD 实施计划

日期：2026-08-13

对应规格：`docs/superpowers/specs/2026-08-13-collaboration-permissions-design.md`

## Task 1：角色权限矩阵

- 先补所有者/编辑者/只读能力 RED；
- 实现统一纯函数判定源；
- 在 `/account` 显示可访问的角色矩阵。

## Task 2：评论编辑、删除与并发防护

- 先补仓库版本冲突 RED 和面板交互 RED；
- 事务内对比 `expectedUpdatedAt`，实现编辑/删除；
- 编辑成功更新列表，删除成功去除记录，冲突保留当前 UI。

## Task 3：项目包强校验

- 对非法协作者和评论记录写 RED；
- 实现类型、非空字段、枚举和项目归属校验；
- 保持合法旧项目包往返不变。

## Task 4：路线图与门禁

- 第 12 阶段完成，第 13 阶段进行中；
- 更新 README 测试数；
- 运行聚焦/全量 Vitest、typecheck、build、Oxlint 和 diff-check。

通过后提交 `feat: harden local collaboration permissions`，再开始第 13 阶段。

## 执行记录

- 基线审计：成员、评论、项目包、会员状态机和两类权益门禁已存在；统一角色权限、评论编辑/删除/并发保护以及深层项目包校验缺失。
- RED：5 个聚焦文件中 8 项按预期失败，分别证明权限源、仓库编辑/删除、面板操作、项目包深校验和权限表缺失。
- GREEN：同一聚焦集 5 个文件 / 17 项全绿；路线图 RED 证明默认进度仍停留在第 12 阶段，随后推进到第 13 阶段。
- 自检修复：同一毫秒内创建并编辑时，旧时间版本不会前进；已以单调 1 ms 版本 RED→GREEN 修复，确保过期写入仍能被拒绝。
- 聚焦回归：协作、账户、画布、预览和路线图共 10 个文件 / 133 项通过。
- 全量门禁：Vitest 93 个文件 / 832 项通过；`typecheck` 和 `build` 通过；Oxlint 退出 0，仅保留既有 hooks / Fast Refresh 提示；`git diff --check` 通过。
