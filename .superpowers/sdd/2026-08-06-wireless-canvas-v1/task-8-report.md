# Task 8 Report — End-to-End Acceptance, Accessibility, and Visual QA

## Status

Complete. The minimum V1 creation loop passes in Playwright Chromium, the accessibility and keyboard checks pass, and the final 1440×1024 in-app Browser comparison has no open P0/P1/P2 findings.

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
- Added compact low-height positioning for the AI Director and React Flow controls so the selected primary action stays reachable at 200% effective zoom.
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
- At the 200% effective layout viewport, selected-node details and the primary timeline action remain visible, focusable, and clickable. Evidence: `design-qa-evidence/zoom-200-reachability.png` (640×360 CSS capture, equivalent to 1280×720 at 200% browser zoom).

## Verification

- `npm run test:run`: PASS — 10 files, 132 tests.
- `npm run typecheck`: PASS — exit 0.
- `npm run build`: PASS — exit 0; Vite reports only its existing advisory that the main minified chunk exceeds 500 kB.
- `npm run e2e -- --reporter=line`: PASS — 4 Chromium tests.
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
