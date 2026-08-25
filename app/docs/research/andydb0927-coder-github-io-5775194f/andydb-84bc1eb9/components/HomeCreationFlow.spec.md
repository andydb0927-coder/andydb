# HomeCreationFlow Specification

## Overview

- Target files: `src/features/home/PlatformHomeSections.tsx`, `src/styles/global.css`
- Interaction model: static hero, click-driven mode cards, local Agent form, click-driven Skill filters, click-driven feature carousel.

## DOM order

1. Hero and creation modes.
2. Creative Agent and Skills.
3. Product features.
4. Recent projects slot.
5. TV Show.

## Current and reference geometry

- Current desktop hero: `y=52`, `h=620`.
- Current Agent heading: `y=1393.66`; textarea: `y=1465.44`.
- Reference large canvas entry: `x=108`, `y=299.5`, `w=640`, `h=200`.
- Reference Agent region: `x=108`, `y=523.5`, `w=1292`, `h=196`.
- Reference quick-action card: `h=94`, radius 12px, padding 12px.

## Target visual rules

- Hero uses a compact `380px–500px` height range and keeps the existing original title/CTA.
- Six mode cards remain available in one wide-screen row; target minimum height 96px and radius 12px.
- Mode-card description clamps to two lines.
- Hover changes background and border in 150–180ms without translating the card.
- Agent begins immediately after the hero, separated by a subtle top border.
- Composer keeps a strong local gold focus ring and retains real validation, attachments, and project creation.
- Features and recent projects become secondary discovery content below the Agent.

## Responsive behavior

- At 1100px: modes use three columns.
- At 820px: modes use two columns and Agent composer becomes one column.
- At 560px: modes remain horizontally scrollable; Agent actions are full width.

## Text and assets

- Preserve all current Wireless Canvas text and locally persisted content.
- No LibLib campaign text, creator media, logos, pricing, or account copy.
