# ProjectCard Specification

## Overview
- **Target file:** `src/features/projects/ProjectsPage.tsx` plus `src/styles/liblib-web-design.css`
- **Interaction model:** hover/focus plus internal project link and local folder select

## Desktop structure and styles

- 16:9 thumbnail at top, object-fit cover, 10px inner radius.
- Content: title, updated date, compact nodes/assets metadata, two-line intent.
- Actions: small category select plus compact cyan/open affordance.
- Card: 12px radius, `rgba(31,31,31,.95)` background, 1px subtle border, 12px padding.
- Target desktop height: approximately 300–330px rather than the previous 401–425px.

## States

- Hover: background -> `rgba(255,255,255,.08)`; border -> `rgba(255,255,255,.16)`; thumbnail image scales to 1.02; no card translation.
- Focus within: cyan border/focus ring.
- Missing thumbnail: dark cyan radial/linear gradient with an original local placeholder glyph; no remote image.

## Mobile

- Horizontal card: 112px thumbnail column + flexible content.
- Hide the long intent text when necessary; keep title, date, node/asset counts and classification available.
- Target height: 150–180px per card.
