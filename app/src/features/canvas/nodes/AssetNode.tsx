import {
  Handle,
  Position,
  type NodeProps,
} from '@xyflow/react'
import {
  Clapperboard,
  Film,
  Image,
  MonitorPlay,
  RefreshCw,
  ScanLine,
  Trash2,
  UserRound,
} from 'lucide-react'

import { StatusText } from '../../../ui/StatusText'
import type { CreativeFlowNode, CreativeNodeData } from '../node-types'

const kindCopy = {
  character: '角色',
  scene: '场景',
  storyboard: '分镜',
  video: '视频',
  preview: '预览',
} as const

const statusCopy = {
  queued: '排队中',
  running: '生成中',
  succeeded: '已完成',
  failed: '生成失败',
  cancelled: '已取消',
} as const

const kindIcons = {
  character: UserRound,
  scene: Image,
  storyboard: Clapperboard,
  video: Film,
  preview: MonitorPlay,
}

function NodeActions({ data }: { data: CreativeNodeData }) {
  return (
    <div
      className="creative-node-actions nodrag"
      aria-label={`${data.node.title}操作`}
      data-placement={data.actionsPlacement}
    >
      <button type="button" onClick={() => data.onAction('regenerate')}>
        <RefreshCw aria-hidden="true" />
        重生成
      </button>
      <button type="button" onClick={() => data.onAction('extend-shot')}>
        <ScanLine aria-hidden="true" />
        扩展镜头
      </button>
      <button type="button" onClick={() => data.onAction('generate-video')}>
        <Film aria-hidden="true" />
        生成视频
      </button>
      <button type="button" onClick={() => data.onAction('add-to-timeline')}>
        <Clapperboard aria-hidden="true" />
        加入时间线
      </button>
      <button
        type="button"
        className="creative-node-actions__danger"
        aria-label="删除节点"
        onClick={(event) => data.onDelete(event.currentTarget)}
      >
        <Trash2 aria-hidden="true" />
        删除
      </button>
    </div>
  )
}

export function CreativeNodeShell({ data }: { data: CreativeNodeData }) {
  const { node, asset, job, selected, contextual } = data
  const KindIcon = kindIcons[node.kind]
  const activeVersion = node.versions.find(
    (version) => version.id === node.activeVersionId,
  )

  return (
    <div className="creative-node-layout">
      <article
        className={`creative-node creative-node--${node.kind}${
          selected ? ' creative-node--selected' : ''
        }${node.sourceChanged ? ' creative-node--changed' : ''}`}
      >
        <Handle type="target" position={Position.Left} />
        <button
          type="button"
          className="creative-node__select"
          aria-label={node.title}
          data-canvas-node-id={node.id}
          onClick={data.onSelect}
        >
          <span className="creative-node__heading">
            <span className="creative-node__kind">
              <KindIcon aria-hidden="true" />
              {kindCopy[node.kind]}
            </span>
            <strong>{node.title}</strong>
          </span>
          {asset ? (
            <img src={asset.url} alt="" className="creative-node__media" />
          ) : null}
          <span className="creative-node__prompt">
            {activeVersion?.prompt ?? '尚未生成内容'}
          </span>
          {node.sourceChanged ? (
            <StatusText status="offline">上游来源已变更</StatusText>
          ) : job ? (
            <StatusText status={job.status === 'cancelled' ? 'idle' : job.status}>
              {statusCopy[job.status]}
            </StatusText>
          ) : (
            <StatusText status="idle">就绪</StatusText>
          )}
        </button>
        <Handle type="source" position={Position.Right} />
      </article>
      {contextual ? <NodeActions data={data} /> : null}
    </div>
  )
}

export function AssetNode({ data }: NodeProps<CreativeFlowNode>) {
  return <CreativeNodeShell data={data} />
}
