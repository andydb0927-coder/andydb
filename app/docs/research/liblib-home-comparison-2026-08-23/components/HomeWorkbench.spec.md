# HomeWorkbench Specification

## Overview

- Target files: `src/features/home/PlatformHomeSections.tsx`, `src/features/launcher/ProjectLauncherPage.tsx`, `src/styles/global.css`
- Screenshots: `docs/design-references/liblib-home-comparison-2026-08-23/`
- Interaction model: click-driven local navigation and prompt creation; horizontal overflow is user-scroll-driven.

## Structure

- Keep the platform rail and top bar.
- Hero contains kicker, compact H1, intro, primary CTA and six mode cards.
- Feature carousel follows hero.
- ProjectLauncher injects the real recent-project region immediately after the feature carousel.
- Agent composer and Skill recommendations follow recent projects.

## Layout Contract

- Home rail remains 184px desktop and 64px at `<=820px`.
- Home top bar target height: 52px.
- Main content max width: 1320px, desktop horizontal padding 32–48px.
- Hero target height: 430–620px desktop; H1 target 48–68px rather than viewport-scale display text.
- Mode cards: six columns when space permits, 112–124px tall; fall back to three / two / horizontal overflow without clipping.
- Feature cards: 168–190px tall; controls remain keyboard accessible.
- Recent projects: one horizontal row, card width 250–320px, all items remain reachable by scroll.
- Agent composer target height: 96–120px; Skill cards remain two columns desktop and one column mobile.

## Visual Contract

- Background near `#101114`; panels near `#17181d`; border white alpha 8–12%.
- Body text 16px on homepage, muted copy 12–14px.
- Accent remains the project warm gold; no LibLib marks, copy, imagery or account UI.
- Hover uses border/color lift of at most 2px; focus ring stays visible.

## Acceptance

- Existing headings, accessible labels and navigation URLs remain stable.
- Recent-project tests and mode/Agent/Skill interactions continue to pass.
- No horizontal page overflow at 390px; only explicit carousels may scroll horizontally.
