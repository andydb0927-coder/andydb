import { Heart, Search, Sparkles, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import type { CreativeNodeData } from '../canvas/node-types'
import type { ModelProvider } from '../generation/model-provider-registry'
import { builtInStyles, styleCategories, styleSnapshot, styleCompatibilityReason, type AppliedStyle, type StyleCard, type StyleTarget } from './style-model'
import { defaultStyleRepository, type StyleRepository, type StyleLibrary } from './style-repository'
import './style-system.css'

type Repository = Pick<StyleRepository, 'load' | 'create' | 'setFavorite' | 'markUsed'>

export function AppliedStyleSummary({ style }: { style?: AppliedStyle | null }) {
  return style ? <span className="applied-style-summary">已应用风格：{style.name}</span> : null
}

export function nodeAppliedStyle(data: CreativeNodeData) {
  return data.node.appliedStyle === undefined ? data.node.generationConfig?.style : data.node.appliedStyle
}

export function nodeStyleCompatibilityReason(data: CreativeNodeData, provider: ModelProvider, target: StyleTarget) {
  const style = nodeAppliedStyle(data)
  return style ? styleCompatibilityReason(style, target, provider.id) : undefined
}

export function StylePicker({ data, provider, target }: { data: CreativeNodeData; provider: ModelProvider; target: StyleTarget }) {
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [data.node.id])
  const trigger = useRef<HTMLButtonElement>(null)
  const selected = nodeAppliedStyle(data)
  const reason = nodeStyleCompatibilityReason(data, provider, target)
  return <>
    <button ref={trigger} type="button" aria-expanded={open} onClick={() => setOpen(true)}><Sparkles aria-hidden="true" />风格</button>
    {reason ? <span className="style-compatibility-warning" role="status">{reason}</span> : null}
    {open ? <StyleGallery provider={provider} target={target} selected={selected} onSelect={style => data.onSelectStyle?.(style)} onClose={() => { setOpen(false); trigger.current?.focus() }} /> : null}
  </>
}

export function StyleGallery({ provider, target, selected, onSelect, onClose, repository = defaultStyleRepository }: {
  provider: ModelProvider
  target: StyleTarget
  selected?: AppliedStyle | null
  onSelect(style: AppliedStyle | null): void
  onClose(): void
  repository?: Repository
}) {
  const [library, setLibrary] = useState<StyleLibrary>({ cards: builtInStyles, preferences: [] })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'plaza' | 'favorites' | 'recent'>('plaza')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('推荐')
  const [commercialOnly, setCommercialOnly] = useState(false)
  const [detailId, setDetailId] = useState<string>()
  const [custom, setCustom] = useState(false)
  const [name, setName] = useState('')
  const [fragment, setFragment] = useState('')
  const [cover, setCover] = useState<string>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const active = useRef(true)
  const trainingReasonId = useId()
  useEffect(() => {
    active.current = true
    void repository.load().then(state => { if (active.current) { setLibrary(state); setLoading(false) } }, () => {
      if (active.current) { setError('风格库读取失败，请关闭后重试。'); setLoading(false) }
    })
    return () => { active.current = false }
  }, [repository])

  const perform = async (task: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError('')
    try { await task() }
    catch { if (active.current) setError('风格保存失败，请重试。未应用任何新风格。') }
    finally { busyRef.current = false; if (active.current) setBusy(false) }
  }
  const preference = (id: string) => library.preferences.find(item => item.id === id)
  const apply = (card: StyleCard) => void perform(async () => {
    await repository.markUsed(card.id)
    if (active.current) { onSelect(styleSnapshot(card)); onClose() }
  })
  const favorite = (card: StyleCard) => void perform(async () => {
    const next = !preference(card.id)?.favorite
    await repository.setFavorite(card.id, next)
    if (active.current) setLibrary(current => ({ ...current, preferences: [
      ...current.preferences.filter(item => item.id !== card.id),
      { ...current.preferences.find(item => item.id === card.id), id: card.id, favorite: next },
    ] }))
  })
  const saveCustom = () => {
    if (!name.trim() || name.trim().length > 80) { setError('风格名称需为 1–80 字。'); return }
    if (!fragment.trim() || fragment.trim().length > 2000) { setError('提示词片段需为 1–2000 字。'); return }
    void perform(async () => {
      const card = await repository.create({ name, promptFragment: fragment, ...(cover ? { cover } : {}) })
      if (active.current) {
        setLibrary(current => ({ ...current, cards: [...current.cards, card] }))
        setCustom(false); setName(''); setFragment(''); setCover(undefined)
        setQuery(''); setCategory('推荐'); setTab('plaza'); setCommercialOnly(false)
      }
    })
  }
  const readCover = (file?: File) => {
    if (!file) { setCover(undefined); return }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('封面仅支持不超过 2MB 的 PNG、JPEG 或 WebP 图片。'); return
    }
    void perform(() => new Promise<void>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => { if (active.current) setCover(String(reader.result)); resolve() }
      reader.onerror = () => reject(new Error('封面读取失败'))
      reader.readAsDataURL(file)
    }))
  }
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const cards = library.cards.filter(card =>
    (tab !== 'favorites' || preference(card.id)?.favorite) &&
    (tab !== 'recent' || preference(card.id)?.lastUsedAt) &&
    (category === '推荐' || card.category === category) &&
    (!commercialOnly || card.commercial) &&
    (!normalizedQuery || `${card.name} ${card.author}`.toLocaleLowerCase().includes(normalizedQuery)))
  if (tab === 'recent') cards.sort((a, b) => (preference(b.id)?.lastUsedAt ?? '').localeCompare(preference(a.id)?.lastUsedAt ?? ''))
  const detail = library.cards.find(card => card.id === detailId)

  return <ConfirmDialog portal as="section" label="风格广场" overlayClassName="image-style-gallery-backdrop nodrag nowheel" className="image-style-gallery style-library" onClose={onClose} dismissOnBackdrop restoreFocus initialFocus="[aria-label='关闭风格广场']" focusableSelector="button:not(:disabled), input:not(:disabled), textarea:not(:disabled)">
    <header className="image-style-gallery__heading"><div><span>STYLE LIBRARY</span><h2>风格广场</h2></div><button type="button" aria-label="关闭风格广场" onClick={onClose}><X aria-hidden="true" /></button></header>
    <p className="style-library__notice">本地提示词模板，非模型训练。封面与热度为示例；生成费用仍按所选模型计算。</p>
    <div className="image-style-gallery__tabs" role="tablist" aria-label="风格来源">{([['plaza', '风格广场'], ['favorites', '我的收藏'], ['recent', '最近使用']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div>
    <div className="style-library__actions"><button type="button" aria-expanded={custom} onClick={() => setCustom(!custom)}>自定义风格</button><button type="button" disabled aria-describedby={trainingReasonId}>AI训练</button><span id={trainingReasonId}>待接入风格训练服务</span>{selected ? <button type="button" onClick={() => { onSelect(null); onClose() }}>移除风格</button> : null}</div>
    {custom ? <form className="style-library__form" aria-label="自定义风格" onSubmit={event => { event.preventDefault(); saveCustom() }}>
      <label>风格名称<input value={name} maxLength={80} onChange={event => setName(event.target.value)} required /></label>
      <label>提示词片段<textarea value={fragment} maxLength={2000} rows={3} onChange={event => setFragment(event.target.value)} required /></label>
      <label>封面（可选）<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => readCover(event.target.files?.[0])} /></label>
      {cover ? <img className="style-library__cover" src={cover} alt="风格封面预览" /> : null}
      <span>兼容图片、视频、文本；提示词模板不改变模型能力。</span><button type="submit" disabled={busy || loading}>保存风格</button>
    </form> : null}
    <label className="image-style-gallery__search"><Search aria-hidden="true" /><span className="visually-hidden">搜索风格</span><input type="search" placeholder="搜索风格名称、作者" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <nav className="image-style-gallery__categories" aria-label="风格分类">{styleCategories.map(item => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</nav>
    <label className="image-style-gallery__commercial"><input type="checkbox" checked={commercialOnly} onChange={event => setCommercialOnly(event.target.checked)} />仅看可商用</label>
    {error ? <p role="alert">{error}</p> : null}
    {loading ? <p role="status">正在读取本地风格库…</p> : null}
    <div className="image-style-gallery__grid">{cards.map(card => {
      const reason = styleCompatibilityReason(card, target, provider.id)
      const isFavorite = Boolean(preference(card.id)?.favorite)
      return <article key={card.id} aria-label={card.name} data-selected={selected?.id === card.id}>
        {card.cover ? <img src={card.cover} alt="" /> : <div className="style-library__cover-placeholder" aria-hidden="true"><Sparkles /></div>}
        <div className="image-style-gallery__card-copy"><strong>{card.name}</strong><span>作者 {card.author}</span><span>热度 {card.heat}</span><div><em>{card.commercial ? '商用' : card.custom ? '商用权限自行确认' : '非商用'}</em><em>{card.model}</em></div>{selected?.id === card.id ? <span>已选中</span> : null}</div>
        <div className="image-style-gallery__card-actions"><button type="button" disabled={busy || loading} aria-label={`${isFavorite ? '取消收藏' : '收藏'} ${card.name}`} aria-pressed={isFavorite} onClick={() => favorite(card)}><Heart aria-hidden="true" />收藏</button><button type="button" aria-label={`查看${card.name}详情`} onClick={() => setDetailId(card.id)}>详情</button><button type="button" disabled={busy || loading || Boolean(reason)} aria-label={`应用风格 ${card.name}`} aria-pressed={selected?.id === card.id} onClick={() => apply(card)}>应用</button></div>
        {reason ? <p className="style-library__notice">{reason}</p> : null}
      </article>
    })}{!cards.length && !loading ? <p role="status">当前筛选下没有风格。</p> : null}</div>
    {detail ? <section className="image-style-gallery__detail" role="region" aria-label={`${detail.name}详情`}><div><strong>{detail.name}</strong><span>{detail.author} · {detail.model} · 热度 {detail.heat}</span><p>{detail.promptFragment}</p><p>兼容：{detail.compatibility.targetKinds.map(kind => ({ image: '图片', video: '视频', text: '文本' })[kind]).join(' / ')}{detail.compatibility.providerIds ? `；模型：${detail.compatibility.providerIds.join('、')}` : '；所有支持该类型的模型'}</p></div><button type="button" aria-label="关闭风格详情" onClick={() => setDetailId(undefined)}><X aria-hidden="true" /></button></section> : null}
  </ConfirmDialog>
}
