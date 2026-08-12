# Workflow execution implementation plan

> Date: 2026-08-13  
> Design: `docs/superpowers/specs/2026-08-13-workflow-execution-design.md`

**Goal:** Turn selected generation-capable canvas nodes into durable serial or parallel local-demo runs with node progress, logs, cancellation, retry, and refresh recovery.

**Architecture:** Add a pure workflow domain that snapshots requests and orders the selected dependency subgraph. Persist complete `WorkflowRun` aggregates in a Dexie v4 table. A framework-independent runner owns abort controllers, progress, serial/parallel scheduling, retry, and recovery while callbacks atomically apply successful output to the project store. A focused React panel renders run creation and the durable queue. CanvasPage injects an always-local `DemoGenerationAdapter`, independent of the existing provider preference.

**Constraints:**

- Never read, modify, stage, or commit `audit-2026-08-06/`.
- Workflow execution must never instantiate or call LibTV/external adapters.
- Write failing tests before each production slice.
- After every GREEN, run the relevant regression slice and `git diff --check`.
- Do not run Chromium E2E in this sandbox; final gates are Vitest, typecheck, and build.
- Do not commit; the acceptance owner will commit.

---

## Task 1: Workflow aggregate and deterministic request plan

**Files:**

- Create: `app/src/features/workflow/workflow-model.test.ts`
- Create: `app/src/features/workflow/workflow-model.ts`

- [x] **Step 1: Write failing domain tests**

Cover executable-kind filtering, dependency topology, canvas-position tie breaking, request snapshots, image/video target kinds, empty selection rejection, status/progress helpers, and immutable recovery normalization.

- [x] **Step 2: Run RED**

```bash
cd app
npm run test:run -- src/features/workflow/workflow-model.test.ts
```

- [x] **Step 3: Implement the minimal pure domain**

Build a `WorkflowRun` from a project and selected ids, snapshot active prompt/reference asset, topologically sort selected executable nodes, and expose pure aggregate progress/status helpers.

- [x] **Step 4: Run GREEN and typecheck**

- [x] **Step 5: Self-review**

Verify deterministic ordering, no mutation of the project/selected set, and no provider preference import.

---

## Task 2: Dexie v4 repository and legacy upgrade

**Files:**

- Modify: `app/src/features/project/project-repository.ts`
- Modify: `app/src/features/project/project-store.test.ts`
- Create: `app/src/features/workflow/workflow-repository.test.ts`
- Create: `app/src/features/workflow/workflow-repository.ts`

- [x] **Step 1: Write failing persistence tests**

Cover complete run round-trip, per-project updated ordering, isolation between projects, overwrite of the same aggregate id, and upgrade from a legacy database without a workflow table.

- [x] **Step 2: Run RED**

```bash
npm run test:run -- src/features/workflow/workflow-repository.test.ts src/features/project/project-store.test.ts
```

- [x] **Step 3: Add the v4 table and repository**

Share the existing database class. Keep workflow writes independent from project/library transactions and expose only `save`, `load`, and `listByProject`.

- [x] **Step 4: Run GREEN and repository regression**

- [x] **Step 5: Self-review**

Verify older project databases open unchanged and no destructive migration is used.

---

## Task 3: TDD workflow runner and atomic result application

**Files:**

- Create: `app/src/features/workflow/workflow-runner.test.ts`
- Create: `app/src/features/workflow/workflow-runner.ts`
- Modify: `app/src/features/project/project-store.test.ts`
- Modify: `app/src/features/project/project-store.ts`

- [x] **Step 1: Write failing runner/store tests**

Prove serial max concurrency one; parallel starts every pending task; progress and logs transition; success is applied once to the owning original node; serial failure leaves later tasks pending; parallel failure does not cancel siblings; failed-node retry increments attempt and skips success; cancellation aborts active/pending; recovery converts interrupted running tasks to pending and skips success; dispose ignores late results.

- [x] **Step 2: Run RED**

```bash
npm run test:run -- src/features/workflow/workflow-runner.test.ts src/features/project/project-store.test.ts
```

- [x] **Step 3: Implement runner and store mutation**

Use per-task abort controllers and a serialized publish chain. Normalize successful results with a stable workflow task job id before one project-store mutation. Keep all workflow state transitions persisted through the injected callback.

- [x] **Step 4: Run GREEN plus generation queue regression**

- [x] **Step 5: Self-review**

Check stale attempt guards, dispose behavior, asset/version collision rejection, no successful double-apply, and no external adapter dependency.

---

## Task 4: Accessible workflow run panel

**Files:**

- Create: `app/src/features/workflow/WorkflowRunPanel.test.tsx`
- Create: `app/src/features/workflow/WorkflowRunPanel.tsx`
- Modify: `app/src/styles/global.css`

- [x] **Step 1: Write failing component tests**

Cover selected count, serial/parallel selection, disabled empty creation, run status/overall progress, node order/progress/attempt, live logs, cancel visibility, failed-node retry, and stable accessible names.

- [x] **Step 2: Run RED**

```bash
npm run test:run -- src/features/workflow/WorkflowRunPanel.test.tsx
```

- [x] **Step 3: Implement the minimal panel and responsive styles**

Use native select/button/progress/details elements and fixed Chinese status copy. Render newest runs first without hiding terminal records.

- [x] **Step 4: Run GREEN and UI primitive regression**

- [x] **Step 5: Self-review**

Verify terminal runs cannot be cancelled, only failed nodes can retry, logs are screen-reader discoverable, and the panel does not overlap critical controls at narrow widths.

---

## Task 5: Canvas selection, execution, persistence, and recovery integration

**Files:**

- Modify: `app/src/features/canvas/CanvasPage.test.tsx`
- Modify: `app/src/features/canvas/CanvasPage.tsx`

- [x] **Step 1: Write failing Canvas integration tests**

Cover mixed multi-selection filtering, serial/parallel run creation, always-local adapter use even under LibTV preference, result attachment to each original node, cancellation, failed retry, persisted run hydration/recovery, project switch cleanup, and existing single-node generation behavior.

- [x] **Step 2: Run RED**

```bash
npm run test:run -- src/features/canvas/CanvasPage.test.tsx
```

- [x] **Step 3: Wire the panel and runner into CanvasPage**

Inject workflow repository/adapter for tests, default to the shared Dexie database and a dedicated `DemoGenerationAdapter`, load project runs after hydration, resume incomplete records, and dispose in-memory work without cancelling durable runs on route exit.

- [x] **Step 4: Run GREEN and expanded workflow/generation/canvas regression**

- [x] **Step 5: Self-review**

Check async route guards, stale repository loads, autosave after each result, adapter isolation, and cleanup of timers/controllers.

---

## Task 6: Final verification and delivery

**Files:**

- Modify: `docs/superpowers/plans/2026-08-13-workflow-execution.md`
- Modify only scoped product/test files required by verified failures.

- [x] **Step 1: Run fresh full gates**

```bash
cd app
npm run test:run
npm run typecheck
npm run build
cd ..
git diff --check
git status --short --untracked-files=no
```

- [x] **Step 2: Whole-feature self-review**

Review state transitions, scheduling concurrency, persistence ordering, recovery idempotency, result identity, route cleanup, accessibility, responsive layout, and external-provider isolation. Fix every Important/Critical finding with RED/GREEN evidence.

- [x] **Step 3: Update evidence-backed checkboxes and report**

Report design points, exact Vitest file/test counts, typecheck/build results, and any genuine residual items. Leave the worktree uncommitted.

### Verification note

- TDD added 23 focused tests across the workflow domain, Dexie repository, runner, run panel, and Canvas integration.
- Fresh full verification passed 47 Vitest files / 635 tests.
- `npm run typecheck` passed with TypeScript project references.
- `npm run build` passed; Vite emitted only the existing advisory that the main bundle exceeds 500 kB after minification.
- Chromium E2E was intentionally not run because the requested sandbox acceptance boundary is Vitest + typecheck + build.
- `git diff --check` passed. The worktree remains uncommitted for the acceptance owner.
