import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ViewportPortal,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnConnectEnd,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'

import { DirectorComposer } from '../director/DirectorComposer'
import { CollaborationCommentsPanel } from '../collaboration/CollaborationCommentsPanel'
import { CollaborationRepository } from '../collaboration/collaboration-repository'
import { AssetLibraryRepository } from '../assets/asset-library-repository'
import { deriveLibraryRecord } from '../assets/library-model'
import type { DirectorCommand } from '../director/director-command'
import { DemoGenerationAdapter } from '../generation/demo-generation-adapter'
import type {
  GenerationAdapter,
  GenerationRequest,
} from '../generation/generation-adapter'
import { GenerationConfirmationDialog } from '../generation/GenerationConfirmationDialog'
import { GenerationQueue } from '../generation/generation-queue'
import {
  createGenerationProviderPreferenceStore,
  type GenerationProviderPreferenceStore,
} from '../generation/generation-provider-preference'
import { LibTvGenerationAdapter } from '../generation/libtv-generation-adapter'
import type { LibTvProviderSelection } from '../generation/libtv-contract'
import { RuntimeGenerationAdapter } from '../generation/runtime-generation-adapter'
import type { MembershipPlanId } from '../membership/membership-model'
import { MembershipRepository } from '../membership/membership-repository'
import type {
  CanvasGroup,
  CreativeCardKind,
  GenerationJob,
  Project,
} from '../project/model'
import {
  buildCreativeCardCreation,
  isCreativeCardKind,
  nextCreativeCardTitle,
  type CreativeCardDraft,
} from '../project/creative-card'
import {
  connectionFailureMessage,
  validateDependencyConnection,
} from '../project/dependency-policy'
import {
  ProjectRepository,
  WirelessCanvasDatabase,
} from '../project/project-repository'
import { useProjectStore } from '../project/project-store'
import { WorkflowRunPanel } from '../workflow/WorkflowRunPanel'
import {
  buildWorkflowRun,
  executableWorkflowNodes,
  type WorkflowExecutionMode,
  type WorkflowRun,
} from '../workflow/workflow-model'
import { WorkflowRepository } from '../workflow/workflow-repository'
import { WorkflowRunner } from '../workflow/workflow-runner'
import {
  CanvasToolbar,
  type CanvasTool,
} from './CanvasToolbar'
import {
  CanvasContextMenu,
  type ContextCreatableKind,
} from './CanvasContextMenu'
import { CanvasTopBar } from './CanvasTopBar'
import {
  CanvasAgentPanel,
  CanvasStoryboardView,
  CanvasViewControls,
  SelectionContextBar,
  WorkspaceSidePanel,
  type WorkspaceMode,
  type WorkspacePanel,
} from './CanvasWorkspace'
import { CanvasGroupOverlay } from './CanvasGroupOverlay'
import {
  findSelectedCanvasGroup,
  measureCanvasGroup,
} from './canvas-group'
import { CreativeCardEditor } from './CreativeCardEditor'
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
import {
  cancelConnectionTool,
  chooseConnectionNode,
  startConnectionTool,
  type ConnectionToolState,
} from './connection-tool'
import '../../styles/global.css'

type CanvasRepository = Pick<ProjectRepository, 'load' | 'save'>
type CanvasWorkflowRepository = Pick<
  WorkflowRepository,
  'listByProject' | 'save'
>
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
  kind: CreatableNodeKind | CreativeCardKind
  entry: 'add-node' | 'free-generation' | 'upload'
  position: CanvasNodePosition
  anchor: { x: number; y: number }
  bounds: { width: number; height: number }
}

interface CanvasContextMenuState {
  projectId: string
  anchor: { x: number; y: number }
  bounds: { width: number; height: number }
  flowPosition: CanvasNodePosition
  targetNodeId?: string
  clipboardText: string
  returnFocusTo?: HTMLElement
}

interface EditingCard {
  projectId: string
  nodeId: string
  anchor: { x: number; y: number }
  bounds: { width: number; height: number }
  returnFocusTo?: HTMLElement
}

type PendingRemoteGeneration =
  | {
      kind: 'enqueue'
      request: GenerationRequest
      selection: LibTvProviderSelection
      returnFocusTo: HTMLElement
    }
  | {
      kind: 'retry'
      job: GenerationJob
      request: GenerationRequest
      selection: LibTvProviderSelection
      returnFocusTo: HTMLElement
    }

const defaultDatabase = new WirelessCanvasDatabase()
const defaultRepository = new ProjectRepository(defaultDatabase)
const defaultLibraryRepository = new AssetLibraryRepository(defaultDatabase)
const defaultWorkflowRepository = new WorkflowRepository(defaultDatabase)
const defaultCollaborationRepository = new CollaborationRepository(defaultDatabase)
const defaultMembershipRepository = new MembershipRepository(defaultDatabase)
const defaultWorkflowGenerationAdapter = new DemoGenerationAdapter()
const browserGenerationPreferenceStore =
  createGenerationProviderPreferenceStore()
const defaultGenerationAdapter = new RuntimeGenerationAdapter(
  browserGenerationPreferenceStore,
  new DemoGenerationAdapter(),
  new LibTvGenerationAdapter({
    preferenceStore: browserGenerationPreferenceStore,
  }),
)

const workspacePreferencesKey = 'wireless-canvas:workspace-preferences'

function readWorkspacePreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(workspacePreferencesKey) ?? '{}') as {
      minimapVisible?: unknown
      snapToGrid?: unknown
    }
    return {
      minimapVisible: stored.minimapVisible === true,
      snapToGrid: stored.snapToGrid === true,
    }
  } catch {
    return { minimapVisible: false, snapToGrid: false }
  }
}

function currentLibTvSelection(
  store: GenerationProviderPreferenceStore,
): LibTvProviderSelection | undefined {
  try {
    const preference = store.read()
    return preference.provider === 'libtv' ? preference.selection : undefined
  } catch {
    return undefined
  }
}

function sameSelection(
  left: LibTvProviderSelection,
  right: LibTvProviderSelection,
) {
  return (
    left.projectUuid === right.projectUuid &&
    left.projectName === right.projectName &&
    left.imageModelKey === right.imageModelKey &&
    left.imageModelName === right.imageModelName &&
    left.videoModelKey === right.videoModelKey &&
    left.videoModelName === right.videoModelName
  )
}

function buildGenerationRequest(
  project: Project,
  node: Project['nodes'][number],
  operation: GenerationRequest['operation'],
  prompt: string,
): GenerationRequest {
  const activeVersion = node.versions.find(
    (version) => version.id === node.activeVersionId,
  )
  const asset = project.assets.find(
    (candidate) => candidate.id === activeVersion?.assetId,
  )

  return {
    projectId: project.id,
    nodeId: node.id,
    operation,
    targetKind:
      operation === 'generate-video' || node.kind === 'video'
        ? 'video'
        : 'image',
    prompt,
    referenceAssets: asset
      ? [
          {
            url: asset.url,
            kind: asset.kind,
            mimeType: asset.mimeType,
          },
        ]
      : [],
  }
}

function downstreamConsumers(project: Project, nodeId: string) {
  const outgoing = new Map<string, string[]>()
  for (const edge of project.edges) {
    const sourceNodeId = edge.sourceNodeId
    const targets = outgoing.get(sourceNodeId)
    if (targets) {
      targets.push(edge.targetNodeId)
    } else {
      outgoing.set(sourceNodeId, [edge.targetNodeId])
    }
  }

  const consumerIds = new Set<string>()
  const visited = new Set([nodeId])
  const queue = [nodeId]

  for (let index = 0; index < queue.length; index += 1) {
    const sourceId = queue[index]
    for (const targetNodeId of outgoing.get(sourceId) ?? []) {
      if (visited.has(targetNodeId)) {
        continue
      }
      visited.add(targetNodeId)
      consumerIds.add(targetNodeId)
      queue.push(targetNodeId)
    }
  }

  return project.nodes.filter((node) => consumerIds.has(node.id))
}

function findCanvasNodeControl(
  viewport: HTMLElement | null,
  nodeId: string,
) {
  if (!viewport) return undefined
  return Array.from(
    viewport.querySelectorAll<HTMLElement>('[data-canvas-node-id]'),
  ).find((candidate) => candidate.dataset.canvasNodeId === nodeId)
}

export interface CanvasPageProps {
  repository?: CanvasRepository
  libraryRepository?: Pick<AssetLibraryRepository, 'list'> &
    Partial<Pick<AssetLibraryRepository, 'save'>>
  generationAdapter?: GenerationAdapter
  generationPreferenceStore?: GenerationProviderPreferenceStore
  workflowRepository?: CanvasWorkflowRepository
  workflowGenerationAdapter?: GenerationAdapter
  collaborationRepository?: Pick<CollaborationRepository, 'listComments' | 'addComment' | 'resolveComment'>
  membershipStore?: Pick<MembershipRepository, 'get'>
}

export function CanvasPage({
  repository = defaultRepository,
  libraryRepository = defaultLibraryRepository,
  generationAdapter = defaultGenerationAdapter,
  generationPreferenceStore = browserGenerationPreferenceStore,
  workflowRepository = defaultWorkflowRepository,
  workflowGenerationAdapter = defaultWorkflowGenerationAdapter,
  collaborationRepository = defaultCollaborationRepository,
  membershipStore = defaultMembershipRepository,
}: CanvasPageProps) {
  const { projectId } = useParams<{ projectId: string }>()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const focusNodeId = searchParams.get('focus')
  const locationState = location.state as {
    assetAttachSuccessMessage?: unknown
  } | null
  const assetAttachSuccessMessage =
    typeof locationState?.assetAttachSuccessMessage === 'string'
      ? locationState.assetAttachSuccessMessage
      : undefined
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
  const disconnectNodes = useProjectStore((state) => state.disconnectNodes)
  const createCanvasContent = useProjectStore(
    (state) => state.createCanvasContent,
  )
  const updateCreativeCard = useProjectStore(
    (state) => state.updateCreativeCard,
  )
  const updateNodePositions = useProjectStore(
    (state) => state.updateNodePositions,
  )
  const groupNodes = useProjectStore((state) => state.groupNodes)
  const ungroupNodes = useProjectStore((state) => state.ungroupNodes)
  const deleteNode = useProjectStore((state) => state.deleteNode)
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [primaryNodeId, setPrimaryNodeId] = useState<string>()
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>()
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([])
  const [membershipPlan, setMembershipPlan] = useState<MembershipPlanId>('free')
  const [dragPreview, setDragPreview] = useState<DragPreviewState>({
    positions: {},
  })
  const [nodeMeasurements, setNodeMeasurements] =
    useState<NodeMeasurementState>({ measurements: {} })
  const [nodeListOpen, setNodeListOpen] = useState(false)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('workflow')
  const [workspacePanel, setWorkspacePanel] = useState<WorkspacePanel>()
  const [agentOpen, setAgentOpen] = useState(false)
  const [minimapVisible, setMinimapVisible] = useState(
    () => readWorkspacePreferences().minimapVisible,
  )
  const [snapToGrid, setSnapToGrid] = useState(
    () => readWorkspacePreferences().snapToGrid,
  )
  const [zoomPercent, setZoomPercent] = useState(100)
  const [activeTool, setActiveTool] = useState<CanvasTool>('select')
  const [connectionTool, setConnectionTool] = useState<ConnectionToolState>({
    phase: 'idle',
  })
  const [connectionFeedback, setConnectionFeedback] = useState<string>()
  const [connectionsVisible, setConnectionsVisible] = useState(true)
  const [visibilityFeedback, setVisibilityFeedback] = useState<string>()
  const [groupFeedback, setGroupFeedback] = useState<string>()
  const [generationFeedback, setGenerationFeedback] = useState<string>()
  const [pendingRemoteGeneration, setPendingRemoteGeneration] =
    useState<PendingRemoteGeneration>()
  const [pendingPlacement, setPendingPlacement] =
    useState<PendingPlacement>()
  const [contextMenu, setContextMenu] =
    useState<CanvasContextMenuState>()
  const [editingCard, setEditingCard] = useState<EditingCard>()
  const [focusRequestVersion, setFocusRequestVersion] = useState(0)
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
  const nativeConnectionActiveRef = useRef(false)
  const placementTriggerRef = useRef<HTMLElement>(null)
  const connectionTriggerRef = useRef<HTMLElement>(null)
  const createdNodeFocusRef = useRef<string | undefined>(undefined)
  const deleteTriggerRef = useRef<HTMLElement>(null)
  const nodeListTriggerRef = useRef<HTMLButtonElement>(null)
  const nodeListSelectionMadeRef = useRef(false)

  const selectOnlyNode = useCallback((nodeId: string) => {
    setSelectedNodeIds(new Set([nodeId]))
    setPrimaryNodeId(nodeId)
  }, [])

  const selectedCanvasGroup = useMemo(
    () =>
      findSelectedCanvasGroup(project?.groups ?? [], selectedNodeIds),
    [project?.groups, selectedNodeIds],
  )

  const selectCanvasGroup = useCallback(
    (group: CanvasGroup) => {
      const currentProject = useProjectStore.getState().activeProject
      const liveNodeIds = new Set(
        currentProject?.nodes.map(({ id }) => id) ?? [],
      )
      const memberIds = group.nodeIds.filter((nodeId) => liveNodeIds.has(nodeId))
      if (memberIds.length < 2) return
      setSelectedEdgeId(undefined)
      setSelectedNodeIds(new Set(memberIds))
      setPrimaryNodeId(memberIds.at(-1))
    },
    [],
  )

  const removeCanvasGroup = useCallback(
    (groupId: string, restoreCanvasFocus = false) => {
      if (!ungroupNodes(groupId)) return
      setVisibilityFeedback(undefined)
      setGroupFeedback('已取消分组')
      if (restoreCanvasFocus) {
        queueMicrotask(() => viewportRef.current?.focus())
      }
    },
    [ungroupNodes],
  )

  const handleGroupAction = useCallback(() => {
    if (selectedCanvasGroup) {
      removeCanvasGroup(selectedCanvasGroup.id)
      return
    }
    if (!groupNodes(selectedNodeIds)) return
    setVisibilityFeedback(undefined)
    setGroupFeedback('已创建分组')
  }, [groupNodes, removeCanvasGroup, selectedCanvasGroup, selectedNodeIds])

  useEffect(() => {
    nativeConnectionActiveRef.current = false
    setWorkspaceMode('workflow')
    setWorkspacePanel(undefined)
    setAgentOpen(false)
    setActiveTool('select')
    setConnectionTool(cancelConnectionTool())
    setConnectionFeedback(undefined)
    setConnectionsVisible(true)
    setVisibilityFeedback(undefined)
    setGroupFeedback(undefined)
    setGenerationFeedback(undefined)
    setPendingRemoteGeneration(undefined)
    setSelectedEdgeId(undefined)
    setPendingPlacement(undefined)
    setContextMenu(undefined)
    setEditingCard(undefined)
    createdNodeFocusRef.current = undefined
    setFocusRequestVersion((version) => version + 1)
    placementTriggerRef.current = null
    connectionTriggerRef.current = null

    return () => {
      nativeConnectionActiveRef.current = false
      connectionTriggerRef.current = null
    }
  }, [projectId])

  useEffect(() => {
    localStorage.setItem(
      workspacePreferencesKey,
      JSON.stringify({ minimapVisible, snapToGrid }),
    )
  }, [minimapVisible, snapToGrid])

  useEffect(() => {
    let active = true
    void membershipStore.get().then(
      (subscription) => { if (active) setMembershipPlan(subscription.plan) },
      () => { if (active) setMembershipPlan('free') },
    )
    return () => { active = false }
  }, [membershipStore])

  const toggleConnectionsVisibility = useCallback(() => {
    const nextConnectionsVisible = !connectionsVisible
    if (!nextConnectionsVisible) setSelectedEdgeId(undefined)
    setGroupFeedback(undefined)
    setConnectionsVisible(nextConnectionsVisible)
    setVisibilityFeedback(
      nextConnectionsVisible ? '连线已显示' : '连线已隐藏，端口仍可使用',
    )
  }, [connectionsVisible])

  const generationQueue = useMemo(
    () =>
      new GenerationQueue({
        adapter: generationAdapter,
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
    [generationAdapter, projectId, selectOnlyNode],
  )

  const workflowRunner = useMemo(
    () =>
      new WorkflowRunner({
        adapter: workflowGenerationAdapter,
        onRunChange(run) {
          if (run.projectId !== projectId) return
          setWorkflowRuns((current) =>
            current.some(({ id }) => id === run.id)
              ? current.map((candidate) =>
                  candidate.id === run.id ? run : candidate,
                )
              : [run, ...current],
          )
        },
        persistRun: (run) => workflowRepository.save(run),
        async onNodeSuccess(nodeRun, result) {
          if (nodeRun.request.projectId !== projectId) {
            throw new Error('Workflow callback route mismatch')
          }
          const state = useProjectStore.getState()
          if (state.activeProjectId !== nodeRun.request.projectId) {
            throw new Error('Workflow active project mismatch')
          }
          state.applyWorkflowGenerationSuccess(
            nodeRun.request.projectId,
            nodeRun,
            result,
          )
          await useProjectStore.getState().persistActive(repository)
        },
      }),
    [projectId, repository, workflowGenerationAdapter, workflowRepository],
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

  useEffect(() => () => workflowRunner.dispose(), [workflowRunner])

  useEffect(() => {
    const activeProjectId = project?.id
    if (!activeProjectId || activeProjectId !== projectId) return
    let active = true
    setWorkflowRuns([])

    const hydrateWorkflowRuns = async () => {
      try {
        const runs = await workflowRepository.listByProject(activeProjectId)
        if (!active) return
        setWorkflowRuns(runs)
        for (const run of runs) {
          if (run.status === 'pending' || run.status === 'running') {
            void workflowRunner.resume(run)
          }
        }
      } catch {
        if (active) setWorkflowRuns([])
      }
    }
    void hydrateWorkflowRuns()

    return () => {
      active = false
    }
  }, [project?.id, projectId, workflowRepository, workflowRunner])

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

  const hasProject = Boolean(project)

  useEffect(() => {
    if (!agentOpen || workspaceMode !== 'workflow' || !flowInstance || !hasProject) {
      return
    }

    let innerFrame = 0
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        void flowInstance.fitView({ duration: 220, padding: 0.18 })
      })
    })

    return () => {
      cancelAnimationFrame(outerFrame)
      if (innerFrame) cancelAnimationFrame(innerFrame)
    }
  }, [agentOpen, flowInstance, hasProject, workspaceMode])

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
    (
      nodeId: string,
      action: CreativeNodeAction,
      explicitFocusTarget?: HTMLElement,
    ) => {
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

      if (action === 'edit-card') {
        if (!isCreativeCardKind(node.kind) || !node.card) return
        const viewportRect = viewportRef.current?.getBoundingClientRect()
        const triggerRect = explicitFocusTarget?.getBoundingClientRect()
        const hasViewportBounds = Boolean(
          viewportRect && viewportRect.width > 0 && viewportRect.height > 0,
        )
        const bounds = hasViewportBounds
          ? { width: viewportRect!.width, height: viewportRect!.height }
          : {
              width: window.innerWidth,
              height: Math.max(0, window.innerHeight - 56),
            }
        const activeElement = document.activeElement
        setEditingCard({
          projectId: currentProject.id,
          nodeId,
          bounds,
          anchor:
            triggerRect && hasViewportBounds
              ? {
                  x:
                    triggerRect.left +
                    triggerRect.width / 2 -
                    viewportRect!.left,
                  y:
                    triggerRect.top +
                    triggerRect.height / 2 -
                    viewportRect!.top,
                }
              : { x: bounds.width / 2, y: bounds.height / 2 },
          returnFocusTo:
            explicitFocusTarget ??
            (activeElement instanceof HTMLElement ? activeElement : undefined),
        })
        setNodeListOpen(false)
        setActiveTool('select')
        setPendingPlacement(undefined)
        return
      }

      if (action === 'cancel-generation') {
        if (job) {
          generationQueue.cancel(job.id)
          if (currentLibTvSelection(generationPreferenceStore)) {
            setGenerationFeedback(
              '已停止在本地应用结果；LibTV 任务可能仍在远程运行。',
            )
          }
        }
        return
      }

      if (action === 'retry-generation') {
        if (job?.operation) {
          const request = buildGenerationRequest(
            currentProject,
            node,
            job.operation,
            job.prompt,
          )
          const selection = currentLibTvSelection(generationPreferenceStore)
          if (selection) {
            const activeElement = document.activeElement
            setPendingRemoteGeneration({
              kind: 'retry',
              job,
              request,
              selection,
              returnFocusTo:
                explicitFocusTarget ??
                (activeElement instanceof HTMLElement
                  ? activeElement
                  : document.body),
            })
            setGenerationFeedback(undefined)
          } else {
            generationQueue.retry(job, request)
          }
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

      const request = buildGenerationRequest(
        currentProject,
        node,
        action,
        activeVersion?.prompt ?? currentProject.intent,
      )
      const selection = currentLibTvSelection(generationPreferenceStore)
      if (selection) {
        const activeElement = document.activeElement
        setPendingRemoteGeneration({
          kind: 'enqueue',
          request,
          selection,
          returnFocusTo:
            explicitFocusTarget ??
            (activeElement instanceof HTMLElement
              ? activeElement
              : document.body),
        })
        setGenerationFeedback(undefined)
      } else {
        generationQueue.enqueue(request)
      }
    },
    [generationPreferenceStore, generationQueue, projectId],
  )

  const confirmRemoteGeneration = useCallback(() => {
    const pending = pendingRemoteGeneration
    if (!pending) return
    setPendingRemoteGeneration(undefined)
    const currentSelection = currentLibTvSelection(generationPreferenceStore)
    if (
      !currentSelection ||
      !sameSelection(currentSelection, pending.selection)
    ) {
      setGenerationFeedback(
        'LibTV 配置已变更，请重新发起生成。',
      )
      return
    }
    setGenerationFeedback(undefined)
    if (pending.kind === 'retry') {
      generationQueue.retry(pending.job, pending.request)
    } else {
      generationQueue.enqueue(pending.request)
    }
  }, [generationPreferenceStore, generationQueue, pendingRemoteGeneration])

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
          handleAction(command.nodeId, 'regenerate', focusReturnTarget)
          return
        case 'replace-node':
          handleAction(command.nodeId, 'regenerate', focusReturnTarget)
          return
        case 'extend-shot':
          handleAction(command.sourceNodeId, 'extend-shot', focusReturnTarget)
          return
        case 'generate-video':
          handleAction(command.sourceNodeId, 'generate-video', focusReturnTarget)
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

  const workflowSelectedCount = useMemo(
    () =>
      project
        ? executableWorkflowNodes(project, selectedNodeIds).length
        : 0,
    [project, selectedNodeIds],
  )

  const createWorkflowRun = useCallback(
    (mode: WorkflowExecutionMode) => {
      const currentProject = useProjectStore.getState().activeProject
      if (!currentProject || currentProject.id !== projectId) return
      try {
        const run = buildWorkflowRun(currentProject, selectedNodeIds, mode)
        void workflowRunner.execute(run)
      } catch {
        return
      }
    },
    [projectId, selectedNodeIds, workflowRunner],
  )

  const cancelWorkflowRun = useCallback(
    (runId: string) => {
      void workflowRunner.cancel(runId)
    },
    [workflowRunner],
  )

  const retryWorkflowNode = useCallback(
    (runId: string, nodeRunId: string) => {
      const run = workflowRuns.find(({ id }) => id === runId)
      if (run) void workflowRunner.retryNode(run, nodeRunId)
    },
    [workflowRunner, workflowRuns],
  )

  const cancelConnection = useCallback((restoreFocus = true) => {
    const trigger = connectionTriggerRef.current
    setConnectionTool(cancelConnectionTool())
    setConnectionFeedback(undefined)
    setActiveTool('select')
    connectionTriggerRef.current = null
    if (restoreFocus) queueMicrotask(() => trigger?.focus())
  }, [])

  const attemptConnection = useCallback(
    (
      sourceNodeId: string,
      targetNodeId: string,
      origin: 'drag' | 'tool',
    ) => {
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

  const handleNodeSelection = useCallback(
    (nodeId: string) => {
      if (connectionTool.phase === 'idle') {
        selectOnlyNode(nodeId)
        return
      }

      const selection = chooseConnectionNode(connectionTool, nodeId)
      if (!selection.connection) {
        setConnectionFeedback(undefined)
        setConnectionTool(selection.state)
        return
      }

      if (
        !attemptConnection(
          selection.connection.sourceNodeId,
          selection.connection.targetNodeId,
          'tool',
        )
      ) {
        setConnectionTool(selection.state)
      }
    },
    [attemptConnection, connectionTool, selectOnlyNode],
  )

  const handleConnectionHandleActivate = useCallback(
    (
      nodeId: string,
      type: 'source' | 'target',
      trigger: HTMLElement,
    ) => {
      if (type === 'source') {
        placementTriggerRef.current = null
        connectionTriggerRef.current = trigger
        setConnectionFeedback(undefined)
        setConnectionTool(
          chooseConnectionNode(startConnectionTool(), nodeId).state,
        )
        setActiveTool('connect')
        return
      }

      if (connectionTool.phase === 'selecting-target') {
        const selection = chooseConnectionNode(connectionTool, nodeId)
        if (
          selection.connection &&
          !attemptConnection(
            selection.connection.sourceNodeId,
            selection.connection.targetNodeId,
            'tool',
          )
        ) {
          setConnectionTool(selection.state)
        }
        return
      }

      if (connectionTool.phase === 'idle') {
        placementTriggerRef.current = null
        connectionTriggerRef.current = trigger
        setConnectionFeedback(undefined)
        setConnectionTool(startConnectionTool())
        setActiveTool('connect')
      }
    },
    [attemptConnection, connectionTool],
  )

  useEffect(() => {
    if (connectionTool.phase === 'idle') return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelConnection()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [cancelConnection, connectionTool.phase])

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
          connectionMode: connectionTool.phase !== 'idle',
          connectionSource:
            connectionTool.phase === 'selecting-target' &&
            connectionTool.sourceNodeId === node.id,
          focusOnMount: node.id === createdNodeFocusRef.current,
          focusRequestVersion,
          actionsPlacement:
            node.position.x === rightmostX ? 'before' : 'after',
          onSelect: () => handleNodeSelection(node.id),
          onHandleActivate: (type, trigger) =>
            handleConnectionHandleActivate(node.id, type, trigger),
          onFocusComplete: () => {
            if (createdNodeFocusRef.current !== node.id) return
            createdNodeFocusRef.current = undefined
            setFocusRequestVersion((version) => version + 1)
          },
          onDelete: (trigger) => requestDelete(node.id, trigger),
          onAction: (action, trigger) => handleAction(node.id, action, trigger),
        },
      }
    })
  }, [
    handleAction,
    connectionTool,
    focusRequestVersion,
    handleConnectionHandleActivate,
    handleNodeSelection,
    primaryNodeId,
    project,
    requestDelete,
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

  const canvasGroupOverlays = useMemo(
    () =>
      (project?.groups ?? []).flatMap((group) => {
        const bounds = measureCanvasGroup(group, flowNodes)
        return bounds ? [{ group, bounds }] : []
      }),
    [flowNodes, project?.groups],
  )

  const disconnectEdge = useCallback(
    (edgeId: string) => {
      const current = useProjectStore.getState().activeProject
      const edge = current?.edges.find(({ id }) => id === edgeId)
      if (!edge || !disconnectNodes(edgeId)) return
      setSelectedEdgeId(undefined)
      queueMicrotask(() => {
        const source = findCanvasNodeControl(
          viewportRef.current,
          edge.sourceNodeId,
        )
        const focusTarget = source ?? viewportRef.current
        focusTarget?.focus()
      })
    },
    [disconnectNodes],
  )

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
          hidden: !connectionsVisible,
          focusable: connectionsVisible,
          selectable: connectionsVisible,
          ariaLabel,
          markerEnd: { type: MarkerType.ArrowClosed },
          data: {
            visible: connectionsVisible,
            sourceChanged: edge.sourceChanged ?? false,
            ariaLabel,
            onDelete: disconnectEdge,
          },
        }
      }),
    [connectionsVisible, disconnectEdge, project, selectedEdgeId],
  )

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<DependencyFlowEdge>[]) => {
      let nextSelectedEdgeId = selectedEdgeId
      for (const change of changes) {
        if (change.type === 'select') {
          if (change.selected) nextSelectedEdgeId = change.id
          else if (nextSelectedEdgeId === change.id) {
            nextSelectedEdgeId = undefined
          }
        }
        if (change.type === 'remove') {
          disconnectEdge(change.id)
          if (nextSelectedEdgeId === change.id) {
            nextSelectedEdgeId = undefined
          }
        }
      }
      setSelectedEdgeId(nextSelectedEdgeId)
    },
    [disconnectEdge, selectedEdgeId],
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
      attemptConnection(connection.source, connection.target, 'drag')
    },
    [attemptConnection],
  )

  const isValidConnection = useCallback(
    (connection: Connection | DependencyFlowEdge) =>
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

  const handleConnectEnd: OnConnectEnd = useCallback(
    (_event, state) => {
      nativeConnectionActiveRef.current = false
      if (state.isValid || !state.fromNode || !state.toNode) return
      const startsFromTarget = state.fromHandle?.type === 'target'
      attemptConnection(
        startsFromTarget ? state.toNode.id : state.fromNode.id,
        startsFromTarget ? state.fromNode.id : state.toNode.id,
        'drag',
      )
    },
    [attemptConnection],
  )

  const handleConnectStart = useCallback(() => {
    nativeConnectionActiveRef.current = true
    if (connectionTool.phase !== 'idle') cancelConnection(false)
  }, [cancelConnection, connectionTool.phase])

  const canvasPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (!flowInstance) return undefined
      const viewport = viewportRef.current
      const rect = viewport?.getBoundingClientRect()
      const hasMeasuredBounds = Boolean(
        rect && rect.width > 0 && rect.height > 0,
      )
      const bounds = hasMeasuredBounds
        ? { width: rect!.width, height: rect!.height }
        : {
            width: window.innerWidth,
            height: Math.max(0, window.innerHeight - 56),
          }
      return {
        flowPosition: flowInstance.screenToFlowPosition({ x: clientX, y: clientY }),
        anchor: {
          x: clientX - (hasMeasuredBounds ? rect!.left : 0),
          y: clientY - (hasMeasuredBounds ? rect!.top : 0),
        },
        bounds,
      }
    },
    [flowInstance],
  )

  const closeContextMenu = useCallback(
    (restoreFocus = true) => {
      const returnFocusTo = contextMenu?.returnFocusTo
      setContextMenu(undefined)
      if (!restoreFocus) return
      queueMicrotask(() => {
        if (returnFocusTo?.isConnected) returnFocusTo.focus()
        else viewportRef.current?.focus()
      })
    },
    [contextMenu?.returnFocusTo],
  )

  const beginPlacement = useCallback(
    (
      kind: ContextCreatableKind,
      entry: PendingPlacement['entry'],
      source: CanvasContextMenuState,
    ) => {
      placementTriggerRef.current =
        source.returnFocusTo?.isConnected
          ? source.returnFocusTo
          : viewportRef.current
      setContextMenu(undefined)
      setPendingPlacement({
        projectId: source.projectId,
        kind,
        entry,
        position: source.flowPosition,
        anchor: source.anchor,
        bounds: source.bounds,
      })
      setActiveTool('select')
    },
    [],
  )

  const openContextMenu = useCallback(
    (
      clientX: number,
      clientY: number,
      targetNodeId?: string,
      returnFocusTo?: HTMLElement,
    ) => {
      if (!project || pendingPlacement || editingCard) return
      const point = canvasPoint(clientX, clientY)
      if (!point) return
      if (connectionTool.phase !== 'idle') cancelConnection(false)
      if (targetNodeId) {
        setSelectedEdgeId(undefined)
        selectOnlyNode(targetNodeId)
      }
      const nextMenu: CanvasContextMenuState = {
        projectId: project.id,
        ...point,
        targetNodeId,
        clipboardText: '',
        returnFocusTo: returnFocusTo ?? viewportRef.current ?? undefined,
      }
      setContextMenu(nextMenu)

      const clipboard = navigator.clipboard
      if (!clipboard?.readText) return
      try {
        void clipboard.readText().then(
          (text) => {
            setContextMenu((current) =>
              current === nextMenu
                ? { ...current, clipboardText: text }
                : current,
            )
          },
          () => undefined,
        )
      } catch {
        // Clipboard permission and support vary by browser; disabled is safe.
      }
    },
    [
      cancelConnection,
      canvasPoint,
      connectionTool.phase,
      editingCard,
      pendingPlacement,
      project,
      selectOnlyNode,
    ],
  )

  const cancelPlacement = useCallback((restoreFocus = true) => {
    const trigger = placementTriggerRef.current
    setPendingPlacement(undefined)
    setActiveTool('select')
    placementTriggerRef.current = null
    if (restoreFocus) queueMicrotask(() => trigger?.focus())
  }, [])

  const finishCardEditing = useCallback(
    (editor: EditingCard, restoreFocus = true) => {
      setEditingCard(undefined)
      if (!restoreFocus) return
      queueMicrotask(() => {
        const canvasNode = findCanvasNodeControl(
          viewportRef.current,
          editor.nodeId,
        )
        if (editor.returnFocusTo?.isConnected) {
          editor.returnFocusTo.focus()
        } else {
          ;(canvasNode ?? viewportRef.current)?.focus()
        }
      })
    },
    [],
  )

  const cancelCardEditing = useCallback(() => {
    if (editingCard) finishCardEditing(editingCard)
  }, [editingCard, finishCardEditing])

  const handleToolChange = useCallback(
    (tool: CanvasTool, trigger: HTMLButtonElement) => {
      if (!project) return
      if (tool === 'connect') {
        if (pendingPlacement) return
        if (connectionTool.phase !== 'idle') {
          cancelConnection(false)
          return
        }
        placementTriggerRef.current = null
        connectionTriggerRef.current = trigger
        setConnectionFeedback(undefined)
        setConnectionTool(startConnectionTool())
        setActiveTool('connect')
        return
      }

      if (connectionTool.phase !== 'idle') cancelConnection(false)
      if (tool === 'select') {
        if (editingCard) cancelCardEditing()
        else if (pendingPlacement) cancelPlacement()
        else setActiveTool('select')
      }
    },
    [
      cancelConnection,
      cancelCardEditing,
      cancelPlacement,
      connectionTool.phase,
      editingCard,
      pendingPlacement,
      project,
    ],
  )

  useEffect(() => {
    const handleConnectShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.key.toLowerCase() !== 'l' ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !project ||
        pendingPlacement ||
        editingCard ||
        nodeListOpen ||
        deleteCandidateId ||
        connectionTool.phase !== 'idle' ||
        nativeConnectionActiveRef.current
      ) {
        return
      }

      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          Boolean(
            target.closest(
              'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
            ),
          ))
      ) {
        return
      }

      const trigger = viewportRef.current?.querySelector<HTMLButtonElement>(
        '.canvas-mode-bar button[aria-label="连线"]',
      )
      if (!trigger || trigger.disabled) return
      event.preventDefault()
      handleToolChange('connect', trigger)
    }

    window.addEventListener('keydown', handleConnectShortcut)
    return () => window.removeEventListener('keydown', handleConnectShortcut)
  }, [
    connectionTool.phase,
    deleteCandidateId,
    editingCard,
    handleToolChange,
    nodeListOpen,
    pendingPlacement,
    project,
  ])

  useEffect(() => {
    const handleVisibilityShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.key.toLowerCase() !== 'h' ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !project ||
        pendingPlacement ||
        nodeListOpen ||
        deleteCandidateId ||
        nativeConnectionActiveRef.current ||
        document.querySelector('[role="dialog"]')
      ) {
        return
      }

      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          Boolean(
            target.closest(
              'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
            ),
          ))
      ) {
        return
      }

      event.preventDefault()
      toggleConnectionsVisibility()
    }

    window.addEventListener('keydown', handleVisibilityShortcut)
    return () => window.removeEventListener('keydown', handleVisibilityShortcut)
  }, [
    deleteCandidateId,
    nodeListOpen,
    pendingPlacement,
    project,
    toggleConnectionsVisibility,
  ])

  const handlePaneClick = useCallback(
    (event: ReactMouseEvent<Element> | MouseEvent) => {
      setSelectedEdgeId(undefined)
      if (contextMenu) {
        closeContextMenu(false)
      }
      if (connectionTool.phase !== 'idle') {
        cancelConnection()
        return
      }
      if (
        !project ||
        !flowInstance ||
        pendingPlacement ||
        editingCard
      ) {
        return
      }
      if (event.detail < 2) return
      const point = canvasPoint(event.clientX, event.clientY)
      if (!point) return
      beginPlacement('text', 'free-generation', {
        projectId: project.id,
        ...point,
        clipboardText: '',
        returnFocusTo: viewportRef.current ?? undefined,
      })
    },
    [
      beginPlacement,
      cancelConnection,
      canvasPoint,
      closeContextMenu,
      connectionTool.phase,
      contextMenu,
      flowInstance,
      editingCard,
      pendingPlacement,
      project,
    ],
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
      if (isCreativeCardKind(pendingPlacement.kind)) return

      const creation = buildCanvasCreation(currentProject, {
        kind: pendingPlacement.kind,
        title: value.title,
        content: value.content,
        position: pendingPlacement.position,
        ...(value.image ? { image: value.image } : {}),
      })
      createdNodeFocusRef.current = creation.node.id
      setFocusRequestVersion((version) => version + 1)
      createCanvasContent(creation)
      selectOnlyNode(creation.node.id)
      setPendingPlacement(undefined)
      setActiveTool('select')
      placementTriggerRef.current = null
    },
    [createCanvasContent, pendingPlacement, projectId, selectOnlyNode],
  )

  const submitCardPlacement = useCallback(
    (draft: CreativeCardDraft) => {
      const currentProject = useProjectStore.getState().activeProject
      if (
        !pendingPlacement ||
        !isCreativeCardKind(pendingPlacement.kind) ||
        !currentProject ||
        currentProject.id !== projectId ||
        pendingPlacement.projectId !== currentProject.id ||
        pendingPlacement.kind !== draft.kind
      ) {
        return
      }
      const creation = buildCreativeCardCreation(
        currentProject,
        draft,
        pendingPlacement.position,
      )
      createdNodeFocusRef.current = creation.node.id
      setFocusRequestVersion((version) => version + 1)
      createCanvasContent(creation)
      selectOnlyNode(creation.node.id)
      setPendingPlacement(undefined)
      setActiveTool('select')
      placementTriggerRef.current = null
    },
    [createCanvasContent, pendingPlacement, projectId, selectOnlyNode],
  )

  const submitCardEdit = useCallback(
    (draft: CreativeCardDraft) => {
      const editor = editingCard
      const currentProject = useProjectStore.getState().activeProject
      const node = currentProject?.nodes.find(({ id }) => id === editor?.nodeId)
      if (
        !editor ||
        !currentProject ||
        currentProject.id !== projectId ||
        editor.projectId !== currentProject.id ||
        !node ||
        node.kind !== draft.kind
      ) {
        return
      }
      updateCreativeCard(editor.nodeId, draft)
      finishCardEditing(editor)
    },
    [editingCard, finishCardEditing, projectId, updateCreativeCard],
  )

  const contextNodeId = contextMenu?.targetNodeId ?? primaryNodeId
  const contextNode = project?.nodes.find(({ id }) => id === contextNodeId)
  const contextVersion = contextNode?.versions.find(
    ({ id }) => id === contextNode.activeVersionId,
  )
  const contextAsset = project?.assets.find(
    ({ id }) => id === contextVersion?.assetId,
  )
  const canSaveContextAsset = Boolean(contextAsset && libraryRepository.save)

  const saveContextAsset = useCallback(() => {
    const currentProject = useProjectStore.getState().activeProject
    const nodeId = contextMenu?.targetNodeId ?? primaryNodeId
    const node = currentProject?.nodes.find(({ id }) => id === nodeId)
    const version = node?.versions.find(({ id }) => id === node.activeVersionId)
    const asset = currentProject?.assets.find(({ id }) => id === version?.assetId)
    const save = libraryRepository.save
    closeContextMenu()
    if (!currentProject || !node || !asset || !save) {
      setGenerationFeedback('当前节点没有可保存的素材。')
      return
    }
    void save.call(
      libraryRepository,
      deriveLibraryRecord(currentProject, asset),
    ).then(
      () => setGenerationFeedback(`已将“${node.title}”保存到我的资产。`),
      () => setGenerationFeedback('保存到我的资产失败，请稍后重试。'),
    )
  }, [
    closeContextMenu,
    contextMenu?.targetNodeId,
    libraryRepository,
    primaryNodeId,
  ])

  const pasteContextText = useCallback(
    (text: string) => {
      const source = contextMenu
      const currentProject = useProjectStore.getState().activeProject
      const content = text.trim()
      if (
        !source ||
        !content ||
        !currentProject ||
        currentProject.id !== projectId ||
        source.projectId !== currentProject.id
      ) {
        closeContextMenu()
        return
      }
      const creation = buildCanvasCreation(currentProject, {
        kind: 'text',
        title: nextNodeTitle(currentProject, 'text'),
        content,
        position: source.flowPosition,
      })
      createdNodeFocusRef.current = creation.node.id
      setFocusRequestVersion((version) => version + 1)
      createCanvasContent(creation)
      selectOnlyNode(creation.node.id)
      setContextMenu(undefined)
      setGenerationFeedback('已从剪贴板创建文本节点。')
    },
    [closeContextMenu, contextMenu, createCanvasContent, projectId, selectOnlyNode],
  )

  const handlePaneContextMenu = useCallback(
    (event: ReactMouseEvent<Element> | MouseEvent) => {
      event.preventDefault()
      openContextMenu(
        event.clientX,
        event.clientY,
        undefined,
        viewportRef.current ?? undefined,
      )
    },
    [openContextMenu],
  )

  const handleNodeContextMenu = useCallback(
    (event: ReactMouseEvent<Element>, node: CreativeFlowNode) => {
      event.preventDefault()
      event.stopPropagation()
      const returnFocusTo = findCanvasNodeControl(viewportRef.current, node.id)
      openContextMenu(
        event.clientX,
        event.clientY,
        node.id,
        returnFocusTo ?? viewportRef.current ?? undefined,
      )
    },
    [openContextMenu],
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
        const candidate = findCanvasNodeControl(viewportRef.current, nodeId)
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
  const connectionHint =
    connectionTool.phase === 'selecting-source'
      ? '请选择来源节点'
      : connectionTool.phase === 'selecting-target'
        ? '请选择目标节点'
        : undefined
  const canvasHint =
    connectionFeedback ?? connectionHint ?? generationFeedback ??
    groupFeedback ?? visibilityFeedback
  const canvasHintIsConnection = Boolean(connectionFeedback || connectionHint)

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
  const commentNode = project?.nodes.find(({ id }) => id === primaryNodeId)
  const selectedWorkspaceNode = project?.nodes.find(({ id }) => id === primaryNodeId)

  const openWorkspaceNode = (nodeId: string) => {
    setWorkspaceMode('workflow')
    setWorkspacePanel(undefined)
    setSelectedEdgeId(undefined)
    selectOnlyNode(nodeId)
    queueMicrotask(() => {
      void flowInstance?.fitView({
        nodes: [{ id: nodeId }],
        duration: 260,
        padding: 0.4,
      })
    })
  }

  const createImageToolNode = (tool: string) => {
    const currentProject = useProjectStore.getState().activeProject
    const sourceNode = currentProject?.nodes.find(({ id }) => id === primaryNodeId)
    if (!currentProject || currentProject.id !== projectId || !sourceNode) return
    const creation = buildCanvasCreation(currentProject, {
      kind: 'text',
      title: `${tool}配置`,
      content: `基于“${sourceNode.title}”创建的${tool}本地配置预览`,
      position: {
        x: sourceNode.position.x + 360,
        y: sourceNode.position.y + 40,
      },
    })
    createCanvasContent(creation)
    selectOnlyNode(creation.node.id)
    setGenerationFeedback(`已创建“${tool}配置”节点；尚未触发外部生成。`)
  }

  const closeAgent = () => {
    setAgentOpen(false)
    queueMicrotask(() => {
      viewportRef.current
        ?.closest('.canvas-page')
        ?.querySelector<HTMLButtonElement>('button[aria-label="Agent"]')
        ?.focus()
    })
  }

  const changeWorkspaceMode = (mode: WorkspaceMode) => {
    if (contextMenu) closeContextMenu(false)
    setWorkspaceMode(mode)
  }

  return (
    <main className={`canvas-page${agentOpen ? ' canvas-page--agent-open' : ''}`}>
      <CanvasTopBar
        projectId={project?.id}
        projectTitle={project?.title ?? '项目画布'}
        saveStatus={saveStatus}
        canUndo={Boolean(project) && canUndo}
        canRedo={Boolean(project) && canRedo}
        mode={workspaceMode}
        agentOpen={agentOpen}
        onUndo={undo}
        onRedo={redo}
        onOpenNodeList={openNodeList}
        onModeChange={changeWorkspaceMode}
        onToggleAgent={() => setAgentOpen((open) => !open)}
      />
      <div
        ref={viewportRef}
        className="canvas-page__viewport"
        role="region"
        aria-label="项目画布"
        tabIndex={-1}
      >
        {assetAttachSuccessMessage ? (
          <p
            className="canvas-asset-attach-feedback"
            role="status"
            aria-live="polite"
          >
            {assetAttachSuccessMessage}
          </p>
        ) : null}
        <div className="canvas-workflow-layer" hidden={workspaceMode !== 'workflow'}>
        <ReactFlow<CreativeFlowNode, DependencyFlowEdge>
          aria-label="创作节点图"
          style={
            {
              '--canvas-handle-hit-size': `${24 / Math.max(zoomPercent / 100, 0.35)}px`,
            } as CSSProperties
          }
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          isValidConnection={isValidConnection}
          onConnect={handleConnect}
          onConnectStart={handleConnectStart}
          onConnectEnd={handleConnectEnd}
          onPaneClick={handlePaneClick}
          onPaneContextMenu={handlePaneContextMenu}
          onNodeContextMenu={handleNodeContextMenu}
          onEdgeClick={(_event, edge) => setSelectedEdgeId(edge.id)}
          onNodeClick={(event, node) => {
            const target = event.target
            if (
              target instanceof Element &&
              target.closest(
                'button, a, input, textarea, select, [role="button"], [contenteditable="true"], .creative-node-actions, .react-flow__handle',
              )
            ) {
              return
            }
            setSelectedEdgeId(undefined)
            handleNodeSelection(node.id)
          }}
          onInit={setFlowInstance}
          onMove={(_event, viewport) => setZoomPercent(viewport.zoom * 100)}
          fitView
          fitViewOptions={{ padding: 0.16 }}
          zoomOnScroll
          panOnScroll={false}
          panActivationKeyCode="Space"
          selectionOnDrag
          zoomOnDoubleClick={false}
          edgesFocusable
          deleteKeyCode={['Backspace', 'Delete']}
          minZoom={0.35}
          maxZoom={1.8}
          snapToGrid={snapToGrid}
          snapGrid={[24, 24]}
        >
          <Background gap={24} size={1} color="rgba(255,255,255,0.1)" />
          <Controls showInteractive={false} />
          {minimapVisible ? <MiniMap aria-label="画布小地图" pannable zoomable /> : null}
          <ViewportPortal>
            {canvasGroupOverlays.map(({ group, bounds }) => (
              <CanvasGroupOverlay
                key={group.id}
                group={group}
                bounds={bounds}
                onSelect={() => selectCanvasGroup(group)}
                onUngroup={() => removeCanvasGroup(group.id, true)}
              />
            ))}
          </ViewportPortal>
        </ReactFlow>
        <CanvasToolbar
          activeTool={activeTool}
          connectionsVisible={connectionsVisible}
          disabled={!project}
          draftOpen={Boolean(pendingPlacement || editingCard)}
          groupAction={
            selectedCanvasGroup
              ? 'ungroup'
              : selectedNodeIds.size >= 2
                ? 'group'
                : 'disabled'
          }
          onGroupAction={handleGroupAction}
          onOpenPanel={setWorkspacePanel}
          onToggleConnections={toggleConnectionsVisibility}
          onToolChange={handleToolChange}
        />
        {contextMenu && project ? (
          <CanvasContextMenu
            anchor={contextMenu.anchor}
            bounds={contextMenu.bounds}
            targetNodeTitle={
              contextMenu.targetNodeId ? contextNode?.title : undefined
            }
            canSaveAsset={canSaveContextAsset}
            canUndo={canUndo}
            canRedo={canRedo}
            clipboardText={contextMenu.clipboardText}
            onUpload={() => beginPlacement('image', 'upload', contextMenu)}
            onSaveAsset={saveContextAsset}
            onAddNode={(kind) => beginPlacement(kind, 'add-node', contextMenu)}
            onUndo={() => {
              closeContextMenu()
              undo()
            }}
            onRedo={() => {
              closeContextMenu()
              redo()
            }}
            onPaste={pasteContextText}
            onClose={closeContextMenu}
          />
        ) : null}
        <CanvasViewControls
          minimapVisible={minimapVisible}
          snapToGrid={snapToGrid}
          zoomPercent={zoomPercent}
          onToggleMinimap={() => setMinimapVisible((visible) => !visible)}
          onToggleSnap={() => setSnapToGrid((enabled) => !enabled)}
          onFitView={() => void flowInstance?.fitView({ duration: 260, padding: 0.16 })}
        />
        <SelectionContextBar
          node={selectedWorkspaceNode}
          onCreateToolNode={createImageToolNode}
        />
        {canvasHint ? (
          <p
            className={`${
              canvasHintIsConnection
                ? 'canvas-connection-hint'
                : visibilityFeedback && canvasHint === visibilityFeedback
                  ? 'canvas-visibility-hint'
                  : generationFeedback && canvasHint === generationFeedback
                    ? 'canvas-generation-hint'
                    : groupFeedback && canvasHint === groupFeedback
                      ? 'canvas-group-hint'
                      : 'canvas-placement-hint'
            }${
              connectionFeedback ? ' canvas-connection-hint--error' : ''
            }`}
            role="status"
            aria-live="polite"
          >
            {canvasHint}
          </p>
        ) : null}
        {project && pendingPlacement && !isCreativeCardKind(pendingPlacement.kind) ? (
          <NodeDraftPanel
            key={`${pendingPlacement.projectId}:${pendingPlacement.kind}`}
            kind={pendingPlacement.kind}
            presentation={pendingPlacement.entry}
            initialTitle={nextNodeTitle(project, pendingPlacement.kind)}
            anchor={pendingPlacement.anchor}
            bounds={pendingPlacement.bounds}
            onCancel={cancelPlacement}
            onSubmit={submitPlacement}
          />
        ) : null}
        {project && pendingPlacement && isCreativeCardKind(pendingPlacement.kind) ? (
          <CreativeCardEditor
            key={`${pendingPlacement.projectId}:${pendingPlacement.kind}`}
            kind={pendingPlacement.kind}
            initialTitle={nextCreativeCardTitle(project, pendingPlacement.kind)}
            anchor={pendingPlacement.anchor}
            bounds={pendingPlacement.bounds}
            libraryRepository={libraryRepository}
            onCancel={cancelPlacement}
            onSubmit={submitCardPlacement}
          />
        ) : null}
        {project && editingCard ? (() => {
          const node = project.nodes.find(({ id }) => id === editingCard.nodeId)
          if (!node || !isCreativeCardKind(node.kind) || !node.card) return null
          const asset = node.card.imageAssetId
            ? project.assets.find(({ id }) => id === node.card?.imageAssetId)
            : undefined
          return (
            <CreativeCardEditor
              key={`${editingCard.projectId}:${editingCard.nodeId}`}
              kind={node.kind}
              initialTitle={node.title}
              initialCard={node.card}
              initialImage={asset ? deriveLibraryRecord(project, asset) : undefined}
              anchor={editingCard.anchor}
              bounds={editingCard.bounds}
              libraryRepository={libraryRepository}
              onCancel={cancelCardEditing}
              onSubmit={submitCardEdit}
            />
          )
        })() : null}
        </div>
        {workspaceMode === 'storyboard' && project ? (
          <CanvasStoryboardView project={project} onOpenNode={openWorkspaceNode} />
        ) : null}
        {workspacePanel && project ? (
          <WorkspaceSidePanel
            panel={workspacePanel}
            project={project}
            onClose={() => setWorkspacePanel(undefined)}
            onSelectNode={openWorkspaceNode}
          />
        ) : null}
        {agentOpen && project ? (
          <CanvasAgentPanel onClose={closeAgent}>
            <DirectorComposer
              selectedNodeId={primaryNodeId}
              onExecute={handleDirectorCommand}
            />
          </CanvasAgentPanel>
        ) : null}
        {project && workspaceMode === 'workflow' ? (
          <WorkflowRunPanel
            selectedCount={workflowSelectedCount}
            runs={workflowRuns}
            onCreate={createWorkflowRun}
            onCancel={cancelWorkflowRun}
            onRetryNode={retryWorkflowNode}
            membershipPlan={membershipPlan}
          />
        ) : null}
        {project && commentNode && workspaceMode === 'workflow' ? (
          <CollaborationCommentsPanel
            projectId={project.id}
            targetType="node"
            targetId={commentNode.id}
            targetLabel={commentNode.title}
            repository={collaborationRepository}
            variant="floating"
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
      {pendingRemoteGeneration ? (
        <GenerationConfirmationDialog
          request={pendingRemoteGeneration.request}
          selection={pendingRemoteGeneration.selection}
          returnFocusTo={pendingRemoteGeneration.returnFocusTo}
          onCancel={() => setPendingRemoteGeneration(undefined)}
          onConfirm={confirmRemoteGeneration}
        />
      ) : null}
    </main>
  )
}
