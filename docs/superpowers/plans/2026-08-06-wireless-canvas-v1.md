# Wireless Canvas V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a verified desktop web prototype in which an AI short-film creator can start a project, arrange connected creative nodes on an infinite canvas, generate deterministic demo results, preview two shots, and start a 1080p export job.

**Architecture:** Create a React/Vite application under `app/`, using React Flow for the infinite canvas, Zustand for in-memory project state, and Dexie for browser persistence. Generation and export are asynchronous jobs behind typed adapters; this plan uses deterministic local adapters so the complete UX can be tested without credentials, while preserving the boundary required for a separate live-provider plan.

**Tech Stack:** React, TypeScript, Vite, React Router, React Flow (`@xyflow/react`), Zustand, Dexie, Lucide React, Vitest, Testing Library, Playwright, npm.

## Global Constraints

- Primary users are AI short-film and cinematic creators.
- The product has exactly three V1 routes: project launcher, project canvas, and preview/export.
- The project canvas occupies at least 80% of the viewport and remains the default project route.
- AI Director is a floating bottom composer plus contextual node actions; it is not a permanent right sidebar.
- Dependency edges do not define playback order; only timeline items define playback order.
- Generated results are versioned and never overwrite a previous result.
- Preview supports one main video track and one audio track.
- The UI must not expose community, public marketplace, collaboration, billing, creator monetization, or advanced multitrack editing.
- Dark surfaces must retain readable text contrast; status must never rely on color alone.
- Keyboard users must be able to open contextual actions and use a node-list alternative to the spatial canvas.
- This plan validates provider-independent UX with deterministic image, video, and export adapters. Live provider credentials, billing, server queues, and production video rendering require a separate plan after the prototype is accepted.

## File Structure

```text
app/
├── package.json                         # npm scripts and dependencies
├── vite.config.ts                      # Vite and Vitest configuration
├── tsconfig.json                       # TypeScript project settings
├── index.html                          # application document
├── playwright.config.ts                # browser acceptance configuration
├── public/demo/                        # approved cinematic demo assets
├── e2e/creation-flow.spec.ts           # full V1 acceptance flow
└── src/
    ├── main.tsx                        # browser entry point
    ├── app/
    │   ├── App.tsx                     # router provider
    │   ├── router.tsx                  # three-route map
    │   └── App.test.tsx                # route smoke tests
    ├── styles/
    │   ├── tokens.css                  # colors, type, spacing, radii
    │   └── global.css                  # reset and app-wide behavior
    ├── ui/
    │   ├── Button.tsx                  # shared button variants
    │   ├── FloatingPanel.tsx           # shared floating surface
    │   └── StatusText.tsx              # icon plus status copy
    ├── features/project/
    │   ├── model.ts                    # domain types and constructors
    │   ├── project-store.ts            # Zustand actions and selectors
    │   ├── project-repository.ts       # Dexie persistence boundary
    │   └── project-store.test.ts       # domain and persistence tests
    ├── features/launcher/
    │   ├── ProjectLauncherPage.tsx     # new and recent project entry
    │   ├── RecipeRow.tsx               # three local recipe rows
    │   └── ProjectLauncherPage.test.tsx
    ├── features/canvas/
    │   ├── CanvasPage.tsx              # canvas route composition
    │   ├── CanvasTopBar.tsx            # project controls and save state
    │   ├── CanvasToolbar.tsx           # seven creation tools
    │   ├── DependencyImpactDialog.tsx  # downstream delete confirmation
    │   ├── NodeListView.tsx            # accessible structural alternative
    │   ├── node-types.ts               # React Flow node registry
    │   ├── edge-types.ts               # dependency edge registry
    │   ├── nodes/
    │   │   ├── AssetNode.tsx           # character and scene assets
    │   │   ├── StoryboardNode.tsx      # prompt and image versions
    │   │   ├── VideoNode.tsx           # generated clip and status
    │   │   └── PreviewNode.tsx         # sequence preview entry
    │   └── CanvasPage.test.tsx
    ├── features/generation/
    │   ├── generation-adapter.ts       # provider-independent interface
    │   ├── demo-generation-adapter.ts  # deterministic local jobs
    │   ├── generation-queue.ts         # cancel, retry, and progress
    │   └── generation-queue.test.ts
    ├── features/director/
    │   ├── DirectorComposer.tsx         # floating natural-language input
    │   ├── director-command.ts          # command parsing and suggestions
    │   └── director-command.test.ts
    ├── features/timeline/
    │   ├── PreviewPage.tsx              # player, timeline, inspector
    │   ├── TimelineTrack.tsx            # ordered video items
    │   ├── timeline-model.ts            # reorder and duration functions
    │   └── timeline-model.test.ts
    ├── features/export/
    │   ├── export-adapter.ts            # provider-independent interface
    │   ├── demo-export-adapter.ts       # deterministic export job
    │   ├── ExportPanel.tsx              # 1080p export settings and status
    │   └── ExportPanel.test.tsx
    └── test/
        ├── setup.ts                     # DOM and IndexedDB test setup
        └── fixtures.ts                  # deterministic project fixture
```

---

### Task 1: Application Foundation and Three-Route Shell

**Files:**
- Create: `app/package.json`
- Create: `app/vite.config.ts`
- Create: `app/tsconfig.json`
- Create: `app/index.html`
- Create: `app/src/main.tsx`
- Create: `app/src/app/App.tsx`
- Create: `app/src/app/router.tsx`
- Create: `app/src/app/App.test.tsx`
- Create: `app/src/test/setup.ts`

**Interfaces:**
- Produces: `createAppRouter(): ReturnType<typeof createBrowserRouter>` with `/`, `/project/:projectId`, and `/project/:projectId/preview`.
- Produces: npm scripts `dev`, `build`, `test`, `test:run`, `e2e`, and `typecheck`.

- [ ] **Step 1: Scaffold the React/Vite package in `app/`**

Run:

```bash
npm create vite@latest app -- --template react-ts
cd app
npm install
npm install react-router-dom @xyflow/react zustand dexie lucide-react
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event happy-dom fake-indexeddb @playwright/test
```

Expected: `app/package.json` exists and `npm install` exits with code 0.

- [ ] **Step 2: Add test scripts and DOM setup**

Set the scripts in `app/package.json` to:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "typecheck": "tsc -b --pretty false",
  "test": "vitest",
  "test:run": "vitest run",
  "e2e": "playwright test"
}
```

Create `app/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
```

Configure Vitest in `app/vite.config.ts` with `environment: 'happy-dom'` and `setupFiles: './src/test/setup.ts'`.

- [ ] **Step 3: Write the failing route smoke test**

Create `app/src/app/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { routes } from './router'

it.each([
  ['/', '创建你的第一部短片'],
  ['/project/demo-project', '项目画布'],
  ['/project/demo-project/preview', '成片预览'],
])('renders %s', async (path, heading) => {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />)
  expect(await screen.findByRole('heading', { name: heading })).toBeVisible()
})
```

- [ ] **Step 4: Run the route test and confirm the expected failure**

Run: `cd app && npm run test:run -- src/app/App.test.tsx`

Expected: FAIL because `./router` and route page components do not exist.

- [ ] **Step 5: Implement the minimal router and page headings**

Create `app/src/app/router.tsx`:

```tsx
import type { RouteObject } from 'react-router-dom'

const Stub = ({ title }: { title: string }) => <main><h1>{title}</h1></main>

export const routes: RouteObject[] = [
  { path: '/', element: <Stub title="创建你的第一部短片" /> },
  { path: '/project/:projectId', element: <Stub title="项目画布" /> },
  { path: '/project/:projectId/preview', element: <Stub title="成片预览" /> },
]
```

Create `createAppRouter()` in the same file using `createBrowserRouter(routes)`, then mount `RouterProvider` from `App.tsx` and `main.tsx`.

- [ ] **Step 6: Verify foundation**

Run:

```bash
cd app
npm run test:run -- src/app/App.test.tsx
npm run typecheck
```

Expected: 3 route cases PASS and TypeScript exits with code 0.

- [ ] **Step 7: Commit**

```bash
git add app
git commit -m "chore: scaffold wireless canvas app"
```

---

### Task 2: Project Domain, Versioned Nodes, and Persistence

**Files:**
- Create: `app/src/features/project/model.ts`
- Create: `app/src/features/project/project-store.ts`
- Create: `app/src/features/project/project-repository.ts`
- Create: `app/src/features/project/project-store.test.ts`
- Create: `app/src/test/fixtures.ts`

**Interfaces:**
- Produces: `Project`, `Asset`, `CanvasNode`, `DependencyEdge`, `TimelineItem`, `GenerationJob`, and `ExportJob` types.
- Produces: `createProject(title: string, intent: string): Project`.
- Produces: `appendNodeVersion(project, nodeId, version): Project` as an immutable domain helper.
- Produces: `useProjectStore` actions `addNode`, `updateNode`, `deleteNode`, `connectNodes`, `appendVersion`, `addToTimeline`, `reorderTimeline`, `undo`, `redo`, `persistActive`, and `hydrate`.
- Produces: `PersistenceStatus = 'saved' | 'saving' | 'failed' | 'offline'`; failed persistence must not roll back in-memory edits.
- Produces: exported `ProjectRepository` class with `save(project): Promise<void>`, `load(projectId): Promise<Project | undefined>`, and `listRecent(limit): Promise<Project[]>`.

- [ ] **Step 1: Define the failing domain tests**

Create tests asserting that:

```ts
const project = createProject('霜河渡', '雨夜寻找失踪的弟弟')
expect(project.timeline).toEqual([])
expect(project.nodes).toEqual([])

const projectWithFixture = makeProjectFixture()
const next = appendNodeVersion(projectWithFixture, 'shot-1', {
  assetId: 'asset-shot-river-v2',
  prompt: '近景，人物望向河面',
})
expect(next.nodes[0].versions).toHaveLength(2)
expect(next.nodes[0].activeVersionId).toBe(next.nodes[0].versions[1].id)
expect(next.nodes[0].versions[0].assetId).toBe('asset-shot-river-v1')
expect(next.assets.find(asset => asset.id === 'asset-shot-river-v1')?.url)
  .toBe('/demo/shot-river.png')
```

Add a persistence test that saves and reloads one project through fake IndexedDB and compares IDs, assets, node positions, edges, versions, and timeline order. Add a repository-failure test that mutates a node, makes `save` reject, and asserts that the edit remains in `activeProject`, `saveStatus` becomes `failed`, and a later retry can become `saved`. Add an offline test using a mocked `navigator.onLine = false` and assert `saveStatus === 'offline'` while the local edit remains readable. Add an undo/redo test that moves a node, restores its prior position with `undo`, reapplies it with `redo`, and clears the redo stack after a new edit.

- [ ] **Step 2: Run tests and confirm missing-domain failures**

Run: `cd app && npm run test:run -- src/features/project/project-store.test.ts`

Expected: FAIL because model constructors and repository methods are undefined.

- [ ] **Step 3: Implement exact domain types**

Create `model.ts` with these unions and fields:

```ts
export type NodeKind = 'character' | 'scene' | 'storyboard' | 'video' | 'preview'
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface NodeVersion {
  id: string
  createdAt: string
  prompt: string
  assetId?: string
  generationJobId?: string
}

export interface Asset {
  id: string
  kind: 'image' | 'video' | 'audio'
  url: string
  mimeType: string
  width?: number
  height?: number
  durationSeconds?: number
}

export interface CanvasNode {
  id: string
  kind: NodeKind
  title: string
  position: { x: number; y: number }
  versions: NodeVersion[]
  activeVersionId: string
  sourceChanged: boolean
}

export interface Project {
  id: string
  title: string
  intent: string
  createdAt: string
  updatedAt: string
  assets: Asset[]
  nodes: CanvasNode[]
  edges: DependencyEdge[]
  timeline: TimelineItem[]
  jobs: GenerationJob[]
  exportJobs: ExportJob[]
}
```

Define the remaining interfaces in the same file, with `TimelineItem` carrying `nodeId`, `order`, `durationSeconds`, and `track: 'video' | 'audio'`. Export this helper signature:

```ts
export function appendNodeVersion(
  project: Project,
  nodeId: string,
  version: Omit<NodeVersion, 'id' | 'createdAt'>,
): Project
```

- [ ] **Step 4: Implement immutable store actions and Dexie repository**

Use one Zustand store containing `projectsById`, `activeProjectId`, `saveStatus`, `past`, `future`, and the action signatures from the Interfaces block. Every user mutation pushes the prior active project onto `past` and clears `future`; `undo` and `redo` move whole project snapshots between the two stacks. `appendVersion` delegates to `appendNodeVersion`, appends the new version, and switches `activeVersionId`; it must never mutate or remove an older version. `persistActive` sets `saving`, saves the current project, and then sets `saved`; offline or rejected saves change only `saveStatus`, never the active project data.

Create one Dexie table:

```ts
class WirelessCanvasDatabase extends Dexie {
  projects!: Table<Project, string>

  constructor() {
    super('wireless-canvas-v1')
    this.version(1).stores({ projects: 'id, updatedAt' })
  }
}
```

Export `ProjectRepository` as a class that accepts `WirelessCanvasDatabase` in its constructor. `save` uses `projects.put`, `load` uses `projects.get`, and `listRecent` orders by `updatedAt`, reverses, and limits the result. Tests instantiate the repository with a unique database name and delete that database in `afterEach`.

- [ ] **Step 5: Verify domain and persistence**

Run: `cd app && npm run test:run -- src/features/project/project-store.test.ts`

Expected: all constructor, versioning, edge, timeline, and persistence cases PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/features/project app/src/test/fixtures.ts
git commit -m "feat: add versioned project domain"
```

---

### Task 3: Visual Foundation and Real Demo Assets

**Files:**
- Create: `app/src/styles/tokens.css`
- Create: `app/src/styles/global.css`
- Create: `app/src/ui/Button.tsx`
- Create: `app/src/ui/FloatingPanel.tsx`
- Create: `app/src/ui/StatusText.tsx`
- Create: `app/public/demo/character-lin-yuan.png`
- Create: `app/public/demo/scene-rain-street.png`
- Create: `app/public/demo/shot-river.png`
- Create: `app/public/demo/shot-rooftop.png`
- Create: `app/src/ui/ui.test.tsx`

**Interfaces:**
- Produces: CSS variables `--surface-canvas`, `--surface-node`, `--text-primary`, `--text-muted`, `--accent`, `--status-error`, and spacing tokens `--space-1` through `--space-8`.
- Produces: `Button`, `FloatingPanel`, and `StatusText` with visible focus styles.
- Produces: four real PNG demo assets used by canvas and preview tests.

- [ ] **Step 1: Write failing UI primitive tests**

Test that `Button` exposes its accessible name, keyboard focus produces the `.focus-visible` style hook, and `StatusText` renders both an icon with `aria-hidden="true"` and visible status copy.

```tsx
render(<StatusText status="failed">生成失败</StatusText>)
expect(screen.getByText('生成失败')).toBeVisible()
expect(screen.getByTestId('status-icon')).toHaveAttribute('aria-hidden', 'true')
```

- [ ] **Step 2: Run tests and confirm missing-components failure**

Run: `cd app && npm run test:run -- src/ui/ui.test.tsx`

Expected: FAIL because shared UI modules do not exist.

- [ ] **Step 3: Implement tokens and primitives**

Use this base palette in `tokens.css`:

```css
:root {
  --surface-canvas: #0b0c0f;
  --surface-node: #17191e;
  --surface-floating: #202229;
  --text-primary: #f2efe8;
  --text-muted: #aaaeb8;
  --accent: #7268f0;
  --status-success: #61b6a7;
  --status-error: #e27f78;
  --focus-ring: #a9a2ff;
}
```

Every interactive primitive must show a 2px `--focus-ring` outline on `:focus-visible`.

- [ ] **Step 4: Generate four project-bound cinematic assets**

Use the built-in ImageGen path with the approved direction image as the style reference. Generate four separate assets, not a contact sheet:

1. `character-lin-yuan.png`: 3:4 portrait of a fictional Chinese female short-film character in a dark raincoat, rainy night, cinematic naturalism, no text.
2. `scene-rain-street.png`: 16:9 empty old-city street in rain, warm practical lights, cinematic naturalism, no person, no text.
3. `shot-river.png`: 16:9 close shot of the same fictional character looking toward a misty river, restrained blue-gray palette, no text.
4. `shot-rooftop.png`: 16:9 rear three-quarter view of the same fictional character on a rainy rooftop, distant city lights, no text.

Save final files at the exact paths listed in the Files block. Inspect each file and reject outputs with watermarks, malformed anatomy, inconsistent wardrobe, unreadable crops, or unexpected text.

- [ ] **Step 5: Verify primitives and assets**

Run:

```bash
cd app
npm run test:run -- src/ui/ui.test.tsx
test -f public/demo/character-lin-yuan.png
test -f public/demo/scene-rain-street.png
test -f public/demo/shot-river.png
test -f public/demo/shot-rooftop.png
```

Expected: UI tests PASS and all four file checks exit with code 0.

- [ ] **Step 6: Commit**

```bash
git add app/src/styles app/src/ui app/public/demo
git commit -m "feat: add cinematic visual foundation"
```

---

### Task 4: Project Launcher Page

**Files:**
- Create: `app/src/features/launcher/ProjectLauncherPage.tsx`
- Create: `app/src/features/launcher/RecipeRow.tsx`
- Create: `app/src/features/launcher/ProjectLauncherPage.test.tsx`
- Modify: `app/src/app/router.tsx`
- Modify: `app/src/styles/global.css`

**Interfaces:**
- Consumes: `createProject(title, intent)` and `ProjectRepository.save(project)` from Task 2.
- Produces: route `/` with intent input, recipe selection, recent projects, and navigation to `/project/:projectId`.
- Produces: `RecipeId = 'cinematic-story' | 'brand-atmosphere' | 'character-teaser'`.

- [ ] **Step 1: Write launcher interaction tests**

Cover these cases:

```tsx
expect(screen.getAllByRole('radio')).toHaveLength(3)
await user.click(screen.getByRole('radio', { name: /电影感叙事/ }))
await user.type(screen.getByLabelText('描述你想创作的短片'), '一位女子在雨夜寻找失踪的弟弟')
await user.click(screen.getByRole('button', { name: '创建项目' }))
expect(mockSave).toHaveBeenCalledTimes(1)
expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/^\/project\//))
```

Add tests for empty intent, parsing cancellation, parsing failure, retry, and “直接进入空白画布”.

- [ ] **Step 2: Run launcher tests and confirm failure**

Run: `cd app && npm run test:run -- src/features/launcher/ProjectLauncherPage.test.tsx`

Expected: FAIL because launcher components are missing.

- [ ] **Step 3: Implement the focused launcher**

Render a small header containing only the product brand, “帮助”, and “账户”; one labeled textarea; three `RecipeRow` radio options; one primary button; and a lightweight recent-project row. When the repository has no recent projects, render one complete clickable example project rather than empty cards. Use an explicit state machine:

```ts
type LauncherState =
  | { status: 'idle' }
  | { status: 'parsing'; abortController: AbortController }
  | { status: 'failed'; message: string }
```

On success, create and persist a project containing character, scene, and first storyboard nodes from the deterministic recipe fixture, then navigate to the canvas.

- [ ] **Step 4: Verify launcher**

Run:

```bash
cd app
npm run test:run -- src/features/launcher/ProjectLauncherPage.test.tsx
npm run typecheck
```

Expected: all launcher cases PASS and TypeScript exits with code 0.

- [ ] **Step 5: Commit**

```bash
git add app/src/features/launcher app/src/app/router.tsx app/src/styles/global.css
git commit -m "feat: add project launcher flow"
```

---

### Task 5: Infinite Canvas, Node Types, and Dependency Edges

**Files:**
- Create: `app/src/features/canvas/CanvasPage.tsx`
- Create: `app/src/features/canvas/CanvasTopBar.tsx`
- Create: `app/src/features/canvas/CanvasToolbar.tsx`
- Create: `app/src/features/canvas/DependencyImpactDialog.tsx`
- Create: `app/src/features/canvas/NodeListView.tsx`
- Create: `app/src/features/canvas/node-types.ts`
- Create: `app/src/features/canvas/edge-types.ts`
- Create: `app/src/features/canvas/nodes/AssetNode.tsx`
- Create: `app/src/features/canvas/nodes/StoryboardNode.tsx`
- Create: `app/src/features/canvas/nodes/VideoNode.tsx`
- Create: `app/src/features/canvas/nodes/PreviewNode.tsx`
- Create: `app/src/features/canvas/CanvasPage.test.tsx`
- Modify: `app/src/app/router.tsx`

**Interfaces:**
- Consumes: project nodes, edges, positions, and store actions from Task 2.
- Produces: custom React Flow node registry `nodeTypes` and dependency edge registry `edgeTypes`.
- Produces: accessible node-list view ordered by dependency depth, then timeline order, then creation time.
- Produces: top-bar persistence copy for saved, saving, failed, and offline states.
- Produces: dependency-impact confirmation before deleting a node with downstream consumers.

- [ ] **Step 1: Write failing canvas tests**

Test that the fixture renders five node names, the canvas region has accessible name “项目画布”, selecting “分镜 02” opens its contextual actions, and adding a dependency edge does not add a timeline item.

```tsx
await user.click(screen.getByRole('button', { name: '分镜 02' }))
expect(screen.getByRole('button', { name: '重生成' })).toBeVisible()
expect(screen.getByRole('button', { name: '扩展镜头' })).toBeVisible()
expect(screen.getByRole('button', { name: '生成视频' })).toBeVisible()
expect(screen.getByRole('button', { name: '加入时间线' })).toBeVisible()
expect(store.getState().activeProject.timeline).toHaveLength(0)
```

Add a keyboard test that opens the node-list view and selects the same node without pointer input. Assert that the floating toolbar exposes exactly these seven controls: “选择”, “文本”, “图片”, “分镜”, “视频”, “连线”, and “分组”. Mock React Flow and assert `zoomOnScroll`, `panActivationKeyCode="Space"`, and `selectionOnDrag` are enabled; a multi-node position change must update every selected node in one undoable store action.

Add a deletion test: deleting a selected node with two downstream consumers opens a dialog naming both affected nodes; pressing “取消” preserves all nodes and edges, while pressing “仍要删除” removes the target plus its incident edges but retains downstream nodes with `sourceChanged: true`. Add top-bar cases for “已保存”, “保存中”, “保存失败，本地更改已保留”, and “已离线，本地更改已保留”. Verify “撤销” and “重做” call their store actions and disable at empty history boundaries.

- [ ] **Step 2: Run canvas tests and confirm failure**

Run: `cd app && npm run test:run -- src/features/canvas/CanvasPage.test.tsx`

Expected: FAIL because canvas route and custom nodes are missing.

- [ ] **Step 3: Implement React Flow canvas shell**

Configure `ReactFlow` with `fitView`, `zoomOnScroll`, `panOnScroll={false}`, `panActivationKeyCode="Space"`, `selectionOnDrag`, and `zoomOnDoubleClick={false}`. Apply `onNodesChange` position changes as one batched project-store mutation so multi-selection moves undo together. Map each domain `CanvasNode` to a React Flow node while keeping domain state authoritative.

Set the canvas container to:

```css
.canvas-page__viewport {
  position: fixed;
  inset: 56px 0 0;
  min-height: calc(100vh - 56px);
  background: var(--surface-canvas);
}
```

The canvas must remain full-bleed; floating tools may overlay it but must not shrink it.

- [ ] **Step 4: Implement node rendering and dependency edges**

Each node receives:

```ts
interface CreativeNodeProps {
  node: CanvasNode
  selected: boolean
  job?: GenerationJob
  onAction(action: 'regenerate' | 'extend-shot' | 'generate-video' | 'add-to-timeline'): void
}
```

Render status with both icon and copy. When an upstream node version changes, mark downstream edges and nodes with `sourceChanged: true`; retain downstream assets.

Render `CanvasTopBar` over the full-bleed viewport without changing its dimensions. It reads `saveStatus` from the store and shows the exact copy from Step 1. `DependencyImpactDialog` derives downstream consumers by traversing outgoing dependency edges and moves focus to its heading when opened; cancel returns focus to the delete trigger.

- [ ] **Step 5: Implement the node-list alternative**

Add a top-bar button named “节点列表”. The view must be a semantic list of buttons, expose node kind and job status as text, and return focus to the corresponding canvas node when closed.

- [ ] **Step 6: Verify canvas**

Run:

```bash
cd app
npm run test:run -- src/features/canvas/CanvasPage.test.tsx
npm run typecheck
```

Expected: node rendering, context actions, dependency semantics, and keyboard list cases PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/features/canvas app/src/app/router.tsx
git commit -m "feat: add infinite creative canvas"
```

---

### Task 6: Generation Queue and Floating AI Director

**Files:**
- Create: `app/src/features/generation/generation-adapter.ts`
- Create: `app/src/features/generation/demo-generation-adapter.ts`
- Create: `app/src/features/generation/generation-queue.ts`
- Create: `app/src/features/generation/generation-queue.test.ts`
- Create: `app/src/features/director/DirectorComposer.tsx`
- Create: `app/src/features/director/director-command.ts`
- Create: `app/src/features/director/director-command.test.ts`
- Modify: `app/src/features/canvas/CanvasPage.tsx`
- Modify: `app/src/features/project/project-store.ts`

**Interfaces:**
- Produces: `GenerationAdapter.start(request, signal): Promise<GenerationResult>`.
- Produces: `GenerationQueue.enqueue`, `cancel`, and `retry`.
- Produces: `parseDirectorCommand(input, context): DirectorCommand`.
- Consumes: active node selection and project context from Task 5.

- [ ] **Step 1: Write failing generation queue tests**

Use fake timers to verify the state sequence `queued → running → succeeded`, cancellation to `cancelled`, and retry from `failed` with the same request ID plus incremented attempt count.

```ts
const job = queue.enqueue({
  nodeId: 'shot-2',
  operation: 'regenerate',
  prompt: '近景，人物望向河面',
  referenceAssetUrls: ['/demo/shot-river.png'],
})
expect(job.status).toBe('queued')
await vi.advanceTimersByTimeAsync(1200)
expect(queue.get(job.id)?.status).toBe('succeeded')
expect(store.getState().activeProject.nodes.find(n => n.id === 'shot-2')?.versions)
  .toHaveLength(2)
```

- [ ] **Step 2: Write failing AI Director parser tests**

Cover exact mappings:

```ts
expect(parseDirectorCommand('扩展这个镜头', { selectedNodeId: 'shot-2' })).toEqual({
  type: 'extend-shot',
  sourceNodeId: 'shot-2',
})

expect(parseDirectorCommand('把这个片段加入时间线', { selectedNodeId: 'video-2' })).toEqual({
  type: 'add-to-timeline',
  nodeId: 'video-2',
})
```

Unknown input must return a suggestion containing three supported example commands; it must not mutate the project.

- [ ] **Step 3: Run tests and confirm missing-queue failures**

Run:

```bash
cd app
npm run test:run -- src/features/generation/generation-queue.test.ts src/features/director/director-command.test.ts
```

Expected: FAIL because adapters, queue, and parser are undefined.

- [ ] **Step 4: Implement the adapter and queue**

Define:

```ts
export interface GenerationRequest {
  nodeId: string
  operation: 'regenerate' | 'extend-shot' | 'generate-video'
  prompt: string
  referenceAssetUrls: string[]
}

export interface GenerationResult {
  version: NodeVersion
  asset: Asset
}

export interface GenerationAdapter {
  start(request: GenerationRequest, signal: AbortSignal): Promise<GenerationResult>
}

export interface GenerationQueueOptions {
  adapter: GenerationAdapter
  onJobChange(job: GenerationJob): void
  onSuccess(job: GenerationJob, result: GenerationResult): void
}
```

Construct the queue as `new GenerationQueue(options: GenerationQueueOptions)`. `enqueue(request)` immediately returns a `GenerationJob`; `get(id)`, `cancel(id)`, and `retry(id)` address that stable job ID, with `retry` incrementing `attempt`.

The deterministic adapter resolves after 1200ms and returns both a new `Asset` and a `NodeVersion` that references the asset ID. Abort must reject with `DOMException('Generation cancelled', 'AbortError')`. Queue success applies operation-specific mutations: `regenerate` appends a version to the selected node; `extend-shot` creates the next numbered storyboard node (for example, `分镜 02`) plus an incoming dependency edge; `generate-video` creates the correspondingly numbered downstream video node (for example, `视频 02`) plus edge and selects the new node. Never overwrite the selected node's prior version or asset.

- [ ] **Step 5: Implement the floating Director Composer**

Place the composer at the bottom center of the viewport. Its label is “AI 导演”; its textarea label is “告诉我下一步要做什么”. Submission calls `parseDirectorCommand`, shows a readable suggestion before mutation, and requires one click on “执行” for destructive commands such as removing or replacing a node.

- [ ] **Step 6: Verify queue and composer integration**

Run:

```bash
cd app
npm run test:run -- src/features/generation src/features/director src/features/canvas/CanvasPage.test.tsx
npm run typecheck
```

Expected: progress, cancellation, retry, asset-reference integrity, version preservation, storyboard extension, video-node creation, supported commands, and unknown-command cases PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/features/generation app/src/features/director app/src/features/canvas/CanvasPage.tsx app/src/features/project/project-store.ts
git commit -m "feat: add AI director generation flow"
```

---

### Task 7: Timeline, Preview, and Deterministic Export

**Files:**
- Create: `app/src/features/timeline/PreviewPage.tsx`
- Create: `app/src/features/timeline/PreviewPlayer.tsx`
- Create: `app/src/features/timeline/TimelineTrack.tsx`
- Create: `app/src/features/timeline/timeline-model.ts`
- Create: `app/src/features/timeline/timeline-model.test.ts`
- Create: `app/src/features/timeline/PreviewPage.test.tsx`
- Create: `app/src/features/export/export-adapter.ts`
- Create: `app/src/features/export/demo-export-adapter.ts`
- Create: `app/src/features/export/ExportPanel.tsx`
- Create: `app/src/features/export/ExportPanel.test.tsx`
- Modify: `app/src/app/router.tsx`
- Modify: `app/src/features/project/project-store.ts`

**Interfaces:**
- Produces: `reorderTimeline(items, fromIndex, toIndex): TimelineItem[]` without mutating the source array.
- Produces: `ExportAdapter.start(settings, signal): Promise<ExportResult>`.
- Produces: preview route with frame stepping, current-clip loop, adjacent-shot comparison, single video track, single audio track, inspector, and “返回画布”.

- [ ] **Step 1: Write failing timeline model tests**

Test reorder, duration total, missing-node gaps, and immutable inputs:

```ts
const original = [first, second]
const reordered = reorderTimeline(original, 1, 0)
expect(reordered.map(item => item.nodeId)).toEqual(['video-2', 'video-1'])
expect(original.map(item => item.nodeId)).toEqual(['video-1', 'video-2'])
expect(reordered.map(item => item.order)).toEqual([0, 1])
```

- [ ] **Step 2: Write failing export panel tests**

Create `PreviewPage.test.tsx` and verify that “上一帧” and “下一帧” move playback by exactly `1 / 24` seconds, “循环当前片段” constrains playback to the active timeline item, and “对比上一镜头” shows the current and previous clip side by side. The comparison control is disabled on the first clip.

In `ExportPanel.test.tsx`, verify defaults `1920×1080`, `16:9`, `24fps`, and `watermark: false`. Test `queued → running → succeeded`, cancellation, failure, and retry from the failed item rather than restarting successful clips. During `running`, assert visible overall percentage, estimated time remaining, and “可在后台继续” copy.

- [ ] **Step 3: Run tests and confirm failure**

Run:

```bash
cd app
npm run test:run -- src/features/timeline src/features/export
```

Expected: FAIL because timeline and export modules are missing.

- [ ] **Step 4: Implement timeline and preview route**

Render `PreviewPlayer` as a large player with exact controls “上一帧”, “下一帧”, “循环当前片段”, and “对比上一镜头”. Beside it, render the current-clip inspector with duration, aspect ratio, source node, and continuity warning. Render one semantic list for video items and one audio track row. Each video item exposes accessible “将视频 NN 前移” and “将视频 NN 后移” controls, disabled at the corresponding boundary. The “返回画布” link includes `?focus=<nodeId>` so the canvas can select and center the originating node.

For missing assets, render a visible “缺少片段” item with a button linking to the origin node. For mismatched aspect ratios, show “统一裁切” and “逐镜确认”.

- [ ] **Step 5: Implement deterministic export jobs**

Define:

```ts
export interface ExportSettings {
  width: 1920
  height: 1080
  aspectRatio: '16:9'
  frameRate: 24
  watermark: boolean
}

export interface ExportResult {
  exportJobId: string
  downloadUrl: string
  completedAt: string
}
```

The demo adapter emits deterministic progress every 300ms and resolves after 1800ms to `/demo/exports/<projectId>.mp4`. `ExportPanel` shows percentage, a derived remaining-time estimate, and “可在后台继续” while running. The prototype must label the final result “演示导出”; it must not claim that a production render occurred.

- [ ] **Step 6: Verify preview and export**

Run:

```bash
cd app
npm run test:run -- src/features/timeline src/features/export
npm run typecheck
```

Expected: frame stepping, loop, comparison, inspector, reorder, gap, aspect-ratio, export progress, background copy, cancellation, retry, and return-to-canvas cases PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/features/timeline app/src/features/export app/src/app/router.tsx app/src/features/project/project-store.ts
git commit -m "feat: add preview and export flow"
```

---

### Task 8: End-to-End Acceptance, Accessibility, and Visual QA

**Files:**
- Create: `app/playwright.config.ts`
- Create: `app/e2e/creation-flow.spec.ts`
- Modify: `app/src/features/launcher/ProjectLauncherPage.tsx`
- Modify: `app/src/features/canvas/CanvasPage.tsx`
- Modify: `app/src/features/canvas/NodeListView.tsx`
- Modify: `app/src/features/timeline/PreviewPage.tsx`
- Modify: `app/src/features/export/ExportPanel.tsx`

**Interfaces:**
- Consumes: all completed routes and deterministic adapters.
- Produces: one browser acceptance test proving the V1 minimal loop.
- Produces: final desktop comparison against `design-references/wireless-canvas-v1-direction-2.png` at 1440×1024.

- [ ] **Step 1: Write the failing end-to-end test**

Create `app/e2e/creation-flow.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('creator completes the minimum short-film loop', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('描述你想创作的短片').fill('一位女子在雨夜寻找失踪的弟弟')
  await page.getByRole('radio', { name: /电影感叙事/ }).check()
  await page.getByRole('button', { name: '创建项目' }).click()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()

  await page.getByRole('button', { name: '分镜 01' }).click()
  await page.getByRole('button', { name: '扩展镜头' }).click()
  await expect(page.getByRole('button', { name: '分镜 02' })).toBeVisible()

  await page.getByRole('button', { name: '分镜 01' }).click()
  await page.getByRole('button', { name: '生成视频' }).click()
  await expect(page.getByRole('button', { name: '视频 01' })).toBeVisible()
  await page.getByRole('button', { name: '加入时间线' }).click()

  await page.getByRole('button', { name: '分镜 02' }).click()
  await page.getByRole('button', { name: '生成视频' }).click()
  await expect(page.getByRole('button', { name: '视频 02' })).toBeVisible()
  await page.getByRole('button', { name: '加入时间线' }).click()

  await page.getByRole('link', { name: '预览' }).click()
  await expect(page.getByRole('heading', { name: '成片预览' })).toBeVisible()
  await page.getByRole('button', { name: '将视频 02 前移' }).click()
  await expect(page.getByRole('list', { name: '主视频轨' }).getByRole('listitem').first())
    .toContainText('视频 02')
  await page.getByRole('button', { name: '导出影片' }).click()
  await expect(page.getByText('演示导出已完成')).toBeVisible()
})
```

- [ ] **Step 2: Run the acceptance test and confirm failure**

Run:

```bash
cd app
npx playwright install chromium
npm run e2e -- e2e/creation-flow.spec.ts
```

Expected: FAIL at the first missing or inaccessible control.

- [ ] **Step 3: Close accessibility and interaction gaps**

Fix only failures exposed by the test and this checklist:

- Every tool and node action has an accessible name.
- Focus is visible against dark surfaces.
- Context actions open with Enter or Space.
- Node List View can complete select, regenerate, and add-to-timeline actions.
- Status includes visible text for queued, running, succeeded, failed, and cancelled.
- Browser zoom at 200% keeps the selected node details and primary action reachable.

- [ ] **Step 4: Run the complete automated suite**

Run:

```bash
cd app
npm run test:run
npm run typecheck
npm run build
npm run e2e
```

Expected: all unit tests PASS, TypeScript exits with code 0, Vite build exits with code 0, and Playwright reports the acceptance test PASS.

- [ ] **Step 5: Perform visual comparison at the approved viewport**

Start the app with `npm run dev -- --host 127.0.0.1`. At exactly 1440×1024:

1. Capture the project canvas with “分镜 02” selected.
2. Compare it side-by-side with `design-references/wireless-canvas-v1-direction-2.png`.
3. Verify the canvas dominates the viewport, nodes form a legible diagonal dependency flow, the left toolbar is compact, the selected node has a restrained violet accent, and the AI Director composer floats at the bottom.
4. Fix visible clipping, unintended card grids, low-contrast text, excessive panel chrome, or misaligned connectors.
5. Capture and compare again after fixes.

Expected: no cropped text, overlapping nodes, broken connectors, hidden primary actions, or source-style drift that changes the approved interaction model.

- [ ] **Step 6: Commit**

```bash
git add app
git commit -m "test: verify wireless canvas v1 flow"
```

---

## Final Verification Gate

Run from the repository root:

```bash
cd app
npm run test:run
npm run typecheck
npm run build
npm run e2e
```

Confirm all four commands exit with code 0. Then inspect `git status --short` and verify that only intentional user-owned files outside `app/` remain untracked.

The prototype is complete only when the full creation flow passes in Chromium and the 1440×1024 visual comparison has been inspected against the approved direction image.
