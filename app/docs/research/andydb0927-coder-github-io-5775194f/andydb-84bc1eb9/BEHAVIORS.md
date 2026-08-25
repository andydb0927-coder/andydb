# Behaviors

## Shared chrome

- Interaction model: click-driven rail expansion on desktop; responsive CSS at 720px and below.
- Current desktop rail: 184px expanded. Public reference rail: 68px.
- Current top bar: 52px. Public reference header: 50px.
- Target: start standard pages at 68px, preserve the expand control, and keep workspace mode unchanged.
- Mobile current state: 64px left rail + 311px main column at a 390px viewport.
- Mobile target: full-width main column with the same navigation actions in a 64px fixed bottom bar.

## Hero and quick creation modes

- Interaction model: static hero plus click-driven mode cards.
- Current desktop hero: `x=230.08`, `y=52`, `w=1148.84`, `h=620`.
- Current mode-card hover: border `rgba(255,255,255,.09)` → `rgba(239,200,124,.4)`, translate `0` → `-2px`, 180ms emphasized easing.
- Public reference quick card: 94px high; hover changes background from `rgba(31,31,31,.95)` to `rgba(255,255,255,.08)` without translation, 150ms ease-out.
- Target: shorter hero, 96–104px quick cards, color/border hover without vertical motion.

## Creative Agent

- Interaction model: local text input, local attachment selection, click-to-create canvas, click-to-filter Skills.
- Current desktop heading begins at `y=1393.66`; textarea begins at `y=1465.44`.
- Public reference Agent region begins at `y=523.5` and is 196px high.
- Target: move the existing Agent section directly after the hero; preserve all local validation and canvas-creation behavior.

## Product features

- Interaction model: explicit previous/next buttons.
- Verified deployed transition: `1 / 5 · Seedance 2.5 模型上新` → `2 / 5 · 导演台` after pressing Next.
- Keep the carousel behavior, but place it after the Agent so it does not delay the primary creative action.

## Screenshots

The browser screenshot endpoint returned `Unable to capture screenshot` for both public pages in this run. Live DOM snapshots, exact computed styles, rectangles, responsive metrics, and hover-state diffs were captured instead. Existing repository design-reference screenshots remain untouched and were used as secondary visual context.
