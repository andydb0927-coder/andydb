import {
  Download,
  Heart,
  Languages,
  Search,
  SlidersHorizontal,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { defaultImageGenerationSettings } from '../../project/model'
import type { CreativeNodeData } from '../node-types'

function downloadUrl(url: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
}

const styleCategories = [
  '推荐',
  '摄影写真',
  '电商营销',
  '动漫游戏',
  '风格插画',
  '平面设计',
  '建筑及室内设计',
  '创意玩法',
  '文创周边',
  '小说推文',
] as const

const styleCards = [
  {
    id: 'comic-character-sheet',
    name: 'J_漫剧素材三视图',
    author: 'JM32',
    heat: '4900',
    commercial: true,
    model: 'Style Image V8.2',
    category: '动漫游戏',
    cover: '/demo/character-lin-yuan.png',
    recent: true,
  },
  {
    id: 'balanced-boy',
    name: '男生·三庭五眼比例均衡',
    author: '小小苏',
    heat: '415',
    commercial: true,
    model: 'Z Image',
    category: '摄影写真',
    cover: '/demo/shot-rooftop.png',
    recent: false,
  },
  {
    id: 'commerce-key-visual',
    name: '全网免费电商主图',
    author: '楚逸AICG',
    heat: '250',
    commercial: true,
    model: 'Qwen Image',
    category: '电商营销',
    cover: '/demo/scene-rain-street.png',
    recent: false,
  },
  {
    id: 'portrait-film',
    name: 'Z-Image 人像写真',
    author: '光影研究所',
    heat: '1.8w',
    commercial: false,
    model: 'Z Image',
    category: '摄影写真',
    cover: '/demo/shot-river.png',
    recent: true,
  },
  {
    id: 'render-poster',
    name: '3D 电商渲染级 KV 海报',
    author: '立体造物',
    heat: '21.6w',
    commercial: true,
    model: 'Lib Image',
    category: '平面设计',
    cover: '/demo/scene-rain-street.png',
    recent: false,
  },
  {
    id: 'storyboard-sheet',
    name: '分镜脚本故事版分镜',
    author: '镜头簿',
    heat: '1500',
    commercial: true,
    model: 'Lib Image',
    category: '小说推文',
    cover: '/demo/shot-rooftop.png',
    recent: false,
  },
] as const

type StyleTab = 'plaza' | 'favorites' | 'recent'

function ImageStyleGallery({ onClose }: { onClose(): void }) {
  const [tab, setTab] = useState<StyleTab>('plaza')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<(typeof styleCategories)[number]>('推荐')
  const [commercialOnly, setCommercialOnly] = useState(false)
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set())
  const [detailId, setDetailId] = useState<string>()

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', handleEscape, true)
    return () => window.removeEventListener('keydown', handleEscape, true)
  }, [onClose])

  const filteredCards = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return styleCards.filter((card) => {
      if (tab === 'favorites' && !favorites.has(card.id)) return false
      if (tab === 'recent' && !card.recent) return false
      if (category !== '推荐' && card.category !== category) return false
      if (commercialOnly && !card.commercial) return false
      return (
        !normalizedQuery ||
        `${card.name} ${card.author}`.toLocaleLowerCase().includes(normalizedQuery)
      )
    })
  }, [category, commercialOnly, favorites, query, tab])
  const detail = styleCards.find(({ id }) => id === detailId)

  return createPortal(
    <div className="image-style-gallery-backdrop nodrag">
      <section
        className="image-style-gallery"
        role="dialog"
        aria-modal="true"
        aria-label="风格广场"
      >
        <header className="image-style-gallery__heading">
          <div>
            <span>STYLE LIBRARY</span>
            <h2>风格广场</h2>
          </div>
          <button type="button" aria-label="关闭风格广场" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="image-style-gallery__tabs" role="tablist" aria-label="风格来源">
          {([
            ['plaza', '风格广场'],
            ['favorites', '我的收藏'],
            ['recent', '最近使用'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="image-style-gallery__search">
          <Search aria-hidden="true" />
          <span className="visually-hidden">搜索风格</span>
          <input
            type="search"
            placeholder="搜索风格名称、作者"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <nav className="image-style-gallery__categories" aria-label="风格分类">
          {styleCategories.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <label className="image-style-gallery__commercial">
          <input
            type="checkbox"
            checked={commercialOnly}
            onChange={(event) => setCommercialOnly(event.target.checked)}
          />
          仅看可商用
        </label>
        <div className="image-style-gallery__grid">
          {filteredCards.map((card) => {
            const favorite = favorites.has(card.id)
            return (
              <article key={card.id}>
                <img src={card.cover} alt="" />
                <div className="image-style-gallery__card-copy">
                  <strong>{card.name}</strong>
                  <span>作者 {card.author}</span>
                  <span>热度 {card.heat}</span>
                  <div>
                    <em>{card.commercial ? '商用' : '非商用'}</em>
                    <em>{card.model}</em>
                  </div>
                </div>
                <div className="image-style-gallery__card-actions">
                  <button
                    type="button"
                    aria-label={`${favorite ? '取消收藏' : '收藏'} ${card.name}`}
                    aria-pressed={favorite}
                    onClick={() =>
                      setFavorites((current) => {
                        const next = new Set(current)
                        if (next.has(card.id)) next.delete(card.id)
                        else next.add(card.id)
                        return next
                      })
                    }
                  >
                    <Heart aria-hidden="true" />收藏
                  </button>
                  <button
                    type="button"
                    aria-label={`查看${card.name}详情`}
                    onClick={() => setDetailId(card.id)}
                  >
                    详情
                  </button>
                </div>
              </article>
            )
          })}
          {!filteredCards.length ? <p role="status">当前筛选下没有风格。</p> : null}
        </div>
        {detail ? (
          <section
            className="image-style-gallery__detail"
            role="region"
            aria-label={`${detail.name}详情`}
          >
            <div>
              <strong>{detail.name}</strong>
              <span>{detail.author} · {detail.model} · 热度 {detail.heat}</span>
            </div>
            <button type="button" aria-label="关闭风格详情" onClick={() => setDetailId(undefined)}>
              <X aria-hidden="true" />
            </button>
          </section>
        ) : null}
      </section>
    </div>,
    document.body,
  )
}

export function ImageGenerationPanel({ data }: { data: CreativeNodeData }) {
  const [advanced, setAdvanced] = useState(false)
  const [styleOpen, setStyleOpen] = useState(false)
  const activeVersion = data.node.versions.find(
    ({ id }) => id === data.node.activeVersionId,
  )
  const imageGeneration = data.node.imageGeneration
  const [prompt, setPrompt] = useState(
    imageGeneration?.prompt ?? activeVersion?.prompt ?? '',
  )
  const [settings, setSettings] = useState({
    ...defaultImageGenerationSettings,
    ...imageGeneration,
  })
  const styleTriggerRef = useRef<HTMLButtonElement>(null)
  const cost = 15
  const hasMedia = Boolean(data.asset || data.imageReferences?.length)
  const eligible = Boolean(prompt.trim() || hasMedia) && cost > 0

  useEffect(() => {
    setAdvanced(false)
    setStyleOpen(false)
  }, [data.node.id])

  useEffect(() => {
    setPrompt(imageGeneration?.prompt ?? activeVersion?.prompt ?? '')
  }, [activeVersion?.prompt, data.node.id, imageGeneration?.prompt])

  useEffect(() => {
    setSettings({
      ...defaultImageGenerationSettings,
      ...imageGeneration,
    })
  }, [data.node.id, imageGeneration])

  const updateSetting = <Key extends keyof typeof settings>(
    key: Key,
    value: (typeof settings)[Key],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }))
    data.onUpdateImageGenerationSettings?.({ [key]: value })
  }

  const closeStyles = () => {
    setStyleOpen(false)
    queueMicrotask(() => styleTriggerRef.current?.focus())
  }

  return (
    <section
      className="image-generation-panel nodrag"
      role="region"
      aria-label={`${data.node.title} 生成参数`}
    >
      <label className="image-generation-panel__prompt">
        <span>提示词</span>
        <textarea
          value={prompt}
          rows={4}
          onChange={(event) => setPrompt(event.target.value)}
          onBlur={() =>
            data.onUpdateImageGenerationSettings?.({ prompt })
          }
        />
      </label>
      <div className="image-generation-panel__controls">
        <button type="button" aria-label="模型 Style Image V8.2">
          Style Image V8.2
        </button>
        <button type="button">4 张</button>
        <button type="button">16:9</button>
        <button type="button">自适应</button>
        <button
          type="button"
          aria-pressed={data.imageReferenceSelecting}
          onClick={(event) =>
            data.onStartImageReferenceSelection?.(event.currentTarget)
          }
        >
          参考
        </button>
        <button
          ref={styleTriggerRef}
          type="button"
          aria-expanded={styleOpen}
          onClick={() => setStyleOpen(true)}
        >
          风格
        </button>
        <button
          type="button"
          aria-label="翻译提示词"
          aria-describedby="image-translation-reason"
          disabled
        >
          <Languages aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={advanced ? '收起高级设置' : '展开高级设置'}
          aria-expanded={advanced}
          onClick={() => setAdvanced((open) => !open)}
        >
          <SlidersHorizontal aria-hidden="true" />
        </button>
      </div>
      <p id="image-translation-reason" className="image-generation-panel__reason">
        翻译服务未接入，本地演示暂不可用。
      </p>
      {data.imageReferenceSelecting ? (
        <section
          className="image-reference-selection"
          role="region"
          aria-label="从画布选择参考"
        >
          <strong>从画布选择参考</strong>
          <p>在当前画布中添加参考</p>
          <div>
            <button
              type="button"
              onClick={() => data.onEndImageReferenceSelection?.(true)}
            >
              返回节点
            </button>
            <button
              type="button"
              onClick={() => data.onEndImageReferenceSelection?.(false)}
            >
              退出
            </button>
          </div>
        </section>
      ) : null}
      {advanced ? (
        <div className="image-generation-panel__advanced">
          <label>
            个性化风格 P 值
            <input
              aria-describedby="image-p-value-help"
              type="text"
              value={settings.pValue}
              onChange={(event) =>
                setSettings((current) => ({ ...current, pValue: event.target.value }))
              }
              onBlur={() =>
                data.onUpdateImageGenerationSettings?.({
                  pValue: settings.pValue,
                })
              }
            />
          </label>
          <small id="image-p-value-help">
            同步你的 MJ 专属风格；请从 Midjourney 复制 P 值并粘贴到此处。
          </small>
          <label>
            风格化程度
            <input
              aria-label="风格化程度"
              type="range"
              min="0"
              max="1000"
              step="50"
              value={settings.stylization}
              onChange={(event) =>
                updateSetting('stylization', Number(event.target.value))
              }
            />
          </label>
          <label>
            怪异度
            <input
              aria-label="怪异度"
              type="range"
              min="0"
              max="3000"
              step="50"
              value={settings.weirdness}
              onChange={(event) =>
                updateSetting('weirdness', Number(event.target.value))
              }
            />
          </label>
          <label>
            多样性
            <input
              aria-label="多样性"
              type="range"
              min="0"
              max="100"
              step="5"
              value={settings.diversity}
              onChange={(event) =>
                updateSetting('diversity', Number(event.target.value))
              }
            />
          </label>
          <label className="image-generation-panel__autolink">
            <input
              type="checkbox"
              checked={settings.autoLink}
              onChange={(event) => updateSetting('autoLink', event.target.checked)}
            />
            智能引用 AutoLink
          </label>
        </div>
      ) : null}
      <div className="image-generation-panel__submit">
        <span aria-label="预计成本 15"><Zap aria-hidden="true" />预计成本 {cost}</span>
        <button
          type="button"
          aria-label="生成图片，预计成本 15"
          aria-describedby={!eligible ? 'image-generation-reason' : undefined}
          title="本地演示，不连接真实生成"
          disabled={!eligible}
          onClick={() => data.onLocalImageGenerate?.()}
        >
          生成
        </button>
      </div>
      {!eligible ? (
        <p id="image-generation-reason" className="image-generation-panel__reason">
          请输入提示词或添加参考媒体后再生成。
        </p>
      ) : null}
      {styleOpen ? <ImageStyleGallery onClose={closeStyles} /> : null}
    </section>
  )
}

export function ImageResults({ data }: { data: CreativeNodeData }) {
  const [open, setOpen] = useState(false)
  const [pendingResultId, setPendingResultId] = useState<string>()
  const results = data.imageResults ?? []
  const activeResultId = data.node.activeResultId ?? results[0]?.id

  useEffect(() => {
    if (!data.contextual) {
      setOpen(false)
      setPendingResultId(undefined)
    }
  }, [data.contextual])

  if (results.length < 2) return null

  return (
    <>
      <button
        type="button"
        className="creative-node__result-count nodrag"
        aria-label={`${open ? '收起' : '查看'} ${results.length} 张结果`}
        aria-expanded={open}
        onClick={() => {
          data.onSelect()
          setOpen((expanded) => !expanded)
        }}
      >
        {results.length} 张
      </button>
      {open ? (
        <section
          className="image-results-grid nodrag"
          role="region"
          aria-label={`${data.node.title} 的 ${results.length} 张结果`}
        >
          {results.map((result, index) => {
            const active = result.id === activeResultId
            return (
              <article key={result.id} data-active={active}>
                <img src={result.asset.url} alt={`结果 ${index + 1}`} />
                <div>
                  <button
                    type="button"
                    aria-label={`下载结果 ${index + 1}`}
                    onClick={() => downloadUrl(result.asset.url, `${data.node.title}-${index + 1}.png`)}
                  >
                    <Download aria-hidden="true" />下载
                  </button>
                  {active ? (
                    <button type="button" onClick={() => setOpen(false)}>
                      收起
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`将结果 ${index + 1} 设为主图`}
                      onClick={() => setPendingResultId(result.id)}
                    >
                      设为主图
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </section>
      ) : null}
      {pendingResultId ? createPortal(
        <div className="image-result-confirm nodrag" role="alertdialog" aria-modal="true" aria-label="设为主图">
          <div>
            <button type="button" aria-label="关闭设为主图提示" onClick={() => setPendingResultId(undefined)}>
              <X aria-hidden="true" />
            </button>
            <h2>设为主图</h2>
            <p>下游引用将使用新的主图。</p>
            <div>
              <button type="button" onClick={() => setPendingResultId(undefined)}>取消</button>
              <button
                type="button"
                onClick={() => {
                  data.onSetActiveResult?.(pendingResultId)
                  setPendingResultId(undefined)
                }}
              >
                确认设为主图
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  )
}
