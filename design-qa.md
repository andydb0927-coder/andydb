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

No open P0, P1, or P2 defect remains in the approved desktop direction or the 721×778 zoom-equivalent CSS layout.

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

### Review fix round 1

- Important accessibility finding: Node List Escape previously returned focus to an already selected canvas node even when the user made no selection in the dialog. The implementation now captures the invoking 节点列表 button and restores it on close-without-selection; intentional list selection still returns focus to the selected canvas node. Focused unit regression: GREEN.
- Important acceptance-evidence finding: the original Space assertion ran while the Enter-opened actions were already visible. The Chromium test now proves Enter hidden→visible, keyboard-selects 场景设定 to hide the 分镜 01 action panel, then proves Space hidden→visible independently. A temporary Space-suppression mutation failed at the new Space visibility assertion; restored production behavior passes.
- Important zoom-evidence finding: `design-qa-evidence/zoom-200-reachability.png` is only a 640×360 strict small-layout regression. It is no longer treated as proof of real browser zoom.
- Actual 200% RED: with the outer window fixed at 1349×864, browser metrics changed from 1280×720 / DPR 1 to 721×778 / DPR 2; `visualViewport.scale=1` and document zoom 1. The selected node stayed visible, but 生成视频 occupied x=637.6…864.4, beyond `innerWidth=721`, and its center had no click target. Evidence: `design-qa-evidence/zoom-200-browser-actual-before.png` (721×778).
- Fix: at CSS viewport widths ≤800px, either context-action placement variant is inset inside its selected node. Automated RED measured action right edge 806.40 > 721; focused GREEN keeps the full action rectangle inside the viewport.
- Actual 200% GREEN: at the same fixed outer 1349×864 and actual DPR 2 / 721×778 inner viewport, the complete 生成视频 button occupied x=135.95…222.21. The real click succeeded and produced one 视频 01 after waiting. Evidence: `design-qa-evidence/zoom-200-browser-actual-after.png` (721×778).

### Review fix round 2

- Acceptance-evidence finding: the Enter path now explicitly asserts that 分镜 01 actions are hidden before Enter and visible afterward.
- Acceptance-evidence finding: the 721×778 regression now checks the complete x/y action rectangle, confirms the center hit target is the named button, clicks it, and verifies 视频 01 is generated.
- P1 RED: after generation at 721×778, the selected 视频 01 rectangle intersected the AI Director rectangle (`Expected false`, `Received true`), matching the obstruction visible in the prior committed after screenshot.
- Automated fix: at widths ≤800px, the AI Director remains fully functional but narrows to 260px and docks left. The selected generated node and its 加入时间线 action no longer intersect it; the complete action rectangle stays inside the viewport, center hit-testing resolves to the button, the real click succeeds, and 视频 01 appears in 主视频轨.
- Evidence encoding: both preserved actual-zoom screenshots were mechanically converted from JPEG payloads to real 721×778 PNG files with `sips`; their `.png` extensions now match their file encoding.
- Round 2 root equivalence evidence: the embedded tab could not be returned to actual 200%—Codex View-menu zoom and focused-WebView Command+Plus left it at 1280×720. The in-app Browser viewport capability therefore set the exact 721×778 CSS layout and reloaded to avoid retaining a 1280px transform. Metrics were DPR 1, `visualViewport.scale=1`, and document zoom 1. This is exact-layout equivalence, not a second actual-zoom capture.
- Pre-generation proof: 生成视频 rect x=135.946…222.208, y=292.742…314.650; complete in the viewport, center hit target 生成视频, click succeeded, and 视频 01 count became 1.
- Post-generation proof: selected node x=281.769…466.615, y=560.427…746.230; 加入时间线 x=368.715…454.977, y=646.004…667.912; actions panel x=362.554…461.138, y=565.904…698.719; composer x=16…276, y=589.594…754. All rectangles are contained in 721×778; node/composer and actions/composer intersection checks are false. The action center hit target is 加入时间线; click succeeded and 主视频轨 reported `视频 01` / `5.00s`.
- Round 2 evidence: `design-qa-evidence/zoom-200-equivalent-round2-after.png` (real PNG, 721×778) and `design-qa-evidence/zoom-200-equivalent-console-errors.json` (`[]`).
- Evidence conclusion: round 1 proves genuine browser zoom produces a 721×778 CSS viewport at DPR 2; round 2 validates the revised width-driven CSS geometry, hit testing, and core actions in the same 721×778 layout after reload. DPR affects raster density, while this fix depends only on CSS viewport width. The combined actual-zoom and exact-layout evidence is sufficient for acceptance, with the round 2 limitation explicitly recorded.

### Review fix round 3

- Important cascade finding: the later `max-width:720px` rule reset the narrow AI Director from 260px to `calc(100vw - 32px)`, so the round 2 `≤800px` claim did not hold at the inclusive 720px boundary.
- RED: the new 720×778 post-generation Chromium regression kept the selected 视频 01 visible but detected a node/AI Director rectangle intersection (`Expected false`, `Received true`).
- Minimal fix: removed only the later width override. At 720×778 the composer now inherits the 260px width and left docking from the `max-width:800px` rule; the existing `max-width:720px and max-height:480px` compact rule remains intact for very short layouts, so no core control is hidden.
- GREEN: both 720×778 and 721×778 prove full selected-node and action containment, no composer intersection, action-center hit testing, real 加入时间线 click, and 视频 01 in 主视频轨. The existing 640×360 strict small-layout path also remains GREEN.
- Visual scope: the cascade change applies only at ≤720px and does not alter the approved 1440×1024 comparison. The round 2 721×778 visual evidence remains the adjacent-boundary reference; the new 720×778 browser-rendered regression is the post-fix boundary proof without adding another committed per-run screenshot path.

## Interaction and accessibility checks

- Created a project, extended 分镜 01 to 分镜 02, generated 视频 02, selected 分镜 02, and invoked Fit View in the in-app Browser.
- Enter and Space independently open the selected node's context actions from a hidden state in Chromium E2E.
- Node List View selected nodes, regenerated 分镜 01, and added 视频 01 to the timeline. Escape returns focus to the invoking 节点列表 button when no selection is made, or to the intentionally selected canvas node when selection supersedes the opener. Dialog Tab and Shift+Tab focus wrapping is covered by tests.
- Strict small-layout regression: at 640×360, selected 视频 01 details and 加入时间线 remain visible, focusable, and clickable. Evidence: `design-qa-evidence/zoom-200-reachability.png`. This is responsive-layout evidence, not browser-zoom evidence.
- At actual 200% browser zoom, selected details and the complete primary action remained visible; clicking 生成视频 succeeded and produced 视频 01.
- Raw post-fix in-app Browser console error query: `design-qa-evidence/zoom-200-console-errors.json`, contents `[]`.
- At the round 2 exact 721×778 CSS layout, the generated selected node, full action panel, and AI Director do not overlap; 生成视频 and 加入时间线 center hit tests and real clicks succeeded. Raw console errors: `design-qa-evidence/zoom-200-equivalent-console-errors.json`, contents `[]`.

### 2026-08-09 — Node connections

- Evidence: `design-qa-evidence/node-connections-1440x1024.png` (real PNG, 1440×1024) and `design-qa-evidence/node-connections-721x778.png` (real PNG, 721×778). Both show the persisted four-node cinematic project with genuine new `角色参考 → 视频 01` and `场景设定 → 视频 01` upstreams in addition to the generated `分镜 01 → 视频 01` dependency. The selected edge retains the neutral curve, arrow, focus color, and selected-only delete action without a persistent metadata label.
- Automated Chromium metrics: 1440×1024 outer and inner CSS viewport, DPR 1, `visualViewport.scale=1`, document zoom 1; exact compact regression 721×778 outer and inner CSS viewport, DPR 1, `visualViewport.scale=1`, document zoom 1. At 721×778 the complete delete-action rectangle is inside the viewport, its center resolves to the named button, and it does not intersect `.director-composer`.
- Expanded Chromium acceptance: genuine handle drag creates `角色参考 → 视频 01`; the safe `L` flow creates `场景设定 → 视频 01`; reverse `视频 01 → 角色参考` reports the deterministic cycle reason; the acyclic `视频 01 → 文本 01` pair reports type incompatibility. Multiple upstreams, Escape focus return, undo/redo, selected-only accessible deletion, keyboard Delete, source focus return, reload persistence, and an empty `主视频轨` all pass. Browser console and page error collection is empty.
- In-app Browser normal QA: outer 1349×864, inner 1280×720, DPR 2, `visualViewport.scale=1`, document zoom 1. Idle character handles measure opacity 0; hover changes both to opacity 1; selected video handles remain visible; Connect mode makes both scene handles opacity 1 at 12×12 CSS px. The selected delete action measures x=626.780…653.220 and y=374.806…401.246; its center resolves to `删除连接：角色参考 → 视频 01`, it is contained, and it does not intersect the 540×152.594 AI Director at x=370…910, y=543.406…696.
- In-app Browser exact-layout QA: the explicit 721×778 viewport override reports outer 1349×864, inner 721×778, DPR 1, `visualViewport.scale=1`, document zoom 1. The delete action measures x=353.526…369.474 and y=409.123…425.072; it is contained, its center resolves to the named button, and it does not intersect the 260×164.406 AI Director at x=16…276, y=589.594…754. Backspace returns focus to `角色参考`, undo restores the edge, and Escape returns focus to `连线`. In-app Browser console errors: `[]`.
- Visual result at normal and 721×778: ports are quiet when idle and discoverable on hover/focus/selection/Connect mode; 2 px neutral curves, arrows, selected state, and source-changed state remain legible without overpowering nodes; the connection status and delete action do not overlap node actions or the AI Director. The compact composer remains functional and the full delete control is hit-testable.
- Actual 200% status: **pending user handoff, not claimed**. The in-app Browser exposes only a CSS viewport override; two attempts with browser zoom shortcuts left the metrics unchanged at inner 1280×720, DPR 2, `visualViewport.scale=1`, document zoom 1. The handoff tab is `http://127.0.0.1:4173/project/f82e38d8-f600-44a9-b87d-71de7075a05f`, with the genuine character-to-video edge selected. A user must apply actual 200% in that tab and re-run the metrics/geometry/console checks before this section may say `final result: passed`.
- Post-core observation: a LibTV-style hide/show-connections toggle remains a deliberate enhancement outside Task 6. The existing final-review Minor about escaping the focus-query selector remains for reviewer triage; this evidence task does not change production code.
- final result: pending — actual 200% user verification required.

## Acceptance

final result: pending — node connections actual 200% user verification required
