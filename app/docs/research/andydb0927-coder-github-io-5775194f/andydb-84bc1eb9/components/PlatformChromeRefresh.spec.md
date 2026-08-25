# PlatformChromeRefresh Specification

## Overview

- Target files: `src/features/platform/PlatformShell.tsx`, `src/styles/global.css`
- Interaction model: click-driven desktop collapse; responsive CSS navigation transformation.
- Reference: public LibLib homepage, used only for proportions and density.

## Desktop computed values

- Deployed shell rail: 184px expanded.
- Public reference rail: 68px.
- Deployed top bar: 52px high.
- Public reference header: 50px high.
- Public reference main: `x=68`, `w=1372`, with first content starting at `x=108`.

## Target desktop state

- Standard shell starts collapsed.
- Collapsed standard rail is 68px wide.
- Expanded rail remains 184px and is reachable from the existing toggle.
- Active links retain the existing gold inset indicator and all routes remain unchanged.
- Workspace mode remains 64px and does not inherit the new standard-shell default.

## Mobile state

- Current deployed: 64px left rail, main `x=64`, main width 311px, inner content width 279px.
- Public reference: main `x=0`, width 375px at a 390px viewport.
- Target at `max-width: 720px`: shell becomes one column; rail is fixed to the bottom, 64px high, full width, horizontally scrollable; main/top bar use the full width.
- Brand and collapse control are hidden in the bottom bar. New Project, platform links, Help, and task trigger remain reachable as icon actions.

## Accessibility

- Preserve navigation labels and link text in the accessibility tree.
- Preserve focus-visible rings.
- Keep the rail toggle focusable on desktop.

## Assets and text

- Reuse Lucide icons and current original product text.
- Do not copy LibLib identity assets or account/commerce controls.
