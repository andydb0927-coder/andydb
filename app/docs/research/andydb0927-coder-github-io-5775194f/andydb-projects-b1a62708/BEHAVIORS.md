# Behaviors

## Reference observations

- Desktop public rail: 68px wide, `rgb(22,22,22)`.
- Desktop header: 50px high, `rgb(20,20,20)`, 9px 12px padding.
- Main background: `rgb(20,20,20)`; foreground: `rgb(247,247,247)`.
- Primary accent: `rgb(9,202,245)` (`#09CAF5`).
- Large creation card: 200px high desktop / 160px mobile, 12px radius, `rgba(255,255,255,.06)` background, 0.5px `rgba(255,255,255,.16)` border.
- Compact cards: 94px desktop / 92px mobile, 12px padding and radius, `rgba(31,31,31,.95)` background.
- Compact-card hover: background changes to `rgba(255,255,255,.08)`; no transform or shadow; 150ms ease-out color transition.
- Mobile public content: 20px horizontal margin, no visible side rail, 50px header.
- System font stack: `-apple-system, system-ui, PingFang SC, Inter, Noto Sans SC, Microsoft YaHei, sans-serif`.

## Existing project interactions to preserve

- Folder filters: click-driven and local-only.
- Folder creation: form submission persisted in IndexedDB.
- Search: immediate client-side filtering by title and intent.
- Sorting: client-side updated/name selection.
- Project classification: local select control persisted per project.
- Project/card navigation: internal route to the real local canvas.

## Responsive contract

- Desktop >= 1320px: 176px folder rail, four-column-capable project grid when space allows.
- Tablet 721–1319px: narrower folder rail and 2–3 project columns.
- Mobile <= 720px: folder filters become horizontal chips, folder form is compact, project cards use a horizontal thumbnail/content layout, and the shared bottom navigation remains fixed.
