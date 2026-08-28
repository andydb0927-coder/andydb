import { expect, test, type Page } from './provider-fixture'
import type { Download } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { makeProjectFixture } from '../src/test/fixtures'
import { addClip, addSubtitleClip, createTimelineProject } from '../src/features/timeline/timeline-project'
import { addAudioTrack, editSubtitle, setAudioEnvelope, setClipPlacement, setTransition } from '../src/features/timeline/timeline-editing'
import type { TimelineProject } from '../src/features/timeline/timeline-types'

function wave(frequency: number) {
  const rate = 24000, count = rate * 4, bytes = Buffer.alloc(44 + count * 2)
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + count * 2, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(count * 2, 40)
  for (let i = 0; i < count; i++) bytes.writeInt16LE(Math.round(Math.sin(i * frequency * 2 * Math.PI / rate) * 6000), 44 + i * 2)
  return bytes
}

async function seed(page: Page, composed = false, videoOnly = false) {
  await page.route('https://**/*', route => route.abort('blockedbyclient'))
  await page.route('**/timeline-fixtures/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('.mp4')) return readFile(resolve('e2e/fixtures/video-result.mp4')).then(body => route.fulfill({ contentType: 'video/mp4', body }))
    if (path.endsWith('.wav')) return route.fulfill({ contentType: 'audio/wav', body: wave(path.includes('440') ? 440 : 880) })
    return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><path fill="${path.includes('red') ? '#ff0000' : '#0000ff'}" d="M0 0h1920v1080H0z"/></svg>` })
  })
  await page.goto('/projects/new')
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  const id = new URL(page.url()).pathname.split('/').at(-1)!
  const project = { ...makeProjectFixture(), id, title: '时间线合成验收', assets: [], nodes: [], timeline: [], edges: [] }
  let timeline = createTimelineProject(project)
  for (const [name, kind, duration] of [['red', 'image', 2], ['blue', 'image', 2], ['440', 'audio', 4], ['880', 'audio', 4]] as const) {
    timeline = addClip(timeline, { id: name, name, kind, durationSeconds: duration, source: { type: 'library-asset', url: `/timeline-fixtures/${name}.${kind === 'image' ? 'svg' : 'wav'}`, mimeType: kind === 'image' ? 'image/svg+xml' : 'audio/wav' } })
  }
  if (composed) {
    const images = timeline.tracks.find(t => t.kind === 'image')!.clips
    timeline = setTransition(timeline, images[1].id, { kind: 'dissolve', durationSeconds: 1 })
    timeline = addSubtitleClip(timeline, '字幕烧录验收', 0.25, 3.5)
    const sub = timeline.tracks.find(t => t.kind === 'subtitle')!.clips[0]
    timeline = editSubtitle(timeline, sub.id, { text: sub.text!, startSeconds: 0.25, endSeconds: 3.75, style: { color: '#ffff00', fontSize: 100, bold: true } })
    const audio = timeline.tracks.find(t => t.kind === 'audio')!.clips
    timeline = addAudioTrack(timeline)
    timeline = setClipPlacement(timeline, audio[1].id, timeline.tracks.at(-1)!.id, 0)
    for (const clip of audio) timeline = setAudioEnvelope(timeline, clip.id, [{ timeSeconds: 0, value: 0.5 }, { timeSeconds: 4, value: 0.5 }])
  }
  if (videoOnly) {
    timeline = createTimelineProject(project)
    const source = { id: 'video', name: '本地视频', kind: 'video' as const, durationSeconds: 1, source: { type: 'library-asset' as const, url: '/timeline-fixtures/video.mp4', mimeType: 'video/mp4' } }
    timeline = addClip(addClip(timeline, source), { ...source, id: 'video2', name: '第二镜' })
    timeline = setTransition(timeline, timeline.tracks[0].clips[1].id, { kind: 'fade', durationSeconds: 0.5 })
  }
  await page.evaluate(async ({ project, timeline }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const open = indexedDB.open('wireless-canvas-v1'); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error) })
    try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(['projects', 'timelineProjects'], 'readwrite'); tx.objectStore('projects').put(project); tx.objectStore('timelineProjects').put(timeline); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }) }
    finally { db.close() }
  }, { project, timeline })
  await page.goto(`/project/${id}/preview`)
  await expect(page.getByRole('heading', { name: '成片预览' })).toBeVisible()
  await expect(page.getByRole('button', { name: videoOnly ? '选择视频 02' : '选择图片 02' })).toBeVisible()
  return id
}

async function savedTimeline(page: Page, id: string): Promise<TimelineProject> {
  return page.evaluate(async key => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const open = indexedDB.open('wireless-canvas-v1'); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error) })
    try { return await new Promise((resolve, reject) => { const read = db.transaction('timelineProjects').objectStore('timelineProjects').get(key); read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error) }) }
    finally { db.close() }
  }, id)
}

async function bytes(download: Download) {
  const stream = await download.createReadStream()
  if (!stream) throw new Error('下载不可读取')
  const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

test('transitions subtitles and aligned audio envelopes edit and survive refresh at 721px', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 721, height: 778 })
  const id = await seed(page)
  await page.getByRole('button', { name: '选择图片 02' }).click()
  await page.getByLabel('入场转场').selectOption('dissolve')
  await page.getByLabel('转场时长（秒）').fill('1')
  await page.getByLabel('字幕文本', { exact: true }).fill('古桥旁的第一句字幕')
  await page.getByRole('button', { name: '在播放头添加字幕' }).click()
  await page.getByLabel('字幕开始（秒）').fill('0.5')
  await page.getByLabel('字幕结束（秒）').fill('3.5')
  await page.getByLabel('字幕颜色').fill('#ffff00')
  await page.getByLabel('字幕位置').selectOption('top')
  await page.getByRole('button', { name: '新增音频轨道' }).click()
  await page.getByRole('button', { name: '选择音频 02' }).click()
  await page.getByLabel('所在音频轨').selectOption({ label: '音频轨道 2' })
  await page.getByLabel('音频开始（秒）').fill('0')
  await page.getByLabel('关键帧时间（秒）').fill('0')
  await page.getByLabel('关键帧音量', { exact: true }).fill('0')
  await page.getByRole('button', { name: '添加音量关键帧' }).click()
  await page.getByLabel('关键帧时间（秒）').fill('2')
  await page.getByLabel('关键帧音量', { exact: true }).fill('1')
  await page.getByRole('button', { name: '添加音量关键帧' }).click()
  await expect.poll(async () => (await savedTimeline(page, id)).tracks.at(-1)?.clips[0]?.volumeKeyframes?.length).toBe(2)
  const saved = await savedTimeline(page, id)
  expect(saved.tracks.find(t => t.kind === 'image')!.clips[1].transitionIn).toEqual({ kind: 'dissolve', durationSeconds: 1 })
  expect(saved.tracks.find(t => t.kind === 'subtitle')!.clips[0]).toMatchObject({ startSeconds: 0.5, sourceOutSeconds: 3, subtitleStyle: { position: 'top', color: '#ffff00' } })
  await page.reload()
  await page.getByLabel('时间线播放头').fill('1')
  await expect(page.getByTestId('timeline-subtitle')).toHaveText('古桥旁的第一句字幕')
  await expect(page.getByLabel('音轨播放 880')).toHaveAttribute('data-volume', '0.5')
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await expect(page.getByLabel('音轨播放 440')).toHaveJSProperty('paused', false)
  await expect(page.getByLabel('音轨播放 880')).toHaveJSProperty('paused', false)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await page.getByLabel('时间线播放头').fill('2.5')
  const sample = () => page.getByLabel('预览录制画布').evaluate((canvas: HTMLCanvasElement) => Array.from(canvas.getContext('2d')!.getImageData(100, 100, 1, 1).data))
  await expect.poll(async () => { const p = await sample(); return p[0] > 100 && p[2] > 100 }).toBe(true)
  const pixel = await sample()
  expect(pixel[0]).toBeGreaterThan(100); expect(pixel[2]).toBeGreaterThan(100)
  await page.getByRole('region', { name: '成片播放器' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: '../docs/qa/evidence/timeline-enhancement/editor-721.png', fullPage: true })
  const selectedClip = page.getByRole('button', { name: '选择图片 02' })
  expect(await selectedClip.evaluate(button => {
    const card = button.closest('li')!, row = card.closest('ol')!
    return card.getBoundingClientRect().bottom <= row.getBoundingClientRect().bottom
  })).toBe(true)
  expect(errors).toEqual([])
})

test('real local WebM contains dissolved pixels, burned subtitles and both audio tracks; cancel drops partial file', async ({ page }) => {
  test.setTimeout(60000)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1024 })
  await seed(page, true)
  const downloads: Download[] = []; page.on('download', download => downloads.push(download))
  const button = page.getByRole('button', { name: '导出合成视频' })
  await button.click()
  await expect(page.getByRole('button', { name: '取消导出' })).toBeVisible()
  await expect(page.getByText(/正在合成 \d+%/)).toBeVisible()
  await page.getByRole('button', { name: '取消导出' }).click()
  await expect(page.getByText('已取消导出，未下载残缺文件。')).toBeVisible()
  expect(downloads).toHaveLength(0)
  const event = page.waitForEvent('download')
  await button.click()
  await expect(button).toBeDisabled()
  const download = await event
  expect(download.suggestedFilename()).toContain('合成.webm')
  const data = await bytes(download)
  expect(data.length).toBeGreaterThan(20000)
  // Decode the actual artifact in Chromium; no fake MediaRecorder or download stub.
  const result = await page.evaluate(async base64 => {
    const array = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const audio = new AudioContext()
    const video = document.createElement('video'); video.muted = true
    const url = URL.createObjectURL(new Blob([array], { type: 'video/webm' }))
    try {
      const buffer = await audio.decodeAudioData(array.buffer.slice(0))
      const samples = buffer.getChannelData(0), rate = buffer.sampleRate
      const power = (hz: number) => {
        let real = 0, imaginary = 0
        for (let i = Math.floor(rate * 0.5); i < Math.floor(rate * 1.5); i++) { real += samples[i] * Math.cos(i * hz * 2 * Math.PI / rate); imaginary += samples[i] * Math.sin(i * hz * 2 * Math.PI / rate) }
        return Math.hypot(real, imaginary) / rate
      }
      await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('导出视频解码失败')); video.src = url })
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const context = canvas.getContext('2d')!
      await new Promise<void>(resolve => { video.onseeked = () => resolve(); video.currentTime = 2.5 })
      context.drawImage(video, 0, 0)
      const pixel = Array.from(context.getImageData(100, 100, 1, 1).data)
      const subtitle = context.getImageData(0, 850, canvas.width, 230).data
      let yellow = 0; for (let i = 0; i < subtitle.length; i += 4) if (subtitle[i] > 170 && subtitle[i + 1] > 170 && subtitle[i + 2] < 100) yellow++
      await new Promise<void>(resolve => { video.onseeked = () => resolve(); video.currentTime = 3.8 })
      context.drawImage(video, 0, 0)
      const lastPixel = Array.from(context.getImageData(100, 100, 1, 1).data)
      return { width: video.videoWidth, height: video.videoHeight, duration: buffer.duration, low: power(440), high: power(880), pixel, yellow, lastPixel }
    } finally { await audio.close(); video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url) }
  }, data.toString('base64'))
  expect(result.width).toBe(1920); expect(result.height).toBe(1080)
  expect(result.duration).toBeGreaterThan(3.7); expect(result.duration).toBeLessThan(4.5)
  expect(result.low).toBeGreaterThan(0.025); expect(result.high).toBeGreaterThan(0.025)
  expect(result.pixel[0]).toBeGreaterThan(75); expect(result.pixel[2]).toBeGreaterThan(75)
  expect(result.yellow).toBeGreaterThan(500)
  expect(result.lastPixel[2]).toBeGreaterThan(200); expect(result.lastPixel[0]).toBeLessThan(40)
  await page.getByLabel('时间线播放头').fill('2.5')
  await expect(page.getByText('合成视频已下载，含转场、字幕和音轨混流。')).toBeVisible()
  await page.getByText('合成视频已下载，含转场、字幕和音轨混流。').scrollIntoViewIfNeeded()
  await page.screenshot({ path: '../docs/qa/evidence/timeline-enhancement/export-complete.png' })
  expect(errors).toEqual([])
})

test('missing media blocks export with recoverable Chinese feedback and no download', async ({ page }) => {
  await seed(page, true)
  await page.route('**/timeline-fixtures/red.svg', route => route.fulfill({ status: 404, body: 'fixture missing' }))
  const downloads: Download[] = []; page.on('download', d => downloads.push(d))
  await page.getByRole('button', { name: '导出合成视频' }).click()
  await expect(page.getByText('合成：素材下载失败，请确认地址仍有效或先导入本地资产。')).toBeVisible()
  expect(downloads).toHaveLength(0)
  await expect(page.getByRole('button', { name: '导出合成视频' })).toBeEnabled()
})

test('video clips use decoded frames during local composition and cancel is reachable at 200 percent equivalent viewport', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 778 })
  await seed(page, false, true)
  await page.getByRole('button', { name: '选择视频 02' }).click()
  await expect(page.getByLabel('入场转场')).toHaveValue('fade')
  await page.getByLabel('入场转场').selectOption('black')
  await page.getByLabel('时间线播放头').fill('1')
  await expect(page.getByTestId('preview-video')).toBeVisible()
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出合成视频' }).click()
  await expect(page.getByRole('button', { name: '取消导出' })).toBeVisible()
  const data = await bytes(await event)
  expect(data.length).toBeGreaterThan(1000)
  await expect(page.getByText('合成视频已下载，含转场、字幕和音轨混流。')).toBeVisible()
})
