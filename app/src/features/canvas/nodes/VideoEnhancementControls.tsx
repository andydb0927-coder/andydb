import type { ModelProvider } from '../../generation/model-provider-registry'
import type { CreativeNodeData } from '../node-types'
import { resolveVideoReferences } from '../../generation/video-generation-semantics'
import type { VideoVersionEntry } from '../../project/video-version-history'
import type { Asset } from '../../project/model'
import './video-enhancements.css'

export function VideoFrameControls({ data, mode }: { data: CreativeNodeData; mode: string }) {
  if (!['图生视频', '首尾帧'].includes(mode)) return null
  const references = resolveVideoReferences(data.node.generationConfig?.parameters?.explicitFrameSelection || data.node.generationConfig?.referenceAssets.length ? data.node.generationConfig.referenceAssets : (data.videoReferences ?? []).map(ref => ({ kind: 'image' as const, url: ref.asset.url, mimeType: ref.asset.mimeType })), mode)
  return <fieldset className="video-frame-controls"><legend>首尾帧参考</legend>
    {(['first_frame', ...(mode === '首尾帧' ? ['last_frame' as const] : [])] as const).map(role => {
      const selected = references.find(ref => ref.role === role)
      return <label key={role}>{role === 'first_frame' ? '首帧图片' : '尾帧图片'}
        <select aria-label={role === 'first_frame' ? '首帧图片' : '尾帧图片'} value={selected?.url ?? ''} onChange={event => data.onSetVideoFrame?.(role, event.target.value)}>
          <option value="">请选择图片</option>
          {(data.videoFrameAssets ?? []).map(({ asset, title }) => <option key={asset.id} value={asset.url}>{title}</option>)}
        </select>
        {selected ? <img src={selected.url} alt={role === 'first_frame' ? '首帧预览' : '尾帧预览'} /> : null}
      </label>
    })}
    <p>首尾帧模式只发送指定图片，不混入普通参考素材。两张可相同；尾帧按首帧比例适配。</p>
  </fieldset>
}

export function VideoPromptControls({ data, provider, parameters }: { data: CreativeNodeData; provider: ModelProvider; parameters: Record<string, string | number | boolean> }) {
  return <div className="video-prompt-controls" role="group" aria-label="镜头提示词引导">
    {(['shotSize', 'cameraMotion', 'negativePrompt'] as const).map(name => {
      const definition = provider.parameterSchema[name]
      if (!definition) return null
      const label = { shotSize: '景别', cameraMotion: '镜头运动', negativePrompt: '负面词' }[name]
      return <label key={name}>{label}{definition.type === 'enum'
        ? <select aria-label={label} value={String(parameters[name] ?? definition.defaultValue)} onChange={event => data.onUpdateVideoGenerationParameters?.({ [name]: event.target.value })}>{definition.options.map(option => <option key={option}>{option}</option>)}</select>
        : definition.type === 'text' ? <textarea aria-label={label} maxLength={definition.maxLength} rows={2} value={String(parameters[name] ?? '')} onChange={event => data.onUpdateVideoGenerationParameters?.({ [name]: event.target.value })} /> : null}</label>
    })}
    {provider.parameterSchema.negativePrompt ? <p>以上参数写入提示词引导；负面词不是模型的硬性排除保证。</p> : null}
  </div>
}

export function VideoResultInfo({ asset, duration, dimensions, entry }: { asset: Asset; duration: number; dimensions?: { width: number; height: number }; entry?: VideoVersionEntry }) {
  const width = dimensions?.width || asset.width
  const height = dimensions?.height || asset.height
  const cost = entry?.job?.creditsSpent
  return <dl className="video-result-info" aria-label="视频结果信息">
    <div><dt>时长</dt><dd>{duration > 0 ? `${duration.toFixed(2)}s` : '未读取'}</dd></div>
    <div><dt>分辨率</dt><dd>{width && height ? `${width} × ${height}` : asset.resolution ?? '未读取'}</dd></div>
    <div><dt>帧率</dt><dd>{asset.framesPerSecond ? `${asset.framesPerSecond} fps` : '未提供'}</dd></div>
    <div><dt>成本</dt><dd>{cost === undefined ? '未提供' : `${cost} 积分`}{entry?.job?.estimatedCostCny === undefined ? '' : `（约¥${entry.job.estimatedCostCny}）`}</dd></div>
  </dl>
}

export function VideoVersionHistory({ data }: { data: CreativeNodeData }) {
  const versions = data.videoVersions ?? []
  if (versions.length < 2) return null
  const busy = data.job?.status === 'queued' || data.job?.status === 'running'
  return <details className="video-version-history nodrag nowheel"><summary>视频版本（{versions.length}）</summary>
    <p>{busy ? '生成处理中，请完成或取消后再恢复版本。' : '恢复同时切换视频、提示词与生成参数，下游将引用该版本；可撤销。'}</p>
    <div>{versions.map(({ version, asset }, index) => <button type="button" key={version.id} aria-label={`恢复视频版本 ${index + 1}`} aria-pressed={version.id === data.node.activeVersionId} disabled={busy || version.id === data.node.activeVersionId} onClick={() => data.onRestoreVideoVersion?.(version.id)}>
      <video src={asset.url} muted preload="metadata" aria-label={`版本 ${index + 1} 缩略图`} />
      <span>版本 {index + 1} · {asset.durationSeconds ?? '—'}s</span><span>{version.generatedPrompt ?? version.prompt ?? '无提示词'}</span>
    </button>)}</div>
  </details>
}
