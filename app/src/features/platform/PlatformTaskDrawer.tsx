import { CheckCircle2, Circle, ExternalLink, LoaderCircle, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  createPlatformTaskProgressStore,
  PLATFORM_TASK_PROGRESS_KEY,
  updatePlatformTaskStatus,
  type PlatformTaskProgressStore,
} from './platform-task-progress'
import {
  platformTasks,
  type PlatformTaskStatus,
} from './platform-tasks'

const statusCopy: Record<PlatformTaskStatus, string> = {
  pending: '待开始',
  'in-progress': '进行中',
  completed: '已完成',
}

const statusIcon = {
  pending: Circle,
  'in-progress': LoaderCircle,
  completed: CheckCircle2,
} as const

export interface PlatformTaskDrawerProps {
  onRequestClose(): void
  progressStore?: PlatformTaskProgressStore
}

export function PlatformTaskDrawer({
  onRequestClose,
  progressStore: suppliedProgressStore,
}: PlatformTaskDrawerProps) {
  const progressStore = useMemo(
    () => suppliedProgressStore ?? createPlatformTaskProgressStore(),
    [suppliedProgressStore],
  )
  const [snapshot, setSnapshot] = useState(() => progressStore.read())

  useEffect(() => {
    setSnapshot(progressStore.read())
  }, [progressStore])

  useEffect(() => {
    const syncProgress = (event: StorageEvent) => {
      if (event.key === PLATFORM_TASK_PROGRESS_KEY) {
        setSnapshot(progressStore.read())
      }
    }
    window.addEventListener('storage', syncProgress)
    return () => window.removeEventListener('storage', syncProgress)
  }, [progressStore])

  const updateStatus = useCallback(
    (taskId: (typeof platformTasks)[number]['id'], status: PlatformTaskStatus) => {
      setSnapshot((current) =>
        progressStore.write(
          updatePlatformTaskStatus(current.statuses, taskId, status),
        ),
      )
    },
    [progressStore],
  )

  const completed = platformTasks.filter(
    (task) => snapshot.statuses[task.id] === 'completed',
  ).length
  const percent = Math.round((completed / platformTasks.length) * 100)
  const currentTask = platformTasks.find(
    (task) => snapshot.statuses[task.id] === 'in-progress',
  ) ?? platformTasks.find((task) => snapshot.statuses[task.id] === 'pending')

  return (
    <aside
      className="platform-task-drawer"
      id="platform-task-drawer"
      aria-label="平台完善路线图"
    >
      <header className="platform-task-drawer__header">
        <div>
          <p>LIBTV FEATURE ROADMAP</p>
          <h2>平台完善路线图</h2>
        </div>
        <button
          aria-label="关闭阶段任务"
          className="platform-task-drawer__close focus-visible"
          type="button"
          onClick={onRequestClose}
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <section className="platform-task-drawer__progress" aria-label="总进度">
        <div>
          <strong>{completed} / {platformTasks.length} 已完成</strong>
          <span>{percent}%</span>
        </div>
        <progress value={completed} max={platformTasks.length}>{percent}%</progress>
        <p className="platform-task-drawer__current">
          当前阶段：<strong>{currentTask?.title ?? '全部完成'}</strong>
        </p>
        <p>进度只保存在当前设备；真实账号、付费和云协作仍按阶段接入。</p>
      </section>

      <ol className="platform-task-drawer__list">
        {platformTasks.map((task) => {
          const status = snapshot.statuses[task.id]
          const StatusIcon = statusIcon[status]
          return (
            <li key={task.id} data-status={status}>
              <div className="platform-task-drawer__stage">
                <span>{String(task.order).padStart(2, '0')}</span>
                <StatusIcon aria-hidden="true" />
                <div>
                  <strong>{task.title}</strong>
                  <p>{task.description}</p>
                </div>
              </div>
              <div className="platform-task-drawer__actions">
                <label>
                  <span className="platform-task-drawer__sr-only">更新 {task.title} 状态</span>
                  <select
                    aria-label={`更新 ${task.title} 状态`}
                    value={status}
                    onChange={(event) =>
                      updateStatus(task.id, event.target.value as PlatformTaskStatus)
                    }
                  >
                    {Object.entries(statusCopy).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <Link
                  aria-label={`打开 ${task.title}`}
                  className="focus-visible"
                  to={task.targetPath}
                >
                  <ExternalLink aria-hidden="true" />
                </Link>
              </div>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
