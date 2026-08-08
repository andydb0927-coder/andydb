# Wireless Canvas V1 — Design QA

## Review setup

- Source visual truth: `design-references/wireless-canvas-v1-direction-2.png`
- Source pixels: 1487×1058; normalized comparison source: `design-qa-evidence/reference-1440x1024.png` at 1440×1024.
- Implementation viewport: 1440×1024 CSS px in the Codex in-app Browser, device-pixel ratio 2.
- Implementation capture: `design-qa-evidence/implementation-1440x1024-final.png` at 1440×1024.
- Full combined comparison: `design-qa-evidence/comparison-final.png` at 2880×1024, reference left and implementation right.
- Focused selected-node comparison: `design-qa-evidence/comparison-focus-selected.png` at 1440×520.
- Density normalization: the reference was proportionally normalized to the approved 1440×1024 review frame; browser screenshots were captured at the CSS viewport size so both comparison halves have identical pixel dimensions.
- Reviewed state: the 电影感叙事 demo project with 角色参考 → 场景设定 → 分镜 01 → 分镜 02 → 视频 02, with 分镜 02 selected and its context actions open.

## Final findings

No open P0, P1, or P2 visual defects remain in the approved desktop canvas direction.

- Typography: the restrained dark-canvas hierarchy is preserved. Node titles, node metadata, toolbar labels, status text, and AI Director text remain legible; no text is cropped.
- Spacing and layout: the canvas dominates the viewport; the dependency chain reads diagonally; the left toolbar stays compact; the selected-node action panel clears adjacent nodes; the bottom composer does not obscure the selected action in the approved viewport.
- Colors and tokens: the graphite canvas and panels remain neutral, the violet selection accent is restrained, focus treatment stays visible, and muted text remains readable against dark surfaces.
- Image quality and assets: all node thumbnails use the repository's existing real demo assets. Images retain aspect-fill presentation without distortion, placeholder art, custom CSS illustration, emoji, or inline SVG artwork.
- Copy and content: the reviewed Chinese labels and status language are present, including 分镜 02, 节点列表, 主视频轨, 导出影片, and 演示导出已完成.
- Interaction model: the source's floating canvas, selected-node actions, compact toolbar, and bottom AI Director composition are preserved. The concept image's preview card is represented by the existing reviewed `/preview` route rather than a new canvas node; this is an intentional V1 behavior constraint, not a fidelity defect.

## Comparison history

### Iteration 1

- Evidence: `design-qa-evidence/implementation-1440x1024-iteration-1.png` and `design-qa-evidence/comparison-iteration-1.png`.
- P1: the initial character, scene, and storyboard nodes formed a flat row rather than the approved diagonal dependency flow.
- P1: generated-node placement could overlap a selected node's context-action panel.
- P2: the AI Director composer was wider and taller than the reference, adding excess chrome and reducing canvas breathing room.
- Fixes: moved recipe nodes onto a diagonal; added collision-aware downstream placement; reduced the composer to 540 px, moved disclosure into its compact heading, and kept the form label visually hidden but accessible.

### Iteration 2

- Evidence: `design-qa-evidence/implementation-1440x1024-iteration-2.png` and `design-qa-evidence/comparison-iteration-2.png`.
- Result: the diagonal composition, compact toolbar, restrained selection accent, and composer proportions matched the approved direction. No new P0/P1/P2 issue was found.
- Final-state refinement: generated 视频 02 from 分镜 02, reselected 分镜 02, and used Fit View so the downstream relationship and selected context controls were visible in one frame.

### Final

- Evidence: `design-qa-evidence/implementation-1440x1024-final.png`, `design-qa-evidence/comparison-final.png`, and `design-qa-evidence/comparison-focus-selected.png`.
- Result: no overlap, cropped text, broken connector, hidden primary action, unintended card grid, excessive panel chrome, or interaction-model drift was observed.

## Interaction and accessibility checks

- Created a project, extended 分镜 01 to 分镜 02, generated 视频 02, selected 分镜 02, and invoked Fit View in the in-app Browser.
- Enter and Space both opened the selected node's context actions.
- Node List View selected nodes, regenerated 分镜 01, and added 视频 01 to the timeline. Escape closed the dialog and returned focus to the invoking 分镜 02 control; dialog Tab and Shift+Tab focus wrapping is covered by tests.
- At the 200% effective layout viewport (640×360, equivalent to a 1280×720 viewport at 200% browser zoom), the selected 视频 01 details and 加入时间线 primary action remained visible, focusable, and clickable. Evidence: `design-qa-evidence/zoom-200-reachability.png`.
- Browser console error query after the final flow returned `[]`.

## Acceptance

final result: passed
