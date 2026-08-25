# ProjectsWorkspace Specification

## Overview
- **Target file:** `src/features/projects/ProjectsPage.tsx` plus `src/styles/liblib-web-design.css`
- **Interaction model:** click-driven filters; input-driven search/sort; local form submission

## DOM structure

Compact header -> workspace layout -> folder aside + directory -> toolbar -> project grid -> empty state.

## Desktop styles

- Page max width: 1440px.
- Header: smaller 32–36px title, 24px bottom spacing, one cyan primary action.
- Layout: 176px folder rail + flexible directory; 16px gap.
- Folder rail/directory: 12px radius, low-contrast surface and border; no decorative shadow.
- Directory toolbar: one compact surface with search flexing and 150px sort control.
- Grid: `repeat(auto-fill, minmax(230px,1fr))`, 12px gap; allow four columns on wide screens.

## States and behaviors

- Active folder: cyan-tinted background and 2px cyan inset marker.
- Hover surfaces: background `rgba(255,255,255,.08)`; no translate.
- Focus: 2px cyan outline with 2px offset.
- Loading/error/empty behaviors remain unchanged.

## Responsive behavior

- Tablet: folder rail 156px; grid min column 220px.
- Mobile <=720px: header stacks, folder filters scroll horizontally, directory loses enclosing heavy panel, toolbar stacks only as needed.
