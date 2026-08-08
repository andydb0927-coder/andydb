import {
  Background,
  Controls,
  ReactFlow,
  type Connection,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

import { DirectorComposer } from '../director/DirectorComposer'
import type { DirectorCommand } from '../director/director-command'
import { DemoGenerationAdapter } from '../generation/demo-generation-adapter'
import { GenerationQueue } from '../generation/generation-queue'
import type { Project } from '../project/model'
import { ProjectRepository } from '../project/project-repository'
import { useProjectStore } from '../project/project-store'
import { CanvasToolbar } from './CanvasToolbar'
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
import '../../styles/global.css'

type CanvasRepository = Pick<ProjectRepository, 'load'>
type CanvasLoadState = 'loading' | 'ready' | 'not-found' | 'error'

const defaultRepository = new ProjectRepository()

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
  const activeProject = useProjectStore((state) => state.activeProject)
  const project =
    activeProject?.id === projectId ? activeProject : undefined
  const saveStatus = useProjectStore((state) => state.saveStatus)
  const canUndo = useProjectStore((state) => state.past.length > 0)
  const canRedo = useProjectStore((state) => state.future.length > 0)
  const undo = useProjectStore((state) => state.undo)
  const redo = useProjectStore((state) => state.redo)
  const connectNodes = useProjectStore((state) => state.connectNodes)
  const updateNodePositions = useProjectStore(
    (state) => state.updateNodePositions,
  )
  const deleteNode = useProjectStore((state) => state.deleteNode)
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [primaryNodeId, setPrimaryNodeId] = useState<string>()
  const [nodeListOpen, setNodeListOpen] = useState(false)
  const [deleteCandidateId, setDeleteCandidateId] = useState<string>()
  const [loadState, setLoadState] = useState<CanvasLoadState>(() =>
    project ? 'ready' : 'loading',
  )
  const [loadAttempt, setLoadAttempt] = useState(0)
  const deleteTriggerRef = useRef<HTMLButtonElement>(undefined)
  const nodeListTriggerRef = useRef<HTMLButtonElement>(null)
  const nodeListSelectionMadeRef = useRef(false)

  const selectOnlyNode = useCallback((nodeId: string) => {
    setSelectedNodeIds(new Set([nodeId]))
    setPrimaryNodeId(nodeId)
  }, [])

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
    return () => generationQueue.dispose()
  }, [generationQueue])

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

  const handleDirectorCommand = useCallback(
    (command: Exclude<DirectorCommand, { type: 'unknown' }>) => {
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
          deleteNode(command.nodeId)
          removeSelectedNode(command.nodeId)
      }
    },
    [deleteNode, handleAction, removeSelectedNode],
  )

  const requestDelete = useCallback(
    (nodeId: string, trigger: HTMLButtonElement) => {
      if (!project) return
      const consumers = downstreamConsumers(project, nodeId)
      if (consumers.length === 0) {
        deleteNode(nodeId)
        removeSelectedNode(nodeId)
        return
      }
      deleteTriggerRef.current = trigger
      setDeleteCandidateId(nodeId)
    },
    [deleteNode, project, removeSelectedNode],
  )

  const flowNodes = useMemo<CreativeFlowNode[]>(() => {
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
      const positions = changes.flatMap((change) =>
        change.type === 'position' &&
        change.position !== undefined &&
        change.dragging !== true
          ? [{ nodeId: change.id, position: change.position }]
          : [],
      )
      if (positions.length > 0) updateNodePositions(positions)

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
    [selectedNodeIds, updateNodePositions],
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
        className="canvas-page__viewport"
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
          onNodeClick={(_event, node) => selectOnlyNode(node.id)}
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
        <CanvasToolbar />
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
