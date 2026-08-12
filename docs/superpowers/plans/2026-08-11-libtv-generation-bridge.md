# Controlled LibTV Generation Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the existing canvas generation queue to a credentials-isolated LibTV CLI bridge with live read-only catalogs, explicit provider selection, per-operation quota confirmation, and no paid calls during automated verification.

**Architecture:** A Vite dev/preview plugin exposes same-origin catalog and generation endpoints backed only by `spawn("libtv", args, { shell: false })`. Browser modules own provider preferences and adapt bridge results into the existing `GenerationResult`; `CanvasPage` keeps its queue but gates every LibTV enqueue or retry behind an accessible confirmation dialog. The default remains Demo and the server independently rejects writes unless `WIRELESS_CANVAS_ENABLE_LIBTV_WRITES=1`.

**Tech Stack:** React 19, TypeScript 6, React Router 7, Zustand, Dexie, Vite 8 plugin middleware, Node 24 child process/filesystem APIs, Vitest 4, Testing Library, Playwright Chromium, official LibTV CLI 1.1.1.

## Global Constraints

- Do not read, modify, delete, stage, or commit `audit-2026-08-06/`; use `git status --short --untracked-files=no` for repository-wide status checks.
- Do not call LibTV HTTP APIs directly and do not extract browser tokens; all LibTV operations go through the official `libtv` CLI.
- Do not execute `libtv project create`, `libtv upload`, `libtv node create --run`, or any other remote write during implementation or verification.
- Read-only CLI checks may use `account info`, `project list`, and `model search`; redact user/account details from reports.
- Default provider is Demo. LibTV writes require server env `WIRELESS_CANVAS_ENABLE_LIBTV_WRITES=1`, a complete saved provider selection, and a fresh per-operation confirmation.
- Do not silently fall back from LibTV to Demo after the user has selected LibTV.
- CLI execution always uses an argument array with `shell: false`; never construct a shell command string from request values.
- Prompt, project UUID, selected model, reference MIME/count/size, and output URL must be validated before their respective side effects are accepted.
- Reference assets are limited to three Data URLs, 20 MiB decoded each. The bridge never fetches arbitrary remote URLs.
- `libtv node ... --run` is synchronous; do not add external polling or timeouts.
- Local cancellation discards the result but must not claim that a remote LibTV task was cancelled.
- Preserve `/`, `/assets`, `/models`, `/project/:projectId`, `/project/:projectId/preview`, local persistence, asset catalog sync, node/edge behavior, export, keyboard accessibility, and the Demo generation path.

---

## File Map

### Browser runtime

- Create `app/src/features/generation/generation-provider-preference.ts`: strict persisted provider/remote-target selection and testable storage adapter.
- Create `app/src/features/generation/libtv-contract.ts`: browser/server-safe catalog, selection, request, and response types with no executable code.
- Create `app/src/features/generation/libtv-generation-adapter.ts`: same-origin bridge client, reference preparation, error parsing, and `GenerationResult` mapping.
- Create `app/src/features/generation/runtime-generation-adapter.ts`: deterministic Demo/LibTV dispatch without fallback.
- Create `app/src/features/generation/GenerationConfirmationDialog.tsx`: accessible one-operation approval UI.
- Modify `app/src/features/generation/generation-adapter.ts`: structured references and target output kind.
- Modify `app/src/features/generation/demo-generation-adapter.ts`: consume the structured request without behavior drift.
- Modify `app/src/features/canvas/CanvasPage.tsx`: derive target kind/references and gate LibTV enqueue/retry.
- Modify `app/src/features/platform/ModelsPage.tsx`: load live catalog, select provider/remote target/models, retry read failures.
- Modify `app/src/features/platform/model-capabilities.ts`: Demo capability copy only; live models come from the bridge.

### Local Node bridge

- Create `app/server/libtv/types.ts`: Node-only CLI result, runner, and executor dependency contracts; shared wire types live in `src/features/generation/libtv-contract.ts`.
- Create `app/server/libtv/cli-runner.ts`: safe child-process execution.
- Create `app/server/libtv/catalog.ts`: redacted account/project/model discovery.
- Create `app/server/libtv/generation-command.ts`: request validation, Data URL materialization/upload, generation args, and terminal output parsing.
- Create `app/server/libtv/http-handler.ts`: Web `Request`/`Response` API handler and write gate.
- Create `app/server/libtv/vite-plugin.ts`: dev/preview middleware adapter.
- Modify `app/vite.config.ts`: register the bridge plugin.
- Modify `app/tsconfig.node.json`: typecheck `server/**/*.ts` with Node and Vitest types.

### Verification

- Create colocated `*.test.ts`/`*.test.tsx` for every new unit.
- Create `app/e2e/libtv-generation.spec.ts`: live-browser provider selection and confirmation using intercepted same-origin endpoints only.

---

### Task 1: Structured requests, persisted preference, and runtime dispatch

**Files:**
- Modify: `app/src/features/generation/generation-adapter.ts`
- Modify: `app/src/features/generation/demo-generation-adapter.ts`
- Modify: `app/src/features/generation/generation-queue.test.ts`
- Modify: `app/src/features/canvas/CanvasPage.tsx`
- Create: `app/src/features/generation/libtv-contract.ts`
- Create: `app/src/features/generation/generation-provider-preference.ts`
- Create: `app/src/features/generation/generation-provider-preference.test.ts`
- Create: `app/src/features/generation/runtime-generation-adapter.ts`
- Create: `app/src/features/generation/runtime-generation-adapter.test.ts`

**Interfaces:**
- Produces `GenerationReference`, the extended `GenerationRequest`, shared `LibTvCatalog`/`LibTvProviderSelection` contracts, `GenerationProviderPreference`, `GenerationProviderPreferenceStore`, and `RuntimeGenerationAdapter`.
- Later tasks must import these exact types rather than duplicate provider state.

- [x] **Step 1: Write failing request and preference tests**

Add the exact request shape to queue fixtures and test strict preference handling:

```ts
export interface GenerationReference {
  url: string
  kind: 'image' | 'video' | 'audio'
  mimeType: string
}

export interface GenerationRequest {
  projectId: string
  nodeId: string
  operation: GenerationOperation
  targetKind: 'image' | 'video'
  prompt: string
  referenceAssets: GenerationReference[]
}

test('falls back to demo when persisted provider JSON is malformed', () => {
  storage.setItem(GENERATION_PROVIDER_KEY, '{not-json')
  expect(store.read()).toEqual({ provider: 'demo' })
})

test('accepts only a complete LibTV selection', () => {
  store.write({
    provider: 'libtv',
    selection: {
      projectUuid: '11111111-2222-3333-4444-555555555555',
      projectName: '低成本验收',
      imageModelName: 'Image Model',
      videoModelName: 'Video Model',
    },
  })
  expect(store.read().provider).toBe('libtv')
})
```

Test runtime dispatch with two in-memory adapters. Assert Demo is called only for Demo, LibTV only for LibTV, and a LibTV error is returned rather than falling back.

- [x] **Step 2: Run RED**

Run:

```bash
cd app
npm run test:run -- src/features/generation/generation-queue.test.ts src/features/generation/generation-provider-preference.test.ts src/features/generation/runtime-generation-adapter.test.ts
```

Expected: fail because structured references, the preference store, and runtime adapter do not exist.

- [x] **Step 3: Implement minimal strict contracts**

Implement:

```ts
export type GenerationProviderPreference =
  | { provider: 'demo' }
  | { provider: 'libtv'; selection: LibTvProviderSelection }

export interface GenerationProviderPreferenceStore {
  read(): GenerationProviderPreference
  write(value: GenerationProviderPreference): void
}

export class RuntimeGenerationAdapter implements GenerationAdapter {
  private readonly preferenceStore: GenerationProviderPreferenceStore
  private readonly demo: GenerationAdapter
  private readonly libtv: GenerationAdapter

  constructor(
    preferenceStore: GenerationProviderPreferenceStore,
    demo: GenerationAdapter,
    libtv: GenerationAdapter,
  ) {
    this.preferenceStore = preferenceStore
    this.demo = demo
    this.libtv = libtv
  }

  start(request: GenerationRequest, signal: AbortSignal) {
    return this.preferenceStore.read().provider === 'libtv'
      ? this.libtv.start(request, signal)
      : this.demo.start(request, signal)
  }
}
```

The browser store uses key `wireless-canvas:generation-provider:v1`, catches JSON/storage errors, trims all strings, validates the UUID, and falls back to `{ provider: 'demo' }` on any invalid field. Update Demo to use `request.referenceAssets[0]?.url`.

Mechanically update both `CanvasPage` request builders in this same task so the task typechecks independently:

```ts
targetKind:
  action === 'generate-video' || node.kind === 'video' ? 'video' : 'image',
referenceAssets: asset
  ? [{ url: asset.url, kind: asset.kind, mimeType: asset.mimeType }]
  : [],
```

The later confirmation task reuses this shape but does not perform a second request-contract migration.

- [x] **Step 4: Run GREEN and typecheck**

Run the Step 2 command, then `npm run typecheck`.

Expected: all focused tests and typecheck pass.

- [x] **Step 5: Self-review and commit**

Check exact changed paths, `git diff --check`, then commit:

```bash
git commit -m "refactor: select generation providers at runtime"
```

---

### Task 2: Safe CLI runner and redacted live catalog

**Files:**
- Create: `app/server/libtv/types.ts`
- Create: `app/server/libtv/cli-runner.ts`
- Create: `app/server/libtv/cli-runner.test.ts`
- Create: `app/server/libtv/catalog.ts`
- Create: `app/server/libtv/catalog.test.ts`
- Modify: `app/tsconfig.node.json`

**Interfaces:**
- Produces `CliRunner.run(args: readonly string[]): Promise<CliResult>` and `loadLibTvCatalog(runner, writesEnabled): Promise<LibTvCatalog>`.
- Catalog fields are the only account/project/model data later exposed to the browser.

- [x] **Step 1: Write failing runner security tests**

Use an injected spawn implementation and assert:

```ts
expect(spawn).toHaveBeenCalledWith(
  '/Users/example/.libtv/libtv',
  ['model', 'search', '--type', 'image'],
  expect.objectContaining({ shell: false, stdio: ['ignore', 'pipe', 'pipe'] }),
)
```

Cover stdout/stderr separation, ENOENT, nonzero exit, and a 2 MiB output limit. The error object may contain a sanitized stderr summary but never the environment or command string.

- [x] **Step 2: Write failing catalog redaction tests**

Fake CLI JSON containing names, ids, tokens, emails, and extra fields. Assert the result is exactly:

```ts
{
  cliInstalled: true,
  cliVersion: '1.1.1',
  authenticated: true,
  writesEnabled: false,
  projects: [{ uuid: '11111111-2222-3333-4444-555555555555', name: '低成本验收' }],
  imageModels: [{ modelKey: 'image-key', modelName: 'Image Model', description: '图片' }],
  videoModels: [{ modelKey: 'video-key', modelName: 'Video Model', description: '视频', pricingRule: '以提交为准', vip: false }],
}
```

Assert user name, email, ownerId, token, icon, prefix, and arbitrary response fields are absent.

- [x] **Step 3: Run RED**

Run:

```bash
cd app
npm run test:run -- server/libtv/cli-runner.test.ts server/libtv/catalog.test.ts
```

Expected: fail because server modules do not exist.

- [x] **Step 4: Implement runner and catalog**

Define:

```ts
export interface CliResult {
  stdout: string
  stderr: string
}

export interface CliRunner {
  run(args: readonly string[]): Promise<CliResult>
}

export interface LibTvModelSummary {
  modelKey: string
  modelName: string
  description?: string
  estimatedTime?: string
  pricingRule?: string
  vip?: boolean
}
```

Runner uses `spawn(binary, [...args], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })`. Catalog runs `--version`, then `account info`, `project list -p 1 -s 50`, `model search --type image`, and `model search --type video`. Parse unknown JSON defensively and return only allowlisted fields. Convert any failure to `{ authenticated: false, projects: [], imageModels: [], videoModels: [], error }` without PII.

Extend `tsconfig.node.json` to include `server/**/*.ts` and types `node`, `vitest/globals`.

- [x] **Step 5: Run GREEN and typecheck**

Run Step 3, then `npm run typecheck`.

Expected: focused tests and both TS project references pass.

- [x] **Step 6: Self-review and commit**

Run `git diff --check`, verify only Task 2 paths, then commit:

```bash
git commit -m "feat: discover libtv generation catalogs"
```

---

### Task 3: Validate and execute official LibTV generation commands

**Files:**
- Create: `app/server/libtv/generation-command.ts`
- Create: `app/server/libtv/generation-command.test.ts`
- Modify: `app/server/libtv/types.ts`
- Modify: `app/src/features/generation/libtv-contract.ts`

**Interfaces:**
- Consumes the Task 2 `CliRunner` and allowlisted `LibTvCatalog`.
- Produces `executeLibTvGeneration(input, catalog, runner, fileWorkspace): Promise<LibTvGeneratedAsset>`.

- [x] **Step 1: Write failing preflight tests**

Before any runner call, reject:

- invalid/unlisted project UUID;
- unlisted model name;
- blank or over-8,000-character prompt;
- more than three references;
- non-Data URLs;
- unsupported MIME or decoded bytes over 20 MiB;
- video requests with unsupported reference combinations;
- missing `confirmed: true`.

Use `expect(runner.run).not.toHaveBeenCalled()` for every preflight error.

- [x] **Step 2: Write failing exact-command tests**

For one PNG Data URL followed by image generation, assert sequential calls:

```ts
expect(calls[0]).toEqual([
  'upload', referenceName,
  '-p', projectUuid,
  '-f', expect.stringMatching(/\.png$/),
  '-t', 'image',
])

expect(calls[1]).toEqual([
  'node', '--x', expect.any(String), '--y', expect.any(String),
  'create', generatedName,
  '-p', projectUuid,
  '-t', 'image',
  '--prompt', '雨夜人物特写',
  '-s', 'model=Image Model',
  '--left', referenceName,
  '--run',
])
```

Add video cases for no reference (`modeType=text2video`), one image (`singleImage2video`), and one video (`video2video`). Assert temp files exist while upload runs and are absent after success and failure.

- [x] **Step 3: Write failing output parser tests**

Accept only JSON containing an `http(s)` URL in `data.url`. Map image/video kind, optional poster/width/height/duration. Reject non-JSON, empty arrays, Data URLs, mismatched kinds, and CLI nonzero errors. Assert returned errors omit args, temp paths, full prompt, and raw output.

- [x] **Step 4: Run RED**

Run:

```bash
cd app
npm run test:run -- server/libtv/generation-command.test.ts
```

Expected: fail because the executor does not exist.

- [x] **Step 5: Implement validation, temp upload, command execution, and parsing**

Define the browser-to-server body in the shared type-only `libtv-contract.ts`; server modules import it with `import type`:

```ts
export interface LibTvGenerateBody {
  confirmed: true
  selection: LibTvProviderSelection
  request: {
    projectId: string
    nodeId: string
    operation: 'regenerate' | 'extend-shot' | 'generate-video'
    targetKind: 'image' | 'video'
    prompt: string
    referenceAssets: Array<{ dataUrl: string; kind: 'image' | 'video' | 'audio'; mimeType: string }>
  }
}
```

Materialize references with `mkdtemp`, `writeFile`, and MIME-derived safe extensions. Run uploads sequentially, then one `node ... create ... --run`. Do not add a timeout or poll. Always clean the exact temp directory in `finally` using Node filesystem APIs.

Return:

```ts
export interface LibTvGeneratedAsset {
  kind: 'image' | 'video'
  url: string
  mimeType: string
  poster?: string
  width?: number
  height?: number
  durationSeconds?: number
}
```

- [x] **Step 6: Run GREEN and typecheck**

Run Step 4, Task 2 focused tests, and `npm run typecheck`.

- [x] **Step 7: Self-review and commit**

Verify no shell interpolation, no real `libtv` runner in tests, no temp residue, then commit:

```bash
git commit -m "feat: execute gated libtv generation commands"
```

---

### Task 4: Same-origin HTTP and Vite bridge

**Files:**
- Create: `app/server/libtv/http-handler.ts`
- Create: `app/server/libtv/http-handler.test.ts`
- Create: `app/server/libtv/vite-plugin.ts`
- Create: `app/server/libtv/vite-plugin.test.ts`
- Modify: `app/vite.config.ts`

**Interfaces:**
- Consumes Tasks 2-3 catalog and generation functions.
- Produces `createLibTvHttpHandler(options): (request: Request) => Promise<Response>` and `libTvGenerationBridgePlugin(options?)`.

- [x] **Step 1: Write failing HTTP contract tests**

Assert:

- `GET /api/libtv/catalog` returns the allowlisted catalog with `Cache-Control: no-store`;
- non-GET catalog methods return 405;
- generation requires JSON and a body under 90 MiB;
- generation returns 403 before runner calls when writes are disabled;
- malformed requests return structured `{ error: { code, message } }`;
- success returns the allowlisted generated asset only;
- unknown paths return `undefined`/delegate rather than serving an app response.

- [x] **Step 2: Write failing Vite middleware tests**

Use request/response doubles to prove dev and preview hooks install the same middleware, `/api/libtv/*` is handled, non-API requests call `next()`, and no CORS wildcard is written.

- [x] **Step 3: Run RED**

Run:

```bash
cd app
npm run test:run -- server/libtv/http-handler.test.ts server/libtv/vite-plugin.test.ts
```

Expected: fail because bridge modules do not exist.

- [x] **Step 4: Implement Web handler and plugin adapter**

Create dependencies once:

```ts
export interface LibTvHttpHandlerOptions {
  runner: CliRunner
  writesEnabled: boolean
}

export function createLibTvHttpHandler(
  options: LibTvHttpHandlerOptions,
): (request: Request) => Promise<Response>
```

The plugin derives `writesEnabled` strictly from `process.env.WIRELESS_CANVAS_ENABLE_LIBTV_WRITES === '1'`. Convert Vite incoming requests to Web Requests without logging bodies and serialize the Web Response. Register in both `configureServer` and `configurePreviewServer` before SPA fallback.

Update `vite.config.ts`:

```ts
plugins: [react(), libTvGenerationBridgePlugin()],
```

- [x] **Step 5: Run GREEN, typecheck, and build**

Run Step 3, `npm run typecheck`, and `npm run build`.

- [x] **Step 6: Self-review and commit**

Verify production bundle contains no server module or credential value, run `git diff --check`, then commit:

```bash
git commit -m "feat: expose the local libtv bridge"
```

---

### Task 5: Live model page and LibTV client adapter

**Files:**
- Create: `app/src/features/generation/libtv-generation-adapter.ts`
- Create: `app/src/features/generation/libtv-generation-adapter.test.ts`
- Modify: `app/src/features/platform/ModelsPage.tsx`
- Modify: `app/src/features/platform/ModelsPage.test.tsx`
- Modify: `app/src/features/platform/model-capabilities.ts`
- Modify: `app/src/styles/global.css`

**Interfaces:**
- Consumes Tasks 1 and 4 contracts.
- Produces `fetchLibTvCatalog`, `LibTvGenerationAdapter`, and a Models page that persists only validated selections.

- [x] **Step 1: Write failing adapter tests**

Test:

- relative/same-origin references are fetched and encoded as Data URLs;
- existing validated Data URLs pass through;
- cross-origin/CORS failure rejects before POST;
- selected image/video model follows `targetKind`;
- aborting fetch rejects with `AbortError`;
- non-2xx structured errors remain actionable and do not fall back to Demo;
- valid bridge output becomes a fresh Asset/NodeVersion pair with the original prompt and matching asset reference.

- [x] **Step 2: Write failing Models page tests**

Inject catalog and preference dependencies. Cover loading, read failure + retry, writes-disabled, unauthenticated, complete selections, and switching back to Demo. Assert exact controls:

```ts
screen.getByRole('radio', { name: 'LibTV 实际生成' })
screen.getByRole('combobox', { name: '远程画布' })
screen.getByRole('combobox', { name: '图片模型' })
screen.getByRole('combobox', { name: '视频模型' })
screen.getByRole('button', { name: '启用 LibTV 实际生成' })
```

Assert the button is disabled until authenticated, writes enabled, and all three values are catalog members. Show pricing rules only when present; otherwise show `费用以 LibTV 提交时为准`.

- [x] **Step 3: Run RED**

Run:

```bash
cd app
npm run test:run -- src/features/generation/libtv-generation-adapter.test.ts src/features/platform/ModelsPage.test.tsx
```

Expected: fail because the adapter and live provider UI do not exist.

- [x] **Step 4: Implement adapter and Models page**

`LibTvGenerationAdapter.start()` reads the current complete LibTV preference, prepares references, POSTs `{ confirmed: true, selection, request }`, validates the generated asset, and creates fresh local ids/timestamps. The server remains the authoritative write gate.

Models page loads catalog once, supports explicit retry, keeps existing image/video filtering, and presents live model summaries without exposing account data. Provider changes are saved only on the explicit action button. Add responsive styles using existing platform tokens.

- [x] **Step 5: Run GREEN, expanded focused suite, and typecheck**

Run Step 3 plus:

```bash
npm run test:run -- src/features/generation/generation-queue.test.ts src/features/generation/runtime-generation-adapter.test.ts src/features/platform/ModelsPage.test.tsx
npm run typecheck
```

- [x] **Step 6: Self-review and commit**

Verify no token/account field can enter storage or render output, then commit:

```bash
git commit -m "feat: configure live libtv generation"
```

---

### Task 6: Per-operation quota confirmation in the canvas

**Files:**
- Create: `app/src/features/generation/GenerationConfirmationDialog.tsx`
- Create: `app/src/features/generation/GenerationConfirmationDialog.test.tsx`
- Modify: `app/src/features/canvas/CanvasPage.tsx`
- Modify: `app/src/features/canvas/CanvasPage.test.tsx`
- Modify: `app/src/styles/global.css`

**Interfaces:**
- Consumes the Task 1 preference store and extended request.
- Preserves the existing `generationAdapter` test injection; production default becomes one module-level `RuntimeGenerationAdapter`.

- [x] **Step 1: Write failing dialog accessibility tests**

Render the dialog and assert visible title, remote canvas, model, operation, reference count, quota warning, initial Cancel focus, Escape close, confirm callback once, and focus return.

- [x] **Step 2: Write failing Canvas behavior tests**

Cover:

- Demo `重生成` enqueues immediately without dialog;
- LibTV new generation opens dialog and Cancel does not call the adapter;
- Confirm calls the adapter once with exact `targetKind` and structured references;
- LibTV retry opens a fresh confirmation and increments only after confirm;
- switching route/project while dialog is open discards the pending action;
- local cancel copy says the LibTV task may still run remotely;
- existing injected-adapter, queue lifecycle, focus, persistence, and keyboard tests remain green.

- [x] **Step 3: Run RED**

Run:

```bash
cd app
npm run test:run -- src/features/generation/GenerationConfirmationDialog.test.tsx src/features/canvas/CanvasPage.test.tsx
```

Expected: fail because LibTV actions are not gated and request references are not structured.

- [x] **Step 4: Implement the minimal confirmation state machine**

Use one pending union:

```ts
type PendingRemoteGeneration =
  | { kind: 'enqueue'; request: GenerationRequest; returnFocusTo: HTMLElement }
  | { kind: 'retry'; job: GenerationJob; request: GenerationRequest; returnFocusTo: HTMLElement }
```

Build requests through one pure helper that derives image/video target kind and copies the current Asset into `referenceAssets`. In Demo mode call the existing queue path. In LibTV mode store pending state and render the dialog. Confirm clears pending before enqueue/retry so double activation cannot submit twice. Project/route changes clear pending.

The module-level production adapter is:

```ts
const defaultGenerationAdapter = new RuntimeGenerationAdapter(
  browserGenerationProviderPreferenceStore,
  new DemoGenerationAdapter(),
  new LibTvGenerationAdapter(browserGenerationProviderPreferenceStore),
)
```

- [x] **Step 5: Run GREEN, full Canvas focused tests, and typecheck**

Run Step 3, then all generation tests and `npm run typecheck`.

- [x] **Step 6: Self-review and commit**

Check double-submit, retry cost confirmation, focus return, stale route state, and Demo regression. Commit:

```bash
git commit -m "feat: confirm billable libtv generation"
```

---

### Task 7: Browser proof, regression gates, and delivery

**Files:**
- Create: `app/e2e/libtv-generation.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-11-libtv-generation-bridge.md` (check completed steps only after evidence exists)
- Modify only if a real browser regression requires a focused production/test fix.

**Interfaces:**
- Consumes all prior tasks.
- Produces no external LibTV writes; all `/api/libtv/*` responses are intercepted in Chromium.

- [x] **Step 1: Write the browser test**

Intercept catalog with authenticated/writes-enabled fixtures and generation with one image asset. Track POST calls in memory. The path must:

1. create a local project;
2. open Models, select LibTV + remote canvas + image/video models, and enable it;
3. return to canvas and activate a real generation action;
4. assert the confirmation dialog describes the target/model/quota boundary;
5. cancel and assert zero POSTs;
6. activate again, confirm, assert exactly one POST and validated request fields;
7. assert the generated video node is selected, persisted after reload, and present in `/assets` with source `生成结果`;
8. assert console/page error arrays are empty;
9. cover Escape and keyboard focus return.

- [x] **Step 2: Run focused Chromium**

Run:

```bash
cd app
npx playwright test e2e/libtv-generation.spec.ts
```

Expected: pass without any CLI remote write. If local port binding is sandbox-blocked, rerun with controlled permission and do not count the first environment denial as a product failure.

- [x] **Step 3: Run fresh full verification**

Run in order:

```bash
cd app
npm run test:run
npm run typecheck
npm run build
npx playwright test
cd ..
git diff --check
git status --short --untracked-files=no
```

Expected: all gates pass. Record exact file/test counts and any existing Vite chunk advisory.

- [x] **Step 4: Independent whole-phase code review**

Review from the design commit base through current HEAD. Reject any Critical/Important issue involving credential leakage, bypassable write gates, shell injection, remote side effects in tests, cost confirmation, result integrity, queue lifecycle, or accessibility. Fix findings with RED/GREEN evidence and run one scoped re-review.

- [x] **Step 5: Confirm protected and external boundaries**

Prove the phase commit range contains no `audit-2026-08-06/` paths. Report the read-only CLI checks separately from automated fake-runner/browser evidence. State explicitly that no paid LibTV generation was executed and live output quality remains unverified.

- [x] **Step 6: Commit browser evidence and completed plan**

Stage only exact Task 7 paths and any reviewed focused fix, then commit:

```bash
git commit -m "test: verify controlled libtv generation flow"
```

Keep branch `codex/platform-shell-phase` unpushed and unmerged unless the user explicitly expands scope.
