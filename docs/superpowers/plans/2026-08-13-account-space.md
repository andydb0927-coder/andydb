# 无线画布第 2 阶段账号与空间 TDD 实施计划

日期：2026-08-13

对应规格：`docs/superpowers/specs/2026-08-13-account-space-design.md`

## Task 1：设备身份偏好模型

**文件**

- 新增 `app/src/features/account/local-account-preferences.ts`
- 新增 `app/src/features/account/local-account-preferences.test.ts`

**RED**

1. 默认本地身份、AI 标识和站内提醒稳定。
2. 名称去首尾空格，空值回退。
3. 损坏 JSON、错误版本和异常 storage 安全回退。
4. 写入只包含已知字段和版本。

**GREEN**

- 实现纯校验、版本化读写和可注入时钟；
- 模块加载时不直接访问 `window`；
- 不保存敏感身份或认证数据。

## Task 2：本地身份与个人空间界面

**文件**

- 修改 `app/src/features/platform/AccountPage.tsx`
- 修改 `app/src/features/platform/AccountPage.test.tsx`
- 修改 `app/src/styles/global.css`

**RED**

1. 页面缺少“本地身份”和“个人本地空间”。
2. 名称和两个偏好不能保存/恢复。
3. 页面缺少云账户、团队、Access key 和真实支付边界。
4. 页面缺少到项目空间、素材库、Agent/CLI 的真实入口。

**GREEN**

- 注入偏好仓储，读取并响应 `storage` 同步；
- 增加身份、空间和偏好 sections；
- 根据真实项目快照估算本地数据体积；
- 保留现有会员、协作、分享和备份交互。

## Task 3：路线图进度推进

**文件**

- 修改 `app/src/features/platform/platform-tasks.ts`
- 修改 `app/src/features/platform/platform-tasks.test.ts`

**RED**

- 默认进度仍停在第 2 阶段进行中。

**GREEN**

- 第 1、2 阶段完成；第 3 阶段进行中；其余待开始。
- 不覆盖用户已经保存的自定义任务状态。

## Task 4：阶段门禁与提交

```bash
npm run test:run -- src/features/account src/features/platform/AccountPage.test.tsx src/features/platform/platform-tasks.test.ts
npm run test:run
npm run typecheck
npm run build
git diff --check
```

全部通过后提交：

```text
feat: add local account and workspace center
```

提交后工作树必须干净，再开始第 3 阶段。

## 执行记录

- LibTV 只读证据：已登录首页账号菜单与 `/project` 项目空间；未记录或复制任何用户私有值。
- RED：偏好模块缺失、账号页缺少本地身份/个人空间、路线图未推进，3 个文件按预期失败。
- 聚焦 GREEN：3 个文件 11/11 通过。
- 账号/会员/协作/壳层回归：13 个文件 32/32 通过。
- 全量 Vitest：84 个文件 772/772 通过。
- `npm run typecheck`：通过。
- `npm run build`：通过；最大入口 chunk 约 291 kB。
- 变更文件 Oxlint：0 warning / 0 error。
- `git diff --check`：通过。
