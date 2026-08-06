# Task 5 Fix Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dependency-cycle validation and node-list traversal linear in graph size without changing their correctness behavior.

**Architecture:** Build the dependency adjacency map once per `connectNodes` validation and traverse it with a cursor-indexed array queue. Keep the existing finite Kahn traversal in `NodeListView`, replacing only its queue-head removal with the same cursor pattern.

**Tech Stack:** TypeScript, Zustand, React, Vitest.

## Global Constraints

- Follow strict RED-GREEN-REFACTOR.
- Use a behavior/performance contract, not source inspection or a wall-clock threshold.
- Preserve cycle rejection and legacy-cycle ordering regressions.
- Do not change the ledgered selection or project-transition Minor findings.

---

### Task 1: Linear graph traversal

**Files:**
- Modify: `app/src/features/project/project-store.test.ts`
- Modify: `app/src/features/project/project-store.ts`
- Modify: `app/src/features/canvas/NodeListView.tsx`
- Modify: `.superpowers/sdd/2026-08-06-wireless-canvas-v1/task-5-report.md`

**Interfaces:**
- Consumes: `connectNodes(edge: DependencyEdge): void` and the existing `sortNodesForList` behavior.
- Produces: cycle validation bounded to a constant number of edge-property reads per edge, with cursor-indexed breadth-first queues in both graph traversals.

- [ ] **Step 1: Add the failing performance-contract test**

Create a 200-node chain whose dependency edges expose instrumented `sourceNodeId` getters. Attempt to close the chain into a cycle through the real store API, assert the project/history remain unchanged, and assert source-property reads are no more than three times the edge count.

- [ ] **Step 2: Verify RED**

Run:

```bash
cd app && npm run test:run -- src/features/project/project-store.test.ts -t "validates a large dependency graph with linear edge traversal"
```

Expected: the cycle is rejected, but the read-count assertion fails by a quadratic margin.

- [ ] **Step 3: Implement the minimal linear traversal**

In `hasDependencyPath`, build `Map<string, string[]>` once from the edge list, then process reachable node IDs with `for (let index = 0; index < queue.length; index += 1)`. Apply the same indexed queue pattern to `dependencyDepths` without changing depth/tie-break semantics.

- [ ] **Step 4: Verify GREEN and correctness regressions**

Run the focused performance contract, the existing cycle-rejection test, and the existing legacy-cycle-order test. Then run both affected suites.

- [ ] **Step 5: Verify, report, and commit**

Run the full suite, typecheck, production build, and `git diff --check`. Append exact Round 2 RED/GREEN evidence and commit only the scoped files.

## Self-Review

- The contract fails if reachability rescans all edges per visited node and passes for a constant number of full edge traversals.
- Expected correctness values are literal and independent of the implementation.
- No source-text assertions, timing thresholds, selection logic, or route-transition logic are included.
