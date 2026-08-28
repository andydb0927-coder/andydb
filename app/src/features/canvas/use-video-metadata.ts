import { useEffect, useState } from 'react'
import { readVideoMetadata } from '../media/browser-media-processing'

/** Decode before offering an export range; stored/guessed durations are not authoritative. */
export function useVideoMetadata(url: string) {
  const [result, setResult] = useState<{ url: string; metadata?: { width: number; height: number; duration: number }; error?: string }>()
  useEffect(() => {
    const controller = new AbortController()
    void readVideoMetadata(url, controller.signal).then(metadata => {
      if (!controller.signal.aborted) setResult({ url, metadata })
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ url, error: error instanceof Error ? error.message : '视频元数据读取失败，请重试。' })
    })
    return () => controller.abort()
  }, [url])
  return result?.url === url ? result : { url }
}
