import { useEffect, useRef, useState } from 'react'
import { Copy, Download } from 'lucide-react'
import { downloadBlob, safeDownloadFilename } from '../../shared/browser-download'
import { buildWorkflowFilename } from '../canvas/canvas-workflow-export'
import type { PublishedWork } from './community-model'
import { copyPublishedWorkShareLink } from './publication'
import { buildWorkPackage, exportWorkPoster } from './work-sharing-export'

export function WorkShareActions({ work }: { work: PublishedWork }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const act = async (action: 'copy' | 'png' | 'json') => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (action === 'copy') {
        await copyPublishedWorkShareLink(work.id)
        if (mounted.current) setMessage('分享链接已复制。本地演示，未发布到云端。')
      } else {
        const now = new Date()
        const blob = action === 'png' ? await exportWorkPoster(work) : new Blob([JSON.stringify(buildWorkPackage(work, now), null, 2)], { type: 'application/json' })
        if (!mounted.current) return
        const filename = action === 'png' ? safeDownloadFilename(`${work.title}-作品长图-${now.toISOString().slice(0, 19).replaceAll(':', '-')}.png`) : buildWorkflowFilename(work.title, now).replace('-工作流-', '-项目包-')
        downloadBlob(blob, filename)
        setMessage(action === 'png' ? '已生成 PNG 长图并请求下载。二维码为预留位，不可扫描。' : '已生成项目包并请求下载。包含资产 ID 和 URL；外部媒体未打包为二进制文件。')
      }
    } catch {
      if (mounted.current) setError(action === 'copy' ? '分享链接复制失败，请允许浏览器剪贴板权限后重试。' : action === 'png' ? 'PNG 长图导出失败，请检查封面可访问性、跨域权限或浏览器支持后重试。' : '项目包导出失败，请重试。')
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return (
    <section className="work-share-actions" aria-label="导出与分享">
      <h2>导出与分享</h2>
      <div>
        <button type="button" disabled={busy} onClick={() => void act('png')}><Download aria-hidden="true" />导出 PNG 长图</button>
        <button type="button" disabled={busy} onClick={() => void act('json')}><Download aria-hidden="true" />导出项目包 JSON</button>
        <button type="button" disabled={busy} onClick={() => void act('copy')}><Copy aria-hidden="true" />复制分享链接</button>
      </div>
      <p>PNG 包含封面、作品信息与二维码预留位；项目包基于发布时快照，可使用画布“导入工作流 JSON”导入。</p>
      {busy ? <p role="status">正在准备分享内容…</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}
