import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, ListChecks, Play, RefreshCw, Square } from 'lucide-react'
import { Link } from 'react-router-dom'

import { canUseFeature, type MembershipPlanId } from '../membership/membership-model'

import {
  workflowProgress,
  type WorkflowExecutionMode,
  type WorkflowRun,
  type WorkflowStatus,
} from './workflow-model'

const statusCopy: Record<WorkflowStatus, string> = {
  pending: '等待中',
  running: '运行中',
  succeeded: '已成功',
  failed: '已失败',
  cancelled: '已取消',
}

export interface WorkflowRunPanelProps {
  selectedCount: number
  runs: WorkflowRun[]
  onCreate(mode: WorkflowExecutionMode): void
  onCancel(runId: string): void
  onRetryNode(runId: string, nodeRunId: string): void
  membershipPlan?: MembershipPlanId
}

export function WorkflowRunPanel({
  selectedCount,
  runs,
  onCreate,
  onCancel,
  onRetryNode,
  membershipPlan = 'professional',
}: WorkflowRunPanelProps) {
  const [mode, setMode] = useState<WorkflowExecutionMode>('serial')
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 800,
  )
  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)')
    const update = () => setCollapsed(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const orderedRuns = [...runs].sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) ||
      right.createdAt.localeCompare(left.createdAt) ||
      right.id.localeCompare(left.id),
  )
  const batchRequested = selectedCount > 1 || mode === 'parallel'
  const upgradeRequired = batchRequested && !canUseFeature(membershipPlan, 'batch-workflow')

  return (
    <aside
      className={
        collapsed
          ? 'workflow-run-panel floating-panel workflow-run-panel--collapsed'
          : 'workflow-run-panel floating-panel'
      }
      aria-label="工作流运行面板"
    >
      <header className="workflow-run-panel__heading">
        <span>
          <ListChecks aria-hidden="true" />
          <strong>工作流</strong>
        </span>
        <span className="workflow-run-panel__heading-meta">
          <small>本地 Demo</small>
          <button
            type="button"
            className="workflow-run-panel__toggle"
            aria-label={collapsed ? '展开工作流面板' : '折叠工作流面板'}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
          </button>
        </span>
      </header>
      <p className="workflow-run-panel__selection">
        {selectedCount > 0
          ? `已选 ${selectedCount} 个可执行节点`
          : '多选图片、分镜或视频节点'}
      </p>
      <div className="workflow-run-panel__create">
        <label>
          <span>执行模式</span>
          <select
            aria-label="执行模式"
            value={mode}
            onChange={(event) =>
              setMode(event.currentTarget.value as WorkflowExecutionMode)
            }
          >
            <option value="serial">串行</option>
            <option value="parallel">并行</option>
          </select>
        </label>
        <button
          type="button"
          disabled={selectedCount === 0 || upgradeRequired}
          onClick={() => onCreate(mode)}
        >
          <Play aria-hidden="true" />
          创建运行
        </button>
      </div>
      {upgradeRequired ? (
        <p className="membership-gate">
          批量或并行工作流需要专业版。<Link to="/#membership">升级到专业版</Link>
        </p>
      ) : null}

      <div className="workflow-run-panel__runs" aria-live="polite">
        {orderedRuns.length === 0 ? (
          <p className="workflow-run-panel__empty">暂无运行记录</p>
        ) : null}
        {orderedRuns.map((run) => {
          const progress = workflowProgress(run)
          const cancellable = run.status === 'pending' || run.status === 'running'
          return (
            <article
              key={run.id}
              className="workflow-run"
              aria-label={`运行 ${run.id}`}
            >
              <header className="workflow-run__heading">
                <div>
                  <strong>{statusCopy[run.status]}</strong>
                  <span>
                    {run.mode === 'serial' ? '串行' : '并行'} · {progress}%
                  </span>
                </div>
                {cancellable ? (
                  <button
                    type="button"
                    aria-label="取消运行"
                    onClick={() => onCancel(run.id)}
                  >
                    <Square aria-hidden="true" />
                  </button>
                ) : null}
              </header>
              <progress
                className="workflow-run__total-progress"
                aria-label={`运行 ${run.id} 总进度`}
                value={progress}
                max={100}
              />
              <ol className="workflow-run__nodes">
                {[...run.nodes]
                  .sort((left, right) => left.order - right.order)
                  .map((node) => (
                    <li key={node.id}>
                      <div className="workflow-run__node-copy">
                        <span>
                          {node.order + 1}. {node.nodeTitle}
                        </span>
                        <small>
                          {statusCopy[node.status]} · 第 {node.attempt} 次
                        </small>
                      </div>
                      <progress
                        aria-label={`${node.nodeTitle}进度`}
                        value={node.progress}
                        max={100}
                      />
                      {node.error ? (
                        <p className="workflow-run__error" role="alert">
                          {node.error}
                        </p>
                      ) : null}
                      {node.status === 'failed' ? (
                        <button
                          type="button"
                          aria-label={`重试${node.nodeTitle}`}
                          onClick={() => onRetryNode(run.id, node.id)}
                        >
                          <RefreshCw aria-hidden="true" />
                          重试
                        </button>
                      ) : null}
                    </li>
                  ))}
              </ol>
              <details className="workflow-run__logs">
                <summary>运行日志</summary>
                <ol>
                  {run.logs.map((log) => (
                    <li key={log.id} data-level={log.level}>
                      <time dateTime={log.timestamp}>
                        {new Date(log.timestamp).toLocaleTimeString('zh-CN', {
                          hour12: false,
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </time>
                      {log.message}
                    </li>
                  ))}
                </ol>
              </details>
            </article>
          )
        })}
      </div>
    </aside>
  )
}
