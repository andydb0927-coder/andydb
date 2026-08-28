import { createWorkflowSnapshot, type WorkflowSnapshot } from '../canvas/canvas-workflow-export'
import { loadImageElement } from '../media/browser-media-processing'
import type { PublishedWork, WorkVisibility } from './community-model'
import { formatWorkDate, getWorkModels, getWorkVisibility, workCreatedAt } from './work-portfolio'

export interface WorkPackage extends WorkflowSnapshot {
  assetIds: string[]
  timeline: PublishedWork['timelineSnapshot']
  publication: Pick<PublishedWork, 'id' | 'title' | 'description' | 'author' | 'tags' | 'coverUrl' | 'publishedAt' | 'localOnly'> & { visibility: WorkVisibility }
}

/** Keeps the existing importable workflow envelope; asset IDs/URLs are not a binary media backup. */
export function buildWorkPackage(work: PublishedWork, now = new Date()): WorkPackage {
  const project = structuredClone(work.workflowSnapshot?.project ?? work.projectSnapshot)
  return {
    ...createWorkflowSnapshot(project, now),
    assetIds: [...new Set(project.assets.map((asset) => asset.id))].sort(),
    timeline: structuredClone(work.timelineSnapshot),
    publication: {
      id: work.id, title: work.title, description: work.description, author: work.author,
      tags: [...work.tags], coverUrl: work.coverUrl, publishedAt: work.publishedAt,
      localOnly: true, visibility: getWorkVisibility(work),
    },
  }
}

type PosterLine = { text: string; x: number; y: number; size: number; kind: 'title' | 'description' | 'meta' }

export function createWorkPosterLayout(work: PublishedWork, measure: (text: string, fontSize: number) => number) {
  const width = 1200
  const margin = 64
  const lines: PosterLine[] = []
  let y = 748
  const addText = (text: string, kind: PosterLine['kind'], size: number) => {
    for (const paragraph of text.split('\n')) {
      let line = ''
      for (const character of Array.from(paragraph)) {
        if (line && measure(line + character, size) > width - margin * 2) {
          lines.push({ text: line, x: margin, y, size, kind })
          y += size * 1.6
          line = ''
        }
        line += character
      }
      lines.push({ text: line, x: margin, y, size, kind })
      y += size * 1.6
    }
    y += 24
  }
  addText(work.title, 'title', 48)
  addText(`${work.author} · 创作于 ${formatWorkDate(workCreatedAt(work))}`, 'meta', 26)
  addText(`模型：${getWorkModels(work).join(' / ') || '未记录模型'}`, 'meta', 26)
  addText(work.description || '暂无作品简介', 'description', 30)
  if (work.tags.length) addText(work.tags.map((tag) => `#${tag}`).join('  '), 'meta', 26)
  const qr = { x: margin, y: Math.max(y, 1100), size: 160, label: '二维码预留位' }
  return { width, height: Math.ceil(qr.y + qr.size + 100), lines, qr, cover: { x: margin, y: 120, width: width - margin * 2, height: 560 } }
}

export async function exportWorkPoster(work: PublishedWork): Promise<Blob> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let image: HTMLImageElement
  try {
    image = await Promise.race([
      loadImageElement(work.coverUrl),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 20_000) }),
    ])
  } catch {
    throw new Error('作品封面无法读取，请检查图片是否过期或存在跨域限制后重试。')
  } finally {
    clearTimeout(timer)
  }
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法创建 PNG 长图画布。')
  const layout = createWorkPosterLayout(work, (text, size) => {
    context.font = `${size}px system-ui, sans-serif`
    return context.measureText(text).width
  })
  canvas.width = layout.width
  canvas.height = layout.height
  context.fillStyle = '#191715'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#daab55'
  context.font = '24px system-ui, sans-serif'
  context.fillText('无线画布 · 作品分享', 64, 72)
  const cover = layout.cover
  const scale = Math.min(cover.width / image.naturalWidth, cover.height / image.naturalHeight)
  if (!Number.isFinite(scale)) throw new Error('作品封面尺寸无效，无法导出。')
  context.drawImage(image, cover.x + (cover.width - image.naturalWidth * scale) / 2, cover.y + (cover.height - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale)
  for (const line of layout.lines) {
    context.font = `${line.kind === 'title' ? '600 ' : ''}${line.size}px system-ui, sans-serif`
    context.fillStyle = line.kind === 'meta' ? '#aaa198' : '#f5f0e8'
    context.fillText(line.text, line.x, line.y)
  }
  context.strokeStyle = '#aaa198'
  context.lineWidth = 2
  context.strokeRect(layout.qr.x, layout.qr.y, layout.qr.size, layout.qr.size)
  context.font = '20px system-ui, sans-serif'
  context.fillStyle = '#aaa198'
  context.fillText(layout.qr.label, layout.qr.x + 10, layout.qr.y + 86)
  context.fillText('本地作品 · 未发布到云端', 264, layout.qr.y + 62)
  context.fillText('二维码为预留位，不可扫描。', 264, layout.qr.y + 106)
  try {
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('PNG 编码失败，请重试。'))
    }, 'image/png'))
  } catch {
    throw new Error('PNG 编码失败，请检查封面跨域权限后重试。')
  }
}
