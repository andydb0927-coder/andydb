# Creative cards implementation plan

> Date: 2026-08-13  
> Design: `docs/superpowers/specs/2026-08-13-creative-cards-design.md`

**Goal:** Add sustainable script, character, and worldview card domains to the existing canvas, including structured create/edit flows, card-to-card dependencies, and image references from the local asset library.

**Architecture:** Extend the persisted node model with three new kinds and an optional discriminated `CreativeCard`. Keep pure validation/version/asset-reference logic in the project domain. A dedicated accessible card editor loads image records through an injected library repository. CanvasPage orchestrates placement and editing while the existing ProjectStore remains authoritative for undo, downstream invalidation, autosave, and hydration.

**Constraints:**

- Preserve legacy `character` reference nodes; structured roles use `character-card`.
- Never read, modify, stage, or commit `audit-2026-08-06/`.
- Do not call LibTV or any external generation provider.
- Write tests before production changes for each task.
- After each GREEN, run the relevant regression slice and `git diff --check` before continuing.

---

## Task 1: Structured card domain contracts

**Files:**

- Modify: `app/src/features/project/model.ts`
- Create: `app/src/features/project/creative-card.ts`
- Create: `app/src/features/project/creative-card.test.ts`
- Modify: `app/src/features/project/project-store.ts`
- Modify: `app/src/features/project/project-store.test.ts`

- [x] **Step 1: Write failing domain tests**

Cover all three discriminated card shapes, required fields, 40-character titles, 2,000-character fields, deterministic summaries, default numbered titles, collision-safe node/version ids, optional library image snapshots, editing as a new version, downstream invalidation, undo/redo, and no duplicate project asset.

- [x] **Step 2: Run RED**

```bash
cd app
npm run test:run -- src/features/project/creative-card.test.ts src/features/project/project-store.test.ts
```

- [x] **Step 3: Implement minimal domain and store mutation**

Add `script | character-card | worldview` to `NodeKind`, add the optional card union to `CanvasNode`, and implement pure `buildCreativeCardCreation` / `updateCreativeCardProject` helpers. Add one ProjectStore action that applies edits through the pure helper and marks downstream consumers changed.

- [x] **Step 4: Run GREEN and regression**

Run Step 2, the dependency-policy suite, and typecheck.

- [x] **Step 5: Self-review**

Verify old nodes without `card` remain valid, project assets are deduplicated by id, and invalid drafts have no mutation.

---

## Task 2: Connection matrix and card node rendering

**Files:**

- Modify: `app/src/features/project/dependency-policy.ts`
- Modify: `app/src/features/project/dependency-policy.test.ts`
- Create: `app/src/features/canvas/nodes/CreativeCardNode.tsx`
- Create: `app/src/features/canvas/nodes/CreativeCardNode.test.tsx`
- Modify: `app/src/features/canvas/nodes/AssetNode.tsx`
- Modify: `app/src/features/canvas/node-types.ts`
- Modify: `app/src/features/canvas/node-action-policy.ts`
- Modify: `app/src/features/canvas/node-action-policy.test.ts`
- Modify: `app/src/features/canvas/NodeListView.tsx`

- [x] **Step 1: Write failing connection and renderer tests**

Assert every card pair is compatible in either direction when acyclic, all cards can feed storyboard/video, cycle/duplicate/self rules remain intact, the real node displays structured labels and referenced image, and its only primary action is `编辑卡片`.

- [x] **Step 2: Run RED**

```bash
npm run test:run -- src/features/project/dependency-policy.test.ts src/features/canvas/nodes/CreativeCardNode.test.tsx src/features/canvas/node-action-policy.test.ts
```

- [x] **Step 3: Implement matrix, node type, and list copy**

Reuse the existing focusable shell/handles and add a structured card preview. Register all new React Flow types, readable kind labels, edit icon/action, and node-list action routing.

- [x] **Step 4: Run GREEN and focused canvas regression**

Run Step 2 plus AssetNode, connection-tool, and relevant CanvasPage tests.

- [x] **Step 5: Self-review**

Check legacy character rendering, edge accessibility, corrupted missing-card fallback, and that cards do not accidentally trigger generation.

---

## Task 3: Accessible create/edit panel with library images

**Files:**

- Create: `app/src/features/canvas/CreativeCardEditor.tsx`
- Create: `app/src/features/canvas/CreativeCardEditor.test.tsx`
- Modify: `app/src/styles/global.css`

- [x] **Step 1: Write failing editor tests**

Cover exact fields for each kind, initial title focus, required/length errors, image-only filtering, selected image output, empty library, fixed read failure, Escape, Command/Ctrl+Enter, edit prefill, submit-once, and small-width layout semantics.

- [x] **Step 2: Run RED**

```bash
npm run test:run -- src/features/canvas/CreativeCardEditor.test.tsx
```

- [x] **Step 3: Implement the minimal editor**

Use native inputs/select/textarea, injected `list()` repository, fixed error copy, and a discriminated submit value. The editor never imports files or contacts a remote service.

- [x] **Step 4: Run GREEN, typecheck, and build**

- [x] **Step 5: Self-review**

Verify stale async library loads do not update an unmounted editor and existing selected images survive a library-read failure.

---

## Task 4: Canvas placement, editing, focus, and persistence

**Files:**

- Modify: `app/src/features/canvas/CanvasToolbar.tsx`
- Modify: `app/src/features/canvas/CanvasToolbar.test.tsx`
- Modify: `app/src/features/canvas/CanvasPage.tsx`
- Modify: `app/src/features/canvas/CanvasPage.test.tsx`

- [x] **Step 1: Write failing Canvas integration tests**

Cover three toolbar tools; create each card with exact structured data; choose an existing library image; no duplicate asset; edit from the real node and node list; focus return; route-switch discard; card-to-card connection; undo/redo; autosave and hydration; legacy creation and generation remain green.

- [x] **Step 2: Run RED**

```bash
npm run test:run -- src/features/canvas/CanvasToolbar.test.tsx src/features/canvas/CanvasPage.test.tsx
```

- [x] **Step 3: Implement Canvas orchestration**

Share one default database between project and asset-library repositories. Route card tools to the dedicated editor, basic tools to NodeDraftPanel, and `edit-card` to an edit state that is cleared on project changes. Preserve exact focus fallback when a node-list trigger unmounts.

- [x] **Step 4: Run GREEN and expanded focused suites**

Run Step 2 plus all project, asset-library, card-editor, card-node, and connection suites; then typecheck and build.

- [x] **Step 5: Self-review**

Check stale route state, editor double-submit, autosave races, active-version image resolution, existing provider confirmation, and keyboard shortcuts while a card dialog is open.

---

## Task 5: Controlled browser proof

**Files:**

- Create: `app/e2e/creative-cards.spec.ts`

- [x] **Step 1: Write the browser path**

Import one local PNG into the asset library, create all three cards with their exact fields and the imported image, connect script → character → worldview, edit one card, assert card labels and edges, wait for save, reload, assert persistence, return to Assets and assert the single source image remains deduplicated. Capture console/page errors.

- [ ] **Step 2: Run focused Chromium**

```bash
npx playwright test e2e/creative-cards.spec.ts
```

- [ ] **Step 3: Self-review browser evidence**

Reject screenshots-only evidence: assertions must prove persisted structured text, edge names, image references, focus return, and no console/page errors.

---

## Task 6: Final gates, review, and delivery

**Files:**

- Modify: `docs/superpowers/plans/2026-08-13-creative-cards.md`
- Modify only focused product/test files required by real review findings.

- [ ] **Step 1: Run fresh full verification**

```bash
cd app
npm run test:run
npm run typecheck
npm run build
npx playwright test
cd ..
git diff --check
git status --short --untracked-files=no
```

- [x] **Step 2: Whole-phase code review**

Review domain invariants, legacy compatibility, asset identity, stale async state, route cleanup, undo/redo, persistence, dependency cycles, focus/keyboard behavior, and absence of external calls. Fix Important/Critical findings with RED/GREEN evidence.

- [ ] **Step 3: Confirm protected boundary**

Prove the exact staged list and phase commit range contain no `audit-2026-08-06/` path.

- [ ] **Step 4: Mark evidence-backed plan steps complete and commit**

Stage exact scoped files and commit:

```bash
git commit -m "feat: add script character and worldview cards"
```

Keep the branch local and unmerged unless the user explicitly expands scope.

### Verification note

- Focused Vitest, expanded 270-test regression, typecheck, and production build passed.
- Fresh full verification passed 43 Vitest files / 611 tests; the focused Playwright spec is discoverable and compiles.
- Independent review found one Important issue: editing a card did not clear stale inbound `sourceChanged` edge state. A failing regression assertion reproduced it, and the store fix now passes the focused and full Vitest suites.
- Focused Chromium is implemented but could not start in the current execution sandbox: local server binding returned `EPERM`, headless Chromium Mach-port registration was denied, and the application browser correctly blocked local `file://` loading. No external provider was called and no browser-bypass technique was used.
- Exact-path staging was attempted after all gates, but the managed workspace denied creation of the worktree `index.lock`. The index and `HEAD` remain unchanged; committing requires a Git-writable execution context.
