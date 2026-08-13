# 无线画布第 5 阶段真实生成模型身份 TDD 实施计划

日期：2026-08-13

对应规格：`docs/superpowers/specs/2026-08-13-generation-model-identity-design.md`

## Task 1：契约与本地偏好

**文件**

- 修改 `app/src/features/generation/libtv-contract.ts`
- 修改 `app/src/features/generation/generation-provider-preference.ts`
- 修改 `app/src/features/generation/generation-provider-preference.test.ts`

**RED**

1. 完整选择无法保存模型稳定键。
2. 缺键、空键或非字符串键仍可能被接受。
3. key/name 周围空白没有一致归一化。

**GREEN**

- 把图片和视频模型 key 加入选择契约；
- localStorage 读取严格校验并归一化六个选择字段；
- 旧的未固定 LibTV 配置安全回退 Demo。

## Task 2：模型中心同名选择

**文件**

- 修改 `app/src/features/platform/ModelsPage.tsx`
- 修改 `app/src/features/platform/ModelsPage.test.tsx`

**RED**

1. 两个同名模型使用相同 option value，无法独立选择。
2. 保存只记录显示名称。
3. 目录刷新后的 key/name 漂移未使保存失效。

**GREEN**

- select state 和 option value 使用稳定键；
- 从当前目录实体派生并保存 key/name 对；
- 同名项显示短键提示；
- key/name 任一漂移均禁用 LibTV 启用操作。

## Task 3：客户端请求与确认一致性

**文件**

- 修改 `app/src/features/generation/libtv-generation-adapter.ts`
- 修改其测试、运行时适配器测试和确认对话框测试
- 修改 `app/src/features/canvas/CanvasPage.tsx` 及相关测试

**RED**

1. 适配器不要求稳定键。
2. 远程请求体不包含固定模型身份。
3. 待确认期间仅模型键变化不会被识别为配置变更。

**GREEN**

- 适配器验证并原样传递 key/name 对；
- Canvas 确认一致性比较包含两个稳定键；
- 既有取消、重试和提供方切换行为不变。

## Task 4：服务端目录固定

**文件**

- 修改 `app/server/libtv/generation-command.ts`
- 修改 `app/server/libtv/generation-command.test.ts`
- 更新 HTTP/Vite bridge 测试 fixtures

**RED**

1. 未知模型键只要名称存在就能通过。
2. 正确键配错误名称仍能进入 CLI。
3. 服务端无法区分目录中的同名模型。

**GREEN**

- 解析完整模型身份；
- 在最新目录中按同一条 key/name 记录校验；
- CLI 只在固定成功后使用对应名称；
- 所有拒绝均发生在 CLI 和文件系统副作用之前。

## Task 5：阶段进度与门禁

**文件**

- 修改 `app/src/features/platform/platform-tasks.ts`
- 修改路线图相关测试和 `app/README.md`

**RED**

- 默认路线图仍显示第 5 阶段进行中。

**GREEN**

- 第 1–5 阶段完成，第 6 阶段进行中；其余待开始；
- 不覆盖用户已保存的合法自定义进度。

## Task 6：阶段验证与提交

```bash
npm run test:run -- src/features/generation/generation-provider-preference.test.ts src/features/generation/libtv-generation-adapter.test.ts src/features/generation/runtime-generation-adapter.test.ts src/features/generation/GenerationConfirmationDialog.test.tsx src/features/platform/ModelsPage.test.tsx src/features/canvas/CanvasPage.test.tsx server/libtv/generation-command.test.ts server/libtv/http-handler.test.ts server/libtv/vite-plugin.test.ts src/features/platform/platform-tasks.test.ts
npm run test:run
npm run typecheck
npm run build
git diff --check
```

全部通过后提交：

```text
feat: pin remote generation model identity
```

提交后工作树必须干净，再开始第 6 阶段。

## 执行记录

- 基线审计：目录、提供方偏好、显式远程确认、服务端写入门禁、请求校验、队列取消/重试与生成结果原子落库均已存在；唯一模型身份仍只使用显示名称。
- 核心 RED：5 个文件失败，14 项失败 / 205 项通过；准确证明 option 只用名称、偏好和请求丢键、服务端接受错误键，以及确认忽略仅键变化。
- 路线图 RED：2 个文件失败，3 项失败 / 1 项通过；证明默认进度尚未推进到“素材与历史”。
- 聚焦 GREEN：11 个文件 271/271 通过。
- 全量 Vitest：88 个文件 796/796 通过。
- `npm run typecheck`：通过。
- `npm run build`：通过；ModelsPage chunk 约 8.07 kB，CanvasPage chunk 约 252.29 kB，最大入口 chunk 约 291.23 kB。
- 变更 TypeScript/TSX Oxlint：0 warning / 0 error。
- `git diff --check`：通过。
