import type {
  GenerationAdapter,
  GenerationRequest,
  GenerationResult,
} from './generation-adapter'

const GENERATION_DELAY_MS = 1200
const DEMO_THUMBNAIL_URL = '/demo/shot-river.png'

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
        resolve({
          asset: {
            id: assetId,
            kind: 'image',
            url: request.referenceAssetUrls[0] ?? DEMO_THUMBNAIL_URL,
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
