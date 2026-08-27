import { CanvasGenerationDialogs, type AnalysisSession, type ImageEditSession, type VideoContinueSession } from './CanvasGenerationDialogs'
import { CanvasProjectDialogs } from './CanvasProjectDialogs'
import { CanvasNodeEditors, type PendingPlacement, type EditingCard } from './CanvasNodeEditors'
import { CanvasWorkspacePanels } from './CanvasWorkspacePanels'
import { CanvasWorkflowTools, CanvasWorkflowBatchStatus, type WorkflowBatchView } from './CanvasWorkflowTools'
import { buildGenerationRequest, generationEligibilityFailure, isWorkflowGeneratableNode, forceDemoProvider } from './canvas-generation-request'
import { buildMediaAssetCreation, activeNodeAsset, processedMediaRecord } from './canvas-media-creation'
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
  type OnNodeDrag,
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
  useSyncExternalStore,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'

import { withAppBase } from '../../app/public-url'
import { CollaborationRepository } from '../collaboration/collaboration-repository'
import { CommunityRepository, type CommunityWorkRepository } from '../community/community-repository'
import type { PublishWorkFormValue } from '../community/PublishWorkDialog'
import { collectPublishCoverOptions, copyPublishedWorkShareLink } from '../community/publication'
import { AssetLibraryRepository } from '../assets/asset-library-repository'
import {
  deriveLibraryRecord,
  libraryRecordToAsset,
  type LibraryAssetRecord,
} from '../assets/library-model'
import {
  AssetImportError,
  readAssetFileAsDataUrl,
  validateAssetFile,
} from '../assets/asset-import'
import type { DirectorCommand } from '../director/director-command'
import {
  defaultVideoGenerationMode,
  defaultProviderRegistry,
  isVideoGenerationMode,
  isProviderEnabled,
  providerDefaultParameters,
  resolveVideoGenerationMode,
  type ProviderRegistry,
} from '../generation/model-provider-registry'
import { RegistryGenerationAdapter } from '../generation/registry-generation-adapter'
import { arkImageUpscaleUnavailable, buildArkImageEditPrompt, imageEditParameters, type ArkImageEditDraft } from '../generation/ark-image-edit-provider'
import type { ArkAnalysisDraft } from './ArkAnalysisDialog'
import { imageAnalysisPlan, isImageAnalysisToolId } from '../generation/ark-image-analysis-provider'
import { frameAnalysisId, validateFrameAnalysisRequest } from '../generation/ark-frame-analysis-provider'
import { parseSubjectDescription, subjectExtractionId, subjectExtractionUnavailable } from '../generation/ark-subject-extraction-provider'
import {
  generationResultAssets,
  type GenerationAdapter,
  type GenerationRequest,
} from '../generation/generation-adapter'
import { GenerationQueue } from '../generation/generation-queue'
import {
  defaultEphemeralGenerationResultStore,
  type EphemeralGenerationResultStore,
} from '../generation/ephemeral-generation-result-store'
import {
  createGenerationProviderPreferenceStore,
  type GenerationProviderPreferenceStore,
} from '../generation/generation-provider-preference'
import { LibTvGenerationAdapter } from '../generation/libtv-generation-adapter'
import type { LibTvProviderSelection } from '../generation/libtv-contract'
import { RuntimeGenerationAdapter, isPinnedArkTool } from '../generation/runtime-generation-adapter'
import { arkVideoContinueId, buildArkVideoContinuePrompt, videoContinueParameters, type ArkVideoContinueDraft } from '../generation/ark-video-continue-provider'
import {
  defaultImageGenerationSettings,
  type Asset,
  type CanvasCreation,
  type CanvasGroup,
  type GenerationConfiguration,
  type GenerationJob,
  type ImageAnnotation,
  type Project,
  type VideoDerivedTool,
} from '../project/model'
import type { CreateSubjectFormValue } from '../subjects/CreateSubjectDialog'
import type { SubjectAsset } from '../subjects/subject-model'
import { SubjectRepository } from '../subjects/subject-repository'
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
import { downloadBlob } from '../timeline/timeline-export'
import {
  captureVideoFrame,
  extractAudioToWav,
  recordVideoSegment,
  renderStoryboardGroup4K,
  splitImageToGrid,
  blobToDataUrl,
  type AudioSliceOptions,
  type ImageGridSize,
  type ProcessedMedia,
  type VideoSegmentOptions,
} from '../media/browser-media-processing'
import { createDefaultDirectorScene } from './director-3d-scene'
import { createTimelineProject } from '../timeline/timeline-project'
import { TimelineRepository, type TimelineProjectRepository } from '../timeline/timeline-repository'
import type { CanvasTool } from './CanvasToolbar'
import {
  CanvasContextMenu,
  type ContextQuickNodeType,
} from './CanvasContextMenu'
import { CanvasTopBar } from './CanvasTopBar'
import {
  buildCanvasExportFilename,
  buildWorkflowFilename,
  createCanvasSnapshotDataUrl,
  createWorkflowSnapshot,
  estimateCanvasExport,
  parseWorkflowImport,
  prepareWorkflowMerge,
  rasterizeCanvasSvg,
  renderCanvasSvg,
  type CanvasExportEstimate,
  type CanvasExportFormat,
  type CanvasExportScope,
  type WorkflowImportResult,
} from './canvas-workflow-export'
import {
  CanvasNodeTypePicker,
  type NodeTypePickerMode,
  type QuickNodeType,
} from './CanvasNodeTypePicker'
import {
  CanvasViewControls,
  SelectionContextBar,
  type WorkspaceMode,
  type WorkspacePanel,
} from './CanvasWorkspace'
import { CanvasGroupOverlay } from './CanvasGroupOverlay'
import { StoryboardGroupDialog } from './StoryboardGroupDialog'
import { createWorkflowBatchPlan } from './workflow-batch'
import type {
  CharacterProfile,
  EffectTemplate,
  MaterialLibraryEntry,
  WorkspaceAsset,
} from './CanvasResourcePanels'
import { SUBJECT_DRAG_MIME } from './CanvasResourcePanels'
import {
  findSelectedCanvasGroup,
  measureCanvasGroup,
} from './canvas-group'
import { edgeTypes, type DependencyFlowEdge } from './edge-types'
import { selectNodeGenerationJob } from './job-selector'
import {
  nodeTypes,
  type CreativeFlowNode,
  type CreativeNodeAction,
} from './node-types'
import { NodeListView } from './NodeListView'
import {
  ImagePreparationError,
  prepareImageFile,
} from './image-file'
import type { NodeDraftFormValue } from './NodeDraftPanel'
import {
  buildCanvasCreation,
  nextNodeTitle,
} from './node-draft'
import {
  cancelConnectionTool,
  chooseConnectionNode,
  startConnectionTool,
  type ConnectionToolState,
} from './connection-tool'
import '../../styles/global.css'

type CanvasRepository = Pick<ProjectRepository, 'load' | 'save'>

type CanvasPublicationRepository = Pick<
  CommunityWorkRepository,
  'publish' | 'findByProjectId'
>
type CanvasLoadState = 'loading' | 'ready' | 'not-found' | 'error'
type CanvasNodePosition = Project['nodes'][number]['position']

interface CanvasPoint {
  flowPosition: CanvasNodePosition
  anchor: { x: number; y: number }
  bounds: { width: number; height: number }
}

interface DragPreviewState {
  projectId?: string
  positions: Record<string, CanvasNodePosition>
}

interface OptionDragCloneState {
  projectId: string
  nodeIds: string[]
  originNodeId: string
  originalPositions: Record<string, CanvasNodePosition>
}

interface NodeMeasurementState {
  projectId?: string
  measurements: Record<string, { width: number; height: number }>
}

interface NodeTypePickerState {
  projectId: string
  position: CanvasNodePosition
  anchor: { x: number; y: number }
  bounds: { width: number; height: number }
  returnFocusTo?: HTMLElement
  mode: NodeTypePickerMode
  sourceNodeId?: string
  edgeInsertions?: Array<{
    edgeId: string
    position: CanvasNodePosition
  }>
}

interface CanvasContextMenuState {
  projectId: string
  anchor: { x: number; y: number }
  bounds: { width: number; height: number }
  flowPosition: CanvasNodePosition
  targetNodeId?: string
  returnFocusTo?: HTMLElement
}

interface CanvasClipboardState {
  projectId: string
  nodeIds: string[]
}

interface ContextResourcePlacement {
  projectId: string
  position: CanvasNodePosition
  returnFocusTo?: HTMLElement
}

interface CanvasExportSession {
  viewport: CanvasExportEstimate
  all: CanvasExportEstimate
}

interface WorkflowImportSession {
  fileName: string
  result: WorkflowImportResult
}

interface PendingSubjectCreation {
  projectId: string
  canvasId?: string
  sourceNodeId: string
  sourceTitle: string
  asset: Asset
  returnFocusTo?: HTMLElement
}

interface WorkflowBatchRuntime {
  id: string
  storeBatchId: string
  label: string
  nodeIds: string[]
  cursor: number
  activeJobId?: string
}

interface StoryboardSetupState {
  group: CanvasGroup
  temporary: boolean
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
const defaultCollaborationRepository = new CollaborationRepository(defaultDatabase)
const defaultCommunityRepository = new CommunityRepository(defaultDatabase)
const defaultTimelineRepository = new TimelineRepository(defaultDatabase)
const defaultSubjectRepository = new SubjectRepository(defaultDatabase)
const browserGenerationPreferenceStore =
  createGenerationProviderPreferenceStore()
const defaultGenerationAdapter = new RuntimeGenerationAdapter(
  browserGenerationPreferenceStore,
  new RegistryGenerationAdapter(),
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
    Partial<Pick<AssetLibraryRepository, 'save' | 'importFile' | 'rename' | 'move' | 'deleteAsset'>>
  generationAdapter?: GenerationAdapter
  providerRegistry?: ProviderRegistry
  ephemeralGenerationResultStore?: EphemeralGenerationResultStore
  generationPreferenceStore?: GenerationProviderPreferenceStore
  collaborationRepository?: Pick<CollaborationRepository, 'listComments' | 'addComment' | 'resolveComment'>
  communityRepository?: CanvasPublicationRepository
  timelineRepository?: Pick<TimelineProjectRepository, 'load'>
  subjectRepository?: Pick<SubjectRepository, 'create' | 'get' | 'list' | 'update' | 'delete'>
}

export function CanvasPage({
  repository = defaultRepository,
  libraryRepository = defaultLibraryRepository,
  generationAdapter = defaultGenerationAdapter,
  providerRegistry = defaultProviderRegistry,
  ephemeralGenerationResultStore = defaultEphemeralGenerationResultStore,
  generationPreferenceStore = browserGenerationPreferenceStore,
  collaborationRepository = defaultCollaborationRepository,
  communityRepository = defaultCommunityRepository,
  timelineRepository = defaultTimelineRepository,
  subjectRepository = defaultSubjectRepository,
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
  const workspaceAssetRepository = useMemo(
    () => ({
      list: () => libraryRepository.list(),
      rename: (assetId: string, name: string) =>
        libraryRepository.rename
          ? libraryRepository.rename(assetId, name)
          : defaultLibraryRepository.rename(assetId, name),
      move: (assetId: string, folderId: 'project' | 'generated' | 'inspiration') =>
        libraryRepository.move
          ? libraryRepository.move(assetId, folderId)
          : defaultLibraryRepository.move(assetId, folderId),
      deleteAsset: (
        assetId: string,
        options?: { detachReferences?: boolean },
      ) => libraryRepository.deleteAsset
        ? libraryRepository.deleteAsset(assetId, options)
        : defaultLibraryRepository.deleteAsset(assetId, options),
    }),
    [libraryRepository],
  )
  const publishCoverOptions = useMemo(
    () => project ? collectPublishCoverOptions(project) : [],
    [project],
  )
  const saveStatus = useProjectStore((state) => state.saveStatus)
  const canUndo = useProjectStore((state) => state.past.length > 0)
  const canRedo = useProjectStore((state) => state.future.length > 0)
  const undo = useProjectStore((state) => state.undo)
  const redo = useProjectStore((state) => state.redo)
  const persistActive = useProjectStore((state) => state.persistActive)
  const renameProject = useProjectStore((state) => state.renameProject)
  const createCanvas = useProjectStore((state) => state.createCanvas)
  const renameCanvas = useProjectStore((state) => state.renameCanvas)
  const switchCanvas = useProjectStore((state) => state.switchCanvas)
  const deleteCanvas = useProjectStore((state) => state.deleteCanvas)
  const updateCanvasViewport = useProjectStore((state) => state.updateCanvasViewport)
  const connectNodes = useProjectStore((state) => state.connectNodes)
  const connectImageReference = useProjectStore(
    (state) => state.connectImageReference,
  )
  const disconnectNodes = useProjectStore((state) => state.disconnectNodes)
  const setActiveImageResult = useProjectStore(
    (state) => state.setActiveImageResult,
  )
  const updateImageGenerationSettings = useProjectStore(
    (state) => state.updateImageGenerationSettings,
  )
  const updateNode = useProjectStore((state) => state.updateNode)
  const updateActiveNodePrompt = useProjectStore(
    (state) => state.updateActiveNodePrompt,
  )
  const rotateImageNode = useProjectStore((state) => state.rotateImageNode)
  const mirrorImageNode = useProjectStore((state) => state.mirrorImageNode)
  const updateImageAnnotations = useProjectStore(
    (state) => state.updateImageAnnotations,
  )
  const createCanvasContent = useProjectStore(
    (state) => state.createCanvasContent,
  )
  const createConnectedCanvasContent = useProjectStore(
    (state) => state.createConnectedCanvasContent,
  )
  const insertCanvasContentIntoEdges = useProjectStore(
    (state) => state.insertCanvasContentIntoEdges,
  )
  const mergeCanvasWorkflow = useProjectStore(
    (state) => state.mergeCanvasWorkflow,
  )
  const deleteGenerationJobs = useProjectStore(
    (state) => state.deleteGenerationJobs,
  )
  const removeAssetReferences = useProjectStore(
    (state) => state.removeAssetReferences,
  )
  const updateCreativeCard = useProjectStore(
    (state) => state.updateCreativeCard,
  )
  const updateNodePositions = useProjectStore(
    (state) => state.updateNodePositions,
  )
  const reorderNodes = useProjectStore((state) => state.reorderNodes)
  const groupNodes = useProjectStore((state) => state.groupNodes)
  const updateCanvasGroup = useProjectStore((state) => state.updateCanvasGroup)
  const ungroupNodes = useProjectStore((state) => state.ungroupNodes)
  const duplicateNodes = useProjectStore((state) => state.duplicateNodes)
  const deleteNode = useProjectStore((state) => state.deleteNode)
  const beginGenerationBatch = useProjectStore((state) => state.beginGenerationBatch)
  const completeGenerationBatch = useProjectStore((state) => state.completeGenerationBatch)
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [primaryNodeId, setPrimaryNodeId] = useState<string>()
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(
    () => new Set(),
  )
  const selectedEdgeId = [...selectedEdgeIds].at(-1)
  const [dragPreview, setDragPreview] = useState<DragPreviewState>({
    positions: {},
  })
  const [nodeMeasurements, setNodeMeasurements] =
    useState<NodeMeasurementState>({ measurements: {} })
  const [nodeListOpen, setNodeListOpen] = useState(false)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('workflow')
  const [workspaceFocusNodeId, setWorkspaceFocusNodeId] = useState<string>()
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
  const [imageReferenceTargetId, setImageReferenceTargetId] = useState<string>()
  const [connectionsVisible, setConnectionsVisible] = useState(true)
  const [visibilityFeedback, setVisibilityFeedback] = useState<string>()
  const [groupFeedback, setGroupFeedback] = useState<string>()
  const [generationFeedback, setGenerationFeedback] = useState<string>()
  const [imageEditSession, setImageEditSession] = useState<ImageEditSession>()
  const [videoContinueSession, setVideoContinueSession] = useState<VideoContinueSession>()
  const [analysisSession, setAnalysisSession] = useState<AnalysisSession>()
  const openAnalysisTool = useCallback((nodeId: string, toolId: string, prompt?: string, savedConfig?: GenerationConfiguration) => {
    const current = useProjectStore.getState().activeProject
    const node = current?.nodes.find(candidate => candidate.id === nodeId)
    if (!current || !node || (!isImageAnalysisToolId(toolId) && toolId !== frameAnalysisId)) return
    const kind = toolId === frameAnalysisId ? 'video' : 'image'
    const version = node.versions.find(candidate => candidate.id === node.activeVersionId)
    const config = savedConfig?.providerId === toolId ? savedConfig : node.generationConfig?.providerId === toolId ? node.generationConfig : undefined
    const savedSource = config?.referenceAssets.find(asset => asset.kind === kind)
    const currentAsset = activeNodeAsset(current, nodeId)
    const upstreamAsset = current.edges.filter(edge => edge.targetNodeId === nodeId).map(edge => activeNodeAsset(current, edge.sourceNodeId)).find(asset => asset?.kind === kind)
    const source: Asset | undefined = savedSource
      ? { ...savedSource, kind, id: `analysis-source-${nodeId}` }
      : currentAsset?.kind === kind ? currentAsset : upstreamAsset
    setAnalysisSession({ nodeId, projectId: current.id, canvasId: current.activeCanvasId, toolId,
      prompt: prompt ?? (toolId === frameAnalysisId ? '分析视频的分镜变化与人物动态。' : node.imageGeneration?.prompt ?? version?.prompt ?? ''), source, parameters: config?.parameters ? { ...config.parameters } : undefined })
  }, [])
  const videoContinueProvider = providerRegistry.list().find(({ id }) => id === arkVideoContinueId)
  const [workflowBatch, setWorkflowBatch] = useState<WorkflowBatchView>()
  const [storyboardSetup, setStoryboardSetup] = useState<StoryboardSetupState>()
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [publishBusy, setPublishBusy] = useState(false)
  const [publishError, setPublishError] = useState<string>()
  const [publishedWorkId, setPublishedWorkId] = useState<string>()
  const ephemeralGenerationResults = useSyncExternalStore(
    ephemeralGenerationResultStore.subscribe,
    ephemeralGenerationResultStore.getSnapshot,
    ephemeralGenerationResultStore.getSnapshot,
  )
  const [canvasExportSession, setCanvasExportSession] =
    useState<CanvasExportSession>()
  const [workflowImportSession, setWorkflowImportSession] =
    useState<WorkflowImportSession>()
  const [pendingRemoteGeneration, setPendingRemoteGeneration] =
    useState<PendingRemoteGeneration>()
  const [pendingPlacement, setPendingPlacement] =
    useState<PendingPlacement>()
  const [nodeTypePicker, setNodeTypePicker] =
    useState<NodeTypePickerState>()
  const [contextMenu, setContextMenu] =
    useState<CanvasContextMenuState>()
  const [canvasClipboard, setCanvasClipboard] =
    useState<CanvasClipboardState>()
  const [contextUploadPlacement, setContextUploadPlacement] =
    useState<ContextResourcePlacement>()
  const [historyPlacement, setHistoryPlacement] =
    useState<ContextResourcePlacement>()
  const [editingCard, setEditingCard] = useState<EditingCard>()
  const [pendingSubjectCreation, setPendingSubjectCreation] = useState<PendingSubjectCreation>()
  const [subjectCreationBusy, setSubjectCreationBusy] = useState(false)
  const [subjectCreationError, setSubjectCreationError] = useState<string>()
  useEffect(() => {
    setPendingSubjectCreation(pending => pending &&
      (pending.projectId !== project?.id || pending.canvasId !== project?.activeCanvasId) ? undefined : pending)
  }, [project?.id, project?.activeCanvasId])
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
  const contextUploadInputRef = useRef<HTMLInputElement>(null)
  const workflowImportInputRef = useRef<HTMLInputElement>(null)
  const nativeConnectionActiveRef = useRef(false)
  const placementTriggerRef = useRef<HTMLElement>(null)
  const connectionTriggerRef = useRef<HTMLElement>(null)
  const imageReferenceTriggerRef = useRef<HTMLButtonElement>(null)
  const createdNodeFocusRef = useRef<string | undefined>(undefined)
  const deleteTriggerRef = useRef<HTMLElement>(null)
  const nodeListTriggerRef = useRef<HTMLButtonElement>(null)
  const nodeListSelectionMadeRef = useRef(false)
  const optionDragCloneRef = useRef<OptionDragCloneState | undefined>(undefined)
  const paneClickRef = useRef<{
    at: number
    clientX: number
    clientY: number
  } | undefined>(undefined)
  const renderedCanvasIdRef = useRef<string | undefined>(undefined)
  const workflowBatchRef = useRef<WorkflowBatchRuntime | undefined>(undefined)
  const advanceWorkflowBatchRef = useRef<() => void>(() => undefined)

  const activeCanvas = project?.canvases?.find(
    ({ id }) => id === project.activeCanvasId,
  )

  useEffect(() => {
    if (!flowInstance || !activeCanvas) return
    const previousCanvasId = renderedCanvasIdRef.current
    renderedCanvasIdRef.current = activeCanvas.id
    if (previousCanvasId && previousCanvasId !== activeCanvas.id) {
      setSelectedNodeIds(new Set())
      setPrimaryNodeId(undefined)
      setSelectedEdgeIds(new Set())
      setNodeMeasurements({ measurements: {} })
    }
    if (typeof flowInstance.setViewport === 'function') {
      void flowInstance.setViewport(activeCanvas.viewport, { duration: 0 })
    }
    setZoomPercent(activeCanvas.viewport.zoom * 100)
  }, [activeCanvas?.id, flowInstance])

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
      setSelectedEdgeIds(new Set())
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
    setImageReferenceTargetId(undefined)
    setConnectionsVisible(true)
    setVisibilityFeedback(undefined)
    setGroupFeedback(undefined)
    setGenerationFeedback(undefined)
    setWorkflowBatch(undefined)
    workflowBatchRef.current = undefined
    setStoryboardSetup(undefined)
    setPublishDialogOpen(false)
    setPublishBusy(false)
    setPublishError(undefined)
    setPublishedWorkId(undefined)
    setCanvasExportSession(undefined)
    setWorkflowImportSession(undefined)
    setPendingRemoteGeneration(undefined)
    setSelectedEdgeIds(new Set())
    setPendingPlacement(undefined)
    setNodeTypePicker(undefined)
    setContextMenu(undefined)
    setContextUploadPlacement(undefined)
    setHistoryPlacement(undefined)
    setEditingCard(undefined)
    createdNodeFocusRef.current = undefined
    setFocusRequestVersion((version) => version + 1)
    placementTriggerRef.current = null
    connectionTriggerRef.current = null
    imageReferenceTriggerRef.current = null
    optionDragCloneRef.current = undefined
    paneClickRef.current = undefined
    if (contextUploadInputRef.current) contextUploadInputRef.current.value = ''
    if (workflowImportInputRef.current) workflowImportInputRef.current.value = ''

    return () => {
      nativeConnectionActiveRef.current = false
      connectionTriggerRef.current = null
      imageReferenceTriggerRef.current = null
      optionDragCloneRef.current = undefined
      paneClickRef.current = undefined
    }
  }, [projectId])

  useEffect(() => {
    if (!project?.id) return
    let active = true
    void communityRepository.findByProjectId(project.id).then((work) => {
      if (active) setPublishedWorkId(work?.status === 'published' ? work.id : undefined)
    }).catch(() => undefined)
    return () => { active = false }
  }, [communityRepository, project?.id])

  useEffect(() => {
    localStorage.setItem(
      workspacePreferencesKey,
      JSON.stringify({ minimapVisible, snapToGrid }),
    )
  }, [minimapVisible, snapToGrid])

  const toggleConnectionsVisibility = useCallback(() => {
    const nextConnectionsVisible = !connectionsVisible
    if (!nextConnectionsVisible) setSelectedEdgeIds(new Set())
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
          const batch = workflowBatchRef.current
          if (batch?.activeJobId === job.id) {
            if (job.status === 'failed' || job.status === 'cancelled') {
              setWorkflowBatch({
                id: batch.id,
                label: batch.label,
                status: 'paused',
                completed: batch.cursor,
                total: batch.nodeIds.length,
                currentNodeTitle: useProjectStore
                  .getState()
                  .projectsById[job.projectId!]?.nodes.find(({ id }) => id === job.nodeId)
                  ?.title,
                error: job.error ?? '执行已暂停，可重试当前节点。',
              })
            } else if (job.status === 'succeeded') {
              batch.cursor += 1
              batch.activeJobId = undefined
              queueMicrotask(() => advanceWorkflowBatchRef.current())
            }
          }
          const jobProviderId =
            job.providerId ?? job.generationConfig?.providerId
          const liveProvider = jobProviderId
            ? providerRegistry.list().find(({ id }) => id === jobProviderId)
            : undefined
          if (liveProvider?.kind === 'live') {
            const providerLabel = liveProvider.modelName
            if (job.status === 'queued') {
              setGenerationFeedback(`${providerLabel}生成任务已提交。`)
            } else if (job.status === 'running') {
              setGenerationFeedback(
                job.progress
                  ? `${providerLabel}生成中 ${job.progress}%`
                  : `${providerLabel}生成中…`,
              )
            } else if (job.status === 'failed') {
              setGenerationFeedback(job.error ?? `${providerLabel}生成失败。`)
            } else if (job.status === 'cancelled') {
              setGenerationFeedback(`${providerLabel}生成已取消。`)
            }
            return
          }
        },
        onSuccess(job, result) {
          if (job.projectId !== projectId) {
            throw new Error('Generation callback route mismatch')
          }
          if (result.persistence === 'ephemeral') {
            ephemeralGenerationResultStore.set(
              job.projectId!,
              job.nodeId,
              result,
            )
            const providerLabel = job.modelName ?? '真实模型'
            setGenerationFeedback(
              `${providerLabel}临时结果已显示，刷新页面后失效。`,
            )
            return
          }
          useProjectStore
            .getState()
            .applyGenerationSuccess(job.projectId!, job, result)
          const completedProvider = job.providerId
            ? providerRegistry.list().find(({ id }) => id === job.providerId)
            : undefined
          if (completedProvider?.kind === 'live') {
            const providerLabel = completedProvider.modelName
            setGenerationFeedback(
              `${providerLabel}结果已保存到项目与生成历史。`,
            )
          }
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
    [
      ephemeralGenerationResultStore,
      generationAdapter,
      projectId,
      providerRegistry,
      selectOnlyNode,
    ],
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

  const advanceWorkflowBatch = useCallback(() => {
    const batch = workflowBatchRef.current
    const currentProject = useProjectStore.getState().activeProject
    if (!batch || !currentProject || currentProject.id !== projectId) return
    if (batch.cursor >= batch.nodeIds.length) {
      completeGenerationBatch(batch.storeBatchId)
      setWorkflowBatch({
        id: batch.id,
        label: batch.label,
        status: 'completed',
        completed: batch.nodeIds.length,
        total: batch.nodeIds.length,
      })
      setGenerationFeedback(`${batch.label}已按依赖顺序执行完成，可一次撤销全部结果。`)
      workflowBatchRef.current = undefined
      return
    }
    const nodeId = batch.nodeIds[batch.cursor]
    const node = currentProject.nodes.find(({ id }) => id === nodeId)
    if (!node) {
      setWorkflowBatch({
        id: batch.id,
        label: batch.label,
        status: 'paused',
        completed: batch.cursor,
        total: batch.nodeIds.length,
        error: '执行节点已不存在。',
      })
      return
    }
    const activeVersion = node.versions.find(({ id }) => id === node.activeVersionId)
    const request = forceDemoProvider(buildGenerationRequest(
      currentProject,
      node,
      'regenerate',
      activeVersion?.prompt?.trim() || currentProject.intent.trim() || node.title,
      providerRegistry,
    ))
    const failure = generationEligibilityFailure(request, providerRegistry)
    if (failure) {
      setWorkflowBatch({
        id: batch.id,
        label: batch.label,
        status: 'paused',
        completed: batch.cursor,
        total: batch.nodeIds.length,
        currentNodeTitle: node.title,
        error: failure,
      })
      return
    }
    const job = generationQueue.enqueue(request)
    batch.activeJobId = job.id
    setWorkflowBatch({
      id: batch.id,
      label: batch.label,
      status: 'running',
      completed: batch.cursor,
      total: batch.nodeIds.length,
      currentNodeTitle: node.title,
    })
  }, [completeGenerationBatch, generationQueue, projectId, providerRegistry])

  useEffect(() => {
    advanceWorkflowBatchRef.current = advanceWorkflowBatch
    return () => {
      advanceWorkflowBatchRef.current = () => undefined
    }
  }, [advanceWorkflowBatch])

  const startWorkflowBatch = useCallback((group?: CanvasGroup) => {
    const currentProject = useProjectStore.getState().activeProject
    setContextMenu(undefined)
    if (!currentProject || currentProject.id !== projectId) return
    if (workflowBatchRef.current) {
      setGenerationFeedback('已有整组执行任务正在进行，请先等待或重试。')
      return
    }
    const executor = providerRegistry.list().find(({ id }) => id === 'internal-demo')
    if (!executor || !isProviderEnabled(executor)) {
      setGenerationFeedback('整组执行仅供开发测试；线上批量生成待接入，不会调用付费 API。')
      return
    }
    const plan = createWorkflowBatchPlan(currentProject, group?.nodeIds)
    if (!plan.ok) {
      setGenerationFeedback(plan.reason)
      return
    }
    const nodeIds = plan.nodeIds.filter((nodeId) => {
      const node = currentProject.nodes.find(({ id }) => id === nodeId)
      return Boolean(node && isWorkflowGeneratableNode(node))
    })
    if (!nodeIds.length) {
      setGenerationFeedback('当前范围没有可执行的生成节点。')
      return
    }
    const storeBatchId = beginGenerationBatch(currentProject.id)
    if (!storeBatchId) return
    const id = crypto.randomUUID()
    const label = group ? `分组“${group.title}”` : '全画布工作流'
    workflowBatchRef.current = {
      id,
      storeBatchId,
      label,
      nodeIds,
      cursor: 0,
    }
    setWorkflowBatch({
      id,
      label,
      status: 'running',
      completed: 0,
      total: nodeIds.length,
    })
    setGenerationFeedback(`${label}已通过拓扑校验，开始按依赖顺序执行。`)
    queueMicrotask(() => advanceWorkflowBatchRef.current())
  }, [beginGenerationBatch, projectId, providerRegistry])

  const retryWorkflowBatch = useCallback(() => {
    const batch = workflowBatchRef.current
    if (!batch) return
    if (batch.activeJobId) {
      const retried = generationQueue.retry(batch.activeJobId)
      if (!retried) return
      setWorkflowBatch((current) => current ? { ...current, status: 'running', error: undefined } : current)
      return
    }
    advanceWorkflowBatchRef.current()
  }, [generationQueue])

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
    if (workspaceMode !== 'workflow' || !flowInstance || !workspaceFocusNodeId) return
    let innerFrame = 0
    // The storyboard hides React Flow. Let it measure the visible layer before
    // fitting; a zero-sized layer can otherwise produce a NaN viewport.
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        void flowInstance.fitView({ nodes: [{ id: workspaceFocusNodeId }], duration: 260, padding: 0.4 })
        setWorkspaceFocusNodeId(undefined)
      })
    })
    return () => {
      cancelAnimationFrame(outerFrame)
      if (innerFrame) cancelAnimationFrame(innerFrame)
    }
  }, [workspaceMode, flowInstance, workspaceFocusNodeId])

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
      promptOverride?: string,
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

      if (node.imageTool?.kind === 'upscale' && (action === 'generate' || action === 'retry-generation')) {
        setGenerationFeedback(arkImageUpscaleUnavailable)
        return
      }
      if (action === 'retry-generation') {
        if (job?.operation) {
          if (isImageAnalysisToolId(job.generationConfig?.providerId ?? '') || job.generationConfig?.providerId === frameAnalysisId) {
            openAnalysisTool(node.id, job.generationConfig!.providerId!, job.prompt, job.generationConfig)
            return
          }
          const request = job.generationConfig && isPinnedArkTool(job.generationConfig.providerId) ? {
            ...job.generationConfig, projectId: currentProject.id, nodeId: node.id, operation: job.operation, prompt: job.prompt,
          } : buildGenerationRequest(
            currentProject,
            node,
            job.operation,
            job.prompt,
            providerRegistry,
          )
          const eligibilityFailure = generationEligibilityFailure(
            request,
            providerRegistry,
          )
          if (eligibilityFailure) {
            setGenerationFeedback(eligibilityFailure)
            return
          }
          const selection = isPinnedArkTool(request.providerId)
            ? undefined
            : currentLibTvSelection(generationPreferenceStore)
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

      if (action === 'generate') {
        if (node.details?.type === 'frame-analysis' || node.videoTool?.kind === 'frame-analysis') {
          openAnalysisTool(node.id, frameAnalysisId, promptOverride)
          return
        }
        const request = buildGenerationRequest(
          currentProject,
          node,
          'regenerate',
          promptOverride ?? activeVersion?.prompt ?? currentProject.intent,
          providerRegistry,
        )
        const eligibilityFailure = generationEligibilityFailure(
          request,
          providerRegistry,
        )
        if (eligibilityFailure) {
          setGenerationFeedback(eligibilityFailure)
          return
        }
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
          setGenerationFeedback('生成任务已提交。')
          generationQueue.enqueue(request)
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
        providerRegistry,
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
    [generationPreferenceStore, generationQueue, openAnalysisTool, projectId, providerRegistry],
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
        queueMicrotask(() => {
          if (focusReturnTarget.isConnected) focusReturnTarget.focus()
          else viewportRef.current?.focus()
        })
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
          handleAction(command.nodeId, 'generate', focusReturnTarget)
          return
        case 'replace-node':
          handleAction(command.nodeId, 'generate', focusReturnTarget)
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

  const cancelConnection = useCallback((restoreFocus = true) => {
    const trigger = connectionTriggerRef.current
    setConnectionTool(cancelConnectionTool())
    setConnectionFeedback(undefined)
    setActiveTool('select')
    connectionTriggerRef.current = null
    if (restoreFocus) queueMicrotask(() => trigger?.focus())
  }, [])

  const endImageReferenceSelection = useCallback(
    (returnToNode: boolean) => {
      const targetNodeId = imageReferenceTargetId
      const trigger = imageReferenceTriggerRef.current
      setImageReferenceTargetId(undefined)
      setConnectionFeedback(undefined)
      imageReferenceTriggerRef.current = null
      if (returnToNode && targetNodeId) {
        selectOnlyNode(targetNodeId)
        void flowInstance?.fitView({
          nodes: [{ id: targetNodeId }],
          duration: 220,
          padding: 0.4,
        })
      }
      queueMicrotask(() => trigger?.focus())
    },
    [flowInstance, imageReferenceTargetId, selectOnlyNode],
  )

  const startImageReferenceSelection = useCallback(
    (targetNodeId: string, trigger: HTMLButtonElement) => {
      if (connectionTool.phase !== 'idle') cancelConnection(false)
      imageReferenceTriggerRef.current = trigger
      setSelectedEdgeIds(new Set())
      setConnectionFeedback(undefined)
      setGenerationFeedback(undefined)
      setImageReferenceTargetId(targetNodeId)
      selectOnlyNode(targetNodeId)
    },
    [cancelConnection, connectionTool.phase, selectOnlyNode],
  )

  useEffect(() => {
    if (!imageReferenceTargetId) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') endImageReferenceSelection(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [endImageReferenceSelection, imageReferenceTargetId])

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
      if (imageReferenceTargetId) {
        const currentProject = useProjectStore.getState().activeProject
        const source = currentProject?.nodes.find(({ id }) => id === nodeId)
        const target = currentProject?.nodes.find(
          ({ id }) => id === imageReferenceTargetId,
        )
        const sourceVersion = source?.versions.find(
          ({ id }) => id === source.activeVersionId,
        )
        const sourceAsset = currentProject?.assets.find(
          ({ id }) => id === sourceVersion?.assetId,
        )
        if (
          !currentProject ||
          !source ||
          !target ||
          (sourceAsset?.kind !== 'image' && sourceAsset?.kind !== 'video')
        ) {
          setGenerationFeedback('请选择带有图片或视频结果的节点作为参考。')
          return
        }
        const result = connectImageReference({
          id: crypto.randomUUID(),
          sourceNodeId: source.id,
          targetNodeId: target.id,
        })
        if (!result.ok) {
          setConnectionFeedback(connectionFailureMessage(result.reason))
          return
        }
        setConnectionFeedback(undefined)
        setImageReferenceTargetId(undefined)
        selectOnlyNode(target.id)
        setGenerationFeedback(
          `已将“${source.title}”设为“${target.title}”的参考。`,
        )
        const trigger = imageReferenceTriggerRef.current
        imageReferenceTriggerRef.current = null
        queueMicrotask(() => trigger?.focus())
        return
      }
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
    [
      attemptConnection,
      connectImageReference,
      connectionTool,
      imageReferenceTargetId,
      selectOnlyNode,
    ],
  )

  const handleConnectionHandleActivate = useCallback(
    (
      nodeId: string,
      type: 'source' | 'target',
      trigger: HTMLElement,
    ) => {
      if (imageReferenceTargetId) return
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
    [attemptConnection, connectionTool, imageReferenceTargetId],
  )

  useEffect(() => {
    if (connectionTool.phase === 'idle') return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelConnection()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [cancelConnection, connectionTool.phase])

  const createVideoToolNode = useCallback(
    (sourceNodeId: string, tool: VideoDerivedTool) => {
      const currentProject = useProjectStore.getState().activeProject
      const sourceNode = currentProject?.nodes.find(({ id }) => id === sourceNodeId)
      if (!currentProject || currentProject.id !== projectId || !sourceNode) return

      const frame =
        tool === '截取首帧'
          ? '首帧'
          : tool === '截取尾帧'
            ? '尾帧'
            : tool === '截取当前帧'
              ? '当前帧'
              : undefined
      let creation: CanvasCreation

      if (frame) {
        creation = buildCanvasCreation(currentProject, {
          kind: 'image',
          title: '截图',
          content: `${sourceNode.title} · ${frame}`,
          image: {
            dataUrl: withAppBase('/demo/shot-river.png'),
            mimeType: 'image/png',
          },
          position: {
            x: sourceNode.position.x + 420,
            y: sourceNode.position.y + 80,
          },
        })
        creation = {
          ...creation,
          node: {
            ...creation.node,
            videoTool: { kind: 'frame-capture', frame },
          },
        }
      } else {
        creation = buildCanvasCreation(currentProject, {
          kind: 'storyboard',
          title: tool === '视频高清' ? '高清（1080P）' : '逐帧拉片',
          content:
            tool === '视频高清'
              ? 'Topazlabs · 1080P · 不补帧 · 1x · 预计成本 16'
              : 'SD2.5 · 分镜 / 动态 / 音乐',
          position: {
            x: sourceNode.position.x + 420,
            y: sourceNode.position.y + 80,
          },
        })
        creation = {
          ...creation,
          node: {
            ...creation.node,
            videoTool:
              tool === '视频高清'
                ? {
                    kind: 'upscale',
                    model: 'Topazlabs',
                    resolution: '1080P',
                    interpolation: '不补帧',
                    slowMotion: '1x',
                    cost: 16,
                  }
                : {
                    kind: 'frame-analysis',
                    model: 'SD2.5',
                    dimensions: ['分镜', '动态', '音乐'],
                  },
          },
        }
      }

      if (
        !createConnectedCanvasContent(
          sourceNode.id,
          creation,
          crypto.randomUUID(),
        )
      ) {
        setGenerationFeedback('无法创建视频工具节点，请重新选择来源节点。')
        return
      }
      selectOnlyNode(creation.node.id)
      setGenerationFeedback(
        `已创建“${creation.node.title}”并建立连接；尚未触发外部生成。`,
      )
    },
    [createConnectedCanvasContent, projectId, selectOnlyNode],
  )

  const saveProcessedAsset = useCallback(
    async (
      sourceNodeId: string,
      media: ProcessedMedia,
      kind: LibraryAssetRecord['kind'],
      title: string,
      positionOffset: { x: number; y: number },
      metadata?: Partial<CanvasCreation['node']>,
    ) => {
      const currentProject = useProjectStore.getState().activeProject
      const sourceNode = currentProject?.nodes.find(({ id }) => id === sourceNodeId)
      if (!currentProject || currentProject.id !== projectId || !sourceNode) {
        throw new Error('当前项目或来源节点不存在。')
      }
      const record = processedMediaRecord(media, title, kind)
      const creation = buildMediaAssetCreation(currentProject, record, {
        x: sourceNode.position.x + positionOffset.x,
        y: sourceNode.position.y + positionOffset.y,
      })
      creation.node = { ...creation.node, ...metadata }
      if (!createConnectedCanvasContent(sourceNodeId, creation, crypto.randomUUID())) {
        // Some derived-media pairs (for example image → image grid slices)
        // are intentionally not valid dependency edges. The processed asset is
        // still a first-class canvas result and must not be discarded.
        createCanvasContent(creation)
      }
      await libraryRepository.save?.(record)
      return creation.node.id
    },
    [createCanvasContent, createConnectedCanvasContent, libraryRepository, projectId],
  )

  const exportDirectorViews = useCallback(
    async (nodeId: string, blob: Blob) => {
      const currentProject = useProjectStore.getState().activeProject
      const sourceNode = currentProject?.nodes.find(({ id }) => id === nodeId)
      if (!sourceNode) throw new Error('导演台节点不存在，无法保存四视图。')
      const createdId = await saveProcessedAsset(
        nodeId,
        {
          dataUrl: await blobToDataUrl(blob),
          mimeType: 'image/png',
          width: 1280,
          height: 720,
        },
        'image',
        `${sourceNode.title} 四视图`,
        { x: 520, y: 120 },
      )
      selectOnlyNode(createdId)
      setGenerationFeedback('导演台四视图 PNG 已生成图片节点并写入资产库。')
    },
    [saveProcessedAsset, selectOnlyNode],
  )

  const splitImageNode = useCallback(
    async (nodeId: string, grid: ImageGridSize, group: boolean) => {
      const currentProject = useProjectStore.getState().activeProject
      const sourceNode = currentProject?.nodes.find(({ id }) => id === nodeId)
      const sourceAsset = currentProject ? activeNodeAsset(currentProject, nodeId) : undefined
      if (!currentProject || currentProject.id !== projectId || !sourceNode || sourceAsset?.kind !== 'image') {
        setGenerationFeedback('当前节点没有可切分的图片结果。')
        return
      }
      setGenerationFeedback(`正在读取图片像素并生成 ${grid}×${grid} 切片…`)
      try {
        const results = await splitImageToGrid(sourceAsset.url, grid)
        const createdIds: string[] = []
        for (const [index, result] of results.entries()) {
          const column = index % grid
          const row = Math.floor(index / grid)
          createdIds.push(await saveProcessedAsset(
            nodeId,
            result,
            'image',
            `${sourceNode.title} 切片 ${index + 1}`,
            { x: 420 + column * 340, y: row * 260 },
          ))
        }
        if (group && createdIds.length >= 2) groupNodes(createdIds, 'storyboard')
        setSelectedNodeIds(new Set(createdIds))
        setPrimaryNodeId(createdIds.at(-1))
        setGenerationFeedback(`已从真实图片生成 ${createdIds.length} 个独立切片资产与节点${group ? '，并完成编组' : ''}。`)
      } catch (error) {
        setGenerationFeedback(error instanceof Error ? error.message : '图片切分失败。')
      }
    },
    [groupNodes, projectId, saveProcessedAsset],
  )

  const saveImageAnnotations = useCallback(
    (nodeId: string, annotations: ImageAnnotation[]) => {
      updateImageAnnotations(nodeId, annotations)
      setGenerationFeedback(`已保存 ${annotations.length} 个可编辑图片标注，工作流 JSON 将携带标注数据。`)
    },
    [updateImageAnnotations],
  )

  const mirrorImage = useCallback(
    (nodeId: string, axis: 'horizontal' | 'vertical') => {
      mirrorImageNode(nodeId, axis)
      setGenerationFeedback(`已${axis === 'horizontal' ? '水平' : '垂直'}镜像图片，变换已持久化。`)
    },
    [mirrorImageNode],
  )

  const captureRealVideoFrame = useCallback(
    async (
      nodeId: string,
      tool: Extract<VideoDerivedTool, '截取首帧' | '截取尾帧' | '截取当前帧'>,
      video: HTMLVideoElement,
      seconds: number,
    ) => {
      const currentProject = useProjectStore.getState().activeProject
      const sourceNode = currentProject?.nodes.find(({ id }) => id === nodeId)
      if (!sourceNode) return
      setGenerationFeedback(`正在解码“${sourceNode.title}”的${tool}…`)
      try {
        const result = await captureVideoFrame(video, seconds)
        const createdId = await saveProcessedAsset(
          nodeId,
          result,
          'image',
          `${sourceNode.title} · ${tool}`,
          { x: 420, y: 80 },
          { videoTool: { kind: 'frame-capture', frame: tool.replace('截取', '') as '首帧' | '尾帧' | '当前帧' } },
        )
        selectOnlyNode(createdId)
        setGenerationFeedback(`已从视频真实像素截取${tool.replace('截取', '')}，并写入资产库。`)
      } catch (error) {
        setGenerationFeedback(error instanceof Error ? error.message : '视频截帧失败。')
      }
    },
    [saveProcessedAsset, selectOnlyNode],
  )

  const processVideoNode = useCallback(
    async (nodeId: string, options: VideoSegmentOptions) => {
      const currentProject = useProjectStore.getState().activeProject
      const sourceNode = currentProject?.nodes.find(({ id }) => id === nodeId)
      const sourceAsset = currentProject ? activeNodeAsset(currentProject, nodeId) : undefined
      if (!sourceNode || sourceAsset?.kind !== 'video') return
      setGenerationFeedback('正在浏览器内逐帧绘制并编码 WebM…')
      try {
        const result = await recordVideoSegment(sourceAsset.url, options)
        const createdId = await saveProcessedAsset(
          nodeId,
          result,
          'video',
          `${sourceNode.title}${options.crop ? ' 裁剪' : ' 截取'}`,
          { x: 420, y: 120 },
        )
        selectOnlyNode(createdId)
        setGenerationFeedback(`已完成${options.crop ? '帧级裁剪' : '选区截取'}并导出 WebM，结果已入资产库。`)
      } catch (error) {
        setGenerationFeedback(error instanceof Error ? error.message : '视频处理失败。')
      }
    },
    [saveProcessedAsset, selectOnlyNode],
  )

  const extractVideoAudio = useCallback(
    async (nodeId: string) => {
      const currentProject = useProjectStore.getState().activeProject
      const sourceNode = currentProject?.nodes.find(({ id }) => id === nodeId)
      const sourceAsset = currentProject ? activeNodeAsset(currentProject, nodeId) : undefined
      if (!sourceNode || sourceAsset?.kind !== 'video') return
      setGenerationFeedback('正在解码视频音轨并生成 WAV…')
      try {
        const result = await extractAudioToWav(sourceAsset.url)
        const createdId = await saveProcessedAsset(
          nodeId,
          result,
          'audio',
          `${sourceNode.title} 音轨`,
          { x: 420, y: 160 },
        )
        selectOnlyNode(createdId)
        setGenerationFeedback('已提取真实音轨，可试听、下载并已写入资产库。')
      } catch (error) {
        setGenerationFeedback(error instanceof Error ? error.message : '音视频分离失败。')
      }
    },
    [saveProcessedAsset, selectOnlyNode],
  )

  const processAudioNode = useCallback(
    async (nodeId: string, options: AudioSliceOptions) => {
      const currentProject = useProjectStore.getState().activeProject
      const sourceNode = currentProject?.nodes.find(({ id }) => id === nodeId)
      const sourceAsset = currentProject ? activeNodeAsset(currentProject, nodeId) : undefined
      if (!sourceNode || sourceAsset?.kind !== 'audio') return
      setGenerationFeedback('正在截取并重采样真实音频…')
      try {
        const result = await extractAudioToWav(sourceAsset.url, options)
        const createdId = await saveProcessedAsset(
          nodeId,
          result,
          'audio',
          `${sourceNode.title} ${options.playbackRate.toFixed(1)}x`,
          { x: 420, y: 200 },
        )
        selectOnlyNode(createdId)
        setGenerationFeedback('已导出截取/变速 WAV，结果已写入资产库。')
      } catch (error) {
        setGenerationFeedback(error instanceof Error ? error.message : '音频处理失败。')
      }
    },
    [saveProcessedAsset, selectOnlyNode],
  )

  const exportStoryboardGroup4K = useCallback(async (group: CanvasGroup) => {
    const currentProject = useProjectStore.getState().activeProject
    if (!currentProject || currentProject.id !== projectId) return
    const sources = group.nodeIds.flatMap((nodeId) => {
      const node = currentProject.nodes.find(({ id }) => id === nodeId)
      const asset = activeNodeAsset(currentProject, nodeId)
      return node && asset?.kind === 'image'
        ? [{ url: asset.url, title: node.title, subtitle: node.storyboardDialogue }]
        : []
    })
    if (!sources.length) {
      setGroupFeedback('分镜组中没有可导出的图片结果。')
      return
    }
    setGroupFeedback(`正在以 4096px 宽度排版 ${sources.length} 个分镜…`)
    try {
      const blob = await renderStoryboardGroup4K(sources, group.storyboardLayout)
      downloadBlob(blob, `${currentProject.title}-${group.title}-4K.png`)
      setGroupFeedback(`已导出 ${sources.length} 个分镜的 4096px 宽 4K 排版图。`)
    } catch (error) {
      setGroupFeedback(error instanceof Error ? error.message : '分镜组 4K 导出失败。')
    }
  }, [projectId])

  const createImageToolNode = useCallback(
    (sourceNodeId: string, tool: string) => {
      const currentProject = useProjectStore.getState().activeProject
      const sourceNode = currentProject?.nodes.find(({ id }) => id === sourceNodeId)
      if (!currentProject || currentProject.id !== projectId || !sourceNode) return
      if (tool === '图片高清' || tool === '高清') {
        setGenerationFeedback(arkImageUpscaleUnavailable)
        return
      }
      const creation = buildCanvasCreation(currentProject, {
        kind: 'storyboard',
        title: tool,
        content: `基于“${sourceNode.title}”创建的${tool}本地配置预览`,
        position: { x: sourceNode.position.x + 360, y: sourceNode.position.y + 40 },
      })
      if (
        !createConnectedCanvasContent(
          sourceNode.id,
          creation,
          crypto.randomUUID(),
          'dependency',
        )
      ) {
        setGenerationFeedback('无法创建工具节点，请重新选择来源节点。')
        return
      }
      selectOnlyNode(creation.node.id)
      setGenerationFeedback(
        `已创建“${creation.node.title}”工具节点并建立连接；尚未触发外部生成。`,
      )
    },
    [createConnectedCanvasContent, projectId, selectOnlyNode],
  )

  const submitAnalysis = (draft: ArkAnalysisDraft) => {
    const current = useProjectStore.getState().activeProject
    const session = analysisSession
    if (!current || !session || current.id !== session.projectId || current.activeCanvasId !== session.canvasId || !current.nodes.some(node => node.id === session.nodeId)) {
      setGenerationFeedback('画布或节点已变化，请重新打开分析工具。')
      setAnalysisSession(undefined)
      return
    }
    try {
      if (current.jobs.some(job => job.nodeId === session.nodeId && (job.status === 'queued' || job.status === 'running'))) throw new Error('当前节点已有任务，请等待完成。')
      const request: GenerationRequest = {
        projectId: current.id, nodeId: session.nodeId, operation: 'regenerate', targetKind: session.toolId === frameAnalysisId ? 'text' : 'image', providerId: session.toolId,
        prompt: draft.prompt, parameters: draft.parameters,
        referenceAssets: draft.source && draft.source.kind !== 'text' ? [{ kind: draft.source.kind, url: draft.source.url, mimeType: draft.source.mimeType }] : [],
      }
      const failure = generationEligibilityFailure(request, providerRegistry)
      if (failure) throw new Error(failure)
      if (session.toolId === frameAnalysisId) validateFrameAnalysisRequest(request)
      else imageAnalysisPlan(request)
      generationQueue.enqueue(request)
    } catch (error) { setGenerationFeedback(error instanceof Error ? error.message : '分析提交失败。') }
    setAnalysisSession(undefined)
  }

  const importAnalysisAsset = async (file: File): Promise<Asset> => {
    if (libraryRepository.importFile) return libraryRecordToAsset((await libraryRepository.importFile(file)).record)
    validateAssetFile(file)
    const record: LibraryAssetRecord = { id: crypto.randomUUID(), name: file.name, kind: file.type.split('/')[0] as LibraryAssetRecord['kind'], mimeType: file.type,
      url: await readAssetFileAsDataUrl(file), createdAt: new Date().toISOString(), source: 'upload', folderId: 'project', byteSize: file.size }
    await libraryRepository.save?.(record)
    return libraryRecordToAsset(record)
  }

  const submitImageEdit = (draft: ArkImageEditDraft) => {
    const current = useProjectStore.getState().activeProject
    const session = imageEditSession
    if (!current || !session || current.id !== session.projectId) return
    const source = activeNodeAsset(current, session.nodeId)
    if (!source || source.id !== session.asset.id) {
      setGenerationFeedback('源图片已变化，请重新打开图片编辑。')
      setImageEditSession(undefined)
      return
    }
    if (current.jobs.some((job) => job.nodeId === session.nodeId && (job.status === 'queued' || job.status === 'running'))) {
      setGenerationFeedback('当前节点已有生成任务，请等待完成。')
      setImageEditSession(undefined)
      return
    }
    const request: GenerationRequest = {
      projectId: current.id, nodeId: session.nodeId, operation: 'regenerate', targetKind: 'image', providerId: 'ark-image-edit',
      prompt: draft.prompt, parameters: imageEditParameters(draft), referenceAssets: [{ url: source.url, kind: 'image', mimeType: source.mimeType }],
    }
    try {
      const failure = generationEligibilityFailure(request, providerRegistry)
      if (failure) throw new Error(failure)
      buildArkImageEditPrompt(request)
      generationQueue.enqueue(request)
    } catch (error) {
      setGenerationFeedback(error instanceof Error ? error.message : '图片编辑提交失败。')
    }
    setImageEditSession(undefined)
  }

  const submitVideoContinue = (draft: ArkVideoContinueDraft) => {
    const current = useProjectStore.getState().activeProject
    const session = videoContinueSession
    if (!current || !session || current.id !== session.projectId) return
    const source = activeNodeAsset(current, session.nodeId)
    if (!source || source.id !== session.asset.id || source.url !== session.asset.url) {
      setGenerationFeedback('源视频已变化，请重新打开智能续写。')
      setVideoContinueSession(undefined)
      return
    }
    if (current.jobs.some(job => job.nodeId === session.nodeId && (job.status === 'queued' || job.status === 'running'))) {
      setGenerationFeedback('当前节点已有生成任务，请等待完成。')
      setVideoContinueSession(undefined)
      return
    }
    const request: GenerationRequest = {
      projectId: current.id, nodeId: session.nodeId, operation: 'regenerate', targetKind: 'video', providerId: arkVideoContinueId,
      prompt: draft.prompt, parameters: videoContinueParameters(draft), referenceAssets: [{ kind: 'video', url: source.url, mimeType: source.mimeType }],
    }
    try {
      const failure = generationEligibilityFailure(request, providerRegistry)
      if (failure) throw new Error(failure)
      buildArkVideoContinuePrompt(request)
      generationQueue.enqueue(request)
    } catch (error) {
      setGenerationFeedback(error instanceof Error ? error.message : '视频续写提交失败。')
    }
    setVideoContinueSession(undefined)
  }

  const projectFlowNodes = useMemo<CreativeFlowNode[]>(() => {
    if (!project) return []
    const rightmostX = Math.max(...project.nodes.map((node) => node.position.x))
    return project.nodes.map((node) => {
      const activeVersion = node.versions.find(
        (version) => version.id === node.activeVersionId,
      )
      const persistedAsset = project.assets.find(
        (candidate) => candidate.id === activeVersion?.assetId,
      )
      const ephemeralResult = ephemeralGenerationResults.get(
        JSON.stringify([project.id, node.id]),
      )
      const ephemeralAsset = ephemeralResult?.asset
      const asset = ephemeralAsset ?? persistedAsset
      const job = selectNodeGenerationJob(node, project.jobs)
      const selected = selectedNodeIds.has(node.id)
      const persistedImageResults = node.imageResults?.flatMap((result) => {
        const resultAsset = project.assets.find(({ id }) => id === result.assetId)
        return resultAsset?.kind === 'image'
          ? [{ id: result.id, asset: resultAsset }]
          : []
      }) ?? []
      const ephemeralImageResults = ephemeralResult
        ? generationResultAssets(ephemeralResult).flatMap((resultAsset) =>
            resultAsset.kind === 'image'
              ? [{ id: `ephemeral-${resultAsset.id}`, asset: resultAsset }]
              : [],
          )
        : []
      const imageResults = [
        ...persistedImageResults,
        ...ephemeralImageResults,
      ]
      const incomingMediaReferences = project.edges
        .filter(({ targetNodeId }) => targetNodeId === node.id)
        .flatMap(({ sourceNodeId }) => {
          const source = project.nodes.find(({ id }) => id === sourceNodeId)
          const sourceVersion = source?.versions.find(
            ({ id }) => id === source.activeVersionId,
          )
          const sourceAsset = project.assets.find(
            ({ id }) => id === sourceVersion?.assetId,
          )
          return source &&
            (sourceAsset?.kind === 'image' || sourceAsset?.kind === 'video')
            ? [{ id: source.id, title: source.title, asset: sourceAsset }]
            : []
        })
      const configuredImageReferences =
        node.generationConfig?.referenceAssets.flatMap((reference, index) =>
          reference.kind === 'image'
            ? [{
                id: `configured-image-reference-${node.id}-${index}`,
                title: `上传参考 ${index + 1}`,
                asset: {
                  id: `configured-image-reference-asset-${node.id}-${index}`,
                  kind: 'image' as const,
                  url: reference.url,
                  mimeType: reference.mimeType,
                },
              }]
            : [],
        ) ?? []
      const imageReferences = [
        ...incomingMediaReferences,
        ...configuredImageReferences,
      ]
      const videoReferences = incomingMediaReferences.filter(
        ({ asset: referenceAsset }) => referenceAsset.kind === 'image',
      )
      const linkedAutoLinkNodeIds = project.edges
        .filter(({ targetNodeId }) => targetNodeId === node.id)
        .map(({ sourceNodeId }) => sourceNodeId)
      const autoLinkCandidates = project.nodes.flatMap((candidate) => {
        if (candidate.id === node.id) return []
        const candidateVersion = candidate.versions.find(
          ({ id }) => id === candidate.activeVersionId,
        )
        const candidateAsset = project.assets.find(
          ({ id }) => id === candidateVersion?.assetId,
        )
        if (!candidateAsset || !['image', 'video'].includes(candidateAsset.kind)) return []
        if (
          node.kind === 'video' &&
          !['image', 'character', 'scene', 'preview', 'storyboard'].includes(candidate.kind)
        ) return []
        const detailText = candidate.details
          ? JSON.stringify(candidate.details)
          : ''
        return [{
          nodeId: candidate.id,
          title: candidate.title,
          kind: candidate.kind,
          assetId: candidateAsset.id,
          tags: [
            candidate.kind,
            detailText,
            candidateAsset.mimeType,
          ].filter(Boolean),
        }]
      })

      return {
        id: node.id,
        type: node.kind,
        position: node.position,
        selected,
        data: {
          node,
          providerRegistry,
          onOpenAnalysisTool: (toolId, prompt) => openAnalysisTool(node.id, toolId, prompt),
          asset,
          imageResults,
          imageReferences,
          videoReferences,
          incomingReferenceCount: imageReferences.length,
          autoLinkCandidates,
          linkedAutoLinkNodeIds,
          imageReferenceSelecting: imageReferenceTargetId === node.id,
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
            (asset?.kind === 'image' &&
              (node.kind === 'image' ||
                node.kind === 'character' ||
                node.kind === 'scene')) ||
            node.position.x === rightmostX
              ? 'before'
              : 'after',
          onSelect: () => handleNodeSelection(node.id),
          onHandleActivate: (type, trigger) =>
            handleConnectionHandleActivate(node.id, type, trigger),
          onFocusComplete: () => {
            if (createdNodeFocusRef.current !== node.id) return
            createdNodeFocusRef.current = undefined
            setFocusRequestVersion((version) => version + 1)
          },
          onDelete: (trigger) => requestDelete(node.id, trigger),
          onRenameNode: (title) => updateNode(node.id, { title }),
          onSetActiveResult: (resultId) =>
            setActiveImageResult(node.id, resultId),
          onUpdateImageGenerationSettings: (settings) =>
            updateImageGenerationSettings(node.id, settings),
          onSelectModelProvider: (providerId) => {
            const provider = providerRegistry.require(providerId)
            if (!isProviderEnabled(provider)) return
            const previousMode = isVideoGenerationMode(
              node.generationConfig?.parameters?.generationMode,
            )
              ? node.generationConfig.parameters.generationMode
              : defaultVideoGenerationMode
            const generationMode = node.kind === 'video'
              ? resolveVideoGenerationMode(provider, previousMode)
              : undefined
            updateNode(node.id, {
              modelProviderId: providerId,
              generationConfig: {
                targetKind: node.kind === 'video' ? 'video' : 'image',
                providerId,
                parameters: {
                  ...providerDefaultParameters(provider),
                  ...(generationMode ? { generationMode } : {}),
                },
                referenceAssets:
                  node.generationConfig?.referenceAssets.map((reference) => ({
                    ...reference,
                  })) ?? [],
              },
            })
          },
          onUpdateVideoGenerationParameters: (parameters) => {
            const provider =
              providerRegistry
                .list()
                .find(({ id }) => id === node.modelProviderId) ??
              providerRegistry.require('seedance-api')
            if (!isProviderEnabled(provider)) return
            const previousParameters =
              node.generationConfig?.providerId === provider.id
                ? node.generationConfig.parameters
                : undefined
            updateNode(node.id, {
              modelProviderId: provider.id,
              generationConfig: {
                targetKind: 'video',
                providerId: provider.id,
                parameters: {
                  ...providerDefaultParameters(provider),
                  ...previousParameters,
                  ...parameters,
                },
                referenceAssets:
                  node.generationConfig?.referenceAssets.map((reference) => ({
                    ...reference,
                  })) ?? [],
              },
            })
          },
          onUpdateVideoPrompt: (prompt) =>
            updateActiveNodePrompt(node.id, prompt),
          onCreatePromptNode: (kind) => {
            const currentProject = useProjectStore.getState().activeProject
            const targetNode = currentProject?.nodes.find(({ id }) => id === node.id)
            if (!currentProject || currentProject.id !== projectId || !targetNode) return
            let creation = buildCanvasCreation(currentProject, {
              kind,
              title: nextNodeTitle(currentProject, kind),
              content: kind === 'storyboard'
                ? 'Slash 命令创建的分镜预设'
                : kind === 'video'
                  ? 'Slash 命令创建的视频预设'
                  : 'Slash 命令创建的图片参考',
              position: {
                x: targetNode.position.x - 400,
                y: targetNode.position.y,
              },
            })
            if (kind === 'image') {
              creation = {
                ...creation,
                node: {
                  ...creation.node,
                  imageGeneration: { ...defaultImageGenerationSettings },
                  modelProviderId: 'seedream-5-pro-api',
                },
              }
            }
            if (kind === 'video') {
              const provider = providerRegistry.require('seedance-api')
              creation = {
                ...creation,
                node: {
                  ...creation.node,
                  modelProviderId: provider.id,
                  generationConfig: {
                    targetKind: 'video',
                    providerId: provider.id,
                    parameters: providerDefaultParameters(provider),
                    referenceAssets: [],
                  },
                },
              }
            }
            createCanvasContent(creation)
            if (kind === 'storyboard' && targetNode.kind === 'video') {
              connectNodes({
                id: crypto.randomUUID(),
                sourceNodeId: creation.node.id,
                targetNodeId: targetNode.id,
              })
            }
            setGenerationFeedback(`Slash 命令已创建“${creation.node.title}”。`)
          },
          onApplyAutoLink: (candidate) => {
            const edge = {
              id: crypto.randomUUID(),
              sourceNodeId: candidate.nodeId,
              targetNodeId: node.id,
            }
            const result = ['image', 'character', 'scene'].includes(node.kind)
              ? connectImageReference(edge)
              : connectNodes(edge)
            setGenerationFeedback(
              result.ok
                ? `AutoLink 已引用“${candidate.title}”并建立连线。`
                : connectionFailureMessage(result.reason),
            )
          },
          onStartImageReferenceSelection: (trigger) =>
            startImageReferenceSelection(node.id, trigger),
          onEndImageReferenceSelection: endImageReferenceSelection,
          onImportImageReference: async (file) => {
            const currentProject = useProjectStore.getState().activeProject
            const currentNode = currentProject?.nodes.find(({ id }) => id === node.id)
            if (!currentProject || currentProject.id !== projectId || !currentNode) return
            try {
              const image = await prepareImageFile(file)
              const existingReferences =
                currentNode.generationConfig?.referenceAssets ?? []
              if (existingReferences.length >= 4) {
                setGenerationFeedback('图生图最多添加 4 张参考图片。')
                return
              }
              const provider = providerRegistry.defaultFor(
                ['image-to-image'],
                currentNode.generationConfig?.providerId ?? currentNode.modelProviderId,
              ) ?? providerRegistry.require('seedream-5-pro-api')
              updateNode(currentNode.id, {
                modelProviderId: provider.id,
                generationConfig: {
                  targetKind: 'image',
                  providerId: provider.id,
                  parameters: {
                    ...providerDefaultParameters(provider),
                    ...currentNode.generationConfig?.parameters,
                  },
                  referenceAssets: [
                    ...existingReferences.map((reference) => ({ ...reference })),
                    {
                      url: image.dataUrl,
                      kind: 'image',
                      mimeType: image.mimeType,
                    },
                  ],
                },
              })
              setGenerationFeedback(`已添加图生图参考图片“${file.name}”。`)
            } catch (error) {
              setGenerationFeedback(
                error instanceof ImagePreparationError
                  ? error.message
                  : '无法读取图片，请重新选择。',
              )
            }
          },
          onLocalImageGenerate: (prompt) =>
            handleAction(node.id, 'generate', undefined, prompt),
          onCreateImageToolNode: (tool) =>
            createImageToolNode(node.id, tool),
          onUpdateImageTool: (changes) => {
            if (!node.imageTool || !node.generationConfig) return
            const imageTool = { ...node.imageTool, ...changes }
            updateNode(node.id, {
              imageTool,
              imageGeneration: {
                ...defaultImageGenerationSettings,
                ...node.imageGeneration,
                resolution: imageTool.resolution,
              },
              generationConfig: {
                ...node.generationConfig,
                parameters: {
                  ...node.generationConfig.parameters,
                  resolution: imageTool.resolution,
                  upscaleScale: imageTool.scale,
                  detailProtection: imageTool.detailProtection,
                },
              },
            })
          },
          onCreateVideoToolNode: (tool) =>
            createVideoToolNode(node.id, tool),
          onCaptureVideoFrame: (tool, video, seconds) =>
            captureRealVideoFrame(node.id, tool, video, seconds),
          onProcessVideo: (options) => processVideoNode(node.id, options),
          onExtractVideoAudio: () => extractVideoAudio(node.id),
          onProcessAudio: (options) => processAudioNode(node.id, options),
          onSplitImage: (grid, group) => splitImageNode(node.id, grid, group),
          onSaveImageAnnotations: (annotations) =>
            saveImageAnnotations(node.id, annotations),
          onMirrorImage: (axis) => mirrorImage(node.id, axis),
          onLocalVideoGenerate: (prompt) => {
            updateActiveNodePrompt(node.id, prompt)
            handleAction(node.id, 'generate', undefined, prompt)
          },
          onCreateTextToVideoPreset: () => {
            const currentProject = useProjectStore.getState().activeProject
            const sourceNode = currentProject?.nodes.find(({ id }) => id === node.id)
            if (
              !currentProject ||
              currentProject.id !== projectId ||
              sourceNode?.details?.type !== 'text'
            ) return

            const sourceContent = sourceNode.details.content.trim()
            const sourceUsesCreationPlaceholder =
              sourceContent === '双击画布创建的自由文本节点' ||
              sourceContent === '右键画布创建的文本节点'
            const prompt = sourceUsesCreationPlaceholder || !sourceContent
              ? '根据文字描述生成视频。'
              : sourceContent
            let creation = buildCanvasCreation(currentProject, {
              kind: 'video',
              title: nextNodeTitle(currentProject, 'video'),
              content: prompt,
              position: {
                x: sourceNode.position.x + 400,
                y: sourceNode.position.y,
              },
            })
            const provider =
              providerRegistry.list().find(({ id }) => id === 'seedance-api') ??
              providerRegistry.matching(['text-to-video']).find(isProviderEnabled)
            const generationMode = provider
              ? resolveVideoGenerationMode(provider, '文生视频')
              : undefined
            if (provider && generationMode) {
              creation = {
                ...creation,
                node: {
                  ...creation.node,
                  modelProviderId: provider.id,
                  generationConfig: {
                    targetKind: 'video',
                    providerId: provider.id,
                    parameters: {
                      ...providerDefaultParameters(provider),
                      generationMode,
                    },
                    referenceAssets: [],
                  },
                },
              }
            }
            if (
              !createConnectedCanvasContent(
                sourceNode.id,
                creation,
                crypto.randomUUID(),
              )
            ) return

            updateNode(sourceNode.id, {
              details: {
                ...sourceNode.details,
                editorMode: 'manual',
                content: sourceUsesCreationPlaceholder ? '' : sourceNode.details.content,
                editorBlockStyle: sourceNode.details.editorBlockStyle ?? 'paragraph',
                editorBold: sourceNode.details.editorBold ?? false,
                editorItalic: sourceNode.details.editorItalic ?? false,
                editorListStyle: sourceNode.details.editorListStyle ?? 'none',
              },
            })
            groupNodes([sourceNode.id, creation.node.id], 'preset')
            createdNodeFocusRef.current = creation.node.id
            setFocusRequestVersion((version) => version + 1)
            selectOnlyNode(creation.node.id)
            setActiveTool('select')
            setGenerationFeedback(
              '已创建“预设 - 文生视频”：输入文本后可在右侧视频节点继续设置模型与参数。',
            )
          },
          onUpdateEffectTool: (changes) => {
            if (!node.effectTool) return
            updateNode(node.id, {
              effectTool: { ...node.effectTool, ...changes },
            })
          },
          onUpdateNodeDetails: (details) => {
            updateNode(node.id, { details })
          },
          onExportDirectorViews: (blob) => exportDirectorViews(node.id, blob),
          onGenerateText: (details, prompt) => {
            const selectedProvider = providerRegistry.list().find(
              ({ id }) => id === details.modelProviderId,
            )
            const parameters = {
              ...(selectedProvider
                ? providerDefaultParameters(selectedProvider)
                : {}),
              outputKind: details.type,
              ...(details.modelVariant
                ? { modelVariant: details.modelVariant }
                : {}),
              ...(details.type === 'script'
                ? { sceneCount: details.sceneCount ?? 3 }
                : {}),
            }
            updateNode(node.id, {
              details,
              modelProviderId: details.modelProviderId,
              generationConfig: {
                targetKind: 'text',
                ...(details.modelProviderId
                  ? { providerId: details.modelProviderId }
                  : {}),
                parameters,
                referenceAssets: [],
              },
            })
            handleAction(node.id, 'generate', undefined, prompt)
          },
          onGenerateAudio: (details, prompt) => {
            const selectedProvider = providerRegistry.list().find(
              ({ id }) => id === details.modelProviderId,
            )
            const parameters = {
              ...(selectedProvider
                ? providerDefaultParameters(selectedProvider)
                : {}),
              ...(details.modelVariant
                ? { modelVariant: details.modelVariant }
                : {}),
              voice: details.voice,
              speed: details.speed,
              volume: details.volume,
              duration: details.durationSeconds,
              sampleRate: details.sampleRate ?? 24_000,
              format: details.format ?? 'mp3',
            }
            updateNode(node.id, {
              details,
              modelProviderId: details.modelProviderId,
              generationConfig: {
                targetKind: 'audio',
                ...(details.modelProviderId
                  ? { providerId: details.modelProviderId }
                  : {}),
                parameters,
                referenceAssets: [],
              },
            })
            handleAction(node.id, 'generate', undefined, prompt)
          },
          onAction: (action, trigger) => handleAction(node.id, action, trigger),
        },
      }
    })
  }, [
    handleAction,
    openAnalysisTool,
    createConnectedCanvasContent,
    createCanvasContent,
    connectImageReference,
    connectNodes,
    connectionTool,
    endImageReferenceSelection,
    focusRequestVersion,
    handleConnectionHandleActivate,
    handleNodeSelection,
    imageReferenceTargetId,
    primaryNodeId,
    project,
    providerRegistry,
    ephemeralGenerationResults,
    requestDelete,
    groupNodes,
    selectedNodeIds,
    setActiveImageResult,
    selectOnlyNode,
    startImageReferenceSelection,
    updateImageGenerationSettings,
    updateActiveNodePrompt,
    updateNode,
    createVideoToolNode,
    createImageToolNode,
    captureRealVideoFrame,
    extractVideoAudio,
    mirrorImage,
    processAudioNode,
    processVideoNode,
    saveImageAnnotations,
    splitImageNode,
    exportDirectorViews,
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

  const selectionGroupOverlay = useMemo(() => {
    if (selectedCanvasGroup || selectedNodeIds.size < 2) return undefined
    const nodeIds = flowNodes
      .filter(({ id }) => selectedNodeIds.has(id))
      .map(({ id }) => id)
    if (nodeIds.length < 2) return undefined
    const group: CanvasGroup = {
      id: '__selection__',
      title: `已选 ${nodeIds.length} 个节点`,
      nodeIds,
      createdAt: '',
      updatedAt: '',
    }
    const bounds = measureCanvasGroup(group, flowNodes)
    return bounds ? { group, bounds } : undefined
  }, [flowNodes, selectedCanvasGroup, selectedNodeIds])

  const disconnectEdge = useCallback(
    (edgeId: string) => {
      const current = useProjectStore.getState().activeProject
      const edge = current?.edges.find(({ id }) => id === edgeId)
      if (!edge || !disconnectNodes(edgeId)) return
      setSelectedEdgeIds((currentSelection) => {
        const next = new Set(currentSelection)
        next.delete(edgeId)
        return next
      })
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

  const openEdgeInsertionPicker = useCallback(
    (
      edgeId: string,
      midpoint: CanvasNodePosition,
      trigger: HTMLButtonElement,
    ) => {
      const currentProject = useProjectStore.getState().activeProject
      const viewportBounds = viewportRef.current?.getBoundingClientRect()
      if (
        !currentProject ||
        currentProject.id !== projectId ||
        !viewportBounds ||
        pendingPlacement ||
        editingCard ||
        imageReferenceTargetId
      ) return
      const batchEdgeIds =
        selectedEdgeIds.has(edgeId) && selectedEdgeIds.size > 1
          ? [...selectedEdgeIds]
          : [edgeId]
      const nodesById = new Map(currentProject.nodes.map((node) => [node.id, node]))
      const edgeInsertions = batchEdgeIds.flatMap((candidateId) => {
        const edge = currentProject.edges.find(({ id }) => id === candidateId)
        if (!edge) return []
        if (candidateId === edgeId) {
          return [{ edgeId: candidateId, position: midpoint }]
        }
        const source = nodesById.get(edge.sourceNodeId)
        const target = nodesById.get(edge.targetNodeId)
        if (!source || !target) return []
        const measured =
          nodeMeasurements.projectId === currentProject.id
            ? nodeMeasurements.measurements
            : {}
        const sourceWidth = measured[source.id]?.width ?? 280
        const sourceHeight = measured[source.id]?.height ?? 180
        const targetWidth = measured[target.id]?.width ?? 280
        const targetHeight = measured[target.id]?.height ?? 180
        return [{
          edgeId: candidateId,
          position: {
            x:
              (source.position.x +
                sourceWidth / 2 +
                target.position.x +
                targetWidth / 2) /
              2,
            y:
              (source.position.y +
                sourceHeight / 2 +
                target.position.y +
                targetHeight / 2) /
              2,
          },
        }]
      })
      if (edgeInsertions.length === 0) return
      const triggerBounds = trigger.getBoundingClientRect()
      if (connectionTool.phase !== 'idle') cancelConnection(false)
      setContextMenu(undefined)
      setNodeTypePicker({
        projectId: currentProject.id,
        position: midpoint,
        anchor: {
          x: triggerBounds.left + triggerBounds.width / 2 - viewportBounds.left,
          y: triggerBounds.top + triggerBounds.height / 2 - viewportBounds.top,
        },
        bounds: { width: viewportBounds.width, height: viewportBounds.height },
        returnFocusTo: trigger,
        mode: 'free',
        edgeInsertions,
      })
      setActiveTool('select')
    },
    [
      cancelConnection,
      connectionTool.phase,
      editingCard,
      imageReferenceTargetId,
      nodeMeasurements,
      pendingPlacement,
      projectId,
      selectedEdgeIds,
    ],
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
          selected: selectedEdgeIds.has(edge.id),
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
            onInsert: openEdgeInsertionPicker,
          },
        }
      }),
    [
      connectionsVisible,
      disconnectEdge,
      openEdgeInsertionPicker,
      project,
      selectedEdgeIds,
    ],
  )

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<DependencyFlowEdge>[]) => {
      for (const change of changes) {
        if (change.type === 'remove') disconnectEdge(change.id)
      }
      setSelectedEdgeIds((current) => {
        const next = new Set(current)
        for (const change of changes) {
          if (change.type === 'select') {
            if (change.selected) next.add(change.id)
            else next.delete(change.id)
          }
          if (change.type === 'remove') next.delete(change.id)
        }
        return next
      })
    },
    [disconnectEdge],
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
        change.dragging !== true &&
        !optionDragCloneRef.current?.nodeIds.includes(change.id)
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

  const handleNodeDragStart: OnNodeDrag<CreativeFlowNode> = useCallback(
    (event, node) => {
      if (!(event instanceof MouseEvent) || !event.altKey || !project) {
        optionDragCloneRef.current = undefined
        return
      }
      const nodeIds = selectedNodeIds.has(node.id)
        ? [...selectedNodeIds]
        : [node.id]
      const originalPositions = Object.fromEntries(
        project.nodes
          .filter(({ id }) => nodeIds.includes(id))
          .map(({ id, position }) => [id, position]),
      )
      optionDragCloneRef.current = {
        projectId: project.id,
        nodeIds,
        originNodeId: node.id,
        originalPositions,
      }
    },
    [project, selectedNodeIds],
  )

  const handleNodeDragStop: OnNodeDrag<CreativeFlowNode> = useCallback(
    (_event, node) => {
      const clone = optionDragCloneRef.current
      optionDragCloneRef.current = undefined
      if (!clone || clone.projectId !== projectId) return
      const origin = clone.originalPositions[clone.originNodeId]
      if (!origin) return
      const duplicatedIds = duplicateNodes(clone.nodeIds, {
        x: node.position.x - origin.x,
        y: node.position.y - origin.y,
      })
      setDragPreview((current) => {
        if (current.projectId !== clone.projectId) return current
        const positions = { ...current.positions }
        clone.nodeIds.forEach((nodeId) => delete positions[nodeId])
        return { ...current, positions }
      })
      if (duplicatedIds.length === 0) return
      setSelectedNodeIds(new Set(duplicatedIds))
      setPrimaryNodeId(duplicatedIds.at(-1))
      setSelectedEdgeIds(new Set())
      setGroupFeedback(
        `已创建 ${duplicatedIds.length} 个节点副本`,
      )
    },
    [duplicateNodes, projectId],
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
    (event, state) => {
      nativeConnectionActiveRef.current = false
      if (state.isValid || !state.fromNode) return
      if (!state.toNode) {
        if (state.fromHandle?.type === 'target' || !flowInstance || !project) return
        const pointer = event as {
          clientX?: number
          clientY?: number
          changedTouches?: ArrayLike<{ clientX: number; clientY: number }>
        }
        const touch = pointer.changedTouches?.[0]
        const clientX = pointer.clientX ?? touch?.clientX
        const clientY = pointer.clientY ?? touch?.clientY
        if (clientX === undefined || clientY === undefined) return
        const viewport = viewportRef.current
        const rect = viewport?.getBoundingClientRect()
        const hasBounds = Boolean(rect && rect.width > 0 && rect.height > 0)
        setNodeTypePicker({
          projectId: project.id,
          position: flowInstance.screenToFlowPosition({ x: clientX, y: clientY }),
          anchor: {
            x: clientX - (hasBounds ? rect!.left : 0),
            y: clientY - (hasBounds ? rect!.top : 0),
          },
          bounds: hasBounds
            ? { width: rect!.width, height: rect!.height }
            : { width: window.innerWidth, height: Math.max(0, window.innerHeight - 56) },
          returnFocusTo:
            findCanvasNodeControl(viewport, state.fromNode.id) ?? viewport ?? undefined,
          mode: 'reference',
          sourceNodeId: state.fromNode.id,
        })
        setActiveTool('select')
        return
      }
      const startsFromTarget = state.fromHandle?.type === 'target'
      attemptConnection(
        startsFromTarget ? state.toNode.id : state.fromNode.id,
        startsFromTarget ? state.fromNode.id : state.toNode.id,
        'drag',
      )
    },
    [attemptConnection, flowInstance, project],
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

  const closeNodeTypePicker = useCallback((restoreFocus = true) => {
    const returnFocusTo = nodeTypePicker?.returnFocusTo
    setNodeTypePicker(undefined)
    if (!restoreFocus) return
    queueMicrotask(() => {
      if (returnFocusTo?.isConnected) returnFocusTo.focus()
      else viewportRef.current?.focus()
    })
  }, [nodeTypePicker?.returnFocusTo])

  const openNodeTypePicker = useCallback(
    (
      point: CanvasPoint,
      returnFocusTo?: HTMLElement,
      mode: NodeTypePickerMode = 'free',
    ) => {
      if (
        !project ||
        !point ||
        pendingPlacement ||
        editingCard ||
        imageReferenceTargetId
      ) return
      if (connectionTool.phase !== 'idle') cancelConnection(false)
      setContextMenu(undefined)
      setNodeTypePicker({
        projectId: project.id,
        position: point.flowPosition,
        anchor: point.anchor,
        bounds: point.bounds,
        returnFocusTo,
        mode,
      })
      setActiveTool('select')
    },
    [
      cancelConnection,
      connectionTool.phase,
      editingCard,
      imageReferenceTargetId,
      pendingPlacement,
      project,
    ],
  )

  const openNodeTypePickerFromDock = useCallback(
    (trigger: HTMLButtonElement) => {
      const rect = viewportRef.current?.getBoundingClientRect()
      if (!rect) return
      const point = canvasPoint(
        rect.left + rect.width / 2,
        rect.top + Math.min(rect.height * 0.56, rect.height - 220),
      )
      if (!point) return
      openNodeTypePicker(point, trigger, 'add')
    },
    [canvasPoint, openNodeTypePicker],
  )

  const openContextMenu = useCallback(
    (
      clientX: number,
      clientY: number,
      targetNodeId?: string,
      returnFocusTo?: HTMLElement,
    ) => {
      if (
        !project ||
        pendingPlacement ||
        nodeTypePicker ||
        editingCard ||
        imageReferenceTargetId
      ) return
      const point = canvasPoint(clientX, clientY)
      if (!point) return
      if (connectionTool.phase !== 'idle') cancelConnection(false)
      if (targetNodeId) {
        setSelectedEdgeIds(new Set())
        selectOnlyNode(targetNodeId)
      }
      const nextMenu: CanvasContextMenuState = {
        projectId: project.id,
        ...point,
        targetNodeId,
        returnFocusTo: returnFocusTo ?? viewportRef.current ?? undefined,
      }
      setContextMenu(nextMenu)
    },
    [
      cancelConnection,
      canvasPoint,
      connectionTool.phase,
      editingCard,
      imageReferenceTargetId,
      nodeTypePicker,
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

  const buildQuickNodeCreation = useCallback(
    (
      currentProject: Project,
      type: QuickNodeType,
      position: CanvasNodePosition,
      entry: 'picker' | 'context',
      dependencyContext?: { sourceTitle: string; targetTitle: string },
    ) => {
      const numberedTitle = (label: string) => {
        const count = currentProject.nodes.filter((node) =>
          node.title.startsWith(label),
        ).length
        return `${label} ${String(count + 1).padStart(2, '0')}`
      }

      let creation: CanvasCreation
      if (type === 'script-generator') {
        creation = buildCreativeCardCreation(
          currentProject,
          {
            kind: 'script',
            title: numberedTitle('故事脚本'),
            scenes: '场一：从这里开始搭建故事结构',
            dialogue: '',
            shotNotes: '双击画布创建的本地故事脚本节点',
          },
          position,
        )
      } else if (type === 'character-turnaround') {
        creation = buildCreativeCardCreation(
          currentProject,
          {
            kind: 'character-card',
            title: numberedTitle('角色三视图'),
            name: '新角色',
            appearance: '等待补充正面、侧面与背面外貌锚点',
            wardrobe: '',
            relationships: '',
          },
          position,
        )
      } else if (type === 'worldview') {
        creation = buildCreativeCardCreation(
          currentProject,
          {
            kind: 'worldview',
            title: nextCreativeCardTitle(currentProject, 'worldview'),
            background: '等待补充故事发生的时代、地点与社会背景',
            artStyle: '等待补充整体美术风格',
            rules: '',
          },
          position,
        )
      } else if (type === 'director' || type === 'script') {
        const label = type === 'director' ? '导演台' : '脚本'
        creation = buildCreativeCardCreation(
          currentProject,
          {
            kind: 'script',
            title: numberedTitle(label),
            scenes:
              type === 'director'
                ? '导演台本地演示：等待拆解镜头与调度创作任务'
                : '场一：等待补充脚本结构',
            dialogue: '',
            shotNotes: type === 'director' ? 'NEW · 本地导演台节点' : '',
          },
          position,
        )
        creation = {
          ...creation,
          node: {
            ...creation.node,
            details: type === 'director'
              ? {
                  type: 'director',
                  shots: [
                    {
                      id: crypto.randomUUID(),
                      title: '远景建立',
                      cameraHint: '广角稳定机位，交代环境与人物关系',
                    },
                    {
                      id: crypto.randomUUID(),
                      title: '人物入画',
                      cameraHint: '中景滑轨前推，保持视线高度',
                    },
                  ],
                  scene3d: createDefaultDirectorScene(),
                  trajectory: { points: [] },
                }
              : {
                  type: 'script',
                  modelProviderId: 'ark-text-llm',
                  outline: '',
                  sceneCount: 5,
                  chapters: [{
                    id: crypto.randomUUID(),
                    title: '第一章',
                    summary: '主角进入场景，建立目标并引出第一个冲突。',
                  }],
                },
          },
        }
      } else if (type === 'image' || type === 'asset-library') {
        const createdAt = new Date().toISOString()
        const title =
          type === 'asset-library'
            ? numberedTitle('素材库')
            : nextNodeTitle(currentProject, 'image')
        const prompt =
          type === 'asset-library'
            ? '从素材库选择素材后替换此占位内容'
            : ''
        creation = {
          node: {
            id: crypto.randomUUID(),
            kind: 'image',
            title,
            position,
            versions: [{
              id: crypto.randomUUID(),
              createdAt,
              prompt,
            }],
            activeVersionId: '',
            sourceChanged: false,
          },
        }
        creation.node.activeVersionId = creation.node.versions[0].id
      } else {
        const quickConfig: Record<
          Exclude<
            QuickNodeType,
            | 'script-generator'
            | 'character-turnaround'
            | 'worldview'
            | 'director'
            | 'script'
            | 'image'
            | 'asset-library'
          >,
          { kind: 'text' | 'storyboard' | 'video'; title: string; content: string }
        > = {
          'reference-video': {
            kind: 'video',
            title: numberedTitle('全能参考生视频'),
            content: 'SD2.5 全能参考生视频：等待补充人物、场景与动作参考',
          },
          'audio-video': {
            kind: 'video',
            title: numberedTitle('音频生视频'),
            content: 'SD2.5 音频生视频：等待补充音频与节奏说明',
          },
          'smart-edit': {
            kind: 'video',
            title: numberedTitle('智能剪辑'),
            content: 'Beta 智能剪辑：等待导入素材并设置剪辑目标',
          },
          'frame-analysis': {
            kind: 'storyboard',
            title: numberedTitle('逐帧拉片'),
            content: 'SD2.5 · 分镜 / 动态 / 音乐',
          },
          audio: {
            kind: 'text',
            title: numberedTitle('音频'),
            content: '等待导入或生成音频素材',
          },
          text: {
            kind: 'text',
            title: nextNodeTitle(currentProject, 'text'),
            content:
              entry === 'picker'
                ? '双击画布创建的自由文本节点'
                : '右键画布创建的文本节点',
          },
          storyboard: {
            kind: 'storyboard',
            title: nextNodeTitle(currentProject, 'storyboard'),
            content: '等待补充分镜构图与画面提示',
          },
          video: {
            kind: 'video',
            title: nextNodeTitle(currentProject, 'video'),
            content: '等待补充视频生成提示',
          },
        }
        const config = quickConfig[type]
        creation = buildCanvasCreation(currentProject, {
          ...config,
          position,
        })
        if (type === 'text') {
          creation = {
            ...creation,
            node: {
              ...creation.node,
              details: {
                type: 'text',
                content: config.content,
                fontStyle: '正文',
                modelProviderId: 'ark-text-llm',
                prompt: '',
              },
            },
          }
        } else if (type === 'audio') {
          creation = {
            ...creation,
            node: {
              ...creation.node,
              details: {
                type: 'audio',
                durationSeconds: 12,
                voice: '温暖女声',
                speed: 1,
                volume: 75,
                modelProviderId: 'ark-tts',
              },
            },
          }
        } else if (type === 'smart-edit') {
          creation = {
            ...creation,
            node: {
              ...creation.node,
              details: {
                type: 'smart-edit',
                tracks: [
                  { id: crypto.randomUUID(), name: '主视频轨' },
                  { id: crypto.randomUUID(), name: '叠加轨' },
                  { id: crypto.randomUUID(), name: '音频轨' },
                ],
                clips: [
                  { id: crypto.randomUUID(), name: '片段 01', durationSeconds: 4 },
                  { id: crypto.randomUUID(), name: '片段 02', durationSeconds: 3 },
                ],
                exportDurationSeconds: 7,
              },
            },
          }
        } else if (type === 'frame-analysis') {
          creation = {
            ...creation,
            node: {
              ...creation.node,
              details: {
                type: 'frame-analysis',
                sourceName: '待选择素材',
                sourceSummary: '尚未绑定视频，可选择上游视频或上传 MP4/MOV/AVI。',
                dimensions: {
                  storyboard: true,
                  motion: true,
                  music: false,
                },
              },
            },
          }
        }
        if (type === 'frame-analysis') {
          creation = {
            ...creation,
            node: {
              ...creation.node,
              videoTool: {
                kind: 'frame-analysis',
                model: 'SD2.5',
                dimensions: ['分镜', '动态', '音乐'],
              },
            },
          }
        }
      }

      if (creation.node.kind === 'video') {
        const provider =
          providerRegistry.list().find(
            ({ id }) => id === 'seedance-api',
          ) ??
          providerRegistry.matching(['text-to-video', 'image-to-video']).find(
            isProviderEnabled,
          )
        const generationMode = provider
          ? resolveVideoGenerationMode(provider, defaultVideoGenerationMode)
          : undefined
        if (provider && generationMode) {
          creation = {
            ...creation,
            node: {
              ...creation.node,
              modelProviderId: provider.id,
              generationConfig: {
                targetKind: 'video',
                providerId: provider.id,
                parameters: {
                  ...providerDefaultParameters(provider),
                  generationMode,
                },
                referenceAssets: [],
              },
            },
          }
        }
      }

      if (
        dependencyContext &&
        (creation.node.kind === 'image' ||
          creation.node.kind === 'storyboard' ||
          creation.node.kind === 'video')
      ) {
        const contextualPrompt =
          `承接“${dependencyContext.sourceTitle}”并输出至` +
          `“${dependencyContext.targetTitle}”的生成上下文`
        creation = {
          ...creation,
          node: {
            ...creation.node,
            versions: creation.node.versions.map((version) =>
              version.id === creation.node.activeVersionId
                ? {
                    ...version,
                    prompt: version.prompt
                      ? `${version.prompt}\n${contextualPrompt}`
                      : contextualPrompt,
                  }
                : version,
            ),
          },
        }
      }

      return creation
    },
    [providerRegistry],
  )

  const createQuickNodeAt = useCallback(
    (
      type: QuickNodeType,
      position: CanvasNodePosition,
      entry: 'picker' | 'context',
    ) => {
      const currentProject = useProjectStore.getState().activeProject
      if (!currentProject || currentProject.id !== projectId) return undefined
      const creation = buildQuickNodeCreation(
        currentProject,
        type,
        position,
        entry,
      )

      createdNodeFocusRef.current = creation.node.id
      setFocusRequestVersion((version) => version + 1)
      createCanvasContent(creation)
      selectOnlyNode(creation.node.id)
      setActiveTool('select')
      setGenerationFeedback(`已创建“${creation.node.title}”，可继续编辑或建立连线。`)
      return creation.node.id
    },
    [
      buildQuickNodeCreation,
      createCanvasContent,
      projectId,
      selectOnlyNode,
    ],
  )

  const createQuickNode = useCallback(
    (type: QuickNodeType) => {
      const picker = nodeTypePicker
      const currentProject = useProjectStore.getState().activeProject
      if (
        !picker ||
        !currentProject ||
        picker.projectId !== currentProject.id
      ) return
      if (picker.sourceNodeId) {
        const sourceNode = currentProject.nodes.find(
          ({ id }) => id === picker.sourceNodeId,
        )
        if (!sourceNode) return
        const creation = buildQuickNodeCreation(
          currentProject,
          type,
          picker.position,
          'picker',
        )
        if (
          !createConnectedCanvasContent(
            sourceNode.id,
            creation,
            crypto.randomUUID(),
            type === 'image' ? 'image-reference' : 'dependency',
          )
        ) return
        createdNodeFocusRef.current = creation.node.id
        setFocusRequestVersion((version) => version + 1)
        selectOnlyNode(creation.node.id)
        setActiveTool('select')
        setGenerationFeedback(
          `已引用“${sourceNode.title}”创建“${creation.node.title}”；撤销一次可同时移除节点与连线。`,
        )
        setNodeTypePicker(undefined)
        return
      }
      if (picker.edgeInsertions) {
        let stagedProject = currentProject
        const insertions = picker.edgeInsertions.flatMap((target) => {
          const edge = currentProject.edges.find(
            ({ id }) => id === target.edgeId,
          )
          if (!edge) return []
          const source = currentProject.nodes.find(
            ({ id }) => id === edge.sourceNodeId,
          )
          const destination = currentProject.nodes.find(
            ({ id }) => id === edge.targetNodeId,
          )
          if (!source || !destination) return []
          const creation = buildQuickNodeCreation(
            stagedProject,
            type,
            target.position,
            'picker',
            { sourceTitle: source.title, targetTitle: destination.title },
          )
          stagedProject = {
            ...stagedProject,
            assets: creation.asset
              ? [...stagedProject.assets, creation.asset]
              : stagedProject.assets,
            nodes: [...stagedProject.nodes, creation.node],
          }
          return [{
            edgeId: edge.id,
            creation,
            incomingEdgeId: crypto.randomUUID(),
            outgoingEdgeId: crypto.randomUUID(),
          }]
        })
        if (insertions.length !== picker.edgeInsertions.length) return
        const createdNodeIds = insertCanvasContentIntoEdges(insertions)
        if (createdNodeIds.length !== insertions.length) return
        const lastNodeId = createdNodeIds.at(-1)
        createdNodeFocusRef.current = lastNodeId
        setFocusRequestVersion((version) => version + 1)
        setSelectedNodeIds(new Set(createdNodeIds))
        setPrimaryNodeId(lastNodeId)
        setSelectedEdgeIds(new Set())
        setActiveTool('select')
        setGenerationFeedback(
          `已在 ${createdNodeIds.length} 条连线中插入节点；撤销一次可恢复原连接。`,
        )
        setNodeTypePicker(undefined)
        return
      }
      if (!createQuickNodeAt(type, picker.position, 'picker')) return
      setNodeTypePicker(undefined)
    },
    [
      buildQuickNodeCreation,
      createConnectedCanvasContent,
      createQuickNodeAt,
      insertCanvasContentIntoEdges,
      nodeTypePicker,
      selectOnlyNode,
    ],
  )

  const createStarterNode = useCallback(
    (type: QuickNodeType) => {
      const rect = viewportRef.current?.getBoundingClientRect()
      if (!rect) return
      const point = canvasPoint(
        rect.left + rect.width / 2,
        rect.top + Math.min(rect.height * 0.42, rect.height - 240),
      )
      if (!point) return
      createQuickNodeAt(type, point.flowPosition, 'picker')
    },
    [canvasPoint, createQuickNodeAt],
  )

  const createContextNode = useCallback(
    (type: ContextQuickNodeType) => {
      const source = contextMenu
      const currentProject = useProjectStore.getState().activeProject
      if (
        !source ||
        !currentProject ||
        source.projectId !== currentProject.id
      ) return
      if (!createQuickNodeAt(type, source.flowPosition, 'context')) return
      setContextMenu(undefined)
    },
    [contextMenu, createQuickNodeAt],
  )

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
        if (pendingPlacement || imageReferenceTargetId) return
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
      if (tool === 'hand') {
        if (editingCard) cancelCardEditing()
        else if (pendingPlacement) cancelPlacement()
        else if (nodeTypePicker) closeNodeTypePicker()
        else setActiveTool('hand')
        return
      }
      if (tool === 'select') {
        if (editingCard) cancelCardEditing()
        else if (pendingPlacement) cancelPlacement()
        else if (nodeTypePicker) closeNodeTypePicker()
        else setActiveTool('select')
      }
    },
    [
      cancelConnection,
      cancelCardEditing,
      cancelPlacement,
      closeNodeTypePicker,
      connectionTool.phase,
      editingCard,
      imageReferenceTargetId,
      nodeTypePicker,
      pendingPlacement,
      project,
    ],
  )

  const arrangeCanvas = useCallback(() => {
    const currentProject = useProjectStore.getState().activeProject
    if (!currentProject || currentProject.id !== projectId) return
    const outgoing = new Map<string, string[]>()
    const indegree = new Map(
      currentProject.nodes.map(({ id }) => [id, 0]),
    )
    for (const edge of currentProject.edges) {
      outgoing.set(edge.sourceNodeId, [
        ...(outgoing.get(edge.sourceNodeId) ?? []),
        edge.targetNodeId,
      ])
      indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1)
    }
    const depths = new Map<string, number>()
    const queue = currentProject.nodes
      .filter(({ id }) => (indegree.get(id) ?? 0) === 0)
      .map(({ id }) => id)
    queue.forEach((id) => depths.set(id, 0))
    for (let index = 0; index < queue.length; index += 1) {
      const sourceId = queue[index]
      const sourceDepth = depths.get(sourceId) ?? 0
      for (const targetId of outgoing.get(sourceId) ?? []) {
        depths.set(targetId, Math.max(depths.get(targetId) ?? 0, sourceDepth + 1))
        const nextIndegree = (indegree.get(targetId) ?? 1) - 1
        indegree.set(targetId, nextIndegree)
        if (nextIndegree === 0) queue.push(targetId)
      }
    }
    const rowByDepth = new Map<number, number>()
    const positions = currentProject.nodes.map(({ id }, index) => {
      const depth = depths.get(id) ?? index
      const row = rowByDepth.get(depth) ?? 0
      rowByDepth.set(depth, row + 1)
      return {
        nodeId: id,
        position: { x: 80 + depth * 360, y: 80 + row * 300 },
      }
    })
    updateNodePositions(positions)
    setGroupFeedback('已整理画布')
    queueMicrotask(() => {
      void flowInstance?.fitView({ duration: 320, padding: 0.18 })
    })
  }, [flowInstance, projectId, updateNodePositions])

  const arrangeCanvasGroup = useCallback(
    (
      group: CanvasGroup,
      mode: 'grid' | 'horizontal' | 'vertical',
      layoutOverride?: CanvasGroup['storyboardLayout'],
    ) => {
      const currentProject = useProjectStore.getState().activeProject
      if (!currentProject || currentProject.id !== projectId) return
      const members = group.nodeIds.flatMap((nodeId) => {
        const node = currentProject.nodes.find(({ id }) => id === nodeId)
        return node ? [node] : []
      })
      if (members.length < 2) return
      const originX = Math.min(...members.map(({ position }) => position.x))
      const originY = Math.min(...members.map(({ position }) => position.y))
      const measured = nodeMeasurements.projectId === currentProject.id
        ? nodeMeasurements.measurements
        : {}
      const gap = 48
      const maxWidth = Math.max(
        ...members.map(({ id }) => measured[id]?.width ?? 270),
      )
      const maxHeight = Math.max(
        ...members.map(({ id }) => measured[id]?.height ?? 180),
      )
      const storyboardLayout = layoutOverride ?? group.storyboardLayout
      const columns =
        mode === 'grid' && storyboardLayout
          ? Math.max(1, storyboardLayout.columns)
          : Math.ceil(Math.sqrt(members.length))
      updateNodePositions(
        members.map(({ id }, index) => ({
          nodeId: id,
          position:
            mode === 'horizontal'
              ? { x: originX + index * (maxWidth + gap), y: originY }
              : mode === 'vertical'
                ? { x: originX, y: originY + index * (maxHeight + gap) }
                : {
                    x: originX + (index % columns) * (maxWidth + gap),
                    y: originY + Math.floor(index / columns) * (maxHeight + gap),
                  },
        })),
      )
      setGroupFeedback(
        mode === 'horizontal'
          ? '已水平排列组合节点'
          : mode === 'vertical'
            ? '已垂直排列组合节点'
            : '已宫格排列组合节点',
      )
    },
    [nodeMeasurements, projectId, updateNodePositions],
  )

  const duplicateCanvasGroup = useCallback(
    (group: CanvasGroup) => {
      const duplicatedIds = duplicateNodes(group.nodeIds, { x: 64, y: 64 })
      if (!duplicatedIds.length) return
      setSelectedNodeIds(new Set(duplicatedIds))
      setPrimaryNodeId(duplicatedIds.at(-1))
      setSelectedEdgeIds(new Set())
      setGroupFeedback(`已创建 ${duplicatedIds.length} 个节点副本`)
    },
    [duplicateNodes],
  )

  const openStoryboardSetup = useCallback(
    (group: CanvasGroup, temporary = false) => {
      setStoryboardSetup({ group, temporary })
    },
    [],
  )

  const applyStoryboardSetup = useCallback(
    (layout: NonNullable<CanvasGroup['storyboardLayout']>) => {
      const setup = storyboardSetup
      if (!setup) return
      const currentProject = useProjectStore.getState().activeProject
      if (!currentProject || currentProject.id !== projectId) return
      let groupId = setup.group.id
      if (setup.temporary) {
        groupId = groupNodes(setup.group.nodeIds, 'storyboard') ?? ''
        if (!groupId) {
          setGroupFeedback('至少选择两个节点才能创建分镜组。')
          return
        }
      }
      const captions = Object.fromEntries(
        setup.group.nodeIds.map((nodeId) => {
          const node = currentProject.nodes.find(({ id }) => id === nodeId)
          return [
            nodeId,
            setup.group.storyboardCaptions?.[nodeId] ?? node?.storyboardDialogue ?? '',
          ]
        }),
      )
      if (!updateCanvasGroup(groupId, {
        kind: 'storyboard',
        storyboardLayout: layout,
        storyboardCaptions: captions,
      })) return
      const updatedGroup = useProjectStore
        .getState()
        .activeProject?.groups?.find(({ id }) => id === groupId)
      if (updatedGroup) arrangeCanvasGroup(updatedGroup, 'grid', layout)
      setSelectedNodeIds(new Set(setup.group.nodeIds))
      setPrimaryNodeId(setup.group.nodeIds.at(-1))
      setStoryboardSetup(undefined)
      setGroupFeedback(`已转换为 ${layout.preset} 分镜组并自动排版。`)
    },
    [arrangeCanvasGroup, groupNodes, projectId, storyboardSetup, updateCanvasGroup],
  )

  const updateStoryboardCaption = useCallback(
    (group: CanvasGroup, nodeId: string, caption: string) => {
      updateCanvasGroup(group.id, {
        storyboardCaptions: {
          ...group.storyboardCaptions,
          [nodeId]: caption,
        },
      })
    },
    [updateCanvasGroup],
  )

  const storyboardItemsFor = useCallback(
    (group: CanvasGroup) => group.nodeIds.flatMap((nodeId) => {
      const node = flowNodes.find(({ id }) => id === nodeId)
      if (!node) return []
      return [{
        nodeId,
        title: String(node.data.title ?? nodeId),
        x: node.position.x,
        y: node.position.y,
        width: node.measured?.width ?? 280,
        height: node.measured?.height ?? 180,
      }]
    }),
    [flowNodes],
  )

  const runSelectedGeneration = useCallback(() => {
    const currentProject = useProjectStore.getState().activeProject
    const node = currentProject?.nodes.find(({ id }) => id === primaryNodeId)
    if (!currentProject || currentProject.id !== projectId || !node) return false
    const version = node.versions.find(({ id }) => id === node.activeVersionId)
    const asset = currentProject.assets.find(({ id }) => id === version?.assetId)
    const hasIncomingMedia = currentProject.edges
      .filter(({ targetNodeId }) => targetNodeId === node.id)
      .some(({ sourceNodeId }) => {
        const source = currentProject.nodes.find(({ id }) => id === sourceNodeId)
        const sourceVersion = source?.versions.find(
          ({ id }) => id === source.activeVersionId,
        )
        return currentProject.assets.some(
          ({ id, kind }) =>
            id === sourceVersion?.assetId && (kind === 'image' || kind === 'video'),
        )
      })
    const prompt = node.imageGeneration?.prompt ?? version?.prompt ?? ''
    const eligible = Boolean(prompt.trim() || asset || hasIncomingMedia)
    if (!eligible) return false

    if (
      (node.kind === 'image' || node.kind === 'character' || node.kind === 'scene') &&
      !node.videoTool
    ) {
      handleAction(node.id, 'generate')
      return true
    }
    if (node.kind === 'video' && !node.videoTool) {
      handleAction(node.id, 'generate')
      return true
    }
    if (node.kind === 'storyboard') {
      handleAction(node.id, 'generate-video')
      return true
    }
    return false
  }, [handleAction, primaryNodeId, projectId])

  useEffect(() => {
    const handleCanvasShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        !project ||
        pendingPlacement ||
        nodeTypePicker ||
        editingCard ||
        imageReferenceTargetId ||
        nodeListOpen ||
        deleteCandidateId ||
        contextMenu ||
        workspacePanel ||
        nativeConnectionActiveRef.current ||
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="menu"]',
        )
      ) {
        return
      }

      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.closest('.canvas-agent-panel') ||
          target.isContentEditable ||
          Boolean(
            target.closest(
              'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
            ),
          ))
      ) {
        return
      }

      const key = event.key.toLowerCase()
      const commandKey = event.metaKey || event.ctrlKey
      if (key === 'z' && commandKey && !event.altKey) {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (key === 'f' && event.altKey && event.shiftKey && !commandKey) {
        event.preventDefault()
        arrangeCanvas()
        return
      }
      if (event.ctrlKey || event.metaKey || (event.altKey && key !== 'g')) return

      if (key === 'h' && !event.shiftKey) {
        event.preventDefault()
        if (connectionTool.phase !== 'idle') cancelConnection(false)
        setActiveTool('hand')
        setGroupFeedback('已切换抓手工具')
        return
      }
      if (key === 'v' && !event.shiftKey) {
        event.preventDefault()
        if (connectionTool.phase !== 'idle') cancelConnection(false)
        setActiveTool('select')
        setGroupFeedback('已切换移动工具')
        return
      }
      if (connectionTool.phase !== 'idle') return
      if (key === 'l' && !event.shiftKey) {
        const trigger = viewportRef.current?.querySelector<HTMLButtonElement>(
          '.canvas-mode-bar button[aria-label="连线"]',
        )
        if (!trigger || trigger.disabled) return
        event.preventDefault()
        handleToolChange('connect', trigger)
        return
      }
      if (key === 'g') {
        event.preventDefault()
        const currentProject = useProjectStore.getState().activeProject
        const selectedGroup = findSelectedCanvasGroup(
          currentProject?.groups ?? [],
          selectedNodeIds,
        )
        if (event.shiftKey) {
          if (selectedGroup) removeCanvasGroup(selectedGroup.id)
          return
        }
        if (selectedNodeIds.size < 2) return
        const groupId = groupNodes(
          selectedNodeIds,
          event.altKey ? 'storyboard' : 'standard',
        )
        if (groupId) {
          setGroupFeedback(
            event.altKey ? '已创建分镜组' : '已创建分组',
          )
        }
        return
      }
      if (event.shiftKey) {
        if (event.key !== '+' && event.key !== '=') return
      }
      if (key === 'd') {
        event.preventDefault()
        const duplicatedIds = duplicateNodes(selectedNodeIds)
        if (duplicatedIds.length === 0) return
        setSelectedNodeIds(new Set(duplicatedIds))
        setPrimaryNodeId(duplicatedIds.at(-1))
        setSelectedEdgeIds(new Set())
        setGroupFeedback(
          `已复制 ${duplicatedIds.length} 个节点及关联连线`,
        )
        return
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        void flowInstance?.zoomIn({ duration: 160 })
        return
      }
      if (event.key === '-') {
        event.preventDefault()
        void flowInstance?.zoomOut({ duration: 160 })
        return
      }
      if (event.key === '0') {
        event.preventDefault()
        void flowInstance?.fitView({ duration: 260, padding: 0.16 })
        return
      }
      if (event.key === 'Tab') {
        const trigger = viewportRef.current?.querySelector<HTMLButtonElement>(
          '.canvas-mode-bar button[aria-label="添加节点"]',
        )
        if (!trigger || trigger.disabled) return
        event.preventDefault()
        openNodeTypePickerFromDock(trigger)
        return
      }
      if (event.key === 'Enter') {
        if (
          target instanceof HTMLElement &&
          target.closest('button, a, [role="button"]')
        ) {
          return
        }
        if (runSelectedGeneration()) event.preventDefault()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        if (selectedEdgeId) {
          disconnectEdge(selectedEdgeId)
        } else if (primaryNodeId && viewportRef.current) {
          requestDelete(primaryNodeId, viewportRef.current)
        }
      }
    }

    window.addEventListener('keydown', handleCanvasShortcut)
    return () => window.removeEventListener('keydown', handleCanvasShortcut)
  }, [
    arrangeCanvas,
    cancelConnection,
    connectionTool.phase,
    contextMenu,
    deleteCandidateId,
    disconnectEdge,
    duplicateNodes,
    editingCard,
    flowInstance,
    groupNodes,
    handleToolChange,
    imageReferenceTargetId,
    nodeListOpen,
    nodeTypePicker,
    openNodeTypePickerFromDock,
    pendingPlacement,
    primaryNodeId,
    project,
    redo,
    removeCanvasGroup,
    requestDelete,
    runSelectedGeneration,
    selectedEdgeId,
    selectedNodeIds,
    undo,
    workspacePanel,
  ])

  const handlePaneClick = useCallback(
    (event: ReactMouseEvent<Element> | MouseEvent) => {
      setSelectedEdgeIds(new Set())
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
        imageReferenceTargetId ||
        pendingPlacement ||
        nodeTypePicker ||
        editingCard
      ) {
        return
      }
      if (event.detail < 2) {
        if (event.detail !== 0) return
        const current = {
          at: Date.now(),
          clientX: event.clientX,
          clientY: event.clientY,
        }
        const previous = paneClickRef.current
        paneClickRef.current = current
        if (
          !previous ||
          current.at - previous.at > 400 ||
          Math.hypot(
            current.clientX - previous.clientX,
            current.clientY - previous.clientY,
          ) > 8
        ) {
          return
        }
      }
      paneClickRef.current = undefined
      const point = canvasPoint(event.clientX, event.clientY)
      if (!point) return
      openNodeTypePicker(point, viewportRef.current ?? undefined)
    },
    [
      cancelConnection,
      canvasPoint,
      closeContextMenu,
      connectionTool.phase,
      contextMenu,
      flowInstance,
      imageReferenceTargetId,
      editingCard,
      nodeTypePicker,
      openNodeTypePicker,
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
  const contextNodeAsset = contextNode
    ? project?.assets.find(({ id }) => contextNode.versions.some(({ assetId }) => assetId === id))
    : undefined
  const canUseGenerationHistory = Boolean(
    project?.jobs.some(
      (job) =>
        job.status === 'succeeded' &&
        job.assetId &&
        project.assets.some(({ id }) => id === job.assetId),
    ),
  )

  const saveContextAssetToLibrary = useCallback(() => {
    const currentProject = useProjectStore.getState().activeProject
    setContextMenu(undefined)
    if (!contextNode || !contextNodeAsset || !currentProject || !libraryRepository.save) {
      setGenerationFeedback('当前节点没有可保存的媒体结果。')
      return
    }
    void libraryRepository.save(
      deriveLibraryRecord(currentProject, contextNodeAsset),
    ).then(() => {
      setGenerationFeedback(`已将“${contextNode.title}”保存到资产管理。`)
    }).catch(() => {
      setGenerationFeedback(`“${contextNode.title}”保存失败，请稍后重试。`)
    })
  }, [contextNode, contextNodeAsset, libraryRepository])

  const beginContextUpload = useCallback(() => {
    const source = contextMenu
    if (!source) return
    setContextUploadPlacement({
      projectId: source.projectId,
      position: source.flowPosition,
      returnFocusTo: source.returnFocusTo,
    })
    setContextMenu(undefined)
    queueMicrotask(() => contextUploadInputRef.current?.click())
  }, [contextMenu])

  const copyContextNode = useCallback(() => {
    if (!contextMenu?.targetNodeId || !project) return
    setCanvasClipboard({ projectId: project.id, nodeIds: [contextMenu.targetNodeId] })
    setGenerationFeedback(`已复制“${contextNode?.title ?? '节点'}”，可在画布中粘贴。`)
    setContextMenu(undefined)
  }, [contextMenu?.targetNodeId, contextNode?.title, project])

  const duplicateContextNode = useCallback(() => {
    if (!contextMenu?.targetNodeId) return
    const duplicatedIds = duplicateNodes([contextMenu.targetNodeId], { x: 48, y: 48 })
    if (duplicatedIds.length) {
      setSelectedNodeIds(new Set(duplicatedIds))
      setPrimaryNodeId(duplicatedIds.at(-1))
      setSelectedEdgeIds(new Set())
      setGenerationFeedback('已在右下方创建节点副本。')
    }
    setContextMenu(undefined)
  }, [contextMenu?.targetNodeId, duplicateNodes])

  const pasteContextNodes = useCallback(() => {
    const source = contextMenu
    const clipboard = canvasClipboard
    const currentProject = useProjectStore.getState().activeProject
    if (!source || !clipboard || !currentProject || clipboard.projectId !== currentProject.id) return
    const origin = currentProject.nodes.find(({ id }) => id === clipboard.nodeIds[0])?.position
    if (!origin) return
    const duplicatedIds = duplicateNodes(clipboard.nodeIds, {
      x: source.flowPosition.x - origin.x,
      y: source.flowPosition.y - origin.y,
    })
    if (duplicatedIds.length) {
      setSelectedNodeIds(new Set(duplicatedIds))
      setPrimaryNodeId(duplicatedIds.at(-1))
      setSelectedEdgeIds(new Set())
      setGenerationFeedback(`已粘贴 ${duplicatedIds.length} 个节点。`)
    }
    setContextMenu(undefined)
  }, [canvasClipboard, contextMenu, duplicateNodes])

  const createSubjectFromContextNode = useCallback(() => {
    const source = contextMenu
    const currentProject = useProjectStore.getState().activeProject
    const sourceNode = currentProject?.nodes.find(({ id }) => id === source?.targetNodeId)
    const sourceAsset = sourceNode ? activeNodeAsset(currentProject!, sourceNode.id) : undefined
    if (!source || !currentProject || !sourceNode || sourceAsset?.kind !== 'image') {
      setContextMenu(undefined)
      setGenerationFeedback('请先选择带图片结果或上传图的节点。')
      return
    }
    setPendingSubjectCreation({
      projectId: currentProject.id,
      canvasId: currentProject.activeCanvasId,
      sourceNodeId: sourceNode.id,
      sourceTitle: sourceNode.title,
      asset: sourceAsset,
      returnFocusTo: source.returnFocusTo,
    })
    setSubjectCreationError(undefined)
    setContextMenu(undefined)
  }, [contextMenu])

  const closeSubjectCreation = useCallback(() => {
    const returnFocusTo = pendingSubjectCreation?.returnFocusTo
    setPendingSubjectCreation(undefined)
    setSubjectCreationError(undefined)
    queueMicrotask(() => returnFocusTo?.focus())
  }, [pendingSubjectCreation])

  const subjectExtractionProvider = providerRegistry.list().find(({ id }) => id === subjectExtractionId)
  const extractSubject = useCallback(async (signal: AbortSignal) => {
    const pending = pendingSubjectCreation
    if (!pending || !subjectExtractionProvider) throw new Error(subjectExtractionUnavailable)
    const result = await providerRegistry.generate({
      projectId: pending.projectId, nodeId: pending.sourceNodeId, operation: 'regenerate', targetKind: 'text',
      providerId: subjectExtractionId, prompt: '提取这张图片主体的创作称呼、可见外貌、服装与标签。',
      referenceAssets: [{ kind: 'image', url: pending.asset.url, mimeType: pending.asset.mimeType }],
    }, { signal })
    signal.throwIfAborted()
    return { ...parseSubjectDescription(result.version.textContent ?? ''), providerId: subjectExtractionId,
      modelName: subjectExtractionProvider.modelName, extractedAt: new Date().toISOString(), usage: result.usage }
  }, [pendingSubjectCreation, providerRegistry, subjectExtractionProvider])

  const saveSubject = useCallback((value: CreateSubjectFormValue) => {
    const pending = pendingSubjectCreation
    const currentProject = useProjectStore.getState().activeProject
    if (!pending || !currentProject || currentProject.id !== projectId || pending.projectId !== currentProject.id || pending.canvasId !== currentProject.activeCanvasId) return
    setSubjectCreationBusy(true)
    setSubjectCreationError(undefined)
    void subjectRepository.create({
      ...value,
      coverUrl: pending.asset.url,
      sampleImages: [pending.asset.url],
      sourceAssetId: pending.asset.id,
      sourceProjectId: currentProject.id,
    }).then((subject) => {
      setPendingSubjectCreation(undefined)
      setGenerationFeedback(`主体“${subject.name}”已保存，可跨项目复用。`)
      setWorkspacePanel('characters')
    }).catch((error) => {
      setSubjectCreationError(error instanceof Error ? error.message : '主体保存失败。')
    }).finally(() => setSubjectCreationBusy(false))
  }, [pendingSubjectCreation, projectId, subjectRepository])

  const copyContextNodeToSystemClipboard = useCallback(() => {
    if (!contextNode || !project) return
    const snapshot = JSON.stringify({
      node: contextNode,
      edges: project.edges.filter(
        ({ sourceNodeId, targetNodeId }) => sourceNodeId === contextNode.id || targetNodeId === contextNode.id,
      ),
    }, null, 2)
    void navigator.clipboard?.writeText(snapshot).catch(() => undefined)
    setCanvasClipboard({ projectId: project.id, nodeIds: [contextNode.id] })
    setContextMenu(undefined)
    setGenerationFeedback(`已将“${contextNode.title}”的 JSON 复制到剪贴板。`)
  }, [contextNode, project])

  const beginPickerUpload = useCallback(() => {
    const source = nodeTypePicker
    if (!source || source.mode === 'reference') return
    setContextUploadPlacement({
      projectId: source.projectId,
      position: source.position,
      returnFocusTo: source.returnFocusTo,
    })
    setNodeTypePicker(undefined)
    queueMicrotask(() => contextUploadInputRef.current?.click())
  }, [nodeTypePicker])

  const openPickerGenerationHistory = useCallback(() => {
    const source = nodeTypePicker
    if (!source || source.mode === 'reference' || !canUseGenerationHistory) return
    setHistoryPlacement({
      projectId: source.projectId,
      position: source.position,
      returnFocusTo: source.returnFocusTo,
    })
    setNodeTypePicker(undefined)
    setWorkspacePanel('history')
  }, [canUseGenerationHistory, nodeTypePicker])

  const cancelContextUpload = useCallback(() => {
    const returnFocusTo = contextUploadPlacement?.returnFocusTo
    setContextUploadPlacement(undefined)
    if (contextUploadInputRef.current) contextUploadInputRef.current.value = ''
    queueMicrotask(() => {
      if (returnFocusTo?.isConnected) returnFocusTo.focus()
      else viewportRef.current?.focus()
    })
  }, [contextUploadPlacement?.returnFocusTo])

  useEffect(() => {
    const input = contextUploadInputRef.current
    if (!input) return
    input.addEventListener('cancel', cancelContextUpload)
    return () => input.removeEventListener('cancel', cancelContextUpload)
  }, [cancelContextUpload])

  const handleContextUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget
      const file = input.files?.[0]
      const placement = contextUploadPlacement
      const currentProject = useProjectStore.getState().activeProject
      if (
        !file ||
        !placement ||
        !currentProject ||
        currentProject.id !== projectId ||
        placement.projectId !== currentProject.id
      ) {
        cancelContextUpload()
        return
      }

      try {
        let record: LibraryAssetRecord
        if (libraryRepository.importFile) {
          record = (await libraryRepository.importFile(file)).record
        } else {
          validateAssetFile(file)
          record = {
            id: crypto.randomUUID(),
            name: file.name,
            kind: file.type.split('/')[0] as LibraryAssetRecord['kind'],
            mimeType: file.type,
            url: await readAssetFileAsDataUrl(file),
            createdAt: new Date().toISOString(),
            source: 'upload',
            folderId: 'project',
            byteSize: file.size,
          }
          await libraryRepository.save?.(record)
        }
        const creation = buildMediaAssetCreation(
          currentProject,
          record,
          placement.position,
        )
        const title = creation.node.title
        createdNodeFocusRef.current = creation.node.id
        setFocusRequestVersion((version) => version + 1)
        createCanvasContent(creation)
        selectOnlyNode(creation.node.id)
        setContextUploadPlacement(undefined)
        input.value = ''
        const kindCopy = record.kind === 'image' ? '图片' : record.kind === 'video' ? '视频' : '音频'
        setGenerationFeedback(`已导入“${title}”并创建${kindCopy}节点，素材已保存到资产管理。`)
      } catch (error) {
        input.value = ''
        setContextUploadPlacement(undefined)
        setGenerationFeedback(
          error instanceof AssetImportError || error instanceof ImagePreparationError
            ? error.message
            : '无法读取素材，请重新选择。',
        )
        queueMicrotask(() => placement.returnFocusTo?.focus())
      }
    },
    [
      cancelContextUpload,
      contextUploadPlacement,
      createCanvasContent,
      libraryRepository,
      projectId,
      selectOnlyNode,
    ],
  )

  const closeWorkspacePanel = useCallback(() => {
    const returnFocusTo = historyPlacement?.returnFocusTo
    setWorkspacePanel(undefined)
    setHistoryPlacement(undefined)
    if (!historyPlacement) return
    queueMicrotask(() => {
      if (returnFocusTo?.isConnected) returnFocusTo.focus()
      else viewportRef.current?.focus()
    })
  }, [historyPlacement])

  const useHistoryResult = useCallback(
    (jobId: string) => {
      const placement = historyPlacement
      const currentProject = useProjectStore.getState().activeProject
      const job = currentProject?.jobs.find(({ id }) => id === jobId)
      const sourceNode = currentProject?.nodes.find(({ id }) => id === job?.nodeId)
      const asset = currentProject?.assets.find(({ id }) => id === job?.assetId)
      if (
        !currentProject ||
        currentProject.id !== projectId ||
        (placement && placement.projectId !== currentProject.id) ||
        job?.status !== 'succeeded' ||
        !sourceNode ||
        !asset
      ) return

      const label = `${sourceNode.title} 历史结果`
      const count = currentProject.nodes.filter(({ title }) => title.startsWith(label)).length
      const title = count ? `${label} ${String(count + 1).padStart(2, '0')}` : label
      const versionId = crypto.randomUUID()
      const creation: CanvasCreation = {
        node: {
          id: crypto.randomUUID(),
          kind: asset.kind === 'video' ? 'video' : asset.kind === 'image' ? 'image' : 'text',
          title,
          position: placement?.position ?? {
            x: sourceNode.position.x + 360,
            y: sourceNode.position.y + 140,
          },
          versions: [{
            id: versionId,
            createdAt: new Date().toISOString(),
            prompt: job.prompt,
            assetId: asset.id,
          }],
          activeVersionId: versionId,
          sourceChanged: false,
          ...(job.generationConfig
            ? {
                generationConfig: {
                  ...job.generationConfig,
                  ...(job.generationConfig.parameters
                    ? { parameters: { ...job.generationConfig.parameters } }
                    : {}),
                  referenceAssets: job.generationConfig.referenceAssets.map(
                    (reference) => ({ ...reference }),
                  ),
                },
              }
            : {}),
        },
      }
      createdNodeFocusRef.current = creation.node.id
      setFocusRequestVersion((version) => version + 1)
      createCanvasContent(creation)
      selectOnlyNode(creation.node.id)
      setWorkspacePanel(undefined)
      setHistoryPlacement(undefined)
      setGenerationFeedback(`已从生成历史使用“${title}”。`)
    },
    [createCanvasContent, historyPlacement, projectId, selectOnlyNode],
  )

  const deleteHistoryJobs = useCallback(
    (jobIds: string[]) => {
      const deletedIds = deleteGenerationJobs(jobIds)
      setGenerationFeedback(
        deletedIds.length
          ? `已删除 ${deletedIds.length} 条生成历史；结果素材仍保留在画布。`
          : '进行中的任务不能从历史中删除。',
      )
    },
    [deleteGenerationJobs],
  )

  const resendHistoryJob = useCallback(
    (jobId: string) => {
      const currentProject = useProjectStore.getState().activeProject
      const job = currentProject?.jobs.find(({ id }) => id === jobId)
      if (!currentProject || currentProject.id !== projectId || !job) return
      const sourceNode = currentProject.nodes.find(({ id }) => id === job.nodeId)
      const sourceAsset = currentProject.assets.find(({ id }) => id === job.assetId)
      const targetKind =
        job.generationConfig?.targetKind ??
        (sourceAsset?.kind === 'text' || sourceNode?.kind === 'text' || sourceNode?.kind === 'script'
          ? 'text'
          : sourceAsset?.kind === 'audio'
          ? 'audio'
          : sourceAsset?.kind === 'video' || sourceNode?.kind === 'video'
            ? 'video'
            : 'image')
      const config: GenerationConfiguration = job.generationConfig ?? {
        targetKind,
        ...(job.providerId ? { providerId: job.providerId } : {}),
        referenceAssets: sourceAsset && sourceAsset.kind !== 'text'
          ? [{
              url: sourceAsset.url,
              kind: sourceAsset.kind,
              mimeType: sourceAsset.mimeType,
            }]
          : [],
      }
      const fallbackLabel =
        targetKind === 'video'
          ? '视频'
          : targetKind === 'audio'
            ? '音频'
            : targetKind === 'text'
              ? '文本'
              : '图片'
      const label = `${sourceNode?.title ?? fallbackLabel} 重发`
      const count = currentProject.nodes.filter(({ title }) =>
        title.startsWith(label),
      ).length
      const title = count
        ? `${label} ${String(count + 1).padStart(2, '0')}`
        : label
      const versionId = crypto.randomUUID()
      const nodeId = crypto.randomUUID()
      const generationConfig = {
        ...config,
        ...(config.parameters
          ? { parameters: { ...config.parameters } }
          : {}),
        referenceAssets: config.referenceAssets.map((reference) => ({
          ...reference,
        })),
      }
      const creation: CanvasCreation = {
        node: {
          id: nodeId,
          kind:
            config.providerId === frameAnalysisId
              ? 'storyboard'
              : targetKind === 'video'
              ? 'video'
              : targetKind === 'image'
                ? 'image'
                : 'text',
          title,
          position: sourceNode
            ? { x: sourceNode.position.x + 380, y: sourceNode.position.y + 180 }
            : { x: 420, y: 320 },
          versions: [{
            id: versionId,
            createdAt: new Date().toISOString(),
            prompt: job.prompt,
          }],
          activeVersionId: versionId,
          sourceChanged: false,
          ...(generationConfig.providerId
            ? { modelProviderId: generationConfig.providerId }
            : {}),
          generationConfig,
          ...(config.providerId === frameAnalysisId ? { details: {
            type: 'frame-analysis' as const,
            sourceName: '历史视频素材',
            sourceSummary: '已恢复历史配置，请核对后重新分析。',
            dimensions: { storyboard: config.parameters?.storyboard !== false, motion: config.parameters?.motion !== false, music: false },
          } } : {}),
        },
      }
      createCanvasContent(creation)
      createdNodeFocusRef.current = nodeId
      setFocusRequestVersion((version) => version + 1)
      selectOnlyNode(nodeId)
      setWorkspacePanel(undefined)
      setHistoryPlacement(undefined)
      if (isImageAnalysisToolId(config.providerId ?? '') || config.providerId === frameAnalysisId) {
        openAnalysisTool(nodeId, config.providerId!, job.prompt, generationConfig)
        setGenerationFeedback(`已回填“${title}”完整配置，请核对费用后确认。`)
        return
      }
      generationQueue.enqueue({
        projectId: currentProject.id,
        nodeId,
        operation: 'regenerate',
        prompt: job.prompt,
        ...generationConfig,
      })
      setGenerationFeedback(`已回填“${title}”完整配置并重新加入本地队列。`)
    },
    [createCanvasContent, generationQueue, openAnalysisTool, projectId, selectOnlyNode],
  )

  const handlePaneContextMenu = useCallback(
    (event: ReactMouseEvent<Element> | MouseEvent) => {
      event.preventDefault()
      if (imageReferenceTargetId) return
      openContextMenu(
        event.clientX,
        event.clientY,
        undefined,
        viewportRef.current ?? undefined,
      )
    },
    [imageReferenceTargetId, openContextMenu],
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
  const imageReferenceHint = imageReferenceTargetId
    ? '请选择画布中的图片或视频参考'
    : undefined
  const canvasHint =
    connectionFeedback ?? connectionHint ?? imageReferenceHint ?? generationFeedback ??
    groupFeedback ?? visibilityFeedback
  const canvasHintIsConnection = Boolean(
    connectionFeedback || connectionHint || imageReferenceHint,
  )

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
    setSelectedEdgeIds(new Set())
    selectOnlyNode(nodeId)
    setWorkspaceFocusNodeId(nodeId)
  }

  const reorderStoryboardNodes = (sourceNodeId: string, targetNodeId: string) => {
    const currentProject = useProjectStore.getState().activeProject
    if (!currentProject || currentProject.id !== projectId) return
    const sourceIndex = currentProject.nodes.findIndex(({ id }) => id === sourceNodeId)
    const targetIndex = currentProject.nodes.findIndex(({ id }) => id === targetNodeId)
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return
    const orderedNodeIds = currentProject.nodes.map(({ id }) => id)
    const [movedNodeId] = orderedNodeIds.splice(sourceIndex, 1)
    orderedNodeIds.splice(targetIndex, 0, movedNodeId)
    reorderNodes(orderedNodeIds)
  }

  const canvasCenterPosition = () => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!flowInstance || !rect) return { x: 640, y: 360 }
    return flowInstance.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    })
  }

  const insertEffectTemplate = (template: EffectTemplate) => {
    const currentProject = useProjectStore.getState().activeProject
    if (!currentProject || currentProject.id !== projectId) return
    const baseTitle = `${template.name}特效`
    const count = currentProject.nodes.filter(({ title }) => title.startsWith(baseTitle)).length
    const title = count ? `${baseTitle} ${String(count + 1).padStart(2, '0')}` : baseTitle
    const versionId = crypto.randomUUID()
    const creation: CanvasCreation = {
      node: {
        id: crypto.randomUUID(),
        kind: 'storyboard',
        title,
        position: canvasCenterPosition(),
        versions: [{
          id: versionId,
          createdAt: new Date().toISOString(),
          prompt: `特效模板：${template.name}`,
        }],
        activeVersionId: versionId,
        sourceChanged: false,
        effectTool: {
          templateId: template.id,
          effect: template.name,
          intensity: 70,
          color: template.colors[0],
          direction: '径向',
          blendMode: '滤色',
        },
      },
    }
    createCanvasContent(creation)
    selectOnlyNode(creation.node.id)
    createdNodeFocusRef.current = creation.node.id
    setFocusRequestVersion((version) => version + 1)
    setWorkspacePanel(undefined)
    setGenerationFeedback(`已在画布中心添加“${title}”，可继续调整参数。`)
  }

  const insertWorkspaceAsset = (record: WorkspaceAsset) => {
    const currentProject = useProjectStore.getState().activeProject
    if (!currentProject || currentProject.id !== projectId) return
    const creation = buildMediaAssetCreation(
      currentProject,
      {
        id: record.id,
        name: record.name,
        kind: record.kind,
        url: record.url,
        mimeType: record.mimeType,
        createdAt: new Date().toISOString(),
        source: 'project',
        folderId: record.folderId,
        width: record.width,
        height: record.height,
        durationSeconds: record.durationSeconds,
      },
      canvasCenterPosition(),
    )
    const nodeId = creation.node.id
    createCanvasContent(creation)
    selectOnlyNode(nodeId)
    createdNodeFocusRef.current = nodeId
    setFocusRequestVersion((version) => version + 1)
    setWorkspacePanel(undefined)
    setGenerationFeedback(`已将素材“${record.name}”发送到画布。`)
  }

  const insertMaterialReference = (entry: MaterialLibraryEntry) => {
    const currentProject = useProjectStore.getState().activeProject
    if (!currentProject || currentProject.id !== projectId) return
    const prefix = entry.kind === 'style' ? '风格参考' : '特效参考'
    const count = currentProject.nodes.filter(({ title }) => title.startsWith(prefix)).length
    const title = `${prefix} ${String(count + 1).padStart(2, '0')}`
    const versionId = crypto.randomUUID()
    const nodeId = crypto.randomUUID()
    const creation: CanvasCreation = {
      node: {
        id: nodeId,
        kind: 'image',
        title,
        position: canvasCenterPosition(),
        versions: [{
          id: versionId,
          createdAt: new Date().toISOString(),
          prompt: `${entry.name}：${entry.description}`,
        }],
        activeVersionId: versionId,
        sourceChanged: false,
      },
    }
    createCanvasContent(creation)
    selectOnlyNode(nodeId)
    createdNodeFocusRef.current = nodeId
    setFocusRequestVersion((version) => version + 1)
    setWorkspacePanel(undefined)
    setGenerationFeedback(`已添加“${title}”。`)
  }

  const applyCharactersToCanvas = (characters: CharacterProfile[]) => {
    const currentProject = useProjectStore.getState().activeProject
    if (!currentProject || currentProject.id !== projectId || !characters.length) return
    const center = canvasCenterPosition()
    let lastNodeId: string | undefined
    characters.forEach((character, index) => {
      const nodeId = crypto.randomUUID()
      const assetId = crypto.randomUUID()
      const versionId = crypto.randomUUID()
      createCanvasContent({
        node: {
          id: nodeId,
          kind: 'character',
          title: character.name,
          position: { x: center.x + index * 320, y: center.y + index * 36 },
          versions: [{
            id: versionId,
            createdAt: new Date().toISOString(),
            prompt: `${character.position}；${character.tags.join('、')}`,
            assetId,
          }],
          activeVersionId: versionId,
          sourceChanged: false,
        },
        asset: {
          id: assetId,
          kind: 'image',
          url: character.images[0],
          mimeType: 'image/png',
          width: 960,
          height: 1200,
        },
      })
      lastNodeId = nodeId
    })
    if (lastNodeId) {
      selectOnlyNode(lastNodeId)
      createdNodeFocusRef.current = lastNodeId
      setFocusRequestVersion((version) => version + 1)
    }
    setWorkspacePanel(undefined)
    setGenerationFeedback(`已应用 ${characters.length} 个角色到画布。`)
  }

  const insertSubjectReference = useCallback((
    subject: SubjectAsset,
    position = canvasCenterPosition(),
  ) => {
    const currentProject = useProjectStore.getState().activeProject
    if (!currentProject || currentProject.id !== projectId) return
    const nodeId = crypto.randomUUID()
    const assetId = crypto.randomUUID()
    const versionId = crypto.randomUUID()
    createCanvasContent({
      node: {
        id: nodeId,
        kind: 'character',
        title: subject.name,
        position,
        subjectId: subject.id,
        versions: [{
          id: versionId,
          createdAt: new Date().toISOString(),
          prompt: [subject.description, ...subject.tags].filter(Boolean).join('；'),
          assetId,
        }],
        activeVersionId: versionId,
        sourceChanged: false,
      },
      asset: {
        id: assetId,
        kind: 'image',
        url: subject.coverUrl,
        mimeType: 'image/png',
      },
    })
    selectOnlyNode(nodeId)
    createdNodeFocusRef.current = nodeId
    setFocusRequestVersion((version) => version + 1)
    setWorkspacePanel(undefined)
    setGenerationFeedback(`已将主体“${subject.name}”作为引用节点放入画布。`)
  }, [canvasCenterPosition, createCanvasContent, projectId, selectOnlyNode])

  const dropSubjectOnCanvas = useCallback((event: ReactDragEvent) => {
    const subjectId = event.dataTransfer.getData(SUBJECT_DRAG_MIME)
    if (!subjectId || !flowInstance) return
    event.preventDefault()
    const position = flowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })
    void subjectRepository.get(subjectId).then((subject) => {
      if (subject) insertSubjectReference(subject, position)
    })
  }, [flowInstance, insertSubjectReference, subjectRepository])

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

  const restorePublishFocus = () => {
    queueMicrotask(() => {
      viewportRef.current
        ?.closest('.canvas-page')
        ?.querySelector<HTMLButtonElement>('button[aria-label="发布与分享"]')
        ?.focus()
    })
  }

  const openPublishDialog = () => {
    if (!project) return
    setPublishError(undefined)
    setPublishDialogOpen(true)
  }

  const closePublishDialog = () => {
    if (publishBusy) return
    setPublishDialogOpen(false)
    setPublishError(undefined)
    restorePublishFocus()
  }

  const publishWork = async (value: PublishWorkFormValue) => {
    const currentProject = useProjectStore.getState().activeProject
    if (!currentProject || currentProject.id !== projectId) return
    setPublishBusy(true)
    setPublishError(undefined)
    try {
      const timeline =
        (await timelineRepository.load(currentProject.id)) ??
        createTimelineProject(currentProject)
      const measurements =
        nodeMeasurements.projectId === currentProject.id
          ? nodeMeasurements.measurements
          : {}
      const work = await communityRepository.publish(currentProject, timeline, {
        ...value,
        author: '本地创作者',
        workflowSnapshot: createWorkflowSnapshot(currentProject),
        canvasSnapshotUrl: createCanvasSnapshotDataUrl(currentProject, measurements),
      })
      setPublishedWorkId(work.id)
      setPublishDialogOpen(false)
      setGenerationFeedback(`“${work.title}”已发布到本地作品页。`)
      restorePublishFocus()
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : '本地发布失败，请重试。')
    } finally {
      setPublishBusy(false)
    }
  }

  const copyShareLink = async () => {
    if (!publishedWorkId) {
      setGenerationFeedback('请先完成本地发布，再复制分享链接。')
      openPublishDialog()
      return
    }
    try {
      await copyPublishedWorkShareLink(publishedWorkId)
      setGenerationFeedback('分享链接已复制。本地演示，未发布到云端。')
    } catch {
      setGenerationFeedback('复制失败，请检查浏览器剪贴板权限。')
    }
  }

  const closeCanvasExport = () => {
    setCanvasExportSession(undefined)
    restorePublishFocus()
  }

  const openCanvasExport = () => {
    if (!project) return
    const flowElement = viewportRef.current?.querySelector<HTMLElement>('.react-flow')
    const rect = flowElement?.getBoundingClientRect()
    const viewport = flowInstance?.getViewport?.() ?? { x: 0, y: 0, zoom: 1 }
    const viewportSnapshot = {
      ...viewport,
      width: rect?.width || viewportRef.current?.clientWidth || 1280,
      height: rect?.height || viewportRef.current?.clientHeight || 720,
    }
    const measurements =
      nodeMeasurements.projectId === project.id
        ? nodeMeasurements.measurements
        : {}
    setCanvasExportSession({
      viewport: estimateCanvasExport(
        project,
        'viewport',
        viewportSnapshot,
        measurements,
      ),
      all: estimateCanvasExport(
        project,
        'all',
        viewportSnapshot,
        measurements,
      ),
    })
  }

  const exportCanvas = async (
    format: CanvasExportFormat,
    scope: CanvasExportScope,
  ) => {
    const currentProject = useProjectStore.getState().activeProject
    if (!currentProject || currentProject.id !== projectId || !canvasExportSession) {
      return
    }
    const estimate =
      scope === 'viewport' ? canvasExportSession.viewport : canvasExportSession.all
    const measurements =
      nodeMeasurements.projectId === currentProject.id
        ? nodeMeasurements.measurements
        : {}
    const svg = renderCanvasSvg(currentProject, estimate, measurements)
    try {
      const blob =
        format === 'svg'
          ? new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
          : await rasterizeCanvasSvg(svg, estimate.width, estimate.height)
      downloadBlob(
        blob,
        buildCanvasExportFilename(currentProject.title, scope, format),
      )
      setGenerationFeedback(
        `已导出${scope === 'viewport' ? '当前视口' : '全画布'} ${format.toUpperCase()}（${estimate.width} × ${estimate.height}）。`,
      )
      closeCanvasExport()
    } catch (error) {
      setGenerationFeedback(
        error instanceof Error ? error.message : '画布导出失败，请重试。',
      )
    }
  }

  const exportWorkflow = () => {
    const currentProject = useProjectStore.getState().activeProject
    if (!currentProject || currentProject.id !== projectId) return
    const now = new Date()
    const snapshot = createWorkflowSnapshot(currentProject, now)
    downloadBlob(
      new Blob([JSON.stringify(snapshot, null, 2)], {
        type: 'application/json;charset=utf-8',
      }),
      buildWorkflowFilename(currentProject.title, now),
    )
    setGenerationFeedback(
      `已导出完整工作流 JSON：${currentProject.nodes.length} 个节点、${currentProject.edges.length} 条连线。`,
    )
  }

  const openWorkflowImport = () => {
    if (workflowImportInputRef.current) {
      workflowImportInputRef.current.value = ''
      workflowImportInputRef.current.click()
    }
  }

  const readWorkflowFile = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('工作流文件不是文本格式'))
      reader.onerror = () => reject(new Error('工作流文件读取失败'))
      reader.readAsText(file)
    })

  const handleWorkflowImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    const currentProject = useProjectStore.getState().activeProject
    if (!file || !currentProject || currentProject.id !== projectId) return
    try {
      const json = await readWorkflowFile(file)
      setWorkflowImportSession({
        fileName: file.name,
        result: parseWorkflowImport(json, currentProject),
      })
    } catch (error) {
      setWorkflowImportSession({
        fileName: file.name,
        result: {
          valid: false,
          errors: [error instanceof Error ? error.message : '工作流文件读取失败'],
          titleConflicts: [],
          missingReferences: [],
        },
      })
    }
  }

  const closeWorkflowImport = () => {
    setWorkflowImportSession(undefined)
    if (workflowImportInputRef.current) workflowImportInputRef.current.value = ''
    restorePublishFocus()
  }

  const confirmWorkflowImport = () => {
    if (!workflowImportSession?.result.valid || !workflowImportSession.result.snapshot) {
      return
    }
    const payload = prepareWorkflowMerge(workflowImportSession.result.snapshot)
    if (!mergeCanvasWorkflow(payload)) {
      setGenerationFeedback('工作流与当前画布发生 ID 冲突，未执行导入。')
      return
    }
    setSelectedNodeIds(new Set(payload.nodes.map((node) => node.id)))
    setPrimaryNodeId(payload.nodes.at(-1)?.id)
    setGenerationFeedback(
      `已合并 ${payload.nodes.length} 个节点和 ${payload.edges.length} 条连线，可使用撤销恢复。`,
    )
    closeWorkflowImport()
  }

  return (
    <main
      className={`canvas-page${agentOpen ? ' canvas-page--agent-open' : ''}${
        activeTool === 'hand' ? ' canvas-page--hand-tool' : ''
      }`}
    >
      <CanvasTopBar
        projectId={project?.id}
        projectTitle={project?.title ?? '项目画布'}
        saveStatus={saveStatus}
        canUndo={Boolean(project) && canUndo}
        canRedo={Boolean(project) && canRedo}
        mode={workspaceMode}
        agentOpen={agentOpen}
        generationJobs={project?.jobs}
        creditBalance={Math.max(
          0,
          120 -
            (project?.jobs.reduce(
              (total, job) => total + (job.creditsSpent ?? 0),
              0,
            ) ?? 0),
        )}
        onUndo={undo}
        onRedo={redo}
        onRenameProject={renameProject}
        canvases={project?.canvases}
        activeCanvasId={project?.activeCanvasId}
        onCreateCanvas={() => {
          const createdId = createCanvas()
          if (createdId) setGenerationFeedback('已新建并切换到空画布。')
        }}
        onRenameCanvas={(canvasId, title) => renameCanvas(canvasId, title)}
        onSwitchCanvas={(canvasId) => {
          if (switchCanvas(canvasId)) setGenerationFeedback('已切换画布，节点、连线与视口已恢复。')
        }}
        onDeleteCanvas={(canvasId) => {
          if (deleteCanvas(canvasId)) setGenerationFeedback('已删除画布并保留其他画布。')
        }}
        onOpenNodeList={openNodeList}
        onModeChange={changeWorkspaceMode}
        onToggleAgent={() => setAgentOpen((open) => !open)}
        onOpenPublish={openPublishDialog}
        onCopyShareLink={() => void copyShareLink()}
        onOpenCanvasExport={openCanvasExport}
        onExportWorkflow={exportWorkflow}
        onImportWorkflow={openWorkflowImport}
      />
      <input
        ref={workflowImportInputRef}
        className="canvas-workflow-import-input"
        type="file"
        accept="application/json,.json"
        aria-label="导入工作流 JSON 文件"
        onChange={(event) => void handleWorkflowImport(event)}
      />
      <CanvasProjectDialogs
        canvasExport={canvasExportSession && project ? { projectTitle: project.title,
          viewportEstimate: canvasExportSession.viewport, allEstimate: canvasExportSession.all,
          onClose: closeCanvasExport, onExport: (format, scope) => void exportCanvas(format, scope),
        } : undefined}
        workflowImport={workflowImportSession ? { fileName: workflowImportSession.fileName, result: workflowImportSession.result,
          onClose: closeWorkflowImport, onConfirm: confirmWorkflowImport,
        } : undefined}
        publication={publishDialogOpen && project ? { projectTitle: project.title, coverOptions: publishCoverOptions,
          busy: publishBusy, error: publishError, onClose: closePublishDialog, onSubmit: (value) => void publishWork(value),
        } : undefined}
        subject={pendingSubjectCreation && project?.id === pendingSubjectCreation.projectId && project.activeCanvasId === pendingSubjectCreation.canvasId ? {
          sourceTitle: pendingSubjectCreation.sourceTitle, coverUrl: pendingSubjectCreation.asset.url,
          busy: subjectCreationBusy, error: subjectCreationError, onExtract: extractSubject,
          extractionDisabledReason: subjectExtractionProvider?.disabledReason ?? (!subjectExtractionProvider ? subjectExtractionUnavailable : undefined),
          extractionNotice: `自动发送图片至豆包生成主体草稿；按token计费（输入${subjectExtractionProvider?.tokenPricing?.inputPerMillionCny ?? 6}元/百万，输出${subjectExtractionProvider?.tokenPricing?.outputPerMillionCny ?? 30}元/百万），保存前请核对。取消等待不保证免除已产生的费用。`,
          onCancel: closeSubjectCreation, onSubmit: saveSubject,
        } : undefined} />
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
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
          onEdgesChange={handleEdgesChange}
          isValidConnection={isValidConnection}
          onConnect={handleConnect}
          onConnectStart={handleConnectStart}
          onConnectEnd={handleConnectEnd}
          onPaneClick={handlePaneClick}
          onPaneContextMenu={handlePaneContextMenu}
          onNodeContextMenu={handleNodeContextMenu}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes(SUBJECT_DRAG_MIME)) {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
            }
          }}
          onDrop={dropSubjectOnCanvas}
          onEdgeClick={(event, edge) => {
            setSelectedEdgeIds((current) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) {
                const next = new Set(current)
                if (next.has(edge.id)) next.delete(edge.id)
                else next.add(edge.id)
                return next
              }
              return new Set([edge.id])
            })
          }}
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
            setSelectedEdgeIds(new Set())
            handleNodeSelection(node.id)
          }}
          onInit={setFlowInstance}
          onMove={(_event, viewport) => setZoomPercent(viewport.zoom * 100)}
          onMoveEnd={(_event, viewport) => updateCanvasViewport(viewport)}
          nodesConnectable={!imageReferenceTargetId}
          fitView
          fitViewOptions={{ padding: 0.16 }}
          zoomOnScroll
          panOnScroll={false}
          panOnDrag={activeTool === 'hand' ? true : [1, 2]}
          panActivationKeyCode="Space"
          nodesDraggable={activeTool !== 'hand'}
          selectionOnDrag={activeTool !== 'hand'}
          zoomOnDoubleClick={false}
          edgesFocusable
          deleteKeyCode={null}
          minZoom={0.35}
          maxZoom={1.8}
          snapToGrid={snapToGrid}
          snapGrid={[24, 24]}
        >
          <Background gap={24} size={1} color="rgba(255,255,255,0.1)" />
          <Controls showInteractive={false} position="top-right" />
          {minimapVisible ? <MiniMap aria-label="画布小地图" pannable zoomable /> : null}
          <ViewportPortal>
            {selectionGroupOverlay ? (
              <CanvasGroupOverlay
                key={selectionGroupOverlay.group.nodeIds.join(':')}
                group={selectionGroupOverlay.group}
                bounds={selectionGroupOverlay.bounds}
                selected
                temporary
                onSelect={() => selectCanvasGroup(selectionGroupOverlay.group)}
                onUngroup={handleGroupAction}
                onGroup={handleGroupAction}
                onArrange={(mode) =>
                  arrangeCanvasGroup(selectionGroupOverlay.group, mode)
                }
                onDuplicate={() =>
                  duplicateCanvasGroup(selectionGroupOverlay.group)
                }
                onExecute={() => startWorkflowBatch(selectionGroupOverlay.group)}
                onConfigureStoryboard={() =>
                  openStoryboardSetup(selectionGroupOverlay.group, true)
                }
                onFeedback={setGroupFeedback}
                onExportStoryboard={() =>
                  exportStoryboardGroup4K(selectionGroupOverlay.group)
                }
                onContinue={(trigger) => {
                  const triggerBounds = trigger.getBoundingClientRect()
                  const point = canvasPoint(
                    triggerBounds.left + triggerBounds.width / 2,
                    triggerBounds.top + triggerBounds.height / 2,
                  )
                  if (point) openNodeTypePicker(point, trigger, 'add')
                }}
              />
            ) : null}
            {canvasGroupOverlays.map(({ group, bounds }) => (
              <CanvasGroupOverlay
                key={group.id}
                group={group}
                bounds={bounds}
                selected={selectedCanvasGroup?.id === group.id}
                onSelect={() => selectCanvasGroup(group)}
                onUngroup={() => removeCanvasGroup(group.id, true)}
                onArrange={(mode) => arrangeCanvasGroup(group, mode)}
                onDuplicate={() => duplicateCanvasGroup(group)}
                onExecute={() => startWorkflowBatch(group)}
                onConfigureStoryboard={() => openStoryboardSetup(group)}
                onUpdateStoryboardCaption={(nodeId, caption) =>
                  updateStoryboardCaption(group, nodeId, caption)
                }
                storyboardItems={storyboardItemsFor(group)}
                onFeedback={setGroupFeedback}
                onExportStoryboard={() => exportStoryboardGroup4K(group)}
                onContinue={(trigger) => {
                  const triggerBounds = trigger.getBoundingClientRect()
                  const point = canvasPoint(
                    triggerBounds.left + triggerBounds.width / 2,
                    triggerBounds.top + triggerBounds.height / 2,
                  )
                  if (point) openNodeTypePicker(point, trigger, 'add')
                }}
              />
            ))}
          </ViewportPortal>
        </ReactFlow>
        <CanvasWorkflowTools
          empty={project?.nodes.length === 0 && !nodeTypePicker && !pendingPlacement && !contextMenu && !editingCard
            ? { disabled: !flowInstance, onSelect: createStarterNode } : undefined}
          toolbar={{ activeTool, connectionsVisible, disabled: !project,
            draftOpen: Boolean(pendingPlacement || nodeTypePicker || editingCard),
            groupAction: selectedCanvasGroup ? 'ungroup' : selectedNodeIds.size >= 2 ? 'group' : 'disabled',
            onGroupAction: handleGroupAction, onAddNode: openNodeTypePickerFromDock,
            onOpenPanel: (panel) => { setHistoryPlacement(undefined); setWorkspacePanel(panel) },
            onToggleConnections: toggleConnectionsVisibility, onToolChange: handleToolChange,
          }} />
        {contextMenu && project ? (
          <CanvasContextMenu
            anchor={contextMenu.anchor}
            bounds={contextMenu.bounds}
            targetNodeTitle={
              contextMenu.targetNodeId ? contextNode?.title : undefined
            }
            canUndo={canUndo}
            canRedo={canRedo}
            canPaste={Boolean(canvasClipboard?.projectId === project.id)}
            canSaveToAssets={Boolean(
              contextNode && contextNodeAsset,
            )}
            canCreateSubject={contextNodeAsset?.kind === 'image'}
            canExecuteGroup={Boolean(project.nodes.some(isWorkflowGeneratableNode))}
            onUpload={beginContextUpload}
            onAddNode={createContextNode}
            onUndo={() => {
              setContextMenu(undefined)
              undo()
            }}
            onRedo={() => {
              setContextMenu(undefined)
              redo()
            }}
            onPaste={pasteContextNodes}
            onSaveToAssets={saveContextAssetToLibrary}
            onExecuteGroup={() =>
              startWorkflowBatch(selectedCanvasGroup ?? selectionGroupOverlay?.group)
            }
            onComplianceCheck={() => {
              setContextMenu(undefined)
              if (contextNode) {
                setGenerationFeedback(`“${contextNode.title}”已通过本地演示合规校验。`)
              }
            }}
            onCreateSubject={createSubjectFromContextNode}
            onCopyNode={copyContextNode}
            onDuplicateNode={duplicateContextNode}
            onCopyToClipboard={copyContextNodeToSystemClipboard}
            onDeleteNode={contextMenu.targetNodeId ? () => {
              const targetNodeId = contextMenu.targetNodeId
              const focusReturnTarget =
                contextMenu.returnFocusTo ?? viewportRef.current
              setContextMenu(undefined)
              if (targetNodeId && focusReturnTarget) {
                requestDelete(targetNodeId, focusReturnTarget)
              }
            } : undefined}
            onClose={closeContextMenu}
          />
        ) : null}
        <CanvasWorkflowBatchStatus batch={workflowBatch} onRetry={retryWorkflowBatch} onDismiss={() => setWorkflowBatch(undefined)} />
        {storyboardSetup ? (
          <StoryboardGroupDialog
            title={storyboardSetup.group.title}
            nodeCount={storyboardSetup.group.nodeIds.length}
            initialLayout={storyboardSetup.group.storyboardLayout}
            onApply={applyStoryboardSetup}
            onClose={() => setStoryboardSetup(undefined)}
          />
        ) : null}
        <input
          ref={contextUploadInputRef}
          className="canvas-context-upload-input"
          type="file"
          accept="image/*,video/*,audio/*"
          aria-label="上传画布素材"
          onChange={(event) => void handleContextUpload(event)}
        />
        {nodeTypePicker && project ? (
          <CanvasNodeTypePicker
            anchor={nodeTypePicker.anchor}
            bounds={nodeTypePicker.bounds}
            mode={nodeTypePicker.mode}
            sourceTitle={project.nodes.find(({ id }) => id === nodeTypePicker.sourceNodeId)?.title}
            canUseGenerationHistory={canUseGenerationHistory}
            onClose={closeNodeTypePicker}
            onSelect={createQuickNode}
            onUpload={beginPickerUpload}
            onOpenGenerationHistory={openPickerGenerationHistory}
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
        {project ? (
          <SelectionContextBar
            project={project}
            providerRegistry={providerRegistry}
            onOpenAnalysisTool={openAnalysisTool}
            node={selectedWorkspaceNode}
            onEditImage={(nodeId, operation) => {
              const asset = activeNodeAsset(project, nodeId)
              if (asset?.kind === 'image') setImageEditSession({ nodeId, operation, asset, projectId: project.id })
            }}
            onCreateToolNode={(tool) => {
              if (primaryNodeId) createImageToolNode(primaryNodeId, tool)
            }}
            onCreateVideoToolNode={(tool) => {
              if (primaryNodeId) createVideoToolNode(primaryNodeId, tool)
            }}
            onProcessVideo={(nodeId, options) => processVideoNode(nodeId, options)}
            onExtractVideoAudio={(nodeId) => extractVideoAudio(nodeId)}
            videoContinueDisabledReason={videoContinueProvider ? videoContinueProvider.disabledReason : '视频续写服务尚未注册。'}
            onContinueVideo={(nodeId) => {
              const asset = activeNodeAsset(project, nodeId)
              if (asset?.kind === 'video') setVideoContinueSession({ nodeId, asset, projectId: project.id })
            }}
            onRotateImage={rotateImageNode}
            onMirrorImage={(nodeId, axis) => mirrorImage(nodeId, axis)}
            onSplitImage={(nodeId, grid, group) => splitImageNode(nodeId, grid, group)}
            onSaveImageAnnotations={(nodeId, annotations) =>
              saveImageAnnotations(nodeId, annotations)
            }
          />
        ) : null}
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
        <CanvasNodeEditors project={project} pendingPlacement={pendingPlacement} editingCard={editingCard}
          libraryRepository={libraryRepository} cancelPlacement={cancelPlacement} submitPlacement={submitPlacement}
          submitCardPlacement={submitCardPlacement} cancelCardEditing={cancelCardEditing} submitCardEdit={submitCardEdit} />
        </div>
        <CanvasWorkspacePanels project={project} mode={workspaceMode} panel={workspacePanel}
          agentOpen={agentOpen} selectedNodeId={primaryNodeId} commentNode={commentNode}
          collaborationRepository={collaborationRepository}
          storyboard={{ onOpenNode: openWorkspaceNode, onReorderNodes: reorderStoryboardNodes,
            onUpdateDialogue: (nodeId, dialogue) => updateNode(nodeId, { storyboardDialogue: dialogue }),
          }}
          resources={{ assetRepository: workspaceAssetRepository, subjectRepository, generationPreferenceStore,
            historyInsertionMode: Boolean(historyPlacement), onClose: closeWorkspacePanel,
            onApplyCharacters: applyCharactersToCanvas, onApplySubject: insertSubjectReference,
            onDeleteHistoryJobs: deleteHistoryJobs, onInsertAsset: insertWorkspaceAsset,
            onRemoveProjectAsset: removeAssetReferences, onInsertEffect: insertEffectTemplate,
            onInsertMaterial: insertMaterialReference, onInsertHistoryResult: useHistoryResult,
            onResendHistoryJob: resendHistoryJob, onSelectNode: openWorkspaceNode,
          }}
          agent={{ onClose: closeAgent, onExecute: handleDirectorCommand }} />
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
          onAction={(nodeId, action) => {
            const focusReturnTarget =
              findCanvasNodeControl(viewportRef.current, nodeId) ??
              viewportRef.current ??
              undefined
            setNodeListOpen(false)
            handleAction(nodeId, action, focusReturnTarget)
          }}
          onClose={closeNodeList}
        />
      ) : null}
      <CanvasGenerationDialogs project={project} providerRegistry={providerRegistry}
        deletion={deleteCandidate ? { node: deleteCandidate, consumers, onCancel: cancelDelete, onConfirm: confirmDelete } : undefined}
        analysis={{ session: analysisSession, onSubmit: submitAnalysis, onImportFile: importAnalysisAsset, onClose: () => setAnalysisSession(undefined) }}
        imageEdit={{ session: imageEditSession, onSubmit: submitImageEdit, onClose: () => setImageEditSession(undefined) }}
        videoContinue={{ session: videoContinueSession, provider: videoContinueProvider, onSubmit: submitVideoContinue, onClose: () => setVideoContinueSession(undefined) }}
        remote={pendingRemoteGeneration ? { request: pendingRemoteGeneration.request, selection: pendingRemoteGeneration.selection,
          returnFocusTo: pendingRemoteGeneration.returnFocusTo, onCancel: () => setPendingRemoteGeneration(undefined), onConfirm: confirmRemoteGeneration,
        } : undefined} />
    </main>
  )
}
