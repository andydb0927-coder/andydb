# Canvas Node Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add typed, multi-input dependency connections that users can create by dragging ports or selecting nodes with the Connect tool, then select, delete, undo, persist, and restore.

**Architecture:** Keep `Project.edges` as the only durable graph and put all structural and node-kind rules in a pure `dependency-policy` module. React Flow and the toolbar share one CanvasPage connection command; CanvasPage owns only transient interaction state, while the Zustand store owns atomic connection mutations, history, source-change propagation, and persistence.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Zustand 5, React Flow 12, Dexie 4, Vitest 4, Testing Library, Playwright Chromium.

## Global Constraints

- Support both output-handle dragging and Connect-tool source/target selection.
- Treat `character`, `scene`, `image`, and `preview` as image-like sources; they may connect to `storyboard` or `video`.
- Allow `text` to connect to `storyboard` or `video`, and `storyboard` to connect to `video`; `video` has no allowed downstream target in this scope.
- Allow multiple distinct upstream nodes to connect to one target.
- Reject missing nodes, self-connections, duplicates, cycles, and incompatible node kinds without changing project identity, save status, or history.
- Preserve legacy loaded edges even when they do not satisfy the new creation matrix.
- Connections express generation dependency only and never mutate timeline order.
- Creating or deleting one edge is one undoable, redoable, auto-saved mutation; refresh restores the graph from IndexedDB.
- A connection change preserves generated results and marks the target plus its downstream consumers as source-changed.
- Keep ports contextual, make edges focusable, and keep status and delete controls reachable at 200% page zoom and a 721×778 CSS viewport.
- Do not add grouping, named ports, edge labels as product metadata, auto-layout, workflow branching, real model integration, timeline changes, or new dependencies.

## File Map

- Create `app/src/features/project/dependency-policy.ts`: pure compatibility, duplicate, self, missing-node, and cycle validation plus localized failure copy.
- Create `app/src/features/project/dependency-policy.test.ts`: exhaustive policy matrix and structural validation.
- Modify `app/src/features/project/project-store.ts`: return validation results, atomically connect/disconnect, and propagate source-changed state.
- Modify `app/src/features/project/project-store.test.ts`: history, no-op, downstream, persistence, undo, and redo coverage.
- Create `app/src/features/canvas/connection-tool.ts`: pure two-step toolbar interaction state.
- Create `app/src/features/canvas/connection-tool.test.ts`: state transition and cancellation coverage.
- Modify `app/src/features/canvas/CanvasToolbar.tsx`: enable Connect while leaving Group unavailable.
- Create `app/src/features/canvas/CanvasToolbar.test.tsx`: toolbar availability and pressed-state coverage.
- Modify `app/src/features/canvas/node-types.ts`: expose connection-mode and connection-source state to node renderers.
- Modify `app/src/features/canvas/nodes/AssetNode.tsx`: accessible contextual input/output handles and connection-source styling.
- Create `app/src/features/canvas/nodes/AssetNode.test.tsx`: handle names and visibility-state class coverage.
- Modify `app/src/features/canvas/CanvasPage.tsx`: unified connection command, toolbar mode, drag validation feedback, cancellation, edge selection, deletion, and focus restoration.
- Modify `app/src/features/canvas/CanvasPage.test.tsx`: component integration for both creation paths, errors, cancellation, and deletion.
- Create `app/src/features/canvas/DependencyEdge.tsx`: focused edge path, direction marker support, expanded hit target, and selected delete action.
- Modify `app/src/features/canvas/edge-types.ts`: edge data contract and type registration.
- Create `app/src/features/canvas/DependencyEdge.test.tsx`: selected rendering and delete action coverage.
- Modify `app/src/styles/global.css`: contextual handles, valid/invalid/source states, edge focus/delete controls, status pill, and narrow-layout placement.
- Create `app/e2e/node-connections.spec.ts`: real pointer, keyboard, persistence, undo/redo, deletion, and 721×778 acceptance flow.
- Modify `design-qa.md`: record connection-specific visual and accessibility verification.
- Create `design-qa-evidence/node-connections-1440x1024.png`: final full-layout evidence.
- Create `design-qa-evidence/node-connections-721x778.png`: final narrow-layout evidence.

---

### Task 1: Define the Dependency Policy

**Files:**
- Create: `app/src/features/project/dependency-policy.ts`
- Create: `app/src/features/project/dependency-policy.test.ts`
- Read: `app/src/features/project/model.ts:1-106`

**Interfaces:**
- Consumes: `Project`, `NodeKind`, and `DependencyEdge` from `./model`.
- Produces: `ConnectionFailureReason`, `ConnectionValidationResult`, `validateDependencyConnection(project, sourceNodeId, targetNodeId)`, and `connectionFailureMessage(reason)`.

- [ ] **Step 1: Write the failing compatibility and structural tests**

Create `dependency-policy.test.ts` with the complete new-edge matrix and deterministic failure order:

```ts
import { describe, expect, test } from 'vitest'

import type { CanvasNode, NodeKind, Project } from './model'
import {
  connectionFailureMessage,
  validateDependencyConnection,
} from './dependency-policy'

const kinds: NodeKind[] = [
  'character', 'scene', 'text', 'image', 'storyboard', 'video', 'preview',
]
const allowed = new Set([
  'character:storyboard', 'character:video',
  'scene:storyboard', 'scene:video',
  'text:storyboard', 'text:video',
  'image:storyboard', 'image:video',
  'preview:storyboard', 'preview:video',
  'storyboard:video',
])

function node(id: string, kind: NodeKind): CanvasNode {
  return {
    id,
    kind,
    title: id,
    position: { x: 0, y: 0 },
    versions: [],
    activeVersionId: '',
    sourceChanged: false,
  }
}

function project(sourceKind: NodeKind, targetKind: NodeKind): Project {
  return {
    id: 'policy-project',
    title: '规则测试',
    intent: '测试连接规则',
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
    assets: [],
    nodes: [node('source', sourceKind), node('target', targetKind)],
    edges: [],
    timeline: [],
    jobs: [],
    exportJobs: [],
  }
}

describe('dependency connection policy', () => {
  test.each(kinds.flatMap((source) => kinds.map((target) => [source, target] as const)))(
    '%s -> %s follows the approved type matrix',
    (sourceKind, targetKind) => {
      const result = validateDependencyConnection(
        project(sourceKind, targetKind),
        'source',
        'target',
      )
      expect(result.ok).toBe(allowed.has(`${sourceKind}:${targetKind}`))
      if (!result.ok && !allowed.has(`${sourceKind}:${targetKind}`)) {
        expect(result.reason).toBe('incompatible-types')
      }
    },
  )

  test('reports missing, self, duplicate, and legacy-backed cycles without mutation', () => {
    const base = project('text', 'storyboard')
    expect(validateDependencyConnection(base, 'missing', 'target')).toEqual({
      ok: false,
      reason: 'missing-node',
    })
    expect(validateDependencyConnection(base, 'source', 'source')).toEqual({
      ok: false,
      reason: 'self-connection',
    })
    const duplicate = {
      ...base,
      edges: [{ id: 'existing', sourceNodeId: 'source', targetNodeId: 'target' }],
    }
    expect(validateDependencyConnection(duplicate, 'source', 'target')).toEqual({
      ok: false,
      reason: 'duplicate',
    })
    const legacyBackEdge = {
      ...base,
      edges: [{ id: 'legacy', sourceNodeId: 'target', targetNodeId: 'source' }],
    }
    expect(validateDependencyConnection(legacyBackEdge, 'source', 'target')).toEqual({
      ok: false,
      reason: 'cycle',
    })
    expect(connectionFailureMessage('cycle')).toBe('此连接会形成循环依赖')
  })
})
```

- [ ] **Step 2: Run the policy test to verify RED**

Run: `npm run test:run -- src/features/project/dependency-policy.test.ts`

Expected: FAIL because `./dependency-policy` does not exist.

- [ ] **Step 3: Implement the pure policy**

Create `dependency-policy.ts` with no React or Store imports:

```ts
import type { DependencyEdge, NodeKind, Project } from './model'

export type ConnectionFailureReason =
  | 'missing-node'
  | 'self-connection'
  | 'duplicate'
  | 'cycle'
  | 'incompatible-types'

export type ConnectionValidationResult =
  | { ok: true }
  | { ok: false; reason: ConnectionFailureReason }

const targets = (...kinds: NodeKind[]) => new Set<NodeKind>(kinds)

const allowedTargets: Record<NodeKind, ReadonlySet<NodeKind>> = {
  character: targets('storyboard', 'video'),
  scene: targets('storyboard', 'video'),
  text: targets('storyboard', 'video'),
  image: targets('storyboard', 'video'),
  preview: targets('storyboard', 'video'),
  storyboard: targets('video'),
  video: targets(),
}

function hasPath(edges: DependencyEdge[], start: string, target: string) {
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    const targets = outgoing.get(edge.sourceNodeId) ?? []
    targets.push(edge.targetNodeId)
    outgoing.set(edge.sourceNodeId, targets)
  }
  const queue = [start]
  const visited = new Set(queue)
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    if (current === target) return true
    for (const next of outgoing.get(current) ?? []) {
      if (visited.has(next)) continue
      visited.add(next)
      queue.push(next)
    }
  }
  return false
}

export function validateDependencyConnection(
  project: Project,
  sourceNodeId: string,
  targetNodeId: string,
): ConnectionValidationResult {
  const source = project.nodes.find(({ id }) => id === sourceNodeId)
  const target = project.nodes.find(({ id }) => id === targetNodeId)
  if (!source || !target) return { ok: false, reason: 'missing-node' }
  if (sourceNodeId === targetNodeId) {
    return { ok: false, reason: 'self-connection' }
  }
  if (
    project.edges.some(
      (edge) =>
        edge.sourceNodeId === sourceNodeId &&
        edge.targetNodeId === targetNodeId,
    )
  ) {
    return { ok: false, reason: 'duplicate' }
  }
  if (hasPath(project.edges, targetNodeId, sourceNodeId)) {
    return { ok: false, reason: 'cycle' }
  }
  if (!allowedTargets[source.kind].has(target.kind)) {
    return { ok: false, reason: 'incompatible-types' }
  }
  return { ok: true }
}

const failureCopy: Record<ConnectionFailureReason, string> = {
  'missing-node': '节点已发生变化，请重新选择',
  'self-connection': '节点不能连接到自身',
  duplicate: '这两个节点已经连接',
  cycle: '此连接会形成循环依赖',
  'incompatible-types': '这两种节点不能建立生成依赖',
}

export function connectionFailureMessage(reason: ConnectionFailureReason) {
  return failureCopy[reason]
}
```

- [ ] **Step 4: Run the policy test to verify GREEN**

Run: `npm run test:run -- src/features/project/dependency-policy.test.ts`

Expected: PASS with the entire matrix and all structural failures covered.

- [ ] **Step 5: Commit the policy unit**

```bash
git add app/src/features/project/dependency-policy.ts app/src/features/project/dependency-policy.test.ts
git commit -m "feat: define canvas dependency rules"
```

---

### Task 2: Make Connection Mutations Atomic and Durable

**Files:**
- Modify: `app/src/features/project/project-store.ts:30-65,73-120,339-369`
- Modify: `app/src/features/project/project-store.test.ts:220-510`
- Test: `app/src/features/project/project-store.test.ts`

**Interfaces:**
- Consumes: `validateDependencyConnection` and `ConnectionValidationResult` from Task 1.
- Produces: `connectNodes(edge): ConnectionValidationResult` and `disconnectNodes(edgeId): boolean` on `ProjectStore`.

- [ ] **Step 1: Write failing Store lifecycle tests**

Add focused tests that use a text source, storyboard target, and video consumer:

```ts
test('connects and disconnects one dependency per history entry', () => {
  const original = useProjectStore.getState().activeProject!
  const text = {
    ...original.nodes[0],
    id: 'text-source',
    kind: 'text' as const,
    title: '文本来源',
  }
  const video = {
    ...original.nodes[0],
    id: 'video-consumer',
    kind: 'video' as const,
    title: '视频结果',
  }
  const project = {
    ...original,
    nodes: [text, { ...original.nodes[0], sourceChanged: false }, video],
    edges: [
      {
        id: 'storyboard-video',
        sourceNodeId: original.nodes[0].id,
        targetNodeId: video.id,
      },
    ],
  }
  useProjectStore.setState({
    projectsById: { [project.id]: project },
    activeProjectId: project.id,
    activeProject: project,
    saveStatus: 'saved',
    past: [],
    future: [],
  })

  expect(
    useProjectStore.getState().connectNodes({
      id: 'text-storyboard',
      sourceNodeId: text.id,
      targetNodeId: original.nodes[0].id,
    }),
  ).toEqual({ ok: true })
  expect(useProjectStore.getState().past).toHaveLength(1)
  expect(
    useProjectStore.getState().activeProject?.nodes
      .filter(({ sourceChanged }) => sourceChanged)
      .map(({ id }) => id),
  ).toEqual([original.nodes[0].id, video.id])

  expect(useProjectStore.getState().disconnectNodes('text-storyboard')).toBe(true)
  expect(useProjectStore.getState().past).toHaveLength(2)
  expect(useProjectStore.getState().activeProject?.edges).toEqual([
    project.edges[0],
  ])
  useProjectStore.getState().undo()
  expect(
    useProjectStore.getState().activeProject?.edges.some(
      ({ id }) => id === 'text-storyboard',
    ),
  ).toBe(true)
})

test('returns a reason and leaves state identity untouched for invalid changes', () => {
  const before = useProjectStore.getState()
  const result = before.connectNodes({
    id: 'invalid',
    sourceNodeId: 'shot-1',
    targetNodeId: 'rain-audio',
  })
  expect(result).toEqual({ ok: false, reason: 'duplicate' })
  expect(useProjectStore.getState().activeProject).toBe(before.activeProject)
  expect(useProjectStore.getState().saveStatus).toBe('saved')
  expect(useProjectStore.getState().past).toEqual([])
  expect(useProjectStore.getState().disconnectNodes('missing-edge')).toBe(false)
  expect(useProjectStore.getState().activeProject).toBe(before.activeProject)
})
```

Extend the real Dexie test to connect, persist, clear the Store, hydrate, disconnect, persist, undo, and hydrate again. Assert the exact edge IDs and `sourceChanged` flags after every reload.

- [ ] **Step 2: Run the Store test to verify RED**

Run: `npm run test:run -- src/features/project/project-store.test.ts`

Expected: FAIL because `connectNodes` returns `void`, incompatible types are not checked, and `disconnectNodes` is absent.

- [ ] **Step 3: Implement validated connect/disconnect mutations**

Import Task 1 interfaces, remove the private `hasDependencyPath`, and change the Store contract:

```ts
import {
  type ConnectionValidationResult,
  validateDependencyConnection,
} from './dependency-policy'

interface ProjectStore {
  // existing fields stay unchanged
  connectNodes: (edge: DependencyEdge) => ConnectionValidationResult
  disconnectNodes: (edgeId: string) => boolean
}
```

Add a focused propagation helper and return mutation outcomes without creating history on failure:

```ts
function markDependencyConsumersChanged(project: Project, targetNodeId: string) {
  const downstream = findDownstream(project, targetNodeId)
  return {
    ...project,
    nodes: project.nodes.map((node) =>
      node.id === targetNodeId || downstream.nodeIds.has(node.id)
        ? { ...node, sourceChanged: true }
        : node,
    ),
    edges: project.edges.map((edge) =>
      downstream.edgeIds.has(edge.id)
        ? { ...edge, sourceChanged: true }
        : edge,
    ),
  }
}

connectNodes: (edge) => {
  let result: ConnectionValidationResult = {
    ok: false,
    reason: 'missing-node',
  }
  commit((project) => {
    result = project.edges.some(({ id }) => id === edge.id)
      ? { ok: false, reason: 'duplicate' }
      : validateDependencyConnection(
          project,
          edge.sourceNodeId,
          edge.targetNodeId,
        )
    if (!result.ok) return project
    const connected = {
      ...project,
      edges: [...project.edges, { ...edge, sourceChanged: false }],
    }
    return withUpdatedTimestamp(
      markDependencyConsumersChanged(connected, edge.targetNodeId),
    )
  })
  return result
},

disconnectNodes: (edgeId) => {
  let removed = false
  commit((project) => {
    const edge = project.edges.find(({ id }) => id === edgeId)
    if (!edge) return project
    removed = true
    const disconnected = {
      ...project,
      edges: project.edges.filter(({ id }) => id !== edgeId),
    }
    return withUpdatedTimestamp(
      markDependencyConsumersChanged(disconnected, edge.targetNodeId),
    )
  })
  return removed
},
```

Update the legacy immutable-edit test so every new edge is type-compatible. Keep the legacy back-edge cycle and large-graph checks, but make the candidate new edge compatible so each test proves cycle traversal rather than failing early on kind compatibility.

- [ ] **Step 4: Run Store and policy tests to verify GREEN**

Run: `npm run test:run -- src/features/project/dependency-policy.test.ts src/features/project/project-store.test.ts`

Expected: PASS; invalid operations preserve project identity and history, valid connect/disconnect survives undo, redo, and Dexie reload.

- [ ] **Step 5: Commit the durable graph lifecycle**

```bash
git add app/src/features/project/project-store.ts app/src/features/project/project-store.test.ts
git commit -m "feat: persist canvas dependency changes"
```

---

### Task 3: Enable the Connect Tool and Contextual Ports

**Files:**
- Create: `app/src/features/canvas/connection-tool.ts`
- Create: `app/src/features/canvas/connection-tool.test.ts`
- Modify: `app/src/features/canvas/CanvasToolbar.tsx:13-74`
- Create: `app/src/features/canvas/CanvasToolbar.test.tsx`
- Modify: `app/src/features/canvas/node-types.ts:15-40`
- Modify: `app/src/features/canvas/nodes/AssetNode.tsx:95-205`
- Create: `app/src/features/canvas/nodes/AssetNode.test.tsx`

**Interfaces:**
- Produces: `ConnectionToolState`, `startConnectionTool()`, `chooseConnectionNode(state, nodeId)`, and `cancelConnectionTool()`.
- Produces on `CreativeNodeData`: `connectionMode: boolean` and `connectionSource: boolean`.
- Keeps `CanvasToolbarProps.onToolChange(tool, trigger)` unchanged for CanvasPage.

- [ ] **Step 1: Write failing controller, toolbar, and node tests**

Create pure transition tests:

```ts
import { expect, test } from 'vitest'
import {
  cancelConnectionTool,
  chooseConnectionNode,
  startConnectionTool,
} from './connection-tool'

test('selects a source and then emits one source-target pair', () => {
  const started = startConnectionTool()
  const source = chooseConnectionNode(started, 'character')
  expect(source).toEqual({
    state: { phase: 'selecting-target', sourceNodeId: 'character' },
  })
  expect(chooseConnectionNode(source.state, 'storyboard')).toEqual({
    state: source.state,
    connection: { sourceNodeId: 'character', targetNodeId: 'storyboard' },
  })
  expect(cancelConnectionTool()).toEqual({ phase: 'idle' })
})
```

Create `CanvasToolbar.test.tsx` with an explicit availability contract:

```tsx
import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { CanvasToolbar } from './CanvasToolbar'

test('enables Connect, keeps Group unavailable, and blocks Connect behind a draft', () => {
  const onToolChange = vi.fn()
  const { rerender } = render(
    <CanvasToolbar
      activeTool="connect"
      draftOpen={false}
      onToolChange={onToolChange}
    />,
  )
  const connect = screen.getByRole('button', { name: '连线' })
  expect(connect).toBeEnabled()
  expect(connect).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: '分组' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '分组' })).toHaveAttribute(
    'title',
    '分组将在后续版本提供',
  )

  rerender(
    <CanvasToolbar
      activeTool="text"
      draftOpen
      onToolChange={onToolChange}
    />,
  )
  expect(screen.getByRole('button', { name: '连线' })).toBeDisabled()
})
```

Create `AssetNode.test.tsx` with a semantic Handle mock and fully specified node data:

```tsx
import { render, screen } from '@testing-library/react'
import { vi, expect, test } from 'vitest'

import { CreativeNodeShell } from './AssetNode'

vi.mock('@xyflow/react', () => ({
  Handle: (props: { 'aria-label': string }) => (
    <button type="button" aria-label={props['aria-label']} />
  ),
  Position: { Left: 'left', Right: 'right' },
}))

test('names both ports and exposes connection source state', () => {
  const { container } = render(
    <CreativeNodeShell
      data={{
        node: {
          id: 'character',
          kind: 'character',
          title: '角色参考',
          position: { x: 0, y: 0 },
          versions: [],
          activeVersionId: '',
          sourceChanged: false,
        },
        selected: true,
        actionsPlacement: 'after',
        contextual: false,
        connectionMode: true,
        connectionSource: true,
        focusOnMount: false,
        focusRequestVersion: 0,
        onAction: vi.fn(),
        onSelect: vi.fn(),
        onFocusComplete: vi.fn(),
        onDelete: vi.fn(),
      }}
    />,
  )
  expect(screen.getByRole('button', { name: '连接到角色参考' })).toBeVisible()
  expect(
    screen.getByRole('button', { name: '从角色参考建立连接' }),
  ).toBeVisible()
  expect(container.querySelector('.creative-node')).toHaveClass(
    'creative-node--connection-mode',
    'creative-node--connection-source',
  )
})
```

- [ ] **Step 2: Run the focused canvas-surface tests to verify RED**

Run: `npm run test:run -- src/features/canvas/connection-tool.test.ts src/features/canvas/CanvasToolbar.test.tsx src/features/canvas/nodes/AssetNode.test.tsx`

Expected: FAIL because the controller and tests do not exist, Connect is disabled, and node connection state is absent.

- [ ] **Step 3: Implement the pure controller and toolbar availability**

Create `connection-tool.ts`:

```ts
export type ConnectionToolState =
  | { phase: 'idle' }
  | { phase: 'selecting-source' }
  | { phase: 'selecting-target'; sourceNodeId: string }

export function startConnectionTool(): ConnectionToolState {
  return { phase: 'selecting-source' }
}

export function cancelConnectionTool(): ConnectionToolState {
  return { phase: 'idle' }
}

export function chooseConnectionNode(
  state: ConnectionToolState,
  nodeId: string,
): {
  state: ConnectionToolState
  connection?: { sourceNodeId: string; targetNodeId: string }
} {
  if (state.phase === 'selecting-source') {
    return { state: { phase: 'selecting-target', sourceNodeId: nodeId } }
  }
  if (state.phase === 'selecting-target') {
    return {
      state,
      connection: { sourceNodeId: state.sourceNodeId, targetNodeId: nodeId },
    }
  }
  return { state }
}
```

In `CanvasToolbar.tsx`, set `unavailable` to `id === 'group'`. Disable every non-select tool while `draftOpen`, so Connect cannot start behind `NodeDraftPanel`. Preserve existing active class and `aria-pressed` behavior.

- [ ] **Step 4: Add accessible contextual handles**

Extend `CreativeNodeData` and add state classes plus explicit handle labels:

```tsx
<article
  className={`creative-node creative-node--${node.kind}${
    selected ? ' creative-node--selected' : ''
  }${data.connectionMode ? ' creative-node--connection-mode' : ''}${
    data.connectionSource ? ' creative-node--connection-source' : ''
  }`}
>
  <Handle
    id="dependency-target"
    type="target"
    position={Position.Left}
    aria-label={`连接到${node.title}`}
  />
  {/* existing selection button remains the node drag surface */}
  <Handle
    id="dependency-source"
    type="source"
    position={Position.Right}
    aria-label={`从${node.title}建立连接`}
  />
</article>
```

Do not add `nodrag` to the node selection button; the existing smooth drag behavior must remain intact.

- [ ] **Step 5: Run the focused tests to verify GREEN**

Run: `npm run test:run -- src/features/canvas/connection-tool.test.ts src/features/canvas/CanvasToolbar.test.tsx src/features/canvas/nodes/AssetNode.test.tsx src/features/canvas/CanvasPage.test.tsx`

Expected: PASS, including the existing node-drag-surface regression.

- [ ] **Step 6: Commit the connection surfaces**

```bash
git add app/src/features/canvas/connection-tool.ts app/src/features/canvas/connection-tool.test.ts app/src/features/canvas/CanvasToolbar.tsx app/src/features/canvas/CanvasToolbar.test.tsx app/src/features/canvas/node-types.ts app/src/features/canvas/nodes/AssetNode.tsx app/src/features/canvas/nodes/AssetNode.test.tsx
git commit -m "feat: expose canvas connection controls"
```

---

### Task 4: Unify Drag and Toolbar Connection Commands

**Files:**
- Modify: `app/src/features/canvas/CanvasPage.tsx:108-155,469-625,763-825`
- Modify: `app/src/features/canvas/CanvasPage.test.tsx:23-81,1078-1103`
- Modify: `app/src/styles/global.css:543-590,833-972`

**Interfaces:**
- Consumes: Store `connectNodes`, Task 1 `connectionFailureMessage` and `validateDependencyConnection`, and Task 3 controller functions.
- Produces: one `attemptConnection(sourceNodeId, targetNodeId, origin)` callback used by `onConnect`, `onConnectEnd`, and toolbar selection.

- [ ] **Step 1: Expand the React Flow test harness and write RED integration tests**

Extend `FlowPropsFixture` with `edges`, `isValidConnection`, `onConnectEnd`, and connection-mode callbacks. Add tests for the toolbar path, invalid feedback, and cancel/focus behavior:

```tsx
test('connects with the toolbar and keeps an invalid source for retry', async () => {
  const user = userEvent.setup()
  renderCanvas()
  const connect = screen.getByRole('button', { name: '连线' })

  await user.click(connect)
  expect(screen.getByRole('status')).toHaveTextContent('请选择来源节点')
  await user.click(screen.getByRole('button', { name: '角色参考' }))
  expect(screen.getByRole('status')).toHaveTextContent('请选择目标节点')
  await user.click(screen.getByRole('button', { name: '分镜 02' }))
  expect(
    useProjectStore.getState().activeProject?.edges.some(
      (edge) =>
        edge.sourceNodeId === 'character' &&
        edge.targetNodeId === 'storyboard',
    ),
  ).toBe(true)
  expect(connect).toBeFocused()

  await user.click(connect)
  await user.click(screen.getByRole('button', { name: '分镜 02' }))
  await user.click(screen.getByRole('button', { name: '角色参考' }))
  expect(screen.getByRole('status')).toHaveTextContent(
    '这两种节点不能建立生成依赖',
  )
  expect(connect).toHaveAttribute('aria-pressed', 'true')
  await user.keyboard('{Escape}')
  expect(connect).toBeFocused()
})
```

Add a drag-callback test that invokes `onConnect({ source: 'scene', target: 'video' })`, then an invalid `onConnectEnd` with `fromNode.id='storyboard'`, `toNode.id='character'`, and `isValid=false`. Assert the same Store path and error copy. Add blank-pane, tool-switch, project-switch, and unmount cancellation tests with no history changes.

- [ ] **Step 2: Run CanvasPage tests to verify RED**

Run: `npm run test:run -- src/features/canvas/CanvasPage.test.tsx`

Expected: FAIL because Connect has no CanvasPage state, node clicks always select, and no connection status or invalid-drop feedback exists.

- [ ] **Step 3: Add transient connection state and one command**

In `CanvasPage`, add `connectionTool`, `connectionFeedback`, and `connectionTriggerRef`. Implement one command that always lets the Store make the final decision:

```ts
const [connectionTool, setConnectionTool] = useState<ConnectionToolState>({
  phase: 'idle',
})
const [connectionFeedback, setConnectionFeedback] = useState<string>()
const connectionTriggerRef = useRef<HTMLButtonElement>(null)

const attemptConnection = useCallback(
  (sourceNodeId: string, targetNodeId: string, origin: 'drag' | 'tool') => {
    const result = connectNodes({
      id: crypto.randomUUID(),
      sourceNodeId,
      targetNodeId,
    })
    if (!result.ok) {
      setConnectionFeedback(connectionFailureMessage(result.reason))
      return false
    }
    setConnectionFeedback(undefined)
    if (origin === 'tool') {
      setConnectionTool(cancelConnectionTool())
      setActiveTool('select')
      queueMicrotask(() => connectionTriggerRef.current?.focus())
    }
    return true
  },
  [connectNodes],
)
```

Use `chooseConnectionNode` from the node selection callback. Guard the React Flow wrapper `onNodeClick` against the inner `[data-canvas-node-id]` button so one pointer action cannot advance both source and target phases.

- [ ] **Step 4: Wire drag validation and concrete invalid-drop feedback**

Use the active project for visual validation, but preserve Store validation as the authority:

```ts
const isValidConnection = useCallback(
  (connection: Connection) =>
    Boolean(
      project &&
      connection.source &&
      connection.target &&
      validateDependencyConnection(
        project,
        connection.source,
        connection.target,
      ).ok,
    ),
  [project],
)

const handleConnectEnd: OnConnectEnd<CreativeFlowNode> = useCallback(
  (_event, state) => {
    if (state.isValid || !state.fromNode || !state.toNode) return
    attemptConnection(state.fromNode.id, state.toNode.id, 'drag')
  },
  [attemptConnection],
)
```

Pass `isValidConnection`, `onConnect`, and `onConnectEnd` to React Flow. `onConnect` calls `attemptConnection(source, target, 'drag')`; `onConnectEnd` only reports invalid node-to-node drops and never creates a second valid edge.

- [ ] **Step 5: Add cancellation, status, and node connection state**

Make `handleToolChange` start or cancel Connect, make pane clicks cancel it before placement logic, and add an Escape listener only while Connect is active. Project changes and unmount clear state without focus restoration.

Pass these values into every `CreativeNodeData`:

```ts
connectionMode: connectionTool.phase !== 'idle',
connectionSource:
  connectionTool.phase === 'selecting-target' &&
  connectionTool.sourceNodeId === node.id,
```

Render a single live status pill:

```tsx
{connectionTool.phase !== 'idle' || connectionFeedback ? (
  <p className="canvas-connection-hint" role="status" aria-live="polite">
    {connectionFeedback ??
      (connectionTool.phase === 'selecting-source'
        ? '请选择来源节点'
        : '请选择目标节点')}
  </p>
) : null}
```

Reuse the placement-hint geometry but give connection errors a visible error modifier. Clear stale errors on success, active cancellation, and a fresh Connect start.

- [ ] **Step 6: Run component integration tests to verify GREEN**

Run: `npm run test:run -- src/features/canvas/connection-tool.test.ts src/features/canvas/CanvasToolbar.test.tsx src/features/canvas/nodes/AssetNode.test.tsx src/features/canvas/CanvasPage.test.tsx`

Expected: PASS for drag and toolbar creation, invalid feedback, no-op cancellation, keyboard focus return, and all existing canvas behavior.

- [ ] **Step 7: Commit the unified connection command**

```bash
git add app/src/features/canvas/CanvasPage.tsx app/src/features/canvas/CanvasPage.test.tsx app/src/styles/global.css
git commit -m "feat: connect canvas nodes from both inputs"
```

---

### Task 5: Select and Delete Accessible Edges

**Files:**
- Create: `app/src/features/canvas/DependencyEdge.tsx`
- Create: `app/src/features/canvas/DependencyEdge.test.tsx`
- Create: `app/e2e/node-connections.spec.ts`
- Modify: `app/src/features/canvas/edge-types.ts:1-38`
- Modify: `app/src/features/canvas/CanvasPage.tsx:469-479,773-796`
- Modify: `app/src/features/canvas/CanvasPage.test.tsx:23-81`
- Modify: `app/src/styles/global.css:956-972`

**Interfaces:**
- Consumes: Store `disconnectNodes(edgeId)` from Task 2.
- Produces: `DependencyEdgeData` with `sourceChanged`, `ariaLabel`, and `onDelete`; React Flow supplies the edge-level `selected` prop to `DependencyEdge`, which renders the path and selected delete control.

- [ ] **Step 1: Write failing edge renderer and CanvasPage deletion tests**

Mock `BaseEdge`, `EdgeLabelRenderer`, and `getBezierPath` in `DependencyEdge.test.tsx`. Render selected data and assert one accessible delete button invokes the edge-specific callback:

```tsx
test('renders the selected edge delete action at the path label point', async () => {
  const user = userEvent.setup()
  const onDelete = vi.fn()
  render(
    <DependencyEdge
      id="edge-a-b"
      source="a"
      target="b"
      sourceX={0}
      sourceY={0}
      targetX={100}
      targetY={100}
      sourcePosition={Position.Right}
      targetPosition={Position.Left}
      selected
      data={{
        sourceChanged: false,
        ariaLabel: '角色参考 → 分镜 01',
        onDelete,
      }}
    />,
  )
  await user.click(
    screen.getByRole('button', { name: '删除连接：角色参考 → 分镜 01' }),
  )
  expect(onDelete).toHaveBeenCalledWith('edge-a-b')
})
```

Expand `FlowPropsFixture` with `onEdgesChange` and `onEdgeClick`. In CanvasPage tests, select an edge, invoke its `data.onDelete`, assert exactly one Store history entry, source-node focus restoration, undo restoration, and unchanged timeline. Invoke a `remove` EdgeChange to prove keyboard Delete/Backspace uses the same deletion callback.

Create an E2E test that becomes RED specifically at the missing edge-delete surface after Task 4's valid toolbar path succeeds:

```ts
import { expect, test } from '@playwright/test'

async function createCinematicProject(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page
    .getByLabel('描述你想创作的短片')
    .fill('一位女子在雨夜寻找失踪的弟弟')
  await page.getByRole('radio', { name: /电影感叙事/ }).check()
  await page.getByRole('button', { name: '创建项目' }).click()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
}

test('selects and deletes a toolbar-created dependency edge', async ({ page }) => {
  await createCinematicProject(page)
  const connect = page.getByRole('button', { name: '连线' })
  await connect.click()
  await page.getByRole('button', { name: '角色参考' }).click()
  await page.getByRole('button', { name: '分镜 01' }).click()
  const edge = page.getByLabel('角色参考 → 分镜 01')
  await expect(edge).toBeVisible()
  await edge.click()
  await page
    .getByRole('button', { name: '删除连接：角色参考 → 分镜 01' })
    .click()
  await expect(edge).toBeHidden()
  await expect(page.getByRole('button', { name: '角色参考' })).toBeFocused()
})
```

- [ ] **Step 2: Run focused edge tests to verify RED**

Run: `npm run test:run -- src/features/canvas/DependencyEdge.test.tsx src/features/canvas/CanvasPage.test.tsx`

Run: `npm run e2e -- e2e/node-connections.spec.ts --reporter=line`

Expected: Vitest FAIL because the renderer, edge data, controlled selection, and disconnect callback do not exist; Chromium reaches the created edge and FAILS because the selected delete action is absent.

- [ ] **Step 3: Implement the custom edge renderer**

Create `DependencyEdge.tsx`:

```tsx
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'
import { Trash2 } from 'lucide-react'

import type { DependencyFlowEdge } from './edge-types'

export function DependencyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
  data,
}: EdgeProps<DependencyFlowEdge>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={24}
        className={data?.sourceChanged
          ? 'dependency-edge--changed'
          : 'dependency-edge'}
      />
      {selected && data ? (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="dependency-edge__delete nodrag nopan"
            aria-label={`删除连接：${data.ariaLabel}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            onClick={() => data.onDelete(id)}
          >
            <Trash2 aria-hidden="true" />
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
```

Export the data interface from `edge-types.ts`, import the component, and keep `edgeTypes = { dependency: DependencyEdge }`.

- [ ] **Step 4: Add controlled edge selection and deletion**

In CanvasPage, keep `selectedEdgeId`, subscribe to `disconnectNodes`, and map titles into edge data:

```ts
const disconnectEdge = useCallback((edgeId: string) => {
  const current = useProjectStore.getState().activeProject
  const edge = current?.edges.find(({ id }) => id === edgeId)
  if (!edge || !disconnectNodes(edgeId)) return
  setSelectedEdgeId(undefined)
  queueMicrotask(() => {
    const source = document.querySelector<HTMLElement>(
      `[data-canvas-node-id="${edge.sourceNodeId}"]`,
    )
    const focusTarget = source ?? viewportRef.current
    focusTarget?.focus()
  })
}, [disconnectNodes])
```

Set the viewport `tabIndex={-1}` for the documented fallback. Map each flow edge with explicit selection, accessible copy, and a closed direction marker:

```ts
const flowEdges = useMemo<DependencyFlowEdge[]>(
  () =>
    (project?.edges ?? []).map((edge) => {
      const sourceTitle = project?.nodes.find(
        ({ id }) => id === edge.sourceNodeId,
      )?.title ?? edge.sourceNodeId
      const targetTitle = project?.nodes.find(
        ({ id }) => id === edge.targetNodeId,
      )?.title ?? edge.targetNodeId
      const ariaLabel = `${sourceTitle} → ${targetTitle}`
      return {
        id: edge.id,
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
        type: 'dependency',
        selected: edge.id === selectedEdgeId,
        focusable: true,
        ariaLabel,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: {
          sourceChanged: edge.sourceChanged ?? false,
          ariaLabel,
          onDelete: disconnectEdge,
        },
      }
    }),
  [disconnectEdge, project, selectedEdgeId],
)
```

Handle edge `select` and `remove` changes in `onEdgesChange`; set `deleteKeyCode={['Backspace', 'Delete']}` and `edgesFocusable` on React Flow. Clicking a node or pane clears edge selection without mutating the graph.

- [ ] **Step 5: Add edge and handle styling**

In `global.css`:

- Hide handles by default with opacity and pointer-event transitions.
- Reveal handles on node hover, node focus-within, selected nodes, active connection mode, and React Flow’s connecting state.
- Add distinct valid, invalid, and source handle outlines that do not rely on color alone.
- Add selected/focused edge width and focus treatment.
- Position `.dependency-edge__delete` above the path with a 32×32 minimum hit target.
- At `max-width: 800px`, clamp the delete control and connection status away from the AI Director and viewport edges.

- [ ] **Step 6: Run edge and canvas tests to verify GREEN**

Run: `npm run test:run -- src/features/canvas/DependencyEdge.test.tsx src/features/canvas/CanvasPage.test.tsx src/features/project/project-store.test.ts`

Run: `npm run e2e -- e2e/node-connections.spec.ts --reporter=line`

Expected: PASS for visible-button deletion, keyboard removal, one-step history, source focus restoration, undo, unchanged timeline, and the real Chromium delete flow.

- [ ] **Step 7: Commit edge editing**

```bash
git add app/src/features/canvas/DependencyEdge.tsx app/src/features/canvas/DependencyEdge.test.tsx app/src/features/canvas/edge-types.ts app/src/features/canvas/CanvasPage.tsx app/src/features/canvas/CanvasPage.test.tsx app/src/styles/global.css app/e2e/node-connections.spec.ts
git commit -m "feat: edit canvas dependency edges"
```

---

### Task 6: Prove the Complete Connection Flow

**Files:**
- Modify: `app/e2e/node-connections.spec.ts`
- Modify: `design-qa.md`
- Create: `design-qa-evidence/node-connections-1440x1024.png`
- Create: `design-qa-evidence/node-connections-721x778.png`
- Verify: all production and test files from Tasks 1-5

**Interfaces:**
- Consumes: the complete user-facing connection flow.
- Produces: Chromium acceptance coverage and visual/accessibility evidence with no production API changes.

- [ ] **Step 1: Expand the committed Chromium smoke test into the complete acceptance flow**

Replace the smoke-test body committed in Task 5 with this complete contract while retaining its exact `createCinematicProject` helper:

```ts
import { expect, test } from '@playwright/test'

test('creates, rejects, deletes, undoes, and restores dependency connections', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')
  await page.getByLabel('描述你想创作的短片').fill('雨夜寻找失踪的弟弟')
  await page.getByRole('radio', { name: /电影感叙事/ }).check()
  await page.getByRole('button', { name: '创建项目' }).click()

  const character = page.getByRole('button', { name: '角色参考' })
  const storyboard = page.getByRole('button', { name: '分镜 01' })
  await character.hover()
  const sourceHandle = page
    .locator('.react-flow__node')
    .filter({ has: character })
    .locator('.react-flow__handle-source')
  const targetHandle = page
    .locator('.react-flow__node')
    .filter({ has: storyboard })
    .locator('.react-flow__handle-target')
  await sourceHandle.dragTo(targetHandle)
  await expect(page.getByLabel('角色参考 → 分镜 01')).toBeVisible()

  await storyboard.click()
  await page.getByRole('button', { name: '生成视频' }).click()
  const video = page.getByRole('button', { name: '视频 01' })
  await expect(video).toBeVisible()

  const connect = page.getByRole('button', { name: '连线' })
  await connect.click()
  await character.click()
  await video.click()
  await expect(page.getByLabel('角色参考 → 视频 01')).toBeVisible()
  await expect(page.getByLabel('分镜 01 → 视频 01')).toBeVisible()

  await connect.focus()
  await page.keyboard.press('Enter')
  await storyboard.focus()
  await page.keyboard.press('Space')
  await character.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toContainText(
    '这两种节点不能建立生成依赖',
  )
  await page.keyboard.press('Escape')
  await expect(connect).toBeFocused()

  await page.getByRole('button', { name: '撤销' }).click()
  await expect(page.getByLabel('角色参考 → 视频 01')).toBeHidden()
  await page.getByRole('button', { name: '重做' }).click()
  await expect(page.getByLabel('角色参考 → 视频 01')).toBeVisible()

  await page.getByLabel('角色参考 → 分镜 01').click()
  await page
    .getByRole('button', { name: '删除连接：角色参考 → 分镜 01' })
    .click()
  await expect(character).toBeFocused()
  await page.getByRole('button', { name: '撤销' }).click()
  await expect(page.getByLabel('角色参考 → 分镜 01')).toBeVisible()

  await expect(page.getByText('已保存')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('角色参考 → 分镜 01')).toBeVisible()
  await expect(page.getByLabel('角色参考 → 视频 01')).toBeVisible()
  expect(errors).toEqual([])
})
```

After reload, navigate to Preview and assert the main video track is still empty because connection creation never adds timeline items, then return to the focused source node. At 721×778, select an edge and assert the complete delete-button rectangle is within the viewport, its center resolves to the button, and it does not intersect `.director-composer`.

- [ ] **Step 2: Run the expanded E2E contract and record its first result**

Ensure port `4173` is served by the current implementation checkout, not an older preview process.

Run: `npm run e2e -- e2e/node-connections.spec.ts --reporter=line`

Expected: the Task 5 smoke path remains green. Record the first expanded assertion that fails and fix only that integration gap; if the full expansion is immediately green because the earlier TDD units already satisfy it, record that result without manufacturing a failure or reverting production code.

- [ ] **Step 3: Complete the E2E assertions and capture evidence**

Run the focused test until it passes:

Run: `npm run e2e -- e2e/node-connections.spec.ts --reporter=line`

Expected: PASS for handle drag, keyboard toolbar selection, invalid reason, Escape focus return, multiple upstreams, deletion, undo/redo, persistence, and no console errors.

Capture the final 1440×1024 and 721×778 states to:

```ts
await page.setViewportSize({ width: 1440, height: 1024 })
await page.screenshot({
  path: '../design-qa-evidence/node-connections-1440x1024.png',
})
await page.setViewportSize({ width: 721, height: 778 })
await page.screenshot({
  path: '../design-qa-evidence/node-connections-721x778.png',
})
```

- [ ] **Step 4: Perform in-app Browser visual and accessibility QA**

Reload the local project in the Codex in-app Browser after production changes. Verify the normal layout, then verify actual 200% page zoom while recording outer window size, inner CSS viewport, DPR, `visualViewport.scale`, and document zoom. If the in-app Browser cannot programmatically change zoom, ask the user to apply 200% in the existing tab; do not relabel a CSS-only viewport override as actual zoom. The automated 721×778 regression remains required even when actual zoom is available.

At normal size, actual 200%, and the exact 721×778 automated CSS viewport, verify:

- Handles remain hidden when idle and appear on hover, focus, selection, and Connect mode.
- Curves, arrows, selected edges, and source-changed edges are readable without overpowering nodes.
- The Connect status and delete button do not overlap node actions or the AI Director.
- Keyboard source/target selection, Escape, edge focus, Delete/Backspace, and focus return work.
- Console error logs are empty.

Append a dated “Node connections” section to `design-qa.md` with the two evidence paths, viewport metrics, console result, and `final result: passed` only when every check is true.

- [ ] **Step 5: Run the complete verification gate**

Run these commands from `app/`:

```bash
npm run test:run
npm run typecheck
node_modules/.bin/oxlint src
npm run build
npm run e2e -- --reporter=line
```

Expected:

- Vitest: every test file passes.
- TypeScript: exit 0.
- Oxlint: no new errors; the existing `NodeListView.tsx` Fast Refresh warning may remain unchanged.
- Vite: exit 0; the existing main-chunk size advisory may remain unchanged.
- Playwright Chromium: every E2E test passes.

Then run from the repository root:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; before the acceptance commit, only intended connection evidence/QA changes and the pre-existing untracked `audit-2026-08-06/` directory are present.

- [ ] **Step 6: Commit acceptance evidence**

```bash
git add app/e2e/node-connections.spec.ts design-qa.md design-qa-evidence/node-connections-1440x1024.png design-qa-evidence/node-connections-721x778.png
git commit -m "test: verify canvas node connections"
```

- [ ] **Step 7: Review the final diff and rerun the smallest post-commit gate**

Run:

```bash
git show --stat --oneline HEAD
git diff HEAD~6..HEAD --check
cd app
npm run test:run -- src/features/project/dependency-policy.test.ts src/features/project/project-store.test.ts src/features/canvas/connection-tool.test.ts src/features/canvas/CanvasToolbar.test.tsx src/features/canvas/nodes/AssetNode.test.tsx src/features/canvas/CanvasPage.test.tsx src/features/canvas/DependencyEdge.test.tsx
```

Expected: the six implementation commits contain no unrelated files, the focused post-commit suite passes, and `audit-2026-08-06/` remains untracked and untouched.
