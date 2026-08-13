# 无线画布扩展指南

## Agent 技能与本地插件

技能契约位于 `app/src/features/agent/agent-skill.ts`。每个技能必须提供稳定 id、名称、描述、版本、输入 schema 和执行函数，并返回非空标题、摘要、正文与受支持格式。执行函数只能使用显式 `input` 和只读 `AgentSkillContext`；禁止在技能内部读取全局 store、发起网络请求或调用生成 provider。异步技能应监听 `context.signal`，并在耗时工作中尽早停止；注册表会在开始前与结果返回后再次检查取消状态。

加载点是 `app/src/features/agent/skill-loader.ts` 的 `loadAgentSkillPlugins()`：

```ts
const runtime = loadAgentSkillPlugins([
  {
    id: 'continuity-tools',
    skills: [continuityCheckSkill],
  },
])
```

内置技能始终先加载；重复 plugin id 或 skill id 会在启动时失败。当前没有从任意磁盘路径动态执行代码，新增插件应通过受版本控制的显式 import 接入。每个技能至少要测试：schema 默认值、非法输入、非法输出、取消后的过期结果丢弃、确定性输出和无副作用边界。

启停状态由 `createSkillEnablementStore()` 保存到 localStorage，只保存禁用 id，不保存项目内容。结果绑定执行时的项目，写入画布时使用 `appendSkillResultNode()`，以新文本节点追加，不覆盖既有节点；页面成功写入后会锁定入口，避免同一结果被重复写入。

## 真实生成提供方

生成边界位于 `app/src/features/generation/generation-adapter.ts`。新 provider 应实现现有 adapter 契约，并由 runtime adapter 选择；不要让 Agent 技能直接依赖 provider。涉及外部计费或远程写入时，必须沿用显式确认、可见价格/范围提示和安全的失败信息。

server 桥接应使用独立路径命名空间、白名单命令、`spawn` 参数数组（禁止 shell 拼接）、有界请求/输出和 allowlist 响应。现有 `/api/libtv/*` 与 `/api/workspace/*` 互不代理。

## CLI 命令扩展

本地命令注册与 manifest 位于 `app/server/workspace/workspace-command.ts`。新增命令时必须同步：

1. 在 manifest 添加稳定 command id、`@版本` schema id 和文件格式。
2. 在 executor 添加严格输入校验，不接受未声明字段。
3. 复用统一 success/error envelope，不抛出原始底层错误。
4. 添加 command、HTTP handler 与 middleware 测试。
5. 更新 `docs/superpowers/local-workspace-cli.md`。

需要写入浏览器 IndexedDB 的 CLI 操作应拆为“server 纯校验/转换”和“浏览器内显式确认后持久化”两段，不能让 Vite server 猜测或扫描用户工作区。

## 云同步

项目、素材、时间线、评论和会员目前分别由本地 repository 管理。云同步应新增独立的 sync adapter，接收显式变更集并返回版本/冲突结果；本地 repository 继续作为离线数据源。建议的最小契约：

- `pull(cursor)` 返回远端变更和新 cursor。
- `push(changes, baseVersion)` 返回确认版本或结构化冲突。
- 冲突解决生成新的本地版本，不静默覆盖画布节点。
- 凭据只存在 server/安全存储，不进入项目 JSON、Agent 结果或错误响应。

接入云同步前应补充认证、权限、重试/幂等、离线队列、冲突 UI 和数据删除策略；本阶段没有实现或模拟这些能力。
