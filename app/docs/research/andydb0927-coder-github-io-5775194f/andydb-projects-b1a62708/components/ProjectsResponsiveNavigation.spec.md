# ProjectsResponsiveNavigation Specification

## Overview
- **Target file:** `src/styles/liblib-web-design.css`
- **Interaction model:** breakpoint-driven CSS; navigation links remain click-driven

## Desktop

- Rail background `#161616`, width 68px collapsed.
- Active navigation uses `rgba(255,255,255,.10)` rather than gold marker.
- New project action uses `#09caf5` with white/dark readable icon treatment.
- Top bar background `#141414`, height 50–52px.

## Mobile <=720px

- Preserve the current fixed bottom navigation and full-width content.
- Use `#161616` background, subtle top border, cyan active state.
- Remove all gold active/CTA styling.
- Keep horizontal scrolling as a safe fallback; no navigation function is removed in this iteration.
