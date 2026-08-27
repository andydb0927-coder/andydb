import type { Asset, ScriptNodeDetails, ScriptShot } from '../project/model'

export type ScriptShotChanges = Partial<Pick<ScriptShot, 'title' | 'shotSize' | 'cameraAngle' | 'cameraMovement' | 'prompt' | 'characterIds'>>
const statuses = { queued: '已提交', running: '生成中', succeeded: '已完成', failed: '生成失败', cancelled: '已取消' }

export function ScriptStoryboardCards({ details, assets, busy = false, onEdit, onSend }: {
  details: ScriptNodeDetails
  assets: readonly Asset[]
  busy?: boolean
  onEdit(shotId: string, changes: ScriptShotChanges): void
  onSend(shotId: string): void
}) {
  return <section className="script-v2-shots" aria-label="脚本分镜卡列表">
    {busy ? <p role="note">任务执行期间分镜编辑暂时锁定。</p> : null}
    {!details.shots?.length ? <p>先拆解剧本，再生成分镜故事板。</p> : null}
    <div className="script-v2-shots__grid">{details.shots?.map((shot, index) => {
      const asset = assets.find(asset => asset.id === shot.assetId && asset.kind === 'image')
      const prefix = `分镜 ${index + 1}`
      return <article className="script-v2-shot" key={shot.id} aria-label={`${prefix} ${shot.title}`}>
        <header><strong>{index + 1}. {shot.title}</strong><span>{shot.status ? statuses[shot.status] : '待生成'}</span></header>
        {asset ? <img src={asset.url} alt={`${prefix} ${shot.title}`} /> : <div className="script-v2-shot__empty">尚无图片结果</div>}
        <p>{shot.shotSize} · {shot.cameraAngle} · {shot.cameraMovement}</p>
        {shot.error ? <p role="status">{shot.error}</p> : null}
        <details><summary>编辑分镜</summary>
          <fieldset disabled={busy}>
            {([['title', '名称', 80], ['shotSize', '景别', 60], ['cameraAngle', '机位', 100], ['cameraMovement', '运镜', 100]] as const).map(([key, label, max]) => <label key={key}>{label}<input aria-label={`${prefix} ${label}`} value={shot[key]} maxLength={max} onChange={event => onEdit(shot.id, { [key]: event.currentTarget.value })} /></label>)}
            <label>提示词<textarea aria-label={`${prefix} 提示词`} value={shot.prompt} maxLength={2000} rows={3} onChange={event => onEdit(shot.id, { prompt: event.currentTarget.value })} /></label>
            <fieldset><legend>参考角色</legend>{details.characters?.map(character => <label key={character.id}><input type="checkbox" aria-label={`${prefix} 引用${character.name}`} checked={shot.characterIds.includes(character.id)} onChange={event => onEdit(shot.id, { characterIds: event.currentTarget.checked ? [...shot.characterIds, character.id] : shot.characterIds.filter(id => id !== character.id) })} />{character.name}</label>)}</fieldset>
          </fieldset>
        </details>
        <button type="button" aria-label={`发送${prefix} 到画布`} disabled={!asset} title={!asset ? '请先生成此分镜的图片。' : undefined} onClick={() => onSend(shot.id)}>{shot.canvasNodeId ? '定位画布节点' : '发送画布'}</button>
      </article>
    })}</div>
  </section>
}
