import type { GenerationReference, GenerationRequest } from './generation-adapter'
import type { ModelParameterManifest } from './model-parameter-semantics'

/** These are prompt guidance, not undocumented native API switches. */
export const videoPromptManifest: ModelParameterManifest = {
  negativePrompt: { type: 'text', defaultValue: '', maxLength: 500 },
  shotSize: { type: 'enum', defaultValue: '自动', options: ['自动', '远景', '全景', '中景', '近景', '特写'] },
  cameraMotion: { type: 'enum', defaultValue: '自动', options: ['自动', '固定镜头', '缓慢推进', '缓慢拉远', '水平摇镜', '跟随', '环绕'] },
}

export function videoGuidedPrompt(request: GenerationRequest) {
  const p = request.parameters
  const parts = [request.prompt.trim()]
  if (p?.shotSize && p.shotSize !== '自动') parts.push(`景别：${p.shotSize}`)
  if (p?.cameraMotion && p.cameraMotion !== '自动') parts.push(`运镜：${p.cameraMotion}`)
  const negative = String(p?.negativePrompt ?? '').trim()
  if (negative.length > 500) throw new Error('负面词最多 500 字。')
  if (negative) parts.push(`避免：${negative}`)
  return parts.filter(Boolean).join('\n')
}

export function resolveVideoReferences(references: GenerationReference[], mode: unknown): GenerationReference[] {
  if (mode !== '首尾帧' && mode !== '图生视频' && mode) {
    return references.map(reference => ({ ...reference, ...(reference.kind === 'image' ? { role: 'reference_image' as const } : {}) }))
  }
  const explicit = references.some(reference => reference.role === 'first_frame' || reference.role === 'last_frame')
  let imageIndex = 0
  const resolved = references.map(reference => reference.kind !== 'image' ? reference : {
    ...reference,
    role: explicit ? reference.role : (imageIndex++ === 0 ? 'first_frame' as const : mode === '首尾帧' ? 'last_frame' as const : 'reference_image' as const),
  })
  return explicit ? [...resolved].sort((a, b) => Number(b.role === 'first_frame') - Number(a.role === 'first_frame')) : resolved
}

export function videoReferenceFailure(references: GenerationReference[], mode: unknown): string | undefined {
  if (mode !== '首尾帧' && mode !== '图生视频') return undefined
  const resolved = resolveVideoReferences(references, mode)
  if (resolved.filter(ref => ref.role === 'first_frame').length !== 1) return '请选择一张首帧图片。'
  if (mode === '首尾帧' && resolved.filter(ref => ref.role === 'last_frame').length !== 1) return '请选择一张尾帧图片。'
  if (resolved.length !== (mode === '首尾帧' ? 2 : 1) || resolved.some(ref => ref.kind !== 'image')) return '首尾帧与普通参考图、视频、音频不可混用。'
  return undefined
}

export function setVideoFrameReference(references: GenerationReference[], mode: unknown, role: 'first_frame' | 'last_frame', image: GenerationReference | undefined): GenerationReference[] {
  if (image && image.kind !== 'image') throw new Error('首尾帧必须选择图片。')
  const remaining = resolveVideoReferences(references, mode).filter(ref => ref.role !== role &&
    (ref.role === 'first_frame' || (mode === '首尾帧' && ref.role === 'last_frame')))
  return resolveVideoReferences([...remaining, ...(image ? [{ ...image, role }] : [])], mode)
}
