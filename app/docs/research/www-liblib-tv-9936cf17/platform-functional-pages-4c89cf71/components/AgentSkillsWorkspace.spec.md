# AgentSkillsWorkspace 组件规格

目标文件：`src/features/agent/AgentsPage.tsx`、对应测试、`src/styles/global.css`。

- 顶部顺序必须是紧凑标题、宽 Agent 指令框、Skill/收藏/我的浏览标签、分类与搜索。
- Skill 桌面三列、移动单列；视觉参考尺寸约高 129px、16px 圆角、0.5px 描边、12.5px 内边距。封面固定在左，标题/描述/作者/使用信息在中，动作在右。
- 本地没有远端收藏/个人 Skill 后端：“收藏/我的”显示明确的本地能力边界或现有本地启用状态，不制造远端数据。
- 点击“使用”应选择/聚焦该 Skill 的运行面板；启停、输入参数、运行、取消、写入项目保持可用。
- `/cli` 不做独立克隆，现有工作区 manifest 桥接区作为 `id=workspace-bridge` 的次级信息面板。
