# LiblibDesignTokens Specification

## Overview
- **Target file:** `src/styles/liblib-web-design.css`
- **Screenshots:** public desktop/mobile references in the page artifact roots
- **Interaction model:** static tokens plus CSS hover/focus states

## Computed style contract

- Page background: `#141414`.
- Rail: `#161616`; desktop width remains 68px.
- Primary text: `#f7f7f7`; secondary text: `rgba(255,255,255,.6)`; muted text: `#919191`.
- Primary accent: `#09caf5`; hover/bright accent: `#31d2f6`.
- Card surface: `rgba(31,31,31,.95)`; overlay hover: `rgba(255,255,255,.08)`.
- Border: `rgba(255,255,255,.10)`; stronger border: `rgba(255,255,255,.16)`.
- Card radius: 12px; compact controls: 8px.
- Font: Apple/system/PingFang/Inter/Noto Sans SC stack; base size 16px.
- Motion: 150ms ease-out for color/background/border; no hover translation.

## Scope

Override the current brand variables and the shared platform/home/function-page selectors after existing CSS. Status/error/success colors remain semantically distinct.

## Responsive behavior

The token system is viewport-independent; mobile navigation and page-specific geometry are handled by their own specs.
