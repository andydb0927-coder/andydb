# ChallengeGallery 组件规格

目标文件：`src/features/challenges/ChallengesPage.tsx`、对应测试、`src/styles/global.css`。

- 采用公开观察到的紧凑标题与媒体网格，不使用首页 hero。
- 状态筛选来自本地挑战目录，显示全部/进行中/评审中/已结束，并标出真实条数。
- 桌面三列、移动单列；封面 16:9、12px 圆角，状态为封面角标，标题和摘要在下方。
- 整卡进入 `/activity/:challengeId`，悬停只做约 1.02 的图片缩放和轻微描边变化。
- 卡片图片、标题、日期、奖项和参与数均使用本地原创演示目录，不抄当前线上赛事。
