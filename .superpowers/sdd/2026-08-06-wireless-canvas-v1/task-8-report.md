# Task 8 Report — End-to-End Acceptance, Accessibility, and Visual QA

## Status

Complete. The minimum V1 creation loop passes in Playwright Chromium, the accessibility and keyboard checks pass, the final 1440×1024 comparison has no open visual P0/P1/P2 findings, and actual 200% in-app Browser reachability is verified.

## RED evidence

Strict TDD exposed the following genuine failures before implementation:

1. The acceptance test could not find a `region` named `项目画布`.
2. React StrictMode's development cleanup disposed the generation queue, so `扩展镜头` failed with `Generation queue is disposed`.
3. A generated video overlapped 分镜 02 and intercepted its pointer action.
4. The reviewed accessible names/copy `主视频轨`, `导出影片`, and `演示导出已完成` were absent.
5. The Node List View could not perform `重生成 分镜 01` or add a video to the timeline.
6. Launcher parsing progress did not expose a polite live status.
7. Node List and dependency-impact dialogs did not trap focus; Escape/focus-return coverage failed.
8. The 200% effective-layout test first found the AI Director textarea, then the React Flow controls, intercepting the selected video's `加入时间线` action.

## GREEN implementation

- Added the named canvas region while keeping React Flow's application name distinct.
- Added queue resume semantics for StrictMode remounts while preserving unmount cancellation.
- Added collision-aware generated-node placement and a legible diagonal recipe layout.
- Added reviewed timeline/export accessible names and completion copy.
- Added uniquely named Node List select/regenerate/add-to-timeline actions.
- Added polite live-region semantics to launcher parsing and creation progress.
- Added reusable dialog Escape and Tab/Shift+Tab focus containment; existing invocation focus restoration is verified.
- Added compact low-height positioning for the AI Director and React Flow controls so the selected primary action stays reachable in the stricter 640×360 small-layout regression.
- Added Playwright Chromium configuration and the complete creation-flow/accessibility acceptance coverage.

## Browser and visual QA

- Tool: Codex in-app Browser only; no deployment and no external Chrome automation.
- Viewport: 1440×1024 CSS px, DPR 2.
- State: 电影感叙事 with 角色参考 → 场景设定 → 分镜 01 → 分镜 02 → 视频 02; 分镜 02 selected.
- Source: `design-references/wireless-canvas-v1-direction-2.png` (1487×1058), normalized to `design-qa-evidence/reference-1440x1024.png`.
- Final implementation: `design-qa-evidence/implementation-1440x1024-final.png`.
- Full comparison: `design-qa-evidence/comparison-final.png` (2880×1024).
- Focused comparison: `design-qa-evidence/comparison-focus-selected.png` (1440×520).
- Iteration 1: `design-qa-evidence/comparison-iteration-1.png` identified a flat node row, action-placement risk, and oversized composer; all were fixed.
- Iteration 2: `design-qa-evidence/comparison-iteration-2.png` confirmed the diagonal layout and compact composer with no new P0/P1/P2 findings.
- Final: no cropped text, node overlap, broken connector, hidden primary action, unintended card grid, excessive panel chrome, or approved-direction drift.
- Console: final in-app Browser error log query returned `[]`.

## Interaction checks

- Created a project, expanded a shot, generated both video nodes, added them to the timeline, reordered the video track, and completed deterministic export.
- Enter and Space expose context actions.
- Node List select, regenerate, add-to-timeline, close, focus trap, Escape, and focus return work.
- In the 640×360 strict small-layout regression, selected-node details and the primary timeline action remain visible, focusable, and clickable. Evidence: `design-qa-evidence/zoom-200-reachability.png`. This is responsive-layout evidence, not proof of actual browser zoom.

## Verification

- `npm run test:run`: PASS — 10 files, 133 tests.
- `npm run typecheck`: PASS — exit 0.
- `npm run build`: PASS — exit 0; Vite reports only its existing advisory that the main minified chunk exceeds 500 kB.
- `npm run e2e -- --reporter=line`: PASS — 5 Chromium tests.
- Product design QA: `design-qa.md` — `final result: passed`.

## Files

- Acceptance/config: `app/e2e/creation-flow.spec.ts`, `app/playwright.config.ts`, `app/.gitignore`.
- Accessibility/dialogs: `app/src/features/canvas/CanvasPage.tsx`, `app/src/features/canvas/NodeListView.tsx`, `app/src/features/canvas/DependencyImpactDialog.tsx`, `app/src/features/canvas/dialog-keyboard.ts`, `app/src/features/launcher/ProjectLauncherPage.tsx` and focused tests.
- Behavior/copy/layout: `app/src/features/generation/generation-queue.ts`, `app/src/features/project/project-store.ts`, `app/src/features/director/DirectorComposer.tsx`, `app/src/features/timeline/TimelineTrack.tsx`, `app/src/features/export/ExportPanel.tsx`, `app/src/styles/global.css` and focused tests.
- QA: `design-qa.md`, this report, and `design-qa-evidence/*.png`.

## Self-review and concerns

- Exactly three routes and the reviewed project/canvas/generation/preview/export behavior are preserved.
- Demo generation/export remains deterministic and local, using the repository's existing real assets and icon library.
- The original reference contains a preview card on canvas; V1 intentionally keeps preview as its reviewed route. Existing demo imagery also differs from the concept collage while preserving the approved layout and visual hierarchy.
- `ExportPanel` unmount cleanup was not changed because acceptance and accessibility QA did not expose it; it remains a deferred final-review pointer.
- The Vite chunk-size warning is non-blocking and unchanged in behavior.

## Fix round 1 — Important review findings

### RED

1. Node List focus return: the new regression preselected 分镜 02, opened Node List from its toolbar trigger, closed with Escape without selecting, and failed because focus returned to 分镜 02 instead of 节点列表.
2. Independent Space evidence: after strengthening the E2E path to hide 分镜 01 actions by keyboard-selecting 场景设定 before pressing Space, a temporary production mutation that suppressed Space keydown/keyup failed exactly at `expect(storyboardActions).toBeVisible()`. This proves the revised test no longer passes on Enter's already-open state. The mutation was removed.

### GREEN

- CanvasTopBar now passes its actual Node List trigger to CanvasPage. CanvasPage captures that opener, tracks whether a list selection was intentional, restores the opener on close-without-selection, and restores the selected canvas node only after intentional list selection.
- Focused Node List tests: 3 passed, including both opener restoration and selected-node restoration.
- Chromium E2E now proves independent Enter and Space hidden→visible transitions; focused and full suites pass.
- The former 640×360 `200% zoom` wording was renamed to `strict small layout`. Its screenshot remains responsive-layout evidence only.

### Actual 200% browser zoom evidence

- User-applied zoom established genuine 200% evidence with the outer window fixed at 1349×864: inner viewport changed from 1280×720 / DPR 1 to 721×778 / DPR 2; `visualViewport.scale=1` and document zoom 1.
- RED evidence: `design-qa-evidence/zoom-200-browser-actual-before.png` (721×778). The selected node was visible, but 生成视频 spanned x=637.6…864.4 beyond `innerWidth=721`; its center had no hit target and click failed.
- Automated RED at 721×778 reproduced a visible selected node near the right edge and measured the action's right edge at 806.40 > 721.
- Minimal fix: at ≤800px CSS viewport width, context actions are inset inside the selected node for either normal placement direction.
- Automated focused GREEN: full action rectangle inside the 721px viewport.
- Actual-browser GREEN: same fixed outer 1349×864, DPR 2, inner 721×778, `visualViewport.scale=1`, document zoom 1. The complete 生成视频 button rect was x=135.95…222.21; click succeeded and 视频 01 count became 1 after waiting. Evidence: `design-qa-evidence/zoom-200-browser-actual-after.png` (721×778).
- Raw post-fix console error query: `design-qa-evidence/zoom-200-console-errors.json`, contents `[]`.

### Verification

- `npm run test:run`: PASS — 10 files, 133 tests.
- `npm run typecheck`: PASS — exit 0.
- `npm run build`: PASS — exit 0; only the existing >500 kB advisory remains.
- `npm run e2e -- --reporter=line`: PASS — 5 Chromium tests.
- `git diff --check`: PASS.
