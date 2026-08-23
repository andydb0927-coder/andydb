# PlatformChrome 组件规格

目标文件：`src/features/platform/PlatformShell.tsx`、`src/styles/global.css`。

- 标准页沿用固定侧栏和紧凑顶栏；路由当前项必须有 `aria-current=page`。
- 主内容最大宽度以页面类型控制，不能给所有页面套同一张大卡片。
- 工作区页保留画布专用壳，不向无限画布增加外层滚动。
- 公开参考只证明导航层级和暗色密度；账户菜单、余额和私有最近项目不复制。
- 验收：桌面、390px 均无页面横向溢出；标准页和工作区页的壳层不互相覆盖。
