# ChallengeDetailDocument 组件规格

目标文件：`src/features/challenges/ChallengeDetailPage.tsx`、相关测试、`src/styles/global.css`。

- 主文档列宽约 760–800px；顶部有返回、标题、状态/日期和“去创作”。
- 本地摘要信息只保留为轻量 lead，不做大型统计卡；正文用分隔线依次呈现活动日历、赛道、参赛指引、奖项和评审说明。
- “去创作”指向本地 `/projects/new`，不声称已经完成活动报名或线上提交。
- 长正文在 390px 保持可读，表格/列表不横向溢出。
- 线上当前赛事的标题、规则、奖金和第三方链接不复制。
