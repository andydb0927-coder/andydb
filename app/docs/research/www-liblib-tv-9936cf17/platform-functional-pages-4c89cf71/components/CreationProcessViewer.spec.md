# CreationProcessViewer 组件规格

目标文件：`src/features/community/CreationProcessPage.tsx`、对应测试、`src/styles/global.css`。

- 来源状态：仅确认公开作品可进入创作过程；内部模板未稳定公开。保留本地真实只读流程。
- 顶部返回、作品标题、只读提示、复制项目为主层级；连线开关为次级工具。
- 节点按日期分组，节点卡紧凑展示种类、标题和提示词；依赖连线面板在桌面并列、移动端下移。
- 复制成功仍导航到新本地项目，失败给可感知错误；不得暗示复制了线上资源。
