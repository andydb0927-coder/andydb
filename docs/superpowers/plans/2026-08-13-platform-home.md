# Platform home implementation plan

> Date: 2026-08-13  
> Design: `docs/superpowers/specs/2026-08-13-platform-home-design.md`

**Goal:** Turn `/` into a local-data platform home while preserving the existing project launcher and every established route.

**Architecture:** Add a Dexie v8 home-content table with idempotent fixed-ID seeds, expand community seeds by missing ID, compose the launcher with focused Hero/Agent/Skill/capability/community sections, and route every creation entry through the existing save/hydrate/navigation boundary.

**Constraints:**

- Never call LibTV/external APIs, generation providers, credits, or billing.
- Write focused failing tests before each production slice, then make that slice green.
- Run relevant regressions and `git diff --check` after each green slice.
- Do not run Chromium E2E; final gates are Vitest, typecheck, and build.
- Do not commit; the acceptance owner will commit.

---

## Task 1: Dexie v8 platform-home content

**Files:**

- Create: `app/src/features/home/home-content.test.ts`
- Create: `app/src/features/home/home-content.ts`
- Create: `app/src/features/home/home-content-repository.test.ts`
- Create: `app/src/features/home/home-content-repository.ts`
- Modify: `app/src/features/project/project-repository.ts`

- [x] Write RED tests for seed shape, exact categories/counts, v7 upgrade, missing-ID supplementation, idempotence, and preservation of existing records.
- [x] Add the v8 table and local repository.
- [x] Run focused GREEN, project repository regression, typecheck, and diff check.

## Task 2: Community seed expansion and card contract

**Files:**

- Modify: `app/src/features/community/demo-works.ts`
- Modify: `app/src/features/community/community-repository.ts`
- Modify: `app/src/features/community/community-repository.test.ts`
- Modify: `app/src/features/community/community-model.ts`
- Modify: `app/src/features/community/WorkCard.tsx`

- [x] Write RED tests for 8 fixed demo works, supplementing a partially seeded database, preserving metrics, certification, and creation-process link copy.
- [x] Expand seeds and make `ensureDemoWorks()` add only missing seed IDs.
- [x] Run focused GREEN plus discover/detail regressions, typecheck, and diff check.

## Task 3: Hero, activity banner, Agent, and Skill creation

**Files:**

- Create: `app/src/features/home/PlatformHomeSections.test.tsx`
- Create: `app/src/features/home/PlatformHomeSections.tsx`
- Modify: `app/src/features/launcher/ProjectLauncherPage.tsx`

- [ ] Write RED tests for required Hero copy, countdown/close, six modes, creation-form anchor, Agent validation/attachment/send, three Skill categories, two cards per category, and Skill use.
- [ ] Implement sections and route mode/Agent/Skill actions through launcher persistence and navigation.
- [ ] Run focused GREEN plus full launcher regression, typecheck, and diff check.

## Task 4: Capability strip and TV Show community

**Files:**

- Modify: `app/src/features/home/PlatformHomeSections.test.tsx`
- Modify: `app/src/features/home/PlatformHomeSections.tsx`
- Modify: `app/src/features/launcher/ProjectLauncherPage.tsx`
- Modify: `app/src/styles/global.css`

- [ ] Write RED tests for four internal capability links, exact category tabs, search, at least eight works, certification, likes, and detail links.
- [ ] Implement responsive local capability and community sections with isolated loading/error states.
- [ ] Run focused GREEN plus discover, work detail, shell, and launcher regressions; run typecheck and diff check.

## Task 5: Final integration and verification

**Files:**

- Modify as required by verified failures only.
- Update this plan with exact evidence.

- [ ] Run fresh full `npm run test:run` and fix every failure.
- [ ] Run `npm run typecheck` and fix every failure.
- [ ] Run `npm run build` and fix every failure.
- [ ] Run `git diff --check` and inspect scoped status/diff.
- [ ] Record exact test/file counts, build output, and genuine residual items; leave worktree uncommitted.
