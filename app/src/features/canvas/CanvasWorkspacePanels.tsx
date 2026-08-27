import type { ComponentProps } from 'react'
import type { Project } from '../project/model'
import { DirectorComposer } from '../director/DirectorComposer'
import { CollaborationCommentsPanel } from '../collaboration/CollaborationCommentsPanel'
import { CanvasAgentPanel, CanvasStoryboardView, WorkspaceSidePanel, type WorkspaceMode, type WorkspacePanel } from './CanvasWorkspace'

interface CanvasWorkspacePanelsProps {
  project?: Project
  mode: WorkspaceMode
  panel?: WorkspacePanel
  agentOpen: boolean
  selectedNodeId?: string
  commentNode?: Project['nodes'][number]
  storyboard: Omit<ComponentProps<typeof CanvasStoryboardView>, 'project'>
  resources: Omit<ComponentProps<typeof WorkspaceSidePanel>, 'project' | 'panel'>
  agent: Pick<ComponentProps<typeof DirectorComposer>, 'onExecute'> & { onClose(): void }
  collaborationRepository: ComponentProps<typeof CollaborationCommentsPanel>['repository']
}

export function CanvasWorkspacePanels({ project, mode, panel, agentOpen, selectedNodeId, commentNode,
  storyboard, resources, agent, collaborationRepository,
}: CanvasWorkspacePanelsProps) {
  if (!project) return null
  return <>
    {mode === 'storyboard' ? <CanvasStoryboardView key={project.id} project={project} {...storyboard} /> : null}
    {panel ? <WorkspaceSidePanel project={project} panel={panel} {...resources} /> : null}
    {agentOpen ? <CanvasAgentPanel onClose={agent.onClose}>
      <DirectorComposer selectedNodeId={selectedNodeId} projectTitle={project.title}
        selectedNodeTitle={project.nodes.find(({ id }) => id === selectedNodeId)?.title}
        assetNames={[...new Set(project.assets.map((asset, index) =>
          project.nodes.find(node => node.versions.some(({ assetId }) => assetId === asset.id))?.title ?? `项目资源 ${index + 1}`,
        ))]} onExecute={agent.onExecute} />
    </CanvasAgentPanel> : null}
    {commentNode && mode === 'workflow' ? <CollaborationCommentsPanel projectId={project.id} targetType="node"
      targetId={commentNode.id} targetLabel={commentNode.title} repository={collaborationRepository} variant="floating" /> : null}
  </>
}
