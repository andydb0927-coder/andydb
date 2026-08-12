# Local collaboration and membership implementation plan

> Date: 2026-08-13  
> Design: `docs/superpowers/specs/2026-08-13-local-collaboration-membership-design.md`

**Goal:** Build the step-6 local-first collaboration, project-package sharing, simulated membership, entitlement gating, and `/account` workspace center without any backend or external generation call.

**Architecture:** Extend the shared Dexie database with collaboration and membership aggregates, keep validation and entitlement checks as pure modules, compose versioned project packages through a transactional repository, and inject the local membership plan into the existing workflow/export surfaces.

**Constraints:**

- No LibTV/external API, credits, real payment, login, or cloud sync.
- Write failing focused tests before each production slice, then run its regressions.
- Clearly label all identity, subscription and sharing behavior as local simulation.
- Do not run Chromium E2E; final gates are Vitest, typecheck, build and diff check.
- Do not commit.

## Task 1: Membership domain and persistence

- [x] Write RED tests for the plan matrix, entitlement checks and subscribe/cancel/renew transitions.
- [x] Add membership types, pure transitions and a Dexie v7 single-record repository.
- [x] Run focused GREEN and database migration regressions.

## Task 2: Collaboration domain and persistence

- [x] Write RED tests for owner seeding, role add/update/remove, node/clip comments and resolving comments.
- [x] Add collaborator/comment models, Dexie tables and transactional repository methods.
- [x] Run focused GREEN and project/timeline regressions.

## Task 3: Versioned project packages

- [x] Write RED tests for export contents, schema validation, share-link round trip, full restore and workspace backup.
- [x] Implement package codecs/download helpers and transactional export/import repository.
- [x] Run focused GREEN and asset/timeline/database regressions.

## Task 4: `/account` local workspace center

- [x] Write RED component tests for membership state/actions, feature matrix, project statistics, collaborator management, share/download/import and backup.
- [x] Replace the placeholder page with repository-backed local workspace sections and explicit local-simulation disclosure.
- [x] Run focused GREEN plus route/platform-shell regressions.

## Task 5: Comment markers on nodes and clips

- [x] Write RED tests for a reusable comment panel and its node/clip target state.
- [x] Integrate the panel with the primary canvas node and selected professional timeline clip.
- [x] Run focused GREEN plus canvas and preview regressions.

## Task 6: Entitlement gates

- [x] Write RED tests for free/creator/pro behavior in workflow and timeline export panels.
- [x] Gate multi-node/parallel workflow as professional and EDL/recording as creator, with `/account` upgrade links.
- [x] Load the persisted plan in canvas and preview without blocking free base features.
- [x] Run focused GREEN plus existing workflow/export regressions.

## Task 7: Final verification

- [x] Run fresh full `npm run test:run` and fix every failure.
- [x] Run `npm run typecheck`, `npm run build`, and `git diff --check`.
- [x] Inspect scoped status/diff, update this plan with exact evidence, and report design points, test count, build result and genuine residual items.

### Verification note

- TDD added 17 net tests for membership transitions and migration, collaboration roles/comments, versioned packages, share links and restore, `/account`, plus workflow/export entitlement gates.
- Fresh full verification passed 64 Vitest files / 704 tests.
- `npm run typecheck` passed with TypeScript project references.
- `npm run build` passed. Vite emitted only the existing advisory that the main bundle exceeds 500 kB after minification (`759.18 kB`, gzip `238.63 kB`).
- `git diff --check` passed. Chromium E2E was intentionally not run under the stated sandbox boundary. No external LibTV/API/payment/credit path was called, and the worktree remains uncommitted.
