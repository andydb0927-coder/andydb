# Professional timeline implementation plan

> Date: 2026-08-13  
> Design: `docs/superpowers/specs/2026-08-13-professional-timeline-design.md`

**Goal:** Upgrade the existing preview route into a durable four-track browser editing workspace while preserving the canvas add-to-timeline contract and legacy preview behavior.

**Architecture:** Introduce a pure `TimelineProject` aggregate and migration from `Project.timeline`, persist it in a Dexie v5 table, render a controlled editor/player pair on the existing preview route, and add client-only JSON/EDL/MediaRecorder exports. The project store remains the compatibility source for canvas one-click insertion; the editor merges those entries by stable legacy ids.

**Constraints:**

- Never call LibTV/external generation adapters, consume credits, or add a backend dependency.
- Never read, modify, stage, or commit `audit-2026-08-06/`.
- Write failing focused tests before each production slice.
- After every GREEN, run the relevant regression slice and `git diff --check`.
- Do not run Chromium E2E; final gates are Vitest, typecheck, and build.
- Do not commit; the acceptance owner will commit.

---

## Task 1: Pure professional timeline aggregate

**Files:**

- Create: `app/src/features/timeline/timeline-project.test.ts`
- Create: `app/src/features/timeline/timeline-project.ts`

- [x] Write RED tests for four default tracks, legacy migration, idempotent merge, node/library/subtitle insertion, reorder, trim, split, delete, visual resolution, and duration.
- [x] Implement immutable types and operations with injected id/time environment.
- [x] Run focused GREEN, timeline-model regression, typecheck, and diff check.

## Task 2: Dexie v5 persistence

**Files:**

- Modify: `app/src/features/project/project-repository.ts`
- Create: `app/src/features/timeline/timeline-repository.test.ts`
- Create: `app/src/features/timeline/timeline-repository.ts`

- [x] Write RED tests for round-trip, project isolation, overwrite, and v4 upgrade.
- [x] Add `timelineProjects` without destructive migration and implement `load/save`.
- [x] Run focused GREEN plus project/workflow repository regressions and diff check.

## Task 3: JSON, EDL, and recording boundary

**Files:**

- Create: `app/src/features/timeline/timeline-export.test.ts`
- Create: `app/src/features/timeline/timeline-export.ts`
- Create: `app/src/features/timeline/TimelineExportPanel.test.tsx`
- Create: `app/src/features/timeline/TimelineExportPanel.tsx`

- [x] Write RED tests for versioned JSON, 24fps EDL timecode, safe filename/download behavior, capability detection, start/stop recording, and unsupported fallback.
- [x] Implement browser-only downloads and canvas-stream MediaRecorder adapter.
- [x] Run focused GREEN, existing export-panel regression, typecheck, and diff check.

## Task 4: Four-track editor

**Files:**

- Create: `app/src/features/timeline/TimelineEditor.test.tsx`
- Create: `app/src/features/timeline/TimelineEditor.tsx`
- Modify: `app/src/styles/global.css`

- [x] Write RED component tests for named tracks, draggable sources, drop/button insertion, selection, reorder, trim, split, delete, subtitles, ruler seek, and accessible feedback.
- [x] Implement controlled editor with asset bin and keyboard-equivalent controls.
- [x] Run focused GREEN, UI regression, typecheck, and diff check.

## Task 5: Controlled preview and route integration

**Files:**

- Modify: `app/src/features/timeline/PreviewPlayer.tsx`
- Modify: `app/src/features/timeline/PreviewPage.test.tsx`
- Modify: `app/src/features/timeline/PreviewPage.tsx`
- Retire or adapt: `app/src/features/timeline/TimelineTrack.tsx`

- [x] Write RED integration tests for play/pause/seek, clip-current linkage, library hydration, editor persistence, legacy merge, source focus, and export panel wiring.
- [x] Upgrade the player to controlled playhead/current-frame preview and wire serialized repository saves.
- [x] Preserve all existing frame, loop, comparison, warning, reorder and hydration contracts.
- [x] Run focused GREEN plus full timeline/export regressions, typecheck, and diff check.

## Task 6: Canvas one-click storyboard/video integration

**Files:**

- Modify: `app/src/features/canvas/node-action-policy.test.ts`
- Modify: `app/src/features/canvas/node-action-policy.ts`
- Modify: `app/src/features/project/project-store.test.ts`
- Modify: `app/src/features/project/project-store.ts`
- Modify: `app/src/features/canvas/CanvasPage.test.tsx`
- Modify: `app/src/features/canvas/NodeListView.tsx`

- [x] Write RED tests proving eligible storyboard/video nodes can be inserted once and ineligible/missing-asset nodes cannot.
- [x] Expand the existing action and store guard without adding another canvas entry or any generation/provider call.
- [x] Run focused GREEN plus canvas/project regressions, typecheck, and diff check.

## Task 7: Final verification and delivery

- [x] Run fresh full `npm run test:run`.
- [x] Run `npm run typecheck` and `npm run build`.
- [x] Run `git diff --check` and inspect scoped status/diff without reading protected audit content.
- [x] Fix every failure, update plan evidence, and report design points, exact test count, build result, and genuine residual items.

### Verification note

- TDD added 24 focused tests across the professional timeline aggregate, Dexie repository, JSON/EDL/MediaRecorder boundary, editor, preview integration, project store, and canvas insertion.
- Fresh full verification passed 52 Vitest files / 657 tests.
- `npm run typecheck` passed with TypeScript project references.
- `npm run build` passed; Vite emitted only the existing advisory that the main bundle exceeds 500 kB after minification.
- `git diff --check` passed. Chromium E2E was intentionally not run under the stated sandbox boundary. The worktree remains uncommitted.
