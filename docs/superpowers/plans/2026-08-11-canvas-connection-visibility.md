# Canvas Connection Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a LibTV-style local canvas control that hides or shows dependency-edge visuals without changing project data or connection capability.

**Architecture:** Keep `connectionsVisible` as transient state owned by `CanvasPage`, pass it through the controlled React Flow edge data, and keep `Project.edges` as the only durable graph. `CanvasToolbar` owns only the button presentation; `DependencyEdge` renders no path, hit layer, or delete action when visibility is false. The `H` shortcut calls the same toggle callback with the existing safe keyboard-target guards.

**Tech Stack:** React 18, TypeScript, Zustand project store, `@xyflow/react`, Vitest + Testing Library, Playwright Chromium, CSS in `app/src/styles/global.css`.

## Global Constraints

- Visibility is local canvas view state, defaults to visible, and is not written to `Project`, Zustand, Dexie, save status, undo/redo history, or timeline.
- Hidden mode removes dependency-edge visuals, pointer hit layers, focus, and edge delete controls; node handles and `L` connection mode remain usable.
- `H` is ignored in inputs, textareas, selects, `contenteditable`, dialogs, repeated/modifier key events, pending drafts, and node-list/delete modal states.
- The toolbar control has a stable accessible name, `aria-pressed`, Enter/Space support, and remains reachable at 721×778 CSS pixels.
- No new dependency, individual-edge visibility, project preference persistence, grouping, minimap, timeline, export, or generation behavior is introduced.
- Every production change follows RED → GREEN focused tests before refactoring; full unit, typecheck, lint, build, Chromium, and diff-check gates run before completion.

## File Map

- `app/src/features/canvas/edge-types.ts`: add `visible` to `DependencyEdgeData`.
- `app/src/features/canvas/DependencyEdge.tsx`: short-circuit hidden edge rendering.
- `app/src/features/canvas/DependencyEdge.test.tsx`: visible/hidden renderer tests.
- `app/src/features/canvas/CanvasToolbar.tsx`: render Eye/EyeOff visibility toggle.
- `app/src/features/canvas/CanvasToolbar.test.tsx`: test labels, pressed state, callback.
- `app/src/features/canvas/CanvasPage.tsx`: local state, status, project reset, edge wiring, `H` shortcut.
- `app/src/features/canvas/CanvasPage.test.tsx`: page wiring, guards, selection clearing, no Store mutation.
- `app/src/styles/global.css`: toolbar separator, pressed state, status pill, narrow layout.
- `app/e2e/node-connections.spec.ts`: genuine Chromium visibility and connection-preservation flow.
- `design-qa.md`: visibility QA entry; preserve actual-200% pending status.

---

### Task 1: Add the hidden-edge rendering contract

**Files:**
- Modify: `app/src/features/canvas/edge-types.ts`
- Modify: `app/src/features/canvas/DependencyEdge.tsx`
- Test: `app/src/features/canvas/DependencyEdge.test.tsx`

**Interfaces:**
- Consumes: existing `DependencyFlowEdge` data and React Flow `EdgeProps`.
- Produces: `DependencyEdgeData.visible: boolean`; `DependencyEdge` treats `false` as hidden and otherwise preserves current rendering.

- [ ] **Step 1: Write the failing renderer test**

Add `visible: boolean` to renderer fixtures and add a selected hidden-edge test. It must assert no `.dependency-edge__paths`, no `.dependency-edge__interaction`, and no `删除连接：...` button. Keep the selected-visible test and assert its delete action still renders.

```tsx
test('does not render paths, hit area, or delete action when hidden', () => {
  const { container } = render(
    <DependencyEdge
      id="edge-a-b"
      source="a"
      target="b"
      sourceX={0}
      sourceY={0}
      targetX={100}
      targetY={100}
      sourcePosition={Position.Right}
      targetPosition={Position.Left}
      selected
      data={{
        visible: false,
        sourceChanged: false,
        ariaLabel: '角色参考 → 分镜 01',
        onDelete: vi.fn(),
      }}
    />,
  )

  expect(container.querySelector('.dependency-edge__paths')).toBeNull()
  expect(container.querySelector('.dependency-edge__interaction')).toBeNull()
  expect(screen.queryByRole('button', { name: /删除连接/ })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npm run test:run -- src/features/canvas/DependencyEdge.test.tsx -t 'hidden|selected edge delete'
```

Expected: the hidden assertion fails because the renderer currently always creates paths and a selected delete control.

- [ ] **Step 3: Implement the minimal renderer/data change**

Add `visible: boolean` to `DependencyEdgeData`. At the top of `DependencyEdge`, use `const visible = data?.visible ?? true` and return `null` before calculating or rendering paths when `visible === false`. Keep the existing `24 / zoom` interaction compensation and delete-control inverse scale unchanged.

- [ ] **Step 4: Run the focused test and verify GREEN**

```bash
npm run test:run -- src/features/canvas/DependencyEdge.test.tsx
```

Expected: every DependencyEdge test passes, including visible selection/delete and hidden-edge absence.

- [ ] **Step 5: Commit the renderer contract**

```bash
git add app/src/features/canvas/edge-types.ts app/src/features/canvas/DependencyEdge.tsx app/src/features/canvas/DependencyEdge.test.tsx
git commit -m "feat: support hidden dependency edges"
```

---

### Task 2: Add the accessible toolbar visibility control

**Files:**
- Modify: `app/src/features/canvas/CanvasToolbar.tsx`
- Test: `app/src/features/canvas/CanvasToolbar.test.tsx`

**Interfaces:**
- Consumes: `connectionsVisible: boolean` and `onToggleConnections(): void` from `CanvasPage`.
- Produces: `隐藏连线` while visible and `显示连线` while hidden, with `aria-pressed` equal to the visibility state.

- [ ] **Step 1: Write the failing toolbar test**

Extend the current toolbar fixture with the two new props. Assert the dynamic name/pressed value and that activation calls only the visibility callback, not `onToolChange`.

```tsx
test('exposes a pressed visibility toggle without changing the active tool', async () => {
  const user = userEvent.setup()
  const onToolChange = vi.fn()
  const onToggleConnections = vi.fn()
  render(
    <CanvasToolbar
      activeTool="select"
      draftOpen={false}
      connectionsVisible
      onToolChange={onToolChange}
      onToggleConnections={onToggleConnections}
    />,
  )

  const toggle = screen.getByRole('button', { name: '隐藏连线' })
  expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await user.click(toggle)
  expect(onToggleConnections).toHaveBeenCalledOnce()
  expect(onToolChange).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npm run test:run -- src/features/canvas/CanvasToolbar.test.tsx
```

Expected: the test fails because the new props and visibility button do not exist.

- [ ] **Step 3: Implement the minimal toolbar control**

Import `Eye` and `EyeOff` from `lucide-react`. Render a button after the tool list with a dedicated class, dynamic `aria-label`, `aria-pressed={connectionsVisible}`, `title`, and `onClick={onToggleConnections}`. Keep it outside the `CanvasTool` union so it cannot activate placement or connection tools. Update every existing toolbar/page fixture for the required props.

- [ ] **Step 4: Run the focused test and verify GREEN**

```bash
npm run test:run -- src/features/canvas/CanvasToolbar.test.tsx
```

Expected: all toolbar tests pass with existing Group-disabled and draft-disabled behavior unchanged.

- [ ] **Step 5: Commit the toolbar control**

```bash
git add app/src/features/canvas/CanvasToolbar.tsx app/src/features/canvas/CanvasToolbar.test.tsx
git commit -m "feat: add canvas connection visibility control"
```

---

### Task 3: Wire local state, status feedback, and the `H` shortcut

**Files:**
- Modify: `app/src/features/canvas/CanvasPage.tsx`
- Test: `app/src/features/canvas/CanvasPage.test.tsx`

**Interfaces:**
- Consumes: `CanvasToolbar` visibility props and `DependencyEdgeData.visible`.
- Produces: local `connectionsVisible` state, `toggleConnectionsVisibility`, dynamic edge data, and an `H` shortcut that preserves current tool/port behavior.

- [ ] **Step 1: Write failing CanvasPage tests**

Update the React Flow fixture edge data with `visible`. Add focused tests that select an edge, click `隐藏连线`, and assert `latestFlowProps.edges[0].data.visible === false`, the edge is no longer selected, the button becomes `显示连线`, and the project `past`, `saveStatus`, and active-project reference are unchanged. Add tests for an unmodified `h` event, an input/textarea target, a modifier key, and a repeated key. Assert Connect mode and port-mode node data stay unchanged while toggling. Remount under a new project ID and assert visibility resets to `true`.

```tsx
await user.click(screen.getByRole('button', { name: '隐藏连线' }))
expect(latestFlowProps?.edges[0].data?.visible).toBe(false)
expect(latestFlowProps?.edges[0].selected).toBe(false)
expect(screen.getByRole('button', { name: '显示连线' })).toHaveAttribute(
  'aria-pressed',
  'false',
)
```

- [ ] **Step 2: Run the focused CanvasPage tests and verify RED**

```bash
npm run test:run -- src/features/canvas/CanvasPage.test.tsx -t 'visibility|hidden|shortcut|H key|connection toggle'
```

Expected: the new assertions fail because CanvasPage has no visibility state, dynamic edge data, status feedback, or `H` listener.

- [ ] **Step 3: Implement local state and edge wiring**

Add `connectionsVisible` initialized to `true` and a separate `visibilityFeedback` state. Reset both in the existing `projectId` effect. Implement `toggleConnectionsVisibility` with `connectionsVisible` in its dependency list; clear `selectedEdgeId` only when hiding and set “连线已隐藏，端口仍可使用” or “连线已显示”. Do not call Store actions. Add `visible: connectionsVisible` to each mapped edge and include the state in `flowEdges` dependencies. Pass the two visibility props to `CanvasToolbar`. Add visibility feedback to `canvasHint` without overriding connection errors or source/target prompts, using a `canvas-visibility-hint` class for the non-error state.

- [ ] **Step 4: Implement the safe `H` listener**

Add a `keydown` effect parallel to the existing `L` listener. Return early for `defaultPrevented`, `repeat`, non-`h`, Alt/Ctrl/Meta/Shift, missing project, pending placement, open node list, delete dialog, or an editable target. Do not require an idle connection phase; toggling while Connect is active preserves Connect mode and port state. Call `preventDefault()` and `toggleConnectionsVisibility()` only after all guards pass.

- [ ] **Step 5: Run the focused tests and verify GREEN**

```bash
npm run test:run -- src/features/canvas/CanvasPage.test.tsx -t 'visibility|hidden|shortcut|H key|connection toggle'
```

Expected: all new page tests pass and the existing CanvasPage regressions remain green.

- [ ] **Step 6: Commit the page wiring**

```bash
git add app/src/features/canvas/CanvasPage.tsx app/src/features/canvas/CanvasPage.test.tsx
git commit -m "feat: wire canvas connection visibility"
```

---

### Task 4: Style the control and prove the real browser flow

**Files:**
- Modify: `app/src/styles/global.css`
- Modify: `app/e2e/node-connections.spec.ts`
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: the toolbar button, `canvas-visibility-hint`, and `visible` edge rendering from Tasks 1–3.
- Produces: compact responsive styling and real Chromium evidence at normal and 721×778 layouts.

- [ ] **Step 1: Write failing Chromium tests**

Use the existing `createCinematicProject` helper and seeded `角色参考 → 分镜 01` edge. Assert paths exist, click `隐藏连线`, assert the dynamic button is pressed false, the edge path count is zero, and the status says “连线已隐藏，端口仍可使用”; click `显示连线` and assert paths return. Add a second flow that focuses the canvas and presses `h`, focuses the AI Director textarea and presses `h` without changing state, hides edges, uses the existing real `L`/handle keyboard flow to create `角色参考 → 视频 01`, shows edges, and asserts the genuine new edge is visible. At 721×778, assert the toggle rectangle is fully in the viewport and its center resolves to the toggle button; reload and assert edges default to visible.

```ts
test('hides and restores dependency visuals without changing connection data', async ({ page }) => {
  await createCinematicProject(page)
  const edge = page.getByLabel('角色参考 → 分镜 01', { exact: true })
  const toggle = page.getByRole('button', { name: '隐藏连线' })

  await expect(edge.locator('.dependency-edge__paths')).toHaveCount(1)
  await toggle.click()
  await expect(page.getByRole('button', { name: '显示连线' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(edge.locator('.dependency-edge__paths')).toHaveCount(0)
  await expect(page.getByText('连线已隐藏，端口仍可使用')).toBeVisible()

  await page.getByRole('button', { name: '显示连线' }).click()
  await expect(edge.locator('.dependency-edge__paths')).toHaveCount(1)
})
```

- [ ] **Step 2: Run the focused Chromium tests and verify RED**

```bash
npm run e2e -- e2e/node-connections.spec.ts --grep 'hides and restores|visibility|connection data' --reporter=line
```

Expected: tests fail because the visibility button, edge suppression, status copy, and `H` behavior are not yet wired or styled.

- [ ] **Step 3: Add compact responsive styling**

Add a separator and hover/focus/pressed treatment for `.canvas-toolbar__visibility`, share the existing 32px icon-button sizing, and style `.canvas-visibility-hint` alongside the existing hint pill. At `max-width: 800px`, keep the toolbar inside the left safe inset and cap hint width so it cannot overlap `.director-composer`.

- [ ] **Step 4: Run the focused Chromium tests and verify GREEN**

```bash
npm run e2e -- e2e/node-connections.spec.ts --grep 'hides and restores|visibility|connection data' --reporter=line
```

Expected: the real button, hidden edge layer, preserved port connection, keyboard guards, status copy, narrow geometry, reload-default behavior, and console-error assertions pass.

- [ ] **Step 5: Record QA evidence without changing the 200% claim**

Append a short `design-qa.md` entry documenting normal/721×778 visibility behavior, preserved `L` port creation, no Store mutation, and the existing actual-200% status as pending. Restore any Playwright-regenerated tracked screenshots unless a new reviewed screenshot is intentionally added.

- [ ] **Step 6: Commit styling and browser acceptance**

```bash
git add app/src/styles/global.css app/e2e/node-connections.spec.ts design-qa.md
git commit -m "test: verify canvas connection visibility"
```

---

### Task 5: Run the complete verification gate

**Files:**
- Verify: all tracked files from Tasks 1–4

**Interfaces:**
- Consumes: the complete local visibility feature and focused coverage.
- Produces: a clean tree with no new lint, build, or browser errors.

- [ ] **Step 1: Run focused unit and component tests**

```bash
cd app
npm run test:run -- src/features/canvas/DependencyEdge.test.tsx src/features/canvas/CanvasToolbar.test.tsx src/features/canvas/CanvasPage.test.tsx
```

Expected: all focused files pass, including existing connection regressions.

- [ ] **Step 2: Run full static gates**

```bash
npm run test:run
npm run typecheck
node_modules/.bin/oxlint src
npm run build
```

Expected: Vitest has zero failures, TypeScript exits 0, Oxlint has no new errors, and Vite build exits 0. Existing Fast Refresh and bundle-size advisories may remain documented.

- [ ] **Step 3: Run the full Chromium gate**

```bash
npm run e2e -- --reporter=line
```

Expected: all existing and new Chromium tests pass, including node creation, genuine connections, edge editing, zoom geometry, accessibility, and visibility toggling.

- [ ] **Step 4: Check the diff and working tree**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intended feature/QA files are modified. Restore generated screenshots before reporting a clean tree.

- [ ] **Step 5: Confirm the final commit state**

```bash
git log --oneline -8
git status --short
```

Expected: feature commits are present, `audit-2026-08-06/` remains untouched, and actual 200% in-app Browser verification is still explicitly described as pending.

## Self-Review Checklist

- Spec sections 2–4 map to Tasks 1–3 state, data, and control wiring.
- Spec section 5.2 maps to Task 4’s hidden-state genuine `L` connection test.
- Spec section 6 maps to Task 3 guards and selection clearing.
- Spec section 7 maps to Tasks 1–5 focused, Chromium, static, and diff gates.
- Spec section 8 non-goals are repeated in Global Constraints and have no implementation tasks.
- No production code is written before its focused failing test.
- The plan contains no `TODO`, `TBD`, or unspecified “add appropriate handling” steps.
