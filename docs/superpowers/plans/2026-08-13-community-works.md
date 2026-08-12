# Community works implementation plan

> Date: 2026-08-13  
> Design: `docs/superpowers/specs/2026-08-13-community-works-design.md`

**Goal:** Turn the existing `/discover` placeholder into a fully local works wall, detail player, interactions, and personal publishing manager backed by Dexie.

**Architecture:** Add a pure published-work snapshot model, persist it in a Dexie v6 table through a transactional repository, keep discovery/detail/mine as separate routes under the existing platform shell, and reuse `PreviewPlayer` against the stored project/timeline snapshots.

**Constraints:**

- Never call LibTV/external generation adapters, consume credits, or add a backend dependency.
- Write failing focused tests before each production slice.
- After every GREEN, run the relevant regression slice and `git diff --check`.
- Do not run Chromium E2E; final gates are Vitest, typecheck, and build.
- Do not commit; the acceptance owner will commit.

---

## Task 1: Published-work aggregate

**Files:**

- Create: `app/src/features/community/community-model.test.ts`
- Create: `app/src/features/community/community-model.ts`

- [x] Write RED tests for publish snapshots, cover/duration/tag derivation, republish metric retention, interaction toggles, status, filtering, and latest/hot sorting.
- [x] Implement immutable work types and operations with injected id/time environment.
- [x] Run focused GREEN, timeline regressions, typecheck, and diff check.

## Task 2: Dexie v6 repository and demo seed

**Files:**

- Modify: `app/src/features/project/project-repository.ts`
- Modify: `app/src/features/timeline/timeline-repository.ts`
- Create: `app/src/features/community/demo-works.ts`
- Create: `app/src/features/community/community-repository.test.ts`
- Create: `app/src/features/community/community-repository.ts`

- [x] Write RED tests for v5 upgrade, round-trip, unique project publication, transactional interactions, status changes, listing timelines, and idempotent demo seed.
- [x] Add the v6 table and repositories without destructive migration.
- [x] Run focused GREEN plus project/timeline repository regressions, typecheck, and diff check.

## Task 3: Works wall

**Files:**

- Replace: `app/src/features/platform/DiscoverPage.test.tsx`
- Replace: `app/src/features/platform/DiscoverPage.tsx`
- Create: `app/src/features/community/WorkCard.tsx`
- Modify: `app/src/styles/global.css`

- [x] Write RED component tests for demo loading, cards, keyword/tag filtering, latest/hot sorting, empty/error states, and detail links.
- [x] Implement the responsive works wall and shared accessible card.
- [x] Run focused GREEN plus platform shell regression, typecheck, and diff check.

## Task 4: Work detail and interactions

**Files:**

- Create: `app/src/features/community/WorkDetailPage.test.tsx`
- Create: `app/src/features/community/WorkDetailPage.tsx`

- [x] Write RED integration tests for stored snapshot preview, single view recording, like/favorite toggles, unavailable states, and recommendations.
- [x] Reuse the controlled `PreviewPlayer` with snapshot resolution and persist interactions.
- [x] Run focused GREEN plus preview-player regression, typecheck, and diff check.

## Task 5: Personal works manager

**Files:**

- Create: `app/src/features/community/MyWorksPage.test.tsx`
- Create: `app/src/features/community/MyWorksPage.tsx`

- [x] Write RED tests for local timeline/project loading, publish form, invalid timeline, publish, unlist, republish, and metrics.
- [x] Implement repository-backed management without invoking generation or billing paths.
- [x] Run focused GREEN plus project/timeline regressions, typecheck, and diff check.

## Task 6: Routes and final verification

**Files:**

- Modify: `app/src/app/router.tsx`
- Modify: `app/src/app/App.test.tsx`

- [x] Write RED route tests for `/discover`, `/discover/mine`, and `/discover/:workId` while preserving active platform navigation.
- [x] Register nested community routes and keep the existing shell entry.
- [x] Run fresh full `npm run test:run`.
- [x] Run `npm run typecheck` and `npm run build`.
- [x] Run `git diff --check` and inspect scoped status/diff.
- [x] Fix every failure, update plan evidence, and report design points, exact test count, build result, and genuine residual items.

### Verification note

- TDD added 30 net tests across the published-work aggregate, Dexie v6 repository, works wall, work detail interactions, personal publishing management, and community routes.
- Fresh full verification passed 56 Vitest files / 687 tests.
- `npm run typecheck` passed with TypeScript project references.
- `npm run build` passed. Vite emitted only the existing advisory that the main bundle exceeds 500 kB after minification (`740.87 kB`, gzip `233.87 kB`).
- `git diff --check` passed. Chromium E2E was intentionally not run under the stated sandbox boundary. The worktree remains uncommitted.
