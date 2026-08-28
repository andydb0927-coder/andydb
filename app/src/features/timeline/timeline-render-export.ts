import { getTimelineDuration } from './timeline-project'
import type { ResolvedTimelineProject, TimelineProject } from './timeline-types'
import { browserCompositionRuntime } from './timeline-browser-composition'

export interface CompositionProgress {
  phase: 'preparing' | 'rendering' | 'encoding' | 'complete'
  fraction: number
}
export interface PreparedComposition {
  render(seconds: number): Promise<void>
  encode(seconds: number, duration: number): Promise<void>
  flush(): Promise<Blob>
  dispose(): Promise<void>
}
export interface CompositionRuntime {
  prepare(timeline: TimelineProject, resolved: ResolvedTimelineProject, signal: AbortSignal, progress: (value: CompositionProgress) => void): Promise<PreparedComposition>
  yieldControl(): Promise<void>
}

export function compositionAbort(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('已取消导出', 'AbortError')
}

/** Release the output even if a saturated encoder has not resolved its backpressure promise. */
function interruptible<T>(start: () => Promise<T>, signal: AbortSignal): Promise<T> {
  compositionAbort(signal)
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new DOMException('已取消导出', 'AbortError')) }
    const cleanup = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve().then(start).then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
  })
}

export function compositionErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return '已取消导出，未下载残缺文件。'
  if (error instanceof Error && error.message.startsWith('合成：')) return error.message
  return '合成导出失败，请确认素材可访问、浏览器支持媒体解码与编码后重试。'
}

/** Encoder backpressure may slow wall-clock progress, but never changes media timestamps. */
export async function exportTimelineVideo(timeline: TimelineProject, resolved: ResolvedTimelineProject, options: { signal: AbortSignal; onProgress?: (value: CompositionProgress) => void }, runtime: CompositionRuntime = browserCompositionRuntime): Promise<Blob> {
  const { signal } = options
  compositionAbort(signal)
  const duration = getTimelineDuration(timeline)
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('合成：时间线为空。')
  if (!Number.isFinite(timeline.frameRate) || timeline.frameRate <= 0) throw new Error('合成：时间线帧率无效。')
  const progress = options.onProgress ?? (() => {})
  progress({ phase: 'preparing', fraction: 0 })
  const prepared = await runtime.prepare(timeline, resolved, signal, progress)
  try {
    const frameCount = Math.ceil(duration * timeline.frameRate)
    for (let frame = 0; frame < frameCount; frame++) {
      compositionAbort(signal)
      const seconds = frame / timeline.frameRate
      await prepared.render(seconds)
      compositionAbort(signal)
      await interruptible(() => prepared.encode(seconds, Math.min(1 / timeline.frameRate, duration - seconds)), signal)
      compositionAbort(signal)
      progress({ phase: 'rendering', fraction: 0.1 + (frame + 1) / frameCount * 0.85 })
      await runtime.yieldControl()
    }
    compositionAbort(signal)
    progress({ phase: 'encoding', fraction: 0.95 })
    const output = await interruptible(() => prepared.flush(), signal)
    compositionAbort(signal)
    if (!output.size) throw new Error('合成：未编码到有效媒体。')
    progress({ phase: 'complete', fraction: 1 })
    return output
  } finally {
    await prepared.dispose()
  }
}
