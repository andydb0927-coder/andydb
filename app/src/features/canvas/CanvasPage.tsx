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

import type { Project } from '../project/model'
import { ProjectRepository } from '../project/project-repository'
import { useProjectStore } from '../project/project-store'
import { CanvasToolbar } from './CanvasToolbar'
import { CanvasTopBar } from './CanvasTopBar'
import { DependencyImpactDialog } from './DependencyImpactDialog'
import { edgeTypes, type DependencyFlowEdge } from './edge-types'
import {
  nodeTypes,
  type CreativeFlowNode,
  type CreativeNodeAction,
} from './node-types'
import { NodeListView } from './NodeListView'
import '../../styles/global.css'

type CanvasRepository = Pick<ProjectRepository, 'load'>

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
  const project = useProjectStore((state) => state.activeProject)
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
  const [selectedNodeId, setSelectedNodeId] = useState<string>()
  const [nodeListOpen, setNodeListOpen] = useState(false)
  const [deleteCandidateId, setDeleteCandidateId] = useState<string>()
  const deleteTriggerRef = useRef<HTMLButtonElement>(undefined)

  useEffect(() => {
    if (!projectId || project?.id === projectId) return

    const abortController = new AbortController()
    void useProjectStore
      .getState()
      .hydrate(projectId, repository, abortController.signal)

    return () => abortController.abort()
  }, [project?.id, projectId, repository])

  const handleAction = useCallback(
    (_nodeId: string, _action: CreativeNodeAction) => {
      // Generation and timeline mutations are intentionally handed to Task 6.
    },
    [],
  )

  const requestDelete = useCallback(
    (nodeId: string, trigger: HTMLButtonElement) => {
      if (!project) return
      const consumers = downstreamConsumers(project, nodeId)
      if (consumers.length === 0) {
        deleteNode(nodeId)
        setSelectedNodeId(undefined)
        return
      }
      deleteTriggerRef.current = trigger
      setDeleteCandidateId(nodeId)
    },
    [deleteNode, project],
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
      const job = project.jobs.find((candidate) => candidate.nodeId === node.id)
      const selected = node.id === selectedNodeId

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
          actionsPlacement:
            node.position.x === rightmostX ? 'before' : 'after',
          onSelect: () => setSelectedNodeId(node.id),
          onDelete: (trigger) => requestDelete(node.id, trigger),
          onAction: (action) => handleAction(node.id, action),
        },
      }
    })
  }, [handleAction, project, requestDelete, selectedNodeId])

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

      const selection = changes.find(
        (change) => change.type === 'select' && change.selected,
      )
      if (selection?.type === 'select') setSelectedNodeId(selection.id)
    },
    [updateNodePositions],
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

  const closeNodeList = useCallback(() => {
    setNodeListOpen(false)
    const nodeId = selectedNodeId
    queueMicrotask(() => {
      if (!nodeId) return
      const candidate = document.querySelector<HTMLElement>(
        `[data-canvas-node-id="${nodeId}"]`,
      )
      candidate?.focus()
    })
  }, [selectedNodeId])

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
    setSelectedNodeId(undefined)
  }

  return (
    <main className="canvas-page">
      <CanvasTopBar
        projectId={project?.id}
        projectTitle={project?.title ?? '项目画布'}
        saveStatus={saveStatus}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onOpenNodeList={() => setNodeListOpen(true)}
      />
      <div className="canvas-page__viewport">
        <ReactFlow<CreativeFlowNode, DependencyFlowEdge>
          aria-label="项目画布"
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onConnect={handleConnect}
          onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
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
      </div>
      {nodeListOpen && project ? (
        <NodeListView
          nodes={project.nodes}
          edges={project.edges}
          timeline={project.timeline}
          jobs={project.jobs}
          selectedNodeId={selectedNodeId}
          onSelect={setSelectedNodeId}
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
