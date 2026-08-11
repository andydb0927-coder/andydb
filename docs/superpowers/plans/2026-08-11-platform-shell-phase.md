# Platform Shell Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build an accessible PlatformShell and local-data-backed platform pages while preserving the launcher, canvas, and preview paths.

**Architecture:** Project remains the only persisted domain object. PlatformShell owns navigation and layout only; platform pages read ProjectRepository.listRecent and reuse extracted recipe/example catalogues, exposing real local data and existing creation actions instead of placeholder claims.

**Tech Stack:** React 19, TypeScript, React Router 7, Dexie, Vitest, Testing Library, Playwright, lucide-react.

## Global Constraints

- Do not read, modify, delete, stage, or commit audit-2026-08-06/.
- Preserve /, /project/:projectId, and /project/:projectId/preview.
- Do not add server, auth, payment, team, community mutation, or real model calls.
- State clearly that DemoGenerationAdapter is local demonstration behavior.
- Keep controls keyboard reachable and descriptively named.
- Write and run a failing focused test before each production behavior.

---

### Task 1: Extract shared recipe and example-project catalogues

**Files:**
- Create: app/src/features/project/recipe-catalog.ts
- Create: app/src/features/project/example-project.ts
- Create: app/src/features/project/recipe-catalog.test.ts
- Create: app/src/features/project/example-project.test.ts
- Modify: app/src/features/launcher/ProjectLauncherPage.tsx
- Modify: app/src/features/launcher/ProjectLauncherPage.test.tsx

**Interfaces:** RecipeId, RecipeDefinition, recipeDefinitions, findRecipe(recipeId), RECIPE_QUERY_PARAM, EXAMPLE_PROJECT_ID, buildExampleProject(), and ensureExampleProject({ load, save }).

- [x] **Step 1: Write the failing tests**

    test('finds a recipe by id', () => {
      expect(findRecipe('cinematic-story')?.title).toBe('电影感叙事')
      expect(findRecipe('not-a-recipe')).toBeUndefined()
    })

    test('saves the example only when absent', async () => {
      const repository = { load: vi.fn().mockResolvedValue(undefined), save: vi.fn() }
      const project = await ensureExampleProject(repository)
      expect(project.id).toBe(EXAMPLE_PROJECT_ID)
      expect(repository.save).toHaveBeenCalledWith(project)
    })

- [x] **Step 2: Run RED**

    npm run test:run -- src/features/project/recipe-catalog.test.ts src/features/project/example-project.test.ts

Expected: FAIL because the catalogue modules do not exist.

- [x] **Step 3: Implement minimal catalogues**

Move three recipe definitions and the sample builder out of ProjectLauncherPage. ensureExampleProject loads the fixed sample id, returning it when found; otherwise it builds, saves, and returns it.

- [x] **Step 4: Rewire launcher and run GREEN**

    npm run test:run -- src/features/project/recipe-catalog.test.ts src/features/project/example-project.test.ts src/features/launcher/ProjectLauncherPage.test.tsx

Expected: PASS; recipe, blank-project, recovery, sample, and recents tests remain green.

- [x] **Step 5: Commit**

    git add app/src/features/project/recipe-catalog.ts app/src/features/project/example-project.ts app/src/features/project/recipe-catalog.test.ts app/src/features/project/example-project.test.ts app/src/features/launcher/ProjectLauncherPage.tsx app/src/features/launcher/ProjectLauncherPage.test.tsx
    git commit -m "refactor: share platform recipe catalog"

### Task 2: Add adaptive PlatformShell and mount it at existing routes

**Files:**
- Create: app/src/features/platform/PlatformShell.tsx
- Create: app/src/features/platform/PlatformShell.test.tsx
- Modify: app/src/app/router.tsx
- Modify: app/src/app/App.test.tsx
- Modify: app/src/styles/global.css

**Interfaces:** PlatformShell accepts mode standard or workspace and renders Outlet. platformNavigation links to /, /assets, /workflows, /discover, /models, and /account. Canvas and preview leaves use workspace mode.

- [x] **Step 1: Write failing shell tests**

    test('marks workspace navigation and collapses the rail', async () => {
      const user = userEvent.setup()
      renderShell('/project/demo-project')
      expect(screen.getByRole('link', { name: '创作画布' })).toHaveAttribute('aria-current', 'page')
      await user.click(screen.getByRole('button', { name: '收起平台导航' }))
      expect(screen.getByRole('navigation', { name: '平台导航' })).toHaveAttribute('data-collapsed', 'true')
    })

    test.each([
      ['/', '创建你的第一部短片'],
      ['/project/demo-project', '项目画布'],
      ['/project/demo-project/preview', '成片预览'],
    ])('keeps route inside shell', async (path, heading) => {
      render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />)
      expect(await screen.findByRole('heading', { name: heading })).toBeVisible()
      expect(screen.getByRole('navigation', { name: '平台导航' })).toBeVisible()
    })

- [x] **Step 2: Run RED**

    npm run test:run -- src/features/platform/PlatformShell.test.tsx src/app/App.test.tsx

Expected: FAIL because no shell or nested layout route exists.

- [x] **Step 3: Implement shell and routing**

Use layout routes and NavLink; preserve leaf paths. Standard rail is 232px, workspace rail 64px, collapsed rail 56px. Toggle labels change between 收起平台导航 and 展开平台导航.

- [x] **Step 4: Run GREEN**

    npm run test:run -- src/features/platform/PlatformShell.test.tsx src/app/App.test.tsx src/features/canvas/CanvasPage.test.tsx src/features/timeline/PreviewPage.test.tsx

Expected: PASS with existing component suites unchanged.

- [x] **Step 5: Commit**

    git add app/src/features/platform/PlatformShell.tsx app/src/features/platform/PlatformShell.test.tsx app/src/app/router.tsx app/src/app/App.test.tsx app/src/styles/global.css
    git commit -m "feat: add adaptive platform shell"

### Task 3: Make workflow selection real in project space

**Files:**
- Modify: app/src/features/launcher/ProjectLauncherPage.tsx
- Modify: app/src/features/launcher/ProjectLauncherPage.test.tsx

**Interfaces:** ProjectLauncherPage reads query key recipe. A valid value selects a shared recipe but does not create, save, or navigate until 创建项目 is pressed.

- [x] **Step 1: Write failing query test**

    test('preselects workflow without creating a project', () => {
      const { repository } = renderLauncher({ initialEntry: '/?recipe=brand-atmosphere' })
      expect(screen.getByRole('radio', { name: /品牌氛围片/ })).toBeChecked()
      expect(repository.save).not.toHaveBeenCalled()
    })

- [x] **Step 2: Run RED**

    npm run test:run -- src/features/launcher/ProjectLauncherPage.test.tsx

Expected: FAIL because the query is ignored.

- [x] **Step 3: Implement and run GREEN**

Use useSearchParams, findRecipe, and a synchronizing effect. Normal radio selection must not rewrite the URL.

    npm run test:run -- src/features/launcher/ProjectLauncherPage.test.tsx

- [x] **Step 4: Commit**

    git add app/src/features/launcher/ProjectLauncherPage.tsx app/src/features/launcher/ProjectLauncherPage.test.tsx
    git commit -m "feat: preselect workflows from project space"

### Task 4: Build read-only assets and history

**Files:**
- Create: app/src/features/platform/AssetsHistoryPage.tsx
- Create: app/src/features/platform/AssetsHistoryPage.test.tsx
- Modify: app/src/app/router.tsx
- Modify: app/src/styles/global.css

**Interfaces:** The page accepts repository.listRecent; it shows assets, active versions, generation jobs, and export jobs from the selected persisted project. Source links resolve to /project/:projectId?focus=:nodeId.

- [x] **Step 1: Write failing populated and empty-state tests**

    test('shows persisted assets and links version to canvas', async () => {
      render(<AssetsHistoryPage repository={repositoryWith(makeProjectFixture())} />)
      expect(await screen.findByRole('heading', { name: '素材与历史' })).toBeVisible()
      expect(screen.getByRole('link', { name: '在画布中查看 分镜 01' })).toHaveAttribute('href', '/project/project-fixture?focus=storyboard-01')
    })

    test('links to project space when no local project exists', async () => {
      render(<AssetsHistoryPage repository={repositoryWith()} />)
      expect(await screen.findByRole('link', { name: '创建项目' })).toHaveAttribute('href', '/')
    })

- [x] **Step 2: Run RED**

    npm run test:run -- src/features/platform/AssetsHistoryPage.test.tsx

Expected: FAIL because route and page are absent.

- [x] **Step 3: Implement and run GREEN**

Load listRecent(12) once, prefer active project when present, and render only values present in Project; never synthesize assets.

    npm run test:run -- src/features/platform/AssetsHistoryPage.test.tsx src/features/project/project-repository.test.ts

- [x] **Step 4: Commit**

    git add app/src/features/platform/AssetsHistoryPage.tsx app/src/features/platform/AssetsHistoryPage.test.tsx app/src/app/router.tsx app/src/styles/global.css
    git commit -m "feat: add local assets and history view"

### Task 5: Build workflows and discovery from executable local content

**Files:**
- Create: app/src/features/platform/WorkflowsPage.tsx
- Create: app/src/features/platform/WorkflowsPage.test.tsx
- Create: app/src/features/platform/DiscoverPage.tsx
- Create: app/src/features/platform/DiscoverPage.test.tsx
- Modify: app/src/app/router.tsx
- Modify: app/src/styles/global.css

**Interfaces:** WorkflowsPage maps shared recipes to /?recipe=<id>. DiscoverPage accepts { load, save }, calls ensureExampleProject only after click, hydrates with the existing store, then navigates to sample canvas.

- [x] **Step 1: Write failing tests**

    test('routes workflow to preselected recipe', () => {
      render(<MemoryRouter><WorkflowsPage /></MemoryRouter>)
      expect(screen.getByRole('link', { name: '使用品牌氛围片' })).toHaveAttribute('href', '/?recipe=brand-atmosphere')
    })

    test('persists and opens example only after user action', async () => {
      const user = userEvent.setup()
      const repository = makeExampleRepository()
      renderDiscover(repository)
      expect(repository.save).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: '打开示例项目' }))
      expect(repository.save).toHaveBeenCalledTimes(1)
      expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
    })

- [x] **Step 2: Run RED**

    npm run test:run -- src/features/platform/WorkflowsPage.test.tsx src/features/platform/DiscoverPage.test.tsx

Expected: FAIL because pages are missing.

- [x] **Step 3: Implement and run GREEN**

Render shared recipes and a built-in sample card with real id, title, intent, and node flow. It writes only after 打开示例项目.

    npm run test:run -- src/features/platform/WorkflowsPage.test.tsx src/features/platform/DiscoverPage.test.tsx src/features/project/example-project.test.ts

- [x] **Step 4: Commit**

    git add app/src/features/platform/WorkflowsPage.tsx app/src/features/platform/WorkflowsPage.test.tsx app/src/features/platform/DiscoverPage.tsx app/src/features/platform/DiscoverPage.test.tsx app/src/app/router.tsx app/src/styles/global.css
    git commit -m "feat: add workflows and example discovery"

### Task 6: Add transparent model and local-workspace pages

**Files:**
- Create: app/src/features/platform/model-capabilities.ts
- Create: app/src/features/platform/ModelsPage.tsx
- Create: app/src/features/platform/ModelsPage.test.tsx
- Create: app/src/features/platform/AccountPage.tsx
- Create: app/src/features/platform/AccountPage.test.tsx
- Modify: app/src/app/router.tsx
- Modify: app/src/styles/global.css

**Interfaces:** modelCapabilities exposes id, kind, label, status, description. ModelsPage filters all, image, video without mutating the adapter. AccountPage reads local project count from listRecent.

- [x] **Step 1: Write failing tests**

    test('filters local demonstration capabilities', async () => {
      const user = userEvent.setup()
      render(<ModelsPage />)
      await user.click(screen.getByRole('radio', { name: '视频' }))
      expect(screen.getByText('演示视频草稿')).toBeVisible()
      expect(screen.queryByText('演示图像草稿')).not.toBeInTheDocument()
      expect(screen.getByText('本地演示适配器')).toBeVisible()
    })

    test('reports saved project count and no cloud account', async () => {
      render(<AccountPage repository={repositoryWith(projectA, projectB)} />)
      expect(await screen.findByText('2 个本地项目')).toBeVisible()
      expect(screen.getByText('登录、团队与会员：未接入')).toBeVisible()
    })

- [x] **Step 2: Run RED**

    npm run test:run -- src/features/platform/ModelsPage.test.tsx src/features/platform/AccountPage.test.tsx

Expected: FAIL because pages and catalogue do not exist.

- [x] **Step 3: Implement and run GREEN**

Use radio filters and model catalogue content. Visible copy says 本地演示适配器 and 登录、团队与会员：未接入; do not add fake disabled sign-in or billing controls.

    npm run test:run -- src/features/platform/ModelsPage.test.tsx src/features/platform/AccountPage.test.tsx

- [x] **Step 4: Commit**

    git add app/src/features/platform/model-capabilities.ts app/src/features/platform/ModelsPage.tsx app/src/features/platform/ModelsPage.test.tsx app/src/features/platform/AccountPage.tsx app/src/features/platform/AccountPage.test.tsx app/src/app/router.tsx app/src/styles/global.css
    git commit -m "feat: add model and workspace capability pages"

### Task 7: Prove end-to-end platform continuity

**Files:**
- Create: app/e2e/platform-shell.spec.ts
- Modify: docs/superpowers/plans/2026-08-11-platform-shell-phase.md

**Interfaces:** Browser flow starts at /, chooses a workflow, creates a project, reaches canvas, opens assets/history, and still opens preview.

- [x] **Step 1: Write failing browser flow**

    test('keeps creation-to-preview usable through platform navigation', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('link', { name: '工作流与模板' }).click()
      await page.getByRole('link', { name: '使用电影感叙事' }).click()
      await expect(page.getByRole('radio', { name: /电影感叙事/ })).toBeChecked()
      await page.getByLabel('描述你想创作的短片').fill('雨夜追踪')
      await page.getByRole('button', { name: '创建项目' }).click()
      await expect(page.getByRole('heading', { name: '项目画布' })).toBeVisible()
      await page.getByRole('link', { name: '素材与历史' }).click()
      await expect(page.getByRole('heading', { name: '素材与历史' })).toBeVisible()
    })

- [x] **Step 2: Run RED**

    npx playwright test e2e/platform-shell.spec.ts

Expected: FAIL until platform links and routes exist.

- [x] **Step 3: Implement only required production-route fixture support and run GREEN**

    npx playwright test e2e/platform-shell.spec.ts
    npm run test:run -- src/features/platform src/app/App.test.tsx

Expected: PASS; no platform-page mock replaces the production router.

- [x] **Step 4: Run full verification**

    npm run test:run
    npm run typecheck
    npm run build
    npx playwright test
    git diff --check HEAD
    git status --short --untracked-files=no

Expected: every command exits zero; only intended tracked files are changed and the protected untracked directory is never staged.

- [x] **Step 5: Commit final implementation**

    git add app/src app/e2e docs/superpowers/plans/2026-08-11-platform-shell-phase.md
    git commit -m "feat: establish platform shell"
