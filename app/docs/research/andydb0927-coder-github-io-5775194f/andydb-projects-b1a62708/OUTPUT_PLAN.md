# LibLib-aligned Project Workspace — Output Plan

## Mapping

| Role | URL | Destination |
| --- | --- | --- |
| Public design reference | `https://www.liblib.tv/` | Visual system only; no branding, promotional media, account, membership, or payment behavior copied |
| Existing product | `https://andydb0927-coder.github.io/andydb/projects` | Preserve the existing React/Vite `/projects` route and all local project-space behavior |
| Local verification | `http://localhost:4173/projects` | Desktop, tablet, and mobile QA |

## App root

`/Users/andydb/.codex/worktrees/322b/无线画布/app`

## Planned files

- Global LibLib-aligned visual tokens: `src/styles/liblib-web-design.css`
- Existing project workspace: `src/features/projects/ProjectsPage.tsx`
- Existing route registry: `src/app/router.tsx`
- Tests: project page behavior plus CSS contract tests

## Route and data boundaries

- Preserve `/`, `/projects`, `/projects/new`, `/works`, `/agents`, `/challenges`, `/tutorials`, all detail routes, and canvas workspace routes.
- Preserve IndexedDB-backed projects, folders, filtering, search, sorting, classification, and canvas navigation.
- Do not fabricate cloud sync, accounts, membership, credits, billing, remote generation, or publishing.
- No LibLib logo, campaign creative, creator data, or copyrighted media will be copied.

## Visual direction

- Replace the previous cinnabar/gold presentation with LibLib's public black/gray/cyan system.
- Keep original Wireless Canvas naming and local project content.
- Compress the project-management page into a creation-first workspace: smaller header, wider grid, denser project cards, mobile horizontal cards, and simplified actions.
