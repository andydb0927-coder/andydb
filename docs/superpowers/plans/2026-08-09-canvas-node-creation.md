# Canvas Node Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the text, image, storyboard, and video toolbar entries into accessible click-to-place node creation flows with atomic undoable persistence.

**Architecture:** Keep React Flow interaction state in `CanvasPage`, move the draft form into a focused `NodeDraftPanel`, and keep node construction in a pure `node-draft` domain module. Persist a node and its optional image Asset through one project-store commit so undo, redo, autosave, and Dexie hydration share the existing project snapshot path.

**Tech Stack:** React 19, TypeScript, Zustand, React Flow 12, Dexie, Vitest, Testing Library, Playwright Chromium, existing Lucide icons and CSS tokens.

## Global Constraints

- Do not add dependencies, routes, sidebars, asset-library screens, grouping, dedicated connect mode, drag-and-drop upload, or continuous creation mode.
- Creatable kinds are exactly `text`, `image`, `storyboard`, and `video`.
- Titles are trimmed and contain 1–40 characters; text or prompt content is trimmed and contains 1–1000 characters.
- Image input accepts PNG, JPEG, and WebP only, with an 8 MiB source-file limit.
- Image assets use durable data URLs, never `blob:` URLs.
- Confirming one draft creates exactly one undo history entry; cancelling creates none.
- Every production behavior starts with a focused failing test and an observed expected RED.
- Existing generation, timeline, preview, export, zoom, accessibility, and drag behavior must remain green.

---

## File Map

- `app/src/features/project/model.ts`: add `text` and `image` node kinds plus the shared atomic creation payload.
- `app/src/features/canvas/node-draft.ts`: pure draft validation, default numbering, and node/Asset construction.
- `app/src/features/canvas/node-draft.test.ts`: deterministic domain tests for all four kinds.
- `app/src/features/project/project-store.ts`: atomic node plus optional Asset project mutation.
- `app/src/features/project/project-store.test.ts`: atomic create, conflict, undo, and redo tests.
- `app/src/features/canvas/node-action-policy.ts`: compatible contextual actions for new node kinds.
- `app/src/features/canvas/node-action-policy.test.ts`: action policy tests.
- `app/src/features/canvas/nodes/AssetNode.tsx`: new kind copy/icons and policy-driven actions.
- `app/src/features/canvas/node-types.ts`: register `text` and `image` renderers.
- `app/src/features/canvas/image-file.ts`: image type/size validation and FileReader conversion.
- `app/src/features/canvas/image-file.test.ts`: image preparation tests.
- `app/src/features/canvas/NodeDraftPanel.tsx`: accessible draft form and keyboard behavior.
- `app/src/features/canvas/NodeDraftPanel.test.tsx`: panel validation, submit, cancel, and focus tests.
- `app/src/features/canvas/CanvasToolbar.tsx`: controlled toolbar state and activation callback.
- `app/src/features/canvas/CanvasPage.tsx`: click-to-place orchestration and submission.
- `app/src/features/canvas/CanvasPage.test.tsx`: placement, selection, history, project switch, and Dexie reload integration.
- `app/src/styles/global.css`: placement cursor and responsive draft-panel styles.
- `app/e2e/creation-flow.spec.ts`: Chromium creation, keyboard, refresh, and 200% layout acceptance.

---

### Task 1: Define creatable node domain structures

**Files:**
- Modify: `app/src/features/project/model.ts`
- Create: `app/src/features/canvas/node-draft.ts`
- Create: `app/src/features/canvas/node-draft.test.ts`

**Interfaces:**
- Produces: `CanvasCreation` in the project model, plus `CreatableNodeKind`, `PreparedImage`, `NodeDraftFields`, `NodeDraftInput`, `DraftValidationErrors`, `nextNodeTitle()`, `validateNodeDraft()`, and `buildCanvasCreation()` in the draft module.
- Consumes: existing `Project`, `CanvasNode`, `Asset`, and `NodeKind` model types.

- [ ] **Step 1: Write failing domain tests**

Create table-driven tests that assert:

```ts
const environment = {
  now: () => '2026-08-09T08:00:00.000Z',
  randomId: vi
    .fn()
    .mockReturnValueOnce('node-id')
    .mockReturnValueOnce('version-id')
    .mockReturnValueOnce('asset-id'),
}

expect(nextNodeTitle(projectWithTitles(['文本 01', '文本 03']), 'text'))
  .toBe('文本 04')

expect(validateNodeDraft({
  kind: 'storyboard',
  title: ' ',
  content: '',
})).toEqual({ title: '请输入标题', content: '请输入画面提示词' })

expect(buildCanvasCreation(project, {
  kind: 'image',
  title: ' 雨夜参考 ',
  content: '',
  position: { x: 120, y: 240 },
  image: { dataUrl: 'data:image/png;base64,AA==', mimeType: 'image/png' },
}, environment)).toMatchObject({
  node: {
    id: 'node-id',
    kind: 'image',
    title: '雨夜参考',
    position: { x: 120, y: 240 },
    activeVersionId: 'version-id',
    versions: [{ id: 'version-id', prompt: '雨夜参考', assetId: 'asset-id' }],
  },
  asset: {
    id: 'asset-id',
    kind: 'image',
    url: 'data:image/png;base64,AA==',
    mimeType: 'image/png',
  },
})
```

Cover all four kinds, maximum lengths, missing image, manual duplicate titles, and numbering after deleted gaps.

- [ ] **Step 2: Run tests and verify expected RED**

Run: `cd app && npm run test:run -- src/features/canvas/node-draft.test.ts`

Expected: FAIL because `node-draft.ts` and the `text`/`image` kinds do not exist.

- [ ] **Step 3: Implement the domain module**

Add the model kinds and exact public contracts:

```ts
export type CreatableNodeKind = Extract<
  NodeKind,
  'text' | 'image' | 'storyboard' | 'video'
>

export interface PreparedImage {
  dataUrl: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
}

export interface NodeDraftFields {
  kind: CreatableNodeKind
  title: string
  content: string
  image?: PreparedImage
}

export interface NodeDraftInput extends NodeDraftFields {
  position: CanvasNode['position']
}

export interface CreationEnvironment {
  now(): string
  randomId(): string
}

export interface DraftValidationErrors {
  title?: string
  content?: string
  image?: string
}

// project/model.ts
export interface CanvasCreation {
  node: CanvasNode
  asset?: Asset
}
```

Use Chinese prefixes `{ text: '文本', image: '图片', storyboard: '分镜', video: '视频' }`. Match only titles shaped like `${prefix} NN`, take the maximum numeric suffix plus one, and format with `padStart(2, '0')`. `validateNodeDraft(fields: NodeDraftFields)` validates form fields without requiring a placement. `buildCanvasCreation()` must trim inputs, create one initial version, use the image title when its description is empty, and allocate IDs in node → version → optional Asset order. The draft module imports and returns `CanvasCreation`; the project store imports that shared payload only from `project/model.ts`, so the project feature never depends on the canvas feature.

- [ ] **Step 4: Run focused tests GREEN**

Run: `cd app && npm run test:run -- src/features/canvas/node-draft.test.ts`

Expected: PASS with every creatable kind and boundary case covered.

- [ ] **Step 5: Commit the domain slice**

```bash
git add app/src/features/project/model.ts app/src/features/canvas/node-draft.ts app/src/features/canvas/node-draft.test.ts
git commit -m "feat: define canvas node drafts"
```

---

### Task 2: Persist node and optional Asset atomically

**Files:**
- Modify: `app/src/features/project/project-store.ts`
- Modify: `app/src/features/project/project-store.test.ts`

**Interfaces:**
- Consumes: `CanvasCreation` from `project/model.ts` in Task 1.
- Produces: `createCanvasContent(creation: CanvasCreation): void` on `ProjectStore`.

- [ ] **Step 1: Write failing store tests**

Add tests that call:

```ts
useProjectStore.getState().createCanvasContent({ node, asset })
```

Assert the active project gains both records, `past` grows by exactly one, `future` clears, and `saveStatus` becomes `dirty`. Then call `undo()` and `redo()` and assert node and Asset disappear and reappear together. Add a conflict test proving duplicate node or Asset IDs leave the project object and history unchanged.

- [ ] **Step 2: Run the focused store test RED**

Run: `cd app && npm run test:run -- src/features/project/project-store.test.ts -t "creates canvas content atomically"`

Expected: FAIL because `createCanvasContent` is missing.

- [ ] **Step 3: Implement one-store-commit creation**

Add the interface method and implementation:

```ts
createCanvasContent: ({ node, asset }) => {
  commit((project) => {
    const nodeConflict = project.nodes.some(({ id }) => id === node.id)
    const assetConflict =
      asset !== undefined && project.assets.some(({ id }) => id === asset.id)
    if (nodeConflict || assetConflict) return project

    return withUpdatedTimestamp({
      ...project,
      assets: asset ? [...project.assets, asset] : project.assets,
      nodes: [...project.nodes, node],
    })
  })
}
```

Do not call the existing `addNode()` and do not create a second commit for the Asset.

- [ ] **Step 4: Run store tests GREEN**

Run: `cd app && npm run test:run -- src/features/project/project-store.test.ts`

Expected: PASS with atomic history and existing generation/history sanitation intact.

- [ ] **Step 5: Commit atomic persistence**

```bash
git add app/src/features/project/project-store.ts app/src/features/project/project-store.test.ts
git commit -m "feat: create canvas content atomically"
```

---

### Task 3: Render new kinds with compatible actions

**Files:**
- Create: `app/src/features/canvas/node-action-policy.ts`
- Create: `app/src/features/canvas/node-action-policy.test.ts`
- Modify: `app/src/features/canvas/nodes/AssetNode.tsx`
- Modify: `app/src/features/canvas/node-types.ts`

**Interfaces:**
- Produces: `NodeActionSpec` and `primaryActionsForNode(kind, hasAsset)`.
- Consumes: `CreativeNodeAction` and `NodeKind`.

- [ ] **Step 1: Write failing action-policy tests**

Assert exact action IDs and labels:

```ts
expect(primaryActionsForNode('text', false)).toEqual([
  { action: 'extend-shot', label: '生成分镜' },
])
expect(primaryActionsForNode('image', true)).toEqual([
  { action: 'generate-video', label: '生成视频' },
])
expect(primaryActionsForNode('video', false)).not.toContainEqual(
  expect.objectContaining({ action: 'add-to-timeline' }),
)
expect(primaryActionsForNode('video', true)).toContainEqual({
  action: 'add-to-timeline',
  label: '加入时间线',
})
```

Preserve existing character, scene, storyboard, video, and preview primary actions except that timeline eligibility remains Asset-gated.

- [ ] **Step 2: Run policy tests RED**

Run: `cd app && npm run test:run -- src/features/canvas/node-action-policy.test.ts`

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement policy and renderer registration**

Define:

```ts
export interface NodeActionSpec {
  action: CreativeNodeAction
  label: string
}
```

Update `NodeActions` to map policy specs to existing Lucide icons, then append running-job cancel, terminal-job retry, and delete exactly as today. Extend `kindCopy` and `kindIcons` with `text: '文本'`/`Type` and `image: '图片'`/`Image`. Register both kinds to `AssetNode` in `nodeTypes`.

- [ ] **Step 4: Run policy and Canvas tests GREEN**

Run: `cd app && npm run test:run -- src/features/canvas/node-action-policy.test.ts src/features/canvas/CanvasPage.test.tsx`

Expected: PASS with existing contextual action assertions unchanged unless their accessible labels intentionally improve.

- [ ] **Step 5: Commit rendering support**

```bash
git add app/src/features/canvas/node-action-policy.ts app/src/features/canvas/node-action-policy.test.ts app/src/features/canvas/nodes/AssetNode.tsx app/src/features/canvas/node-types.ts
git commit -m "feat: render creatable canvas node kinds"
```

---

### Task 4: Prepare durable local image Assets

**Files:**
- Create: `app/src/features/canvas/image-file.ts`
- Create: `app/src/features/canvas/image-file.test.ts`

**Interfaces:**
- Produces: `MAX_IMAGE_BYTES`, `ACCEPTED_IMAGE_TYPES`, `ImagePreparationError`, and `prepareImageFile(file: File): Promise<PreparedImage>`.
- Consumes: `PreparedImage` from Task 1.

- [ ] **Step 1: Write failing image tests**

Cover a PNG returning a `data:image/png;base64,` URL, JPEG/WebP MIME preservation, an unsupported GIF returning a `type` error, a file larger than `8 * 1024 * 1024` returning a `size` error, and a mocked FileReader error returning a `read` error.

```ts
await expect(prepareImageFile(
  new File(['png'], 'frame.png', { type: 'image/png' }),
)).resolves.toMatchObject({ mimeType: 'image/png' })

await expect(prepareImageFile(
  new File(['gif'], 'frame.gif', { type: 'image/gif' }),
)).rejects.toMatchObject({ code: 'type' })
```

- [ ] **Step 2: Run image tests RED**

Run: `cd app && npm run test:run -- src/features/canvas/image-file.test.ts`

Expected: FAIL because `prepareImageFile` does not exist.

- [ ] **Step 3: Implement validation before FileReader**

Use exact constants:

```ts
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const
```

Reject type and size before constructing `FileReader`. Resolve only when `reader.result` is a `data:` string; otherwise reject `new ImagePreparationError('read')`.

- [ ] **Step 4: Run image tests GREEN**

Run: `cd app && npm run test:run -- src/features/canvas/image-file.test.ts`

Expected: PASS without object URLs or network access.

- [ ] **Step 5: Commit image preparation**

```bash
git add app/src/features/canvas/image-file.ts app/src/features/canvas/image-file.test.ts
git commit -m "feat: prepare durable image assets"
```

---

### Task 5: Build the accessible draft panel

**Files:**
- Create: `app/src/features/canvas/NodeDraftPanel.tsx`
- Create: `app/src/features/canvas/NodeDraftPanel.test.tsx`
- Modify: `app/src/styles/global.css`

**Interfaces:**
- Consumes: `CreatableNodeKind`, `PreparedImage`, `validateNodeDraft()`, and `prepareImageFile()`.
- Produces: `NodeDraftFormValue`, `NodeDraftPanel`, and deterministic `clampDraftPanelPosition()` geometry.

- [ ] **Step 1: Write failing panel tests**

Render the panel for each kind and assert exact labels. Test initial focus, inline required errors, PNG selection, invalid type/size copy, a FileReader failure that preserves title/description and permits a second file selection, plain textarea Enter newline, `Control+Enter` submit, `Escape` cancel, file-read and submit-pending button disabling, and error fields linked with `aria-describedby`. Table-test `clampDraftPanelPosition()` for top-left, bottom-right, 320 px-wide, and 721×778 effective 200% bounds.

Use this public contract:

```ts
export interface NodeDraftFormValue {
  title: string
  content: string
  image?: PreparedImage
}

export interface NodeDraftPanelProps {
  kind: CreatableNodeKind
  initialTitle: string
  anchor: { x: number; y: number }
  bounds: { width: number; height: number }
  onCancel(): void
  onSubmit(value: NodeDraftFormValue): void | Promise<void>
}

export interface DraftPanelPosition {
  left: number
  top: number
  width: number
  maxHeight: number
}

export function clampDraftPanelPosition(
  anchor: { x: number; y: number },
  bounds: { width: number; height: number },
): DraftPanelPosition
```

- [ ] **Step 2: Run panel tests RED**

Run: `cd app && npm run test:run -- src/features/canvas/NodeDraftPanel.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement focused form behavior**

Use one `<form>` with title input, kind-specific textarea label, image input only for `image`, Cancel and Confirm buttons. Keep plain Enter inside the textarea, submit on `Control+Enter` or `Meta+Enter`, and cancel on Escape. Guard submission with local `submitting` state.

Compute panel geometry using these exact constants and formulas:

```ts
const PANEL_WIDTH = 320
const PANEL_MAX_HEIGHT = 440
const PANEL_MARGIN = 16
const width = Math.max(0, Math.min(PANEL_WIDTH, bounds.width - 32))
const maxHeight = Math.max(0, Math.min(PANEL_MAX_HEIGHT, bounds.height - 32))
const left = Math.min(
  Math.max(PANEL_MARGIN, anchor.x),
  Math.max(PANEL_MARGIN, bounds.width - width - PANEL_MARGIN),
)
const top = Math.min(
  Math.max(PANEL_MARGIN, anchor.y),
  Math.max(PANEL_MARGIN, bounds.height - maxHeight - PANEL_MARGIN),
)
```

Apply the returned `left`, `top`, `width`, and `maxHeight` as inline pixel values to an absolutely positioned panel with `overflow: auto`. At bounds heights below 480 px, replace `top` with `Math.max(16, bounds.height - maxHeight - 16)` so the panel remains bottom-docked with its own scroll region.

- [ ] **Step 4: Run panel tests GREEN**

Run: `cd app && npm run test:run -- src/features/canvas/NodeDraftPanel.test.tsx`

Expected: PASS for mouse, keyboard, validation, and focus.

- [ ] **Step 5: Commit the panel**

```bash
git add app/src/features/canvas/NodeDraftPanel.tsx app/src/features/canvas/NodeDraftPanel.test.tsx app/src/styles/global.css
git commit -m "feat: add canvas node draft panel"
```

---

### Task 6: Connect toolbar selection to click-to-place creation

**Files:**
- Modify: `app/src/features/canvas/CanvasToolbar.tsx`
- Modify: `app/src/features/canvas/CanvasPage.tsx`
- Modify: `app/src/features/canvas/CanvasPage.test.tsx`

**Interfaces:**
- Consumes: `NodeDraftPanel`, `nextNodeTitle()`, `buildCanvasCreation()`, and `createCanvasContent()`.
- Produces: controlled `CanvasTool` toolbar behavior and complete page orchestration.

- [ ] **Step 1: Write failing Canvas integration tests**

Extend the React Flow mock with `onPaneClick` and `screenToFlowPosition`. Prove:

```ts
await user.click(screen.getByRole('button', { name: '分镜' }))
expect(screen.getByRole('button', { name: '分镜' })).toHaveAttribute(
  'aria-pressed',
  'true',
)

act(() => latestFlowProps?.onPaneClick({ clientX: 420, clientY: 300 }))
expect(screen.getByRole('dialog', { name: '创建分镜节点' })).toBeVisible()
expect(screen.getByLabelText('标题')).toHaveValue('分镜 03')
```

Submit and assert the store node uses the mocked `screenToFlowPosition()` result, one history entry exists, autosave receives the new snapshot once, the new node is selected, and Selection is active again. Add cancel, Escape, node-click non-trigger, second pane-click suppression, project switch and unmount cleanup, and four-kind table cases.

- [ ] **Step 2: Run Canvas tests RED**

Run: `cd app && npm run test:run -- src/features/canvas/CanvasPage.test.tsx -t "creates nodes from the toolbar"`

Expected: FAIL because the toolbar is uncontrolled and CanvasPage has no pane creation flow.

- [ ] **Step 3: Make CanvasToolbar controlled**

Export:

```ts
export type CanvasTool =
  | 'select'
  | 'text'
  | 'image'
  | 'storyboard'
  | 'video'
  | 'connect'
  | 'group'

export interface CanvasToolbarProps {
  activeTool: CanvasTool
  disabled?: boolean
  draftOpen: boolean
  onToolChange(tool: CanvasTool, trigger: HTMLButtonElement): void
}
```

Only creatable tools enter placement mode in this task. `draftOpen` disables the four creatable tool buttons until the draft closes. Connect and Group remain visible but disabled with accessible titles explaining they are unavailable in this iteration.

- [ ] **Step 4: Add CanvasPage orchestration**

Store `activeTool`, the activating button, and a pending placement containing kind, flow position, viewport-relative anchor, and bounds. Add `onPaneClick` only when a project, flow instance, and creatable active tool exist. Build and atomically persist the creation on panel submit, then select the new node, reset to Selection, and focus the new node in a queued microtask. On cancel or project change, clear pending state, reset Selection, and restore the activating tool button.

- [ ] **Step 5: Run Canvas tests GREEN**

Run: `cd app && npm run test:run -- src/features/canvas/CanvasPage.test.tsx`

Expected: PASS including the existing drag performance, focus return, generation, deletion, persistence, and zoom contracts.

- [ ] **Step 6: Commit page integration**

```bash
git add app/src/features/canvas/CanvasToolbar.tsx app/src/features/canvas/CanvasPage.tsx app/src/features/canvas/CanvasPage.test.tsx
git commit -m "feat: create nodes from the canvas toolbar"
```

---

### Task 7: Prove durable reload and full user acceptance

**Files:**
- Modify: `app/src/features/canvas/CanvasPage.test.tsx`
- Modify: `app/e2e/creation-flow.spec.ts`
- Modify only if evidence exposes a layout defect: `app/src/styles/global.css`

**Interfaces:**
- Consumes: completed node creation workflow from Tasks 1–6.
- Produces: durable Dexie and Chromium acceptance evidence.

- [ ] **Step 1: Write failing real-Dexie reload test**

Use `WirelessCanvasDatabase` and `ProjectRepository`, create an image node through the Canvas UI using `public/demo/character-lin-yuan.png`, wait for `saveStatus === 'saved'`, unmount, reset Zustand, remount the same route, and assert the node title, data URL Asset, active version link, and position restore.

- [ ] **Step 2: Run reload test and verify expected RED or missing coverage**

Run: `cd app && npm run test:run -- src/features/canvas/CanvasPage.test.tsx -t "reloads toolbar-created image content"`

Expected before adding the test harness: FAIL at the missing toolbar interaction or persistence assertion. If Tasks 1–6 already make the behavior green, temporarily mutate `createCanvasContent()` to omit the Asset, observe the test fail at the missing image, restore production, and rerun GREEN.

- [ ] **Step 3: Add Chromium creation acceptance**

Extend `creation-flow.spec.ts` to:

1. activate Text with keyboard and create a text node;
2. activate Image, choose `public/demo/character-lin-yuan.png`, and create an image node;
3. create Storyboard and Video nodes at distinct pane coordinates;
4. assert each new node is selected after creation and Selection is reactivated;
5. keyboard-activate a fifth draft, cancel with Escape, and assert focus returns with no fifth node;
6. drag the created text node, undo and redo the latest creation, and record the post-drag position;
7. reload and assert all four nodes, the uploaded image, and the dragged text position remain visible;
8. repeat panel reachability at the existing 721×778 effective 200% layout and assert the full panel, inline errors, and both buttons are inside the viewport;
9. assert the browser console error collection remains empty.

- [ ] **Step 4: Run focused acceptance GREEN**

Run: `cd app && npm run e2e -- --reporter=line --grep "creates canvas nodes"`

Expected: PASS with no page console errors.

- [ ] **Step 5: Run the complete verification gate**

Run in order:

```bash
cd app && npm run test:run
cd app && npm run typecheck
cd app && node_modules/.bin/oxlint src
cd app && npm run build
cd app && npm run e2e -- --reporter=line
git diff --check
git status --short
```

Expected: all unit and Chromium tests pass; typecheck/build exit 0; Oxlint has no errors (the existing `NodeListView.tsx` Fast Refresh warning may remain); Vite may retain the existing >500 kB advisory; the worktree contains only intentional task changes before the final commit.

- [ ] **Step 6: Commit acceptance coverage and any verified layout correction**

```bash
git add app/src/features/canvas/CanvasPage.test.tsx app/e2e/creation-flow.spec.ts app/src/styles/global.css
git commit -m "test: verify canvas node creation flow"
```

---

## Plan Self-Review Checklist

- [x] Every requirement in `docs/superpowers/specs/2026-08-09-canvas-node-creation-design.md` maps to a task above.
- [x] No task introduces grouping, dedicated connect mode, drag-and-drop upload, a new route, a new dependency, or a new persistence channel.
- [x] `CreatableNodeKind`, `PreparedImage`, `NodeDraftFields`, `NodeDraftInput`, `CanvasCreation`, `createCanvasContent`, `NodeDraftFormValue`, and `CanvasTool` names are consistent across tasks.
- [x] The project store imports `CanvasCreation` only from `project/model.ts`; no project-to-canvas dependency is introduced.
- [x] Every production task has an explicit RED command, minimal GREEN implementation, GREEN command, and commit.
- [x] Image validation happens before FileReader; node plus Asset persistence is atomic.
- [x] Cancellation, unmounting, and project switching do not mutate project history.
- [x] Focus return and 200% reachability have automated coverage.
