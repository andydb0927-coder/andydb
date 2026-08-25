# MobileNavigation Specification

## Overview

- Target: standard platform shell at `max-width: 720px`.
- Target files: `src/styles/global.css`, layout-contract tests.
- Interaction model: fixed bottom navigation plus normal page scrolling.

## Structure

- Reuse the existing `aside.platform-shell__rail` and its links.
- Hide only the desktop brand and collapse control.
- Keep New Project, five platform destinations, Help, and the optional task trigger reachable.
- Use a horizontally scrollable row when all actions do not fit.

## Computed target values

- Shell columns: `minmax(0, 1fr)`.
- Bottom rail: fixed; left/right/bottom 0; height 64px; width 100%; z-index above page content.
- Content: full viewport width with 64px bottom padding.
- Top bar: 52px, full width, 16px inline padding.
- Homepage main: 16px inline padding, yielding approximately 358px usable width at a 390px viewport.

## Visual states

- Active navigation uses the current gold accent and a top/inner indicator appropriate to the horizontal bar.
- Icons are 18px; labels remain screen-reader accessible.
- Hover/focus uses the existing overlay and focus-ring tokens.

## Boundary

No native app tab bar, authentication, or remote account behavior is introduced.
