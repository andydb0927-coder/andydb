# LibTV 型首页改版实施计划

日期：2026-08-13  
设计：`docs/superpowers/specs/2026-08-13-libtv-homepage-redesign.md`

**目标：** 只改造 `/` 为本地数据驱动的创作门户，同时完整保留项目、画布、作品详情和创作过程能力。

**TDD 原则：** 每个切片先增加失败测试，确认 RED，再实现到 GREEN；每个切片完成后运行 focused tests 与 `git diff --check` 自检，通过后再进入下一切片。

**边界：** 不调用 LibTV 或任何外部 API，不消耗积分，不引入远程图片，不改写已有项目数据，不触碰受保护目录 `audit-2026-08-06/`。

## Task 1：首页导航契约

**文件：**

- Modify: `app/src/features/platform/PlatformShell.test.tsx`
- Modify: `app/src/features/platform/PlatformShell.tsx`
- Modify: `app/src/features/launcher/ProjectLauncherPage.test.tsx`
- Modify: `app/src/features/launcher/ProjectLauncherPage.tsx`

- [x] 写 RED：首页侧栏为首页/项目/Skills/创作者挑战赛/帮助，顶栏为积分超市/开通会员/注册/登录。
- [x] 实现首页态精简侧栏与顶栏内部链接；非首页平台导航和工作区模式保持原样。
- [x] 运行 shell + launcher focused tests 和 `git diff --check`。

## Task 2：Hero 与五张产品特性轮播

**文件：**

- Modify: `app/src/features/home/home-content.test.ts`
- Modify: `app/src/features/home/home-content.ts`
- Modify: `app/src/features/home/PlatformHomeSections.test.tsx`
- Modify: `app/src/features/home/PlatformHomeSections.tsx`

- [x] 写 RED：精确 Hero 文案、六个指定模式、5 张特性卡及前后切换状态。
- [x] 更新固定本地种子和 Hero；实现无自动播放、可循环的产品特性轮播。
- [x] 运行 home model + home sections + launcher focused tests 和 `git diff --check`。

## Task 3：Agent 与横排 Skill 分类

**文件：**

- Modify: `app/src/features/home/PlatformHomeSections.test.tsx`
- Modify: `app/src/features/home/PlatformHomeSections.tsx`

- [x] 写 RED：创意发送、附件反馈、三类横排切换、每类两张卡和 Skill 创建。
- [x] 实现分类选择状态与选中分类卡片；复用已有项目创建门禁。
- [x] 运行 home sections + launcher focused tests 和 `git diff --check`。

## Task 4：TV Show 分类、搜索和瀑布流

**文件：**

- Modify: `app/src/features/community/demo-works.test.ts`
- Modify: `app/src/features/community/demo-works.ts`
- Modify: `app/src/features/home/PlatformHomeSections.test.tsx`
- Modify: `app/src/features/home/PlatformHomeSections.tsx`

- [x] 写 RED：新增 Seedance2.5 分类、8 分类栏、显式搜索、播放数/作者认证与创作过程链接。
- [x] 为固定演示作品补标签并实现本地搜索提交；保持详情路径不变。
- [x] 运行 home + community + discover/detail focused tests 和 `git diff --check`。

## Task 5：视觉系统、帮助锚点与响应式

**文件：**

- Modify: `app/src/styles/global.css`
- Modify: `app/src/features/launcher/ProjectLauncherPage.tsx`

- [x] 为首页各区实现深色电影门户布局、轮播、横排分类和响应式瀑布流。
- [x] 增加真实帮助锚点及内部链接；验证窄屏规则和 reduced-motion。
- [x] 运行首页 focused tests、typecheck 和 `git diff --check`。

## Task 6：全量自检与提交

- [x] 运行全量 `npm run test:run`。
- [x] 运行 `npm run typecheck`。
- [x] 运行 `npm run build`。
- [x] 运行 `git diff --check` 并检查仅包含本阶段文件；不读取或暂存 `audit-2026-08-06/`。
- [ ] 精确暂存本阶段文件并提交；记录 commit hash、测试数量和真实剩余边界。

## 验证记录

- RED：首轮 5 个测试文件共 39 个测试，其中 8 个按预期失败，分别覆盖导航、Hero、特性轮播、Skill 分类、TV Show 与演示标签。
- Focused GREEN：导航/创建器 30 个测试；首页/社区/账号/详情综合回归 54 个测试；演示种子刷新回归 13 个测试。
- 全量 Vitest：94 个测试文件、841 个测试通过。
- TypeScript：`npm run typecheck` 通过。
- Production build：Vite 构建通过，2054 modules transformed。
- 浏览器：`http://localhost:4173/` 首页关键结构可见；轮播切换为“2 / 5 · 导演台”；商业广告显示 2 张 Skill；Seedance2.5 显示 2 个作品；控制台 error 日志为空。
- 范围：检查到 3 张既有 `design-qa-evidence/*.png` 修改，不属于本阶段，明确不暂存；受保护目录未读取、未改动、未暂存。
