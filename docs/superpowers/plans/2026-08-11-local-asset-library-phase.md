# Local Asset Library Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a durable local asset library with upload, search, filtering, and image/video reuse across projects while making the canvas generation adapter injectable.

**Architecture:** Dexie version 3 is the final schema and adds a canonical `libraryAssets` table with a unique fingerprint index while existing projects retain embedded `Asset[]` snapshots. Version 2 was an intermediate state in this same unpublished phase, not a deployable target. A dedicated repository owns import and lookup, a pure attach function creates project nodes, the existing `/assets` page coordinates the two repositories, and `CanvasPage` receives an optional `GenerationAdapter` without changing production runtime behavior.

**Schema migration note:** If version 2 had ever been deployed, duplicate fingerprints would have to be deduplicated before upgrading to the version 3 unique index. This phase confirms version 2 was not published, so that blocking migration is not required here.

**Tech Stack:** React 19, TypeScript 6, React Router 7, Dexie 4, Zustand, Vitest, Testing Library, Playwright.

## Global Constraints

- Do not call any LibTV remote command, upload, generation, workspace, or project mutation.
- Do not add credentials, authentication, billing, membership, or provider configuration UI.
- Do not read, modify, delete, stage, or commit `audit-2026-08-06/`.
- Preserve `/`, `/assets`, `/project/:projectId`, and `/project/:projectId/preview`.
- Preserve existing project records, canvas nodes, connections, generation queue, versions, preview, export, persistence, and keyboard accessibility.
- Accept only `image/*`, `video/*`, and `audio/*` files up to exactly 20 MiB.
- Do not add asset deletion, collections, tags, remote URL import, audio nodes, or real generation.
- Write one focused failing test before every production behavior and run its focused GREEN suite before continuing.
- After every task run `git diff --check`, inspect exact changed paths, and commit only those paths.

---

### Task 1: Add the canonical asset table and project synchronization

**Files:**
- Create: `app/src/features/assets/library-model.ts`
- Create: `app/src/features/assets/asset-library-repository.ts`
- Create: `app/src/features/assets/asset-library-repository.test.ts`
- Modify: `app/src/features/project/project-repository.ts`
- Modify: `app/src/features/project/project-store.test.ts`

**Interfaces:**
- Produces `LibraryAssetSource`, `LibraryAssetRecord`, `libraryRecordToAsset(record)`, `deriveLibraryRecord(project, asset)`, and `AssetLibraryRepository` with `list`, `load`, `save`, and `findByFingerprint`.
- Extends `WirelessCanvasDatabase` with `libraryAssets!: Table<LibraryAssetRecord, string>` and the final Dexie schema version 3; version 2 remains documented only as an unpublished intermediate schema.
- `ProjectRepository.save(project)` preserves existing asset-library metadata and inserts only missing derived records.

- [x] **Step 1: Write the failing repository tests**

```ts
test('opens a version 1 project database after adding the library table', async () => {
  const legacy = await createVersionOneDatabase(project)
  legacy.close()
  const database = new WirelessCanvasDatabase(databaseName)
  expect(await new ProjectRepository(database).load(project.id)).toEqual(project)
  expect(await new AssetLibraryRepository(database).list()).toEqual([])
})

test('indexes project assets without replacing richer library metadata', async () => {
  await library.save(uploadRecord)
  await projects.save(projectUsingUploadRecord)
  expect(await library.load(uploadRecord.id)).toEqual(uploadRecord)
  await projects.save(makeProjectFixture())
  expect((await library.list()).some(({ id }) => id === 'asset-shot-river-v1')).toBe(true)
})
```

- [x] **Step 2: Run RED**

Run:

```bash
cd app && npm run test:run -- src/features/assets/asset-library-repository.test.ts src/features/project/project-store.test.ts
```

Expected: FAIL because the asset model, repository, and `libraryAssets` table do not exist.

- [x] **Step 3: Implement the schema and synchronization**

Define the record exactly as approved:

```ts
export interface LibraryAssetRecord {
  id: string
  name: string
  kind: Asset['kind']
  mimeType: string
  url: string
  createdAt: string
  source: 'upload' | 'generated' | 'project' | 'built-in'
  fingerprint?: string
  byteSize?: number
  width?: number
  height?: number
  durationSeconds?: number
}
```

Keep the version 2 declaration only as the same-phase intermediate upgrade step, and make version 3 the final schema with `this.version(3).stores({ projects: 'id, updatedAt', libraryAssets: 'id, createdAt, kind, source, name, &fingerprint' })`. If version 2 had shipped, deduplicate fingerprints before this unique-index upgrade; it did not ship in this phase. In `ProjectRepository.save`, run one Dexie read-write transaction, load existing library records by asset id, insert only records that are missing, then put the project. Derive names from the title of the node whose version references the asset (falling back stably to the asset id), derive generated source from `job.assetId`, and treat `/demo/` URLs as built-in.

- [x] **Step 4: Run GREEN and self-check**

Run:

```bash
cd app && npm run test:run -- src/features/assets/asset-library-repository.test.ts src/features/project/project-store.test.ts
git diff --check
git diff --name-only
```

Expected: both files pass; changed paths are limited to the five Task 1 files.

- [x] **Step 5: Commit Task 1**

```bash
git add app/src/features/assets/library-model.ts app/src/features/assets/asset-library-repository.ts app/src/features/assets/asset-library-repository.test.ts app/src/features/project/project-repository.ts app/src/features/project/project-store.test.ts
git commit -m "feat: add durable asset catalog"
```

### Task 2: Import and deduplicate local media

**Files:**
- Create: `app/src/features/assets/asset-import.ts`
- Create: `app/src/features/assets/asset-import.test.ts`
- Modify: `app/src/features/assets/asset-library-repository.ts`
- Modify: `app/src/features/assets/asset-library-repository.test.ts`

**Interfaces:**
- Produces `MAX_ASSET_FILE_BYTES`, `AssetImportError`, `validateAssetFile(file)`, `fingerprintAssetFile(file)`, and `readAssetFileAsDataUrl(file)`.
- Adds `AssetLibraryRepository.importFile(file): Promise<{ status: 'created' | 'existing'; record: LibraryAssetRecord }>`.

- [x] **Step 1: Write failing import tests**

```ts
test('rejects unsupported and oversized files before reading them', () => {
  expect(() => validateAssetFile(new File(['x'], 'note.txt', { type: 'text/plain' })))
    .toThrow('仅支持图片、视频或音频文件')
  const oversized = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })
  expect(() => validateAssetFile(oversized)).toThrow('单个素材不能超过 20 MiB')
})

test('returns the existing record for identical file bytes', async () => {
  const file = new File(['same-media'], 'first.png', { type: 'image/png' })
  expect((await repository.importFile(file)).status).toBe('created')
  expect((await repository.importFile(new File(['same-media'], 'renamed.png', { type: 'image/png' }))).status).toBe('existing')
  expect(await repository.list()).toHaveLength(1)
})
```

- [x] **Step 2: Run RED**

```bash
cd app && npm run test:run -- src/features/assets/asset-import.test.ts src/features/assets/asset-library-repository.test.ts
```

Expected: FAIL because import validation and repository import do not exist.

- [x] **Step 3: Implement minimal browser import**

Use `file.arrayBuffer()` with `crypto.subtle.digest('SHA-256', bytes)` and encode the content with `FileReader.readAsDataURL(file)`. Check `findByFingerprint` before reading the data URL. New records use `crypto.randomUUID()`, `file.name`, the MIME prefix as kind, `file.size`, current ISO time, and source `upload`.

- [x] **Step 4: Run GREEN and self-check**

```bash
cd app && npm run test:run -- src/features/assets/asset-import.test.ts src/features/assets/asset-library-repository.test.ts
git diff --check
git diff --name-only
```

Expected: import and repository suites pass with no unrelated changes.

- [x] **Step 5: Commit Task 2**

```bash
git add app/src/features/assets/asset-import.ts app/src/features/assets/asset-import.test.ts app/src/features/assets/asset-library-repository.ts app/src/features/assets/asset-library-repository.test.ts
git commit -m "feat: import local media assets"
```

### Task 3: Attach reusable assets to projects

**Files:**
- Create: `app/src/features/assets/attach-library-asset.ts`
- Create: `app/src/features/assets/attach-library-asset.test.ts`

**Interfaces:**
- Produces `AttachAssetEnvironment`, `AttachLibraryAssetResult`, and `attachLibraryAssetToProject(record, project, environment?)`.
- Throws `UnsupportedLibraryAssetError` for audio without mutating the input project.

```ts
interface AttachAssetEnvironment {
  now(): string
  randomId(): string
}
```

- [x] **Step 1: Write failing domain tests**

```ts
test('creates an image node while reusing one project asset snapshot', () => {
  const first = attachLibraryAssetToProject(imageRecord, project, fixedEnvironment)
  const second = attachLibraryAssetToProject(imageRecord, first.project, nextEnvironment)
  expect(first.node).toMatchObject({ kind: 'image', title: '雨夜参考', position: { x: 1020, y: 80 } })
  expect(second.project.assets.filter(({ id }) => id === imageRecord.id)).toHaveLength(1)
  expect(second.project.nodes.filter(({ title }) => title === '雨夜参考')).toHaveLength(2)
})

test('rejects audio without changing the project', () => {
  expect(() => attachLibraryAssetToProject(audioRecord, project, fixedEnvironment))
    .toThrow('音频素材将在专业剪辑阶段开放')
  expect(project).toEqual(projectBefore)
})
```

- [x] **Step 2: Run RED**

```bash
cd app && npm run test:run -- src/features/assets/attach-library-asset.test.ts
```

Expected: FAIL because the attach module does not exist.

- [x] **Step 3: Implement the pure attach function**

Copy the library record into project `Asset` fields, generate collision-free node and version ids, and use the approved 340px horizontal / 220px vertical placement. Return a new project with updated `updatedAt`; never mutate the input.

- [x] **Step 4: Run GREEN and self-check**

```bash
cd app && npm run test:run -- src/features/assets/attach-library-asset.test.ts
git diff --check
git diff --name-only
```

Expected: all attach tests pass and only the two Task 3 files changed.

- [x] **Step 5: Commit Task 3**

```bash
git add app/src/features/assets/attach-library-asset.ts app/src/features/assets/attach-library-asset.test.ts
git commit -m "feat: reuse assets across projects"
```

### Task 4: Upgrade the assets and history page

**Files:**
- Modify: `app/src/features/platform/AssetsHistoryPage.tsx`
- Modify: `app/src/features/platform/AssetsHistoryPage.test.tsx`
- Modify: `app/src/styles/global.css`

**Interfaces:**
- `AssetsHistoryPageProps.repository` consumes `listRecent`, `load`, and `save`.
- `AssetsHistoryPageProps.libraryRepository` consumes `list` and `importFile`.
- The page exposes labels `上传本地素材`, `搜索素材`, `素材类型`, and `目标项目`.

- [x] **Step 1: Write failing page tests**

```tsx
test('uploads, searches, and filters real library records', async () => {
  const user = userEvent.setup()
  renderAssetsPage({ libraryRepository })
  await user.upload(screen.getByLabelText('上传本地素材'), pngFile)
  expect(await screen.findByRole('status')).toHaveTextContent('已导入 雨夜.png')
  await user.type(screen.getByLabelText('搜索素材'), '雨夜')
  await user.click(screen.getByRole('radio', { name: '图片' }))
  expect(screen.getByRole('article', { name: '雨夜.png' })).toBeVisible()
  expect(screen.queryByRole('article', { name: '环境声.wav' })).not.toBeInTheDocument()
})

test('saves a selected asset into the target project before navigating', async () => {
  const user = userEvent.setup()
  renderAssetsPage({ project, imageRecord })
  await user.click(screen.getByRole('button', { name: '添加 雨夜参考 到项目并打开画布' }))
  expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
  expect(savedProject.nodes.at(-1)?.title).toBe('雨夜参考')
})
```

Add the remaining observable error and boundary tests:

```tsx
test('reports a duplicate import without adding a second card', async () => {
  await user.upload(screen.getByLabelText('上传本地素材'), duplicatePng)
  expect(await screen.findByRole('status')).toHaveTextContent('素材已存在')
  expect(screen.getAllByRole('article', { name: '雨夜.png' })).toHaveLength(1)
})

test('shows unsupported upload errors while keeping history visible', async () => {
  await user.upload(screen.getByLabelText('上传本地素材'), textFile)
  expect(await screen.findByRole('alert')).toHaveTextContent('仅支持图片、视频或音频文件')
  expect(screen.getByRole('heading', { name: project.title })).toBeVisible()
})

test('keeps audio browseable without offering a canvas action', async () => {
  expect(await screen.findByRole('article', { name: '环境声.wav' })).toBeVisible()
  expect(screen.getByText('将在专业剪辑阶段使用')).toBeVisible()
  expect(screen.queryByRole('button', { name: /添加 环境声\.wav/ })).not.toBeInTheDocument()
})

test('keeps loaded history visible when the library fails to load', async () => {
  expect(await screen.findByRole('alert')).toHaveTextContent('无法读取本地素材库')
  expect(screen.getByRole('heading', { name: project.title })).toBeVisible()
})

test('stays on the assets page when saving the target project fails', async () => {
  await user.click(screen.getByRole('button', { name: '添加 雨夜参考 到项目并打开画布' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('无法添加素材到项目')
  expect(screen.getByRole('heading', { name: '素材与历史' })).toBeVisible()
})
```

- [x] **Step 2: Run RED**

```bash
cd app && npm run test:run -- src/features/platform/AssetsHistoryPage.test.tsx
```

Expected: FAIL because upload, library filters, and attach actions are absent.

- [x] **Step 3: Implement page behavior**

Load project history and library records independently. Keep existing history markup and add the upload/search/filter/library section before it. On attach, reload the selected project, call `attachLibraryAssetToProject`, save, hydrate through the real project store, then navigate to the focus URL. Keep action-specific `aria-busy`, alert, and status states.

- [x] **Step 4: Run focused GREEN and self-check**

```bash
cd app && npm run test:run -- src/features/platform/AssetsHistoryPage.test.tsx src/features/assets src/features/project/project-store.test.ts
git diff --check
git diff --name-only
```

Expected: focused asset, platform, and project persistence tests pass; exact changes are the three Task 4 files.

- [x] **Step 5: Commit Task 4**

```bash
git add app/src/features/platform/AssetsHistoryPage.tsx app/src/features/platform/AssetsHistoryPage.test.tsx app/src/styles/global.css
git commit -m "feat: make local assets reusable"
```

### Task 5: Make the generation adapter injectable

**Files:**
- Modify: `app/src/features/canvas/CanvasPage.tsx`
- Modify: `app/src/features/canvas/CanvasPage.test.tsx`
- Modify: `app/src/features/platform/model-capabilities.ts`
- Modify: `app/src/features/platform/ModelsPage.tsx`
- Modify: `app/src/features/platform/ModelsPage.test.tsx`

**Interfaces:**
- Extends `CanvasPageProps` with `generationAdapter?: GenerationAdapter`.
- Uses one module-level default `DemoGenerationAdapter` while preserving queue disposal and resume behavior.

- [x] **Step 1: Write the failing injection test**

```tsx
test('uses an injected generation adapter for canvas results', async () => {
  const adapter: GenerationAdapter = { start: async () => injectedResult }
  renderCanvas({ repository, generationAdapter: adapter })
  await user.click(screen.getByRole('button', { name: '角色参考' }))
  await user.click(screen.getByRole('button', { name: '生成视频' }))
  expect(await screen.findByRole('button', { name: '视频 01' })).toBeVisible()
  expect(useProjectStore.getState().activeProject?.assets).toContainEqual(injectedResult.asset)
})
```

Update the model page expectation to include “真实提供方未配置”.

- [x] **Step 2: Run RED**

```bash
cd app && npm run test:run -- src/features/canvas/CanvasPage.test.tsx src/features/platform/ModelsPage.test.tsx
```

Expected: FAIL because `CanvasPage` ignores the injected adapter and the explicit provider-boundary copy is absent.

- [x] **Step 3: Implement injection and truthful copy**

Use the injected adapter when building `GenerationQueue`; default to the existing demo adapter. Add no provider selector or remote configuration control.

- [x] **Step 4: Run GREEN and self-check**

```bash
cd app && npm run test:run -- src/features/canvas/CanvasPage.test.tsx src/features/generation src/features/platform/ModelsPage.test.tsx
git diff --check
git diff --name-only
```

Expected: canvas, queue, and models tests pass; changes remain within the four Task 5 files.

- [x] **Step 5: Commit Task 5**

```bash
git add app/src/features/canvas/CanvasPage.tsx app/src/features/canvas/CanvasPage.test.tsx app/src/features/platform/model-capabilities.ts app/src/features/platform/ModelsPage.tsx app/src/features/platform/ModelsPage.test.tsx
git commit -m "refactor: inject canvas generation provider"
```

### Task 6: Prove the asset-library browser path and complete the phase

**Files:**
- Create: `app/e2e/asset-library.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-11-local-asset-library-phase.md`

**Interfaces:**
- Browser path creates a project, uploads a real 1×1 PNG buffer, filters to images, attaches it, verifies the focused canvas node, and opens preview.

- [x] **Step 1: Write the failing browser path**

```ts
test('imports and reuses a local image through the platform', async ({ page }) => {
  await createCinematicProject(page)
  await page.getByRole('link', { name: '素材与历史' }).click()
  await page.getByLabel('上传本地素材').setInputFiles({
    name: '雨夜参考.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  })
  await page.getByRole('radio', { name: '图片' }).click()
  await page.getByRole('button', { name: '添加 雨夜参考.png 到项目并打开画布' }).click()
  await expect(page.getByRole('button', { name: '雨夜参考.png', exact: true })).toBeVisible()
  await page.getByRole('link', { name: '预览' }).click()
  await expect(page.getByRole('heading', { name: '成片预览' })).toBeVisible()
})
```

Track console errors and page errors and assert the collection is empty.

- [x] **Step 2: Run RED**

```bash
cd app && npx playwright test e2e/asset-library.spec.ts
```

Expected: FAIL before the complete production route supports upload and attach.

- [x] **Step 3: Make only integration corrections revealed by the browser test**

For every observed bug, add a focused failing component or domain regression test first, implement the minimal correction, and rerun both focused Vitest and this Playwright file.

- [x] **Step 4: Run full phase verification**

```bash
cd app && npm run test:run
cd app && npm run typecheck
cd app && npm run build
cd app && npx playwright test
git diff --check HEAD
git status --short --untracked-files=no
```

Expected: all commands exit zero; build may retain the existing non-failing chunk-size warning; only intended Task 6 paths remain uncommitted.

- [x] **Step 5: Mark the plan complete, self-review, and commit**

Mark every completed checkbox `[x]`, confirm no placeholder token or unchecked implementation step remains, and commit exact paths:

```bash
git add app/e2e/asset-library.spec.ts docs/superpowers/plans/2026-08-11-local-asset-library-phase.md
git commit -m "test: verify local asset library flow"
```

After commit, rerun `git status --short --untracked-files=no` and `git log -1 --oneline`. Do not inspect or stage the protected untracked directory.
