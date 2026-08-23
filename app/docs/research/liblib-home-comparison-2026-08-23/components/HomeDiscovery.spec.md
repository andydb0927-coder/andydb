# HomeDiscovery Specification

## Overview

- Target files: `src/features/home/PlatformHomeSections.tsx`, `src/styles/global.css`
- Interaction model: category buttons and explicit search submit.

## Structure

- Keep one TV Show region with heading, category row, search and local work cards.
- Preserve all eight seeded works and creation-process links.
- Keep the local-community disclosure in the kicker.

## Layout Contract

- Desktop: four compact masonry columns at wide widths, three at `<=1100px`, two at `<=820px`, one at `<=560px`.
- Reduce section padding to 40–56px and card body density to roughly 12px gaps / 12–14px text.
- Toolbar categories may wrap; search remains fully visible.
- Mobile cards must not exceed the content width and images retain intentional aspect ratios.

## States

- Selected category remains expressed by `aria-pressed=true`.
- Search draft does not filter until submit.
- Empty, loading and error states remain visible and honest.

## Acceptance

- Filtering `Seedance2.5`, `动漫游戏`, and searching `山岚` still produce the existing tested results.
- Community data remains local; no fabricated remote counters or publishing behavior is added.
