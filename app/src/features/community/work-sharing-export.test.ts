import { afterEach, expect, test, vi } from 'vitest'
import { makeProjectFixture } from '../../test/fixtures'
import { createTimelineProject } from '../timeline/timeline-project'
import { parseWorkflowImport } from '../canvas/canvas-workflow-export'
import { createPublishedWork } from './community-model'
import { buildWorkPackage, createWorkPosterLayout, exportWorkPoster } from './work-sharing-export'
import { loadImageElement } from '../media/browser-media-processing'

vi.mock('../media/browser-media-processing', () => ({ loadImageElement: vi.fn() }))
afterEach(() => vi.restoreAllMocks())
const makeWork = () => {
  const project = makeProjectFixture()
  return createPublishedWork(project, createTimelineProject(project), { title: '古桥/清晨', author: '小安', tags: ['山水'], description: '清晨的古桥' })
}

test('packages a frozen workflow with a deduplicated asset ID inventory and independent timeline', () => {
  const work = makeWork()
  const packaged = buildWorkPackage(work, new Date('2026-08-29T00:00:00Z'))
  expect(packaged.format).toBe('wireless-canvas-workflow')
  expect(packaged.assetIds).toEqual(work.projectSnapshot.assets.map((a) => a.id).sort())
  expect(packaged.publication).toMatchObject({ id: work.id, title: work.title, visibility: 'private', localOnly: true })
  expect(packaged.timeline).toEqual(work.timelineSnapshot)
  expect(parseWorkflowImport(JSON.stringify(packaged), makeProjectFixture()).valid).toBe(true)
  packaged.project.nodes[0].title = '不能改动原作品'
  expect(work.projectSnapshot.nodes[0].title).not.toBe('不能改动原作品')
})

test('poster wraps long Chinese text, keeps all content and has an explicit non-scannable QR placeholder', () => {
  const work = makeWork()
  work.description = '长图说明'.repeat(125)
  const layout = createWorkPosterLayout(work, (text) => Array.from(text).length * 26)
  expect(layout.width).toBe(1200)
  expect(layout.height).toBeGreaterThan(layout.width)
  expect(layout.lines.filter((l) => l.kind === 'description').map((l) => l.text).join('')).toBe(work.description)
  expect(layout.qr.label).toBe('二维码预留位')
  expect(layout.qr.y + layout.qr.size).toBeLessThan(layout.height)
})

test('encodes a real canvas PNG including the loaded cover', async () => {
  const loaded = { naturalWidth: 1920, naturalHeight: 1080 } as HTMLImageElement
  vi.mocked(loadImageElement).mockResolvedValue(loaded)
  const context = { fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(), measureText: (s: string) => ({ width: s.length * 16 }) }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['png'], { type: 'image/png' })))
  const result = await exportWorkPoster(makeWork())
  expect(result.type).toBe('image/png')
  expect(context.drawImage).toHaveBeenCalledWith(loaded, expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number))
  expect(context.fillText).toHaveBeenCalledWith('二维码预留位', expect.any(Number), expect.any(Number))
})

test('does not silently export an empty poster when cover loading or PNG encoding fails', async () => {
  vi.mocked(loadImageElement).mockRejectedValue(new Error('failed'))
  await expect(exportWorkPoster(makeWork())).rejects.toThrow('封面')
  vi.mocked(loadImageElement).mockResolvedValue({ naturalWidth: 10, naturalHeight: 10 } as HTMLImageElement)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {}, measureText: () => ({ width: 1 }) } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null))
  await expect(exportWorkPoster(makeWork())).rejects.toThrow('PNG')
})
