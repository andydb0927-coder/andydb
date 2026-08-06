# Task 5 Fix Round 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the five Important canvas findings while preserving the selected visual direction, exactly three routes, and side-effect-free Task 6 generation callbacks.

**Architecture:** Keep `Project` in Zustand authoritative and treat React Flow selection, positions, nodes, and edges as controlled projections. Put generation-job resolution in a shared pure selector, make dependency creation enforce a DAG, and keep route-loading state local to `CanvasPage` while reusing Task 4 hydration tokens and abort signals.

**Tech Stack:** React 19, TypeScript, Zustand, React Flow, React Router, Vitest, Testing Library.

## Global Constraints

- Follow strict RED-GREEN-REFACTOR for every production change.
- Do not alter the ledgered dialog-focus or video-renderer Minor findings.
- Do not fake Task 6 generation success or mutate the timeline from dependency creation.
- Preserve exactly three routes and the full-bleed direction-2 visual structure.

---

### Task 1: Controlled multi-selection and batched movement

**Files:**
- Modify: `app/src/features/canvas/CanvasPage.test.tsx`
- Modify: `app/src/features/canvas/CanvasPage.tsx`

**Interfaces:**
- Consumes React Flow `NodeChange<CreativeFlowNode>[]` selection and final position changes.
- Produces controlled `selected` flags for every selected node plus one `primaryNodeId` for contextual actions and focus return.

- [ ] Add a test that sends two real `{ type: 'select', selected: true }` changes through `onNodesChange`, verifies both projected nodes remain selected, then sends their final positions and verifies one history entry.
- [ ] Run the focused canvas test and confirm the second selected node is lost before implementation.
- [ ] Replace the single selection state with `selectedNodeIds` plus `primaryNodeId`; apply every selection change in one functional set update while preserving a single contextual node.
- [ ] Run the focused canvas test and confirm selection plus one-step undo pass.

### Task 2: Active-version generation-job selection

**Files:**
- Create: `app/src/features/canvas/job-selector.ts`
- Modify: `app/src/features/canvas/CanvasPage.test.tsx`
- Modify: `app/src/features/canvas/CanvasPage.tsx`
- Modify: `app/src/features/canvas/NodeListView.tsx`

**Interfaces:**
- Produces `selectNodeGenerationJob(node: CanvasNode, jobs: GenerationJob[]): GenerationJob | undefined`.
- Active `generationJobId` wins; legacy nodes fall back to greatest `updatedAt`, then `createdAt`, then `id`.

- [ ] Add a UI regression with an older succeeded job before a current running job referenced by the active version; assert canvas and node-list both show `生成中`.
- [ ] Run focused canvas tests and confirm both consumers show the stale succeeded status.
- [ ] Implement the shared pure selector and use it in both consumers.
- [ ] Re-run focused canvas tests and confirm current job status wins.

### Task 3: Resolve stale input state on version append

**Files:**
- Modify: `app/src/features/project/project-store.test.ts`
- Modify: `app/src/features/project/project-store.ts`

**Interfaces:**
- `appendVersion('B', version)` clears `B.sourceChanged` and incoming edges targeting B, while marking B's outgoing/transitive downstream nodes and edges stale.

- [ ] Add an A to B to C store fixture with stale B/C and both stale edges; append B and assert B/incoming edge clear, C/outgoing edge stay stale, assets remain identical, and one history entry is created.
- [ ] Run the focused store test and confirm B plus its incoming edge remain stale before implementation.
- [ ] Update the append mutation to resolve the regenerated node and its incoming dependency edges before propagating stale state downstream.
- [ ] Re-run focused store tests and confirm graph state and history pass.

### Task 4: Route-safe hydration state and retry

**Files:**
- Modify: `app/src/features/canvas/CanvasPage.test.tsx`
- Modify: `app/src/features/canvas/CanvasPage.tsx`
- Modify: `app/src/features/canvas/CanvasTopBar.tsx`

**Interfaces:**
- Produces route states `loading`, `ready`, `not-found`, and `error` with a `重试加载` action.
- Project UI is rendered only when `activeProject.id === projectId`; pending/error top bars never link to an old project's preview.

- [ ] Add a test starting with an old active project whose requested load rejects, assert no old heading/preview link, then retry with a successful project and assert new heading/link.
- [ ] Run focused canvas tests and confirm old content leaks and the rejection is not handled.
- [ ] Guard project projection by route ID, catch hydration rejection, render explicit loading/error/not-found states, add retry key, and ignore aborted/unmounted completions.
- [ ] Re-run focused canvas tests and confirm the error/retry flow passes without unhandled rejection.

### Task 5: DAG validation and stable legacy ordering

**Files:**
- Modify: `app/src/features/project/project-store.test.ts`
- Modify: `app/src/features/project/project-store.ts`
- Modify: `app/src/features/canvas/CanvasPage.test.tsx`
- Modify: `app/src/features/canvas/NodeListView.tsx`

**Interfaces:**
- `connectNodes(edge)` becomes a no-op without history when the edge is invalid, duplicate, self-referential, or would make the dependency graph cyclic.
- `sortNodesForList` uses finite Kahn traversal; legacy cycle members retain deterministic creation/timeline ordering.

- [ ] Add a store test attempting the reverse edge in an existing A to B graph; assert graph and history unchanged.
- [ ] Add a node-list test with cyclic legacy edges and literal expected stable order.
- [ ] Run the two focused suites and confirm cycle insertion and inflated depth ordering fail.
- [ ] Implement reachability validation in `connectNodes` and finite indegree traversal for list depths.
- [ ] Re-run both focused suites and confirm DAG enforcement and stable ordering pass.

### Task 6: Verification, browser smoke, report, and commit

**Files:**
- Modify: `.superpowers/sdd/2026-08-06-wireless-canvas-v1/task-5-report.md`

**Interfaces:**
- Appends exact RED/GREEN and browser evidence under `Fix Round 1`.

- [ ] Run canvas focused tests, project-store focused tests, the full suite, typecheck, and production build.
- [ ] Open the persisted example in a fresh browser session, exercise selection/node list/reload, and inspect warning/error logs.
- [ ] Append exact evidence and scoped concerns to the Task 5 report.
- [ ] Run `git diff --check`, stage only Fix Round 1 files, and commit with one-off Codex identity.

## Self-Review

- All five Important findings map to Tasks 1 through 5.
- The two ledgered Minor findings are excluded explicitly.
- Tests assert user/store outcomes rather than mock call existence.
- Shared selector signature and consumers match across tasks.
- No generation or export success state is introduced.
