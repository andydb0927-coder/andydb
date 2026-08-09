import {
  Background,
  Controls,
  ReactFlow,
  type Connection,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

import { DirectorComposer } from '../director/DirectorComposer'
import type { DirectorCommand } from '../director/director-command'
import { DemoGenerationAdapter } from '../generation/demo-generation-adapter'
import { GenerationQueue } from '../generation/generation-queue'
import type { Project } from '../project/model'
import { ProjectRepository } from '../project/project-repository'
import { useProjectStore } from '../project/project-store'
import {
  CanvasToolbar,
  type CanvasTool,
} from './CanvasToolbar'
import { CanvasTopBar } from './CanvasTopBar'
import { DependencyImpactDialog } from './DependencyImpactDialog'
import { edgeTypes, type DependencyFlowEdge } from './edge-types'
import { selectNodeGenerationJob } from './job-selector'
import {
  nodeTypes,
  type CreativeFlowNode,
  type CreativeNodeAction,
} from './node-types'
import { NodeListView } from './NodeListView'
import {
  NodeDraftPanel,
  type NodeDraftFormValue,
} from './NodeDraftPanel'
import {
  buildCanvasCreation,
  nextNodeTitle,
  type CreatableNodeKind,
} from './node-draft'
import '../../styles/global.css'

type CanvasRepository = Pick<ProjectRepository, 'load' | 'save'>
type CanvasLoadState = 'loading' | 'ready' | 'not-found' | 'error'
type CanvasNodePosition = Project['nodes'][number]['position']

interface DragPreviewState {
  projectId?: string
  positions: Record<string, CanvasNodePosition>
}

interface NodeMeasurementState {
  projectId?: string
  measurements: Record<string, { width: number; height: number }>
}

interface PendingPlacement {
  projectId: string
  kind: CreatableNodeKind
  position: CanvasNodePosition
  anchor: { x: number; y: number }
  bounds: { width: number; height: number }
}

const defaultRepository = new ProjectRepository()

function isCreatableTool(tool: CanvasTool): tool is CreatableNodeKind {
  return (
    tool === 'text' ||
    tool === 'image' ||
    tool === 'storyboard' ||
    tool === 'video'
  )
}

function downstreamConsumers(project: Project, nodeId: string) {
  const consumerIds = new Set<string>()
  const queue = [nodeId]

  while (queue.length > 0) {
    const sourceId = queue.shift()!
    for (const edge of project.edges) {
      if (edge.sourceNodeId !== sourceId || consumerIds.has(edge.targetNodeId)) {
        continue
      }
      consumerIds.add(edge.targetNodeId)
      queue.push(edge.targetNodeId)
    }
  }

  consumerIds.delete(nodeId)
  return project.nodes.filter((node) => consumerIds.has(node.id))
}

export interface CanvasPageProps {
  repository?: CanvasRepository
}

export function CanvasPage({ repository = defaultRepository }: CanvasPageProps) {
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams] = useSearchParams()
  const focusNodeId = searchParams.get('focus')
  const activeProject = useProjectStore((state) => state.activeProject)
  const project =
    activeProject?.id === projectId ? activeProject : undefined
  const saveStatus = useProjectStore((state) => state.saveStatus)
  const canUndo = useProjectStore((state) => state.past.length > 0)
  const canRedo = useProjectStore((state) => state.future.length > 0)
  const undo = useProjectStore((state) => state.undo)
  const redo = useProjectStore((state) => state.redo)
  const persistActive = useProjectStore((state) => state.persistActive)
  const connectNodes = useProjectStore((state) => state.connectNodes)
  const createCanvasContent = useProjectStore(
    (state) => state.createCanvasContent,
  )
  const updateNodePositions = useProjectStore(
    (state) => state.updateNodePositions,
  )
  const deleteNode = useProjectStore((state) => state.deleteNode)
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [primaryNodeId, setPrimaryNodeId] = useState<string>()
  const [dragPreview, setDragPreview] = useState<DragPreviewState>({
    positions: {},
  })
  const [nodeMeasurements, setNodeMeasurements] =
    useState<NodeMeasurementState>({ measurements: {} })
  const [nodeListOpen, setNodeListOpen] = useState(false)
  const [activeTool, setActiveTool] = useState<CanvasTool>('select')
  const [pendingPlacement, setPendingPlacement] =
    useState<PendingPlacement>()
  const [deleteCandidateId, setDeleteCandidateId] = useState<string>()
  const [loadState, setLoadState] = useState<CanvasLoadState>(() =>
    project ? 'ready' : 'loading',
  )
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [flowInstance, setFlowInstance] = useState<
    ReactFlowInstance<CreativeFlowNode, DependencyFlowEdge>
  >()
  const appliedFocusRef = useRef<string | undefined>(undefined)
  const viewportRef = useRef<HTMLDivElement>(null)
  const placementTriggerRef = useRef<HTMLButtonElement>(null)
  const deleteTriggerRef = useRef<HTMLElement>(null)
  const nodeListTriggerRef = useRef<HTMLButtonElement>(null)
  const nodeListSelectionMadeRef = useRef(false)

  const selectOnlyNode = useCallback((nodeId: string) => {
    setSelectedNodeIds(new Set([nodeId]))
    setPrimaryNodeId(nodeId)
  }, [])

  useEffect(() => {
    setActiveTool('select')
    setPendingPlacement(undefined)
    placementTriggerRef.current = null
  }, [projectId])

  const generationQueue = useMemo(
    () =>
      new GenerationQueue({
        adapter: new DemoGenerationAdapter(),
        getLatestSequence(queueProjectId) {
          const jobs =
            useProjectStore.getState().projectsById[queueProjectId]?.jobs ?? []
          return jobs.reduce(
            (latest, job) => Math.max(latest, job.sequence ?? 0),
            0,
          )
        },
        onJobChange(job) {
          if (job.projectId !== projectId) return
          if (job.status !== 'succeeded') {
            useProjectStore
              .getState()
              .updateGenerationJob(job.projectId!, job)
          }
        },
        onSuccess(job, result) {
          if (job.projectId !== projectId) {
            throw new Error('Generation callback route mismatch')
          }
          useProjectStore
            .getState()
            .applyGenerationSuccess(job.projectId!, job, result)
          if (job.operation !== 'generate-video') return

          const state = useProjectStore.getState()
          if (state.activeProjectId !== job.projectId) return
          const generatedNode = state.activeProject?.nodes.find((node) => {
            if (node.kind !== 'video') return false
            const activeVersion = node.versions.find(
              (version) => version.id === node.activeVersionId,
            )
            return activeVersion?.generationJobId === job.id
          })
          if (generatedNode) selectOnlyNode(generatedNode.id)
        },
      }),
    [projectId, selectOnlyNode],
  )

  useEffect(() => {
    generationQueue.resume()
    return () => {
      generationQueue.dispose()
      const state = useProjectStore.getState()
      if (
        state.activeProject?.id === projectId &&
        state.saveStatus === 'dirty'
      ) {
        void state.persistActive(repository)
      }
    }
  }, [generationQueue, projectId, repository])

  useEffect(() => {
    if (!project || saveStatus !== 'dirty') return
    void persistActive(repository)
  }, [persistActive, project, repository, saveStatus])

  useEffect(() => {
    if (!project || !flowInstance || !focusNodeId) return
    const focusKey = `${project.id}:${focusNodeId}`
    if (appliedFocusRef.current === focusKey) return
    const node = project.nodes.find((candidate) => candidate.id === focusNodeId)
    if (!node) return

    appliedFocusRef.current = focusKey
    selectOnlyNode(node.id)
    void flowInstance.fitView({
      nodes: [{ id: node.id }],
      duration: 300,
      padding: 0.4,
    })
  }, [flowInstance, focusNodeId, project, selectOnlyNode])

  const removeSelectedNode = useCallback((nodeId: string) => {
    setSelectedNodeIds((current) => {
      const next = new Set(current)
      next.delete(nodeId)
      return next
    })
    setPrimaryNodeId((current) => (current === nodeId ? undefined : current))
  }, [])

  useEffect(() => {
    if (!projectId) {
      setLoadState('error')
      return
    }
    if (useProjectStore.getState().activeProject?.id === projectId) {
      setLoadState('ready')
      return
    }

    const abortController = new AbortController()
    let active = true
    setLoadState('loading')

    const hydrateRoute = async () => {
      try {
        const hydrated = await useProjectStore
          .getState()
          .hydrate(projectId, repository, abortController.signal)
        if (!active || abortController.signal.aborted) return
        setLoadState(hydrated ? 'ready' : 'not-found')
      } catch {
        if (!active || abortController.signal.aborted) return
        setLoadState('error')
      }
    }
    void hydrateRoute()

    return () => {
      active = false
      abortController.abort()
    }
  }, [loadAttempt, projectId, repository])

  const handleAction = useCallback(
    (nodeId: string, action: CreativeNodeAction) => {
      const currentProject = useProjectStore.getState().activeProject
      const node = currentProject?.nodes.find(
        (candidate) => candidate.id === nodeId,
      )
      if (!currentProject || currentProject.id !== projectId || !node) return

      const activeVersion = node.versions.find(
        (version) => version.id === node.activeVersionId,
      )
      const asset = currentProject.assets.find(
        (candidate) => candidate.id === activeVersion?.assetId,
      )

      const job = selectNodeGenerationJob(node, currentProject.jobs)

      if (action === 'cancel-generation') {
        if (job) generationQueue.cancel(job.id)
        return
      }

      if (action === 'retry-generation') {
        if (job?.operation) {
          generationQueue.retry(job, {
            projectId: currentProject.id,
            nodeId: job.nodeId,
            operation: job.operation,
            prompt: job.prompt,
            referenceAssetUrls: asset ? [asset.url] : [],
          })
        }
        return
      }

      if (action === 'add-to-timeline') {
        useProjectStore.getState().addToTimeline({
          id: crypto.randomUUID(),
          nodeId,
          order: currentProject.timeline.length,
          durationSeconds: asset?.durationSeconds ?? 5,
          track: 'video',
        })
        return
      }

      generationQueue.enqueue({
        projectId: currentProject.id,
        nodeId,
        operation: action,
        prompt: activeVersion?.prompt ?? currentProject.intent,
        referenceAssetUrls: asset ? [asset.url] : [],
      })
    },
    [generationQueue, projectId],
  )

  const requestDelete = useCallback(
    (nodeId: string, focusReturnTarget: HTMLElement) => {
      if (!project) return
      const consumers = downstreamConsumers(project, nodeId)
      if (consumers.length === 0) {
        deleteNode(nodeId)
        removeSelectedNode(nodeId)
        return
      }
      deleteTriggerRef.current = focusReturnTarget
      setDeleteCandidateId(nodeId)
    },
    [deleteNode, project, removeSelectedNode],
  )

  const handleDirectorCommand = useCallback(
    (
      command: Exclude<DirectorCommand, { type: 'unknown' }>,
      focusReturnTarget?: HTMLElement,
    ) => {
      switch (command.type) {
        case 'regenerate':
          handleAction(command.nodeId, 'regenerate')
          return
        case 'replace-node':
          handleAction(command.nodeId, 'regenerate')
          return
        case 'extend-shot':
          handleAction(command.sourceNodeId, 'extend-shot')
          return
        case 'generate-video':
          handleAction(command.sourceNodeId, 'generate-video')
          return
        case 'add-to-timeline':
          handleAction(command.nodeId, 'add-to-timeline')
          return
        case 'remove-node':
          if (focusReturnTarget) {
            requestDelete(command.nodeId, focusReturnTarget)
          }
      }
    },
    [handleAction, requestDelete],
  )

  const projectFlowNodes = useMemo<CreativeFlowNode[]>(() => {
    if (!project) return []
    const rightmostX = Math.max(...project.nodes.map((node) => node.position.x))
    return project.nodes.map((node) => {
      const activeVersion = node.versions.find(
        (version) => version.id === node.activeVersionId,
      )
      const asset = project.assets.find(
        (candidate) => candidate.id === activeVersion?.assetId,
      )
      const job = selectNodeGenerationJob(node, project.jobs)
      const selected = selectedNodeIds.has(node.id)

      return {
        id: node.id,
        type: node.kind,
        position: node.position,
        selected,
        data: {
          node,
          asset,
          job,
          selected,
          contextual: node.id === primaryNodeId,
          actionsPlacement:
            node.position.x === rightmostX ? 'before' : 'after',
          onSelect: () => selectOnlyNode(node.id),
          onDelete: (trigger) => requestDelete(node.id, trigger),
          onAction: (action) => handleAction(node.id, action),
        },
      }
    })
  }, [
    handleAction,
    primaryNodeId,
    project,
    requestDelete,
    selectOnlyNode,
    selectedNodeIds,
  ])

  const measuredFlowNodes = useMemo<CreativeFlowNode[]>(() => {
    if (!project || nodeMeasurements.projectId !== project.id) {
      return projectFlowNodes
    }

    return projectFlowNodes.map((node) => {
      const measured = nodeMeasurements.measurements[node.id]
      return measured ? { ...node, measured } : node
    })
  }, [nodeMeasurements, project, projectFlowNodes])

  const flowNodes = useMemo<CreativeFlowNode[]>(() => {
    if (!project || dragPreview.projectId !== project.id) {
      return measuredFlowNodes
    }

    return measuredFlowNodes.map((node) => {
      const previewPosition = dragPreview.positions[node.id]
      return previewPosition
        ? { ...node, position: previewPosition, dragging: true }
        : node
    })
  }, [dragPreview, measuredFlowNodes, project])

  const flowEdges = useMemo<DependencyFlowEdge[]>(
    () =>
      (project?.edges ?? []).map((edge) => ({
        id: edge.id,
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
        type: 'dependency',
        data: { sourceChanged: edge.sourceChanged ?? false },
      })),
    [project?.edges],
  )

  const handleNodesChange = useCallback(
    (changes: NodeChange<CreativeFlowNode>[]) => {
      const measurements = changes.flatMap((change) =>
        change.type === 'dimensions' && change.dimensions !== undefined
          ? [{ nodeId: change.id, dimensions: change.dimensions }]
          : [],
      )
      if (project && measurements.length > 0) {
        setNodeMeasurements((current) => {
          const nextMeasurements =
            current.projectId === project.id
              ? { ...current.measurements }
              : {}
          let changed = current.projectId !== project.id

          for (const { nodeId, dimensions } of measurements) {
            const previous = nextMeasurements[nodeId]
            if (
              previous?.width === dimensions.width &&
              previous.height === dimensions.height
            ) {
              continue
            }
            nextMeasurements[nodeId] = dimensions
            changed = true
          }

          return changed
            ? { projectId: project.id, measurements: nextMeasurements }
            : current
        })
      }

      const previewPositions = changes.flatMap((change) =>
        change.type === 'position' &&
        change.position !== undefined &&
        change.dragging === true
          ? [{ nodeId: change.id, position: change.position }]
          : [],
      )
      if (project && previewPositions.length > 0) {
        setDragPreview((current) => {
          const positions =
            current.projectId === project.id ? { ...current.positions } : {}
          let changed = current.projectId !== project.id

          for (const { nodeId, position } of previewPositions) {
            const previous = positions[nodeId]
            if (
              previous?.x === position.x &&
              previous.y === position.y
            ) {
              continue
            }
            positions[nodeId] = position
            changed = true
          }

          return changed ? { projectId: project.id, positions } : current
        })
      }

      const committedPositions = changes.flatMap((change) =>
        change.type === 'position' &&
        change.position !== undefined &&
        change.dragging !== true
          ? [{ nodeId: change.id, position: change.position }]
          : [],
      )
      if (committedPositions.length > 0) {
        updateNodePositions(committedPositions)
        setDragPreview((current) => {
          if (current.projectId !== project?.id) return current
          const positions = { ...current.positions }
          let changed = false

          for (const { nodeId } of committedPositions) {
            if (!(nodeId in positions)) continue
            delete positions[nodeId]
            changed = true
          }

          return changed ? { ...current, positions } : current
        })
      }

      const selectionChanges = changes.filter(
        (change) => change.type === 'select',
      )
      if (selectionChanges.length > 0) {
        const nextSelection = new Set(selectedNodeIds)
        for (const change of selectionChanges) {
          if (change.type !== 'select') continue
          if (change.selected) nextSelection.add(change.id)
          else nextSelection.delete(change.id)
        }
        setSelectedNodeIds(nextSelection)
        const latestSelected = selectionChanges.findLast(
          (change) => change.type === 'select' && change.selected,
        )
        setPrimaryNodeId((current) =>
          latestSelected?.id ??
          (current && nextSelection.has(current)
            ? current
            : [...nextSelection].at(-1)),
        )
      }
    },
    [project, selectedNodeIds, updateNodePositions],
  )

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      connectNodes({
        id: crypto.randomUUID(),
        sourceNodeId: connection.source,
        targetNodeId: connection.target,
      })
    },
    [connectNodes],
  )

  const cancelPlacement = useCallback((restoreFocus = true) => {
    const trigger = placementTriggerRef.current
    setPendingPlacement(undefined)
    setActiveTool('select')
    placementTriggerRef.current = null
    if (restoreFocus) queueMicrotask(() => trigger?.focus())
  }, [])

  const handleToolChange = useCallback(
    (tool: CanvasTool, trigger: HTMLButtonElement) => {
      if (!project) return
      if (tool === 'select') {
        if (pendingPlacement) cancelPlacement()
        else setActiveTool('select')
        return
      }
      if (!isCreatableTool(tool) || pendingPlacement) return

      placementTriggerRef.current = trigger
      setActiveTool(tool)
    },
    [cancelPlacement, pendingPlacement, project],
  )

  const handlePaneClick = useCallback(
    (event: ReactMouseEvent<Element>) => {
      if (
        !project ||
        !flowInstance ||
        !isCreatableTool(activeTool) ||
        pendingPlacement
      ) {
        return
      }

      const viewport = viewportRef.current
      const rect = viewport?.getBoundingClientRect()
      const hasMeasuredBounds = Boolean(rect && rect.width > 0 && rect.height > 0)
      const bounds = hasMeasuredBounds
        ? { width: rect!.width, height: rect!.height }
        : {
            width: window.innerWidth,
            height: Math.max(0, window.innerHeight - 56),
          }
      const offsetLeft = hasMeasuredBounds ? rect!.left : 0
      const offsetTop = hasMeasuredBounds ? rect!.top : 0

      setPendingPlacement({
        projectId: project.id,
        kind: activeTool,
        position: flowInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        }),
        anchor: {
          x: event.clientX - offsetLeft,
          y: event.clientY - offsetTop,
        },
        bounds,
      })
    },
    [activeTool, flowInstance, pendingPlacement, project],
  )

  const submitPlacement = useCallback(
    (value: NodeDraftFormValue) => {
      const currentProject = useProjectStore.getState().activeProject
      if (
        !pendingPlacement ||
        !currentProject ||
        currentProject.id !== projectId ||
        pendingPlacement.projectId !== currentProject.id
      ) {
        return
      }

      const creation = buildCanvasCreation(currentProject, {
        kind: pendingPlacement.kind,
        title: value.title,
        content: value.content,
        position: pendingPlacement.position,
        ...(value.image ? { image: value.image } : {}),
      })
      createCanvasContent(creation)
      selectOnlyNode(creation.node.id)
      setPendingPlacement(undefined)
      setActiveTool('select')
      placementTriggerRef.current = null
      queueMicrotask(() => {
        document
          .querySelector<HTMLElement>(
            `[data-canvas-node-id="${creation.node.id}"]`,
          )
          ?.focus()
      })
    },
    [createCanvasContent, pendingPlacement, projectId, selectOnlyNode],
  )

  const openNodeList = useCallback((trigger: HTMLButtonElement) => {
    nodeListTriggerRef.current = trigger
    nodeListSelectionMadeRef.current = false
    setNodeListOpen(true)
  }, [])

  const selectFromNodeList = useCallback(
    (nodeId: string) => {
      nodeListSelectionMadeRef.current = true
      selectOnlyNode(nodeId)
    },
    [selectOnlyNode],
  )

  const closeNodeList = useCallback(() => {
    setNodeListOpen(false)
    const nodeId = primaryNodeId
    const selectionWasMade = nodeListSelectionMadeRef.current
    const trigger = nodeListTriggerRef.current
    nodeListSelectionMadeRef.current = false
    queueMicrotask(() => {
      if (selectionWasMade && nodeId) {
        const candidate = document.querySelector<HTMLElement>(
          `[data-canvas-node-id="${nodeId}"]`,
        )
        candidate?.focus()
        return
      }
      trigger?.focus()
    })
  }, [primaryNodeId])

  const deleteCandidate = project?.nodes.find(
    (node) => node.id === deleteCandidateId,
  )
  const consumers =
    project && deleteCandidate
      ? downstreamConsumers(project, deleteCandidate.id)
      : []

  const cancelDelete = () => {
    setDeleteCandidateId(undefined)
    queueMicrotask(() => deleteTriggerRef.current?.focus())
  }

  const confirmDelete = () => {
    if (!deleteCandidate) return
    deleteNode(deleteCandidate.id)
    setDeleteCandidateId(undefined)
    removeSelectedNode(deleteCandidate.id)
    queueMicrotask(() => deleteTriggerRef.current?.focus())
  }

  return (
    <main className="canvas-page">
      <CanvasTopBar
        projectId={project?.id}
        projectTitle={project?.title ?? '项目画布'}
        saveStatus={saveStatus}
        canUndo={Boolean(project) && canUndo}
        canRedo={Boolean(project) && canRedo}
        onUndo={undo}
        onRedo={redo}
        onOpenNodeList={openNodeList}
      />
      <div
        ref={viewportRef}
        className={`canvas-page__viewport${
          isCreatableTool(activeTool)
            ? ' canvas-page__viewport--placing'
            : ''
        }`}
        role="region"
        aria-label="项目画布"
      >
        <ReactFlow<CreativeFlowNode, DependencyFlowEdge>
          aria-label="创作节点图"
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onConnect={handleConnect}
          onPaneClick={handlePaneClick}
          onNodeClick={(_event, node) => selectOnlyNode(node.id)}
          onInit={setFlowInstance}
          fitView
          fitViewOptions={{ padding: 0.16 }}
          zoomOnScroll
          panOnScroll={false}
          panActivationKeyCode="Space"
          selectionOnDrag
          zoomOnDoubleClick={false}
          minZoom={0.35}
          maxZoom={1.8}
        >
          <Background gap={24} size={1} color="rgba(255,255,255,0.1)" />
          <Controls showInteractive={false} />
        </ReactFlow>
        <CanvasToolbar
          activeTool={activeTool}
          disabled={!project}
          draftOpen={Boolean(pendingPlacement)}
          onToolChange={handleToolChange}
        />
        {project && isCreatableTool(activeTool) && !pendingPlacement ? (
          <p className="canvas-placement-hint" role="status">
            点击画布放置{activeTool === 'text'
              ? '文本'
              : activeTool === 'image'
                ? '图片'
                : activeTool === 'storyboard'
                  ? '分镜'
                  : '视频'}节点
          </p>
        ) : null}
        {project && pendingPlacement ? (
          <NodeDraftPanel
            key={`${pendingPlacement.projectId}:${pendingPlacement.kind}`}
            kind={pendingPlacement.kind}
            initialTitle={nextNodeTitle(project, pendingPlacement.kind)}
            anchor={pendingPlacement.anchor}
            bounds={pendingPlacement.bounds}
            onCancel={cancelPlacement}
            onSubmit={submitPlacement}
          />
        ) : null}
        {project ? (
          <DirectorComposer
            selectedNodeId={primaryNodeId}
            onExecute={handleDirectorCommand}
          />
        ) : null}
        {!project ? (
          <div
            className="canvas-route-state"
            role={loadState === 'loading' ? 'status' : 'alert'}
          >
            <p>
              {loadState === 'loading'
                ? '正在加载项目'
                : loadState === 'not-found'
                  ? '未找到项目'
                  : '无法加载项目'}
            </p>
            {loadState === 'error' ? (
              <button
                type="button"
                onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              >
                重试加载
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {nodeListOpen && project ? (
        <NodeListView
          nodes={project.nodes}
          edges={project.edges}
          timeline={project.timeline}
          jobs={project.jobs}
          selectedNodeId={primaryNodeId}
          onSelect={selectFromNodeList}
          onAction={handleAction}
          onClose={closeNodeList}
        />
      ) : null}
      {deleteCandidate ? (
        <DependencyImpactDialog
          node={deleteCandidate}
          consumers={consumers}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      ) : null}
    </main>
  )
}
