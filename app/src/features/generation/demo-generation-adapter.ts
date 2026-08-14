import type {
  GenerationAdapter,
  GenerationRequest,
  GenerationResult,
} from './generation-adapter'

const GENERATION_DELAY_MS = 1200
const DEMO_THUMBNAIL_URL = '/demo/shot-river.png'
const DEMO_VIDEO_URL = '/demo/video-preview.mp4'

export class DemoGenerationAdapter implements GenerationAdapter {
  start(
    request: GenerationRequest,
    signal: AbortSignal,
  ): Promise<GenerationResult> {
    return new Promise((resolve, reject) => {
      const cancel = () => {
        clearTimeout(timeoutId)
        reject(new DOMException('Generation cancelled', 'AbortError'))
      }
      const timeoutId = setTimeout(() => {
        signal.removeEventListener('abort', cancel)
        const assetId = crypto.randomUUID()
        const video = request.targetKind === 'video'
        resolve({
          asset: video
            ? {
                id: assetId,
                kind: 'video',
                url: DEMO_VIDEO_URL,
                mimeType: 'video/mp4',
                width: 1280,
                height: 720,
                durationSeconds: 3.041,
              }
            : {
                id: assetId,
                kind: 'image',
                url: request.referenceAssets[0]?.url ?? DEMO_THUMBNAIL_URL,
                mimeType: 'image/png',
                width: 1920,
                height: 1080,
              },
          version: {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            prompt: request.prompt,
            assetId,
          },
        })
      }, GENERATION_DELAY_MS)

      if (signal.aborted) cancel()
      else signal.addEventListener('abort', cancel, { once: true })
    })
  }
}
