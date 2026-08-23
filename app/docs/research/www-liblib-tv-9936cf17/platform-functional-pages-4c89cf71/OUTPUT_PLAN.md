# LibLib TV functional-page integration plan

## Scope

- Source origin: `https://www.liblib.tv`
- App root: `/Users/andydb/.codex/worktrees/322b/无线画布/app`
- Site key: `www-liblib-tv-9936cf17`
- Page-family key: `platform-functional-pages-4c89cf71`
- Integration target: the existing React Router application; all current routes and local repositories are preserved.
- Product rule: reproduce observed public interaction patterns and hierarchy, not LibLib branding, private user data, paid features, authentication, or remote community behavior.

## Source page type to local route mapping

| Source page type | Evidence level | Local destination | Planned treatment |
| --- | --- | --- | --- |
| `/` public creation/discovery home | Observed public UI; signed-in recent-project block excluded from copied content | `/` | Already compacted; keep as shared visual foundation |
| `/project` project library | Public shell and generic page labels observed; project contents are authenticated/private | `/projects` | Apply the compact project-library UI to real local projects only |
| `/skill` Agent and Skill catalog | Public layout, filters, search, card selection and composer behavior observed | `/agents` | Recompose existing local Skill runner as composer + catalog + execution workspace |
| `/activity` challenge listing | Public list/card/status layout observed | `/challenges` | Recompose the existing local challenge catalog into the same list hierarchy |
| `/activity/:id` challenge detail | Public detail, status, time range, rules and CTA hierarchy observed | `/activity/:challengeId` | Keep original local challenge copy and working create CTA; match information architecture |
| TV Show work card/detail | Public cards and process-entry affordance observed; a stable detail record was not available | `/detail/:workId` | Preserve local demo work data and immersive viewer; align shell, metadata and reuse CTA |
| TV Show creation process | Public “查看创作过程” affordance observed; authenticated process internals not verified | `/detail/:workId/process` | Preserve the existing local node/connection viewer and reuse flow; align visual hierarchy |
| Canvas workspace | Authenticated canvas content not inspected or copied | `/project/:projectId` | Preserve the functional local infinite canvas; only harmonize shared chrome and panels |
| Preview/delivery | No distinct public LibLib preview page established | `/project/:projectId/preview` | Preserve functional local timeline/preview and harmonize product chrome |
| `/cli` Agent integration page | Public standalone integration page observed | `/agents#workspace-bridge` | Fold the relevant local workspace bridge into Agents instead of duplicating install/login claims |

## Shared foundation changes

- Create route-scoped platform tokens for dense dark panels, warm-gold focus/accent, 52 px top chrome, 184/64 px navigation rail, 12–16 px radii, and compact controls.
- Reuse existing `PlatformShell`, local repositories, demo generation adapter, challenge catalog, community repository, project store, timeline, and canvas components.
- Add no copied trademark, current LibLib contest copy, public creator identity, remote counters, account balance, billing state, or authenticated project content.
- Add no downloader. Reference screenshots are research artifacts only; product imagery remains original/local demo material.

## Planned research artifacts

- `PAGE_TOPOLOGY.md`
- `BEHAVIORS.md`
- `ROUTE_MATRIX.md`
- Component specs for Projects, Agents, Challenges, Challenge Detail, Work Detail, Creation Process, Canvas Chrome, and Preview.

## Planned code ownership

- Shared platform foundation: `src/features/platform/PlatformShell.tsx`, `src/styles/global.css`
- Project library: `src/features/projects/ProjectsPage.tsx`
- Skill workspace: `src/features/agent/AgentsPage.tsx`
- Challenge hierarchy: `src/features/challenges/ChallengesPage.tsx`, `ChallengeDetailPage.tsx`
- Community hierarchy: `src/features/community/WorkDetailPage.tsx`, `CreationProcessPage.tsx`
- Canvas/preview chrome: existing canvas and timeline files, with functional behavior preserved
- Focused tests beside each changed component plus a cross-route visual-contract test

## Collision and safety checks

- All destination routes already exist and are being intentionally updated at the user’s request.
- Existing homepage changes and research artifacts are preserved.
- No commit, push, publish, deploy, account action, challenge submission, Skill save, or remote generation is authorized.
