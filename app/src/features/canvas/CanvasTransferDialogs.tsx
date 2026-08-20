import { useEffect, useRef, useState } from 'react'

import type {
  CanvasExportEstimate,
  CanvasExportFormat,
  CanvasExportScope,
  WorkflowImportResult,
} from './canvas-workflow-export'
import { useDialogKeyboard } from './dialog-keyboard'

interface CanvasExportDialogProps {
  projectTitle: string
  viewportEstimate: CanvasExportEstimate
  allEstimate: CanvasExportEstimate
  onClose(): void
  onExport(format: CanvasExportFormat, scope: CanvasExportScope): void
}

function estimateCopy(label: string, estimate: CanvasExportEstimate) {
  return `${label}·${estimate.width} × ${estimate.height}`
}

export function CanvasExportDialog({
  projectTitle,
  viewportEstimate,
  allEstimate,
  onClose,
  onExport,
}: CanvasExportDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [format, setFormat] = useState<CanvasExportFormat>('png')
  const [scope, setScope] = useState<CanvasExportScope>('viewport')
  useDialogKeyboard(dialogRef, onClose)

  useEffect(() => headingRef.current?.focus(), [])

  return (
    <div className="canvas-dialog-backdrop">
      <section
        ref={dialogRef}
        className="canvas-dialog canvas-transfer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="canvas-export-heading"
      >
        <h2 id="canvas-export-heading" ref={headingRef} tabIndex={-1}>
          导出画布
        </h2>
        <p>项目：{projectTitle}。导出前请确认范围与预计尺寸。</p>
        <fieldset>
          <legend>文件格式</legend>
          <label>
            <input
              type="radio"
              name="canvas-export-format"
              checked={format === 'png'}
              onChange={() => setFormat('png')}
            />
            PNG 位图
          </label>
          <label>
            <input
              type="radio"
              name="canvas-export-format"
              checked={format === 'svg'}
              onChange={() => setFormat('svg')}
            />
            SVG 矢量图
          </label>
        </fieldset>
        <fieldset>
          <legend>导出范围</legend>
          <label>
            <input
              type="radio"
              name="canvas-export-scope"
              checked={scope === 'viewport'}
              onChange={() => setScope('viewport')}
            />
            {estimateCopy('当前视口', viewportEstimate)}
          </label>
          <span>所见即所得，保留当前平移与缩放。</span>
          <label>
            <input
              type="radio"
              name="canvas-export-scope"
              checked={scope === 'all'}
              onChange={() => setScope('all')}
            />
            {estimateCopy('全画布', allEstimate)}
          </label>
          <span>按所有节点外包围盒导出，并保留 64px 安全边距。</span>
        </fieldset>
        <div className="canvas-dialog__actions">
          <button type="button" onClick={onClose}>取消</button>
          <button
            type="button"
            className="canvas-transfer-dialog__primary"
            onClick={() => onExport(format, scope)}
          >
            导出 {format.toUpperCase()}
          </button>
        </div>
      </section>
    </div>
  )
}

interface WorkflowImportDialogProps {
  fileName: string
  result: WorkflowImportResult
  onClose(): void
  onConfirm(): void
}

export function WorkflowImportDialog({
  fileName,
  result,
  onClose,
  onConfirm,
}: WorkflowImportDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  useDialogKeyboard(dialogRef, onClose)
  useEffect(() => headingRef.current?.focus(), [])
  const project = result.snapshot?.project

  return (
    <div className="canvas-dialog-backdrop">
      <section
        ref={dialogRef}
        className="canvas-dialog canvas-transfer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workflow-import-heading"
      >
        <h2 id="workflow-import-heading" ref={headingRef} tabIndex={-1}>
          导入工作流 JSON
        </h2>
        <p>{fileName}</p>
        {project ? (
          <p className="canvas-transfer-dialog__summary">
            待合并：{project.nodes.length} 个节点、{project.edges.length} 条连线、
            {project.assets.length} 个素材。导入会保留参数与位置，并生成新 ID。
          </p>
        ) : null}
        {result.titleConflicts.length > 0 ? (
          <div className="canvas-transfer-dialog__warning" role="status">
            <strong>重名节点：{result.titleConflicts.join('、')}</strong>
            <span>确认后会保留同名节点，不覆盖当前内容。</span>
          </div>
        ) : null}
        {[...result.errors, ...result.missingReferences].length > 0 ? (
          <div className="canvas-transfer-dialog__errors" role="alert">
            <strong>无法合并</strong>
            <ul>
              {[...result.errors, ...result.missingReferences].map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="canvas-dialog__actions">
          <button type="button" onClick={onClose}>取消</button>
          <button
            type="button"
            className="canvas-transfer-dialog__primary"
            disabled={!result.valid || !result.snapshot}
            onClick={onConfirm}
          >
            确认合并
          </button>
        </div>
      </section>
    </div>
  )
}
