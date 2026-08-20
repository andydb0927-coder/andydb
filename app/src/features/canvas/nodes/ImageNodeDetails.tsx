import {
  ArrowUp,
  Download,
  Heart,
  Languages,
  ScanSearch,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import { defaultImageGenerationSettings } from '../../project/model'
import {
  defaultProviderRegistry,
  providerOptionLabel,
} from '../../generation/model-provider-registry'
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

export function ImageGenerationPanel({
  data,
  imageToImage,
  upscalePending,
  onUpscalePendingChange,
  upscaleTriggerRef,
}: {
  data: CreativeNodeData
  imageToImage: boolean
  upscalePending: boolean
  onUpscalePendingChange(pending: boolean): void
  upscaleTriggerRef: RefObject<HTMLButtonElement | null>
}) {
  const [advanced, setAdvanced] = useState(false)
  const [styleOpen, setStyleOpen] = useState(false)
  const [marking, setMarking] = useState(false)
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
  const markingTriggerRef = useRef<HTMLButtonElement>(null)
  const incomingReferenceCount =
    data.incomingReferenceCount ?? data.imageReferences?.length ?? 0
  const hasMedia = Boolean(data.asset || incomingReferenceCount)
  const providers = defaultProviderRegistry.matching([
    'text-to-image',
    'image-to-image',
  ])
  const selectedProvider =
    providers.find(({ id }) => id === data.node.modelProviderId) ??
    providers.find(({ kind }) => kind === 'demo')!
  const cost = selectedProvider.pricing.amount
  const eligible = Boolean(prompt.trim() || hasMedia) && cost > 0

  useEffect(() => {
    setAdvanced(false)
    setStyleOpen(false)
    setMarking(false)
  }, [data.node.id])

  useEffect(() => {
    if (!marking) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      setMarking(false)
      queueMicrotask(() => markingTriggerRef.current?.focus())
    }
    window.addEventListener('keydown', handleEscape, true)
    return () => window.removeEventListener('keydown', handleEscape, true)
  }, [marking])

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

  const closeUpscale = () => {
    onUpscalePendingChange(false)
    queueMicrotask(() => upscaleTriggerRef.current?.focus())
  }

  return (
    <section
      className="image-generation-panel nodrag"
      role="region"
      aria-label={`${data.node.title} 生成参数`}
    >
      <div
        className="image-generation-panel__primary-actions"
        role="toolbar"
        aria-label="图片主操作"
      >
        <button
          type="button"
          aria-pressed={data.imageReferenceSelecting}
          onClick={(event) => {
            setMarking(false)
            data.onStartImageReferenceSelection?.(event.currentTarget)
          }}
        >
          <ScanSearch aria-hidden="true" />参考
        </button>
        <button
          ref={markingTriggerRef}
          type="button"
          aria-pressed={marking}
          onClick={() => {
            if (data.imageReferenceSelecting) {
              data.onEndImageReferenceSelection?.(false)
            }
            setMarking((enabled) => !enabled)
          }}
        >
          <ScanSearch aria-hidden="true" />标记
        </button>
        <button
          ref={styleTriggerRef}
          type="button"
          aria-expanded={styleOpen}
          onClick={() => {
            setMarking(false)
            setStyleOpen(true)
          }}
        >
          <Sparkles aria-hidden="true" />风格
        </button>
      </div>
      {incomingReferenceCount ? (
        <span
          className="image-generation-panel__reference-count"
          aria-label={`${incomingReferenceCount} 个上游参考`}
        >
          <ScanSearch aria-hidden="true" />{incomingReferenceCount}
        </span>
      ) : null}
      {imageToImage ? (
        <p className="image-generation-panel__mode" role="status">
          已切换图生图模式
        </p>
      ) : null}
      {marking ? (
        <section
          className="image-reference-selection"
          role="region"
          aria-label="标记元素"
        >
          <strong>标记元素</strong>
          <p>点击图片选择局部元素</p>
          <button type="button" onClick={() => setMarking(false)}>退出标记</button>
        </section>
      ) : null}
      <p className="image-generation-panel__instruction">
        可直接文字生图，或上传图片输入文字指令对图片进行编辑，如：将背景改为雪夜
      </p>
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
        <label className="image-generation-panel__model">
          <span className="visually-hidden">图片模型</span>
          <select
            aria-label="图片模型"
            value={selectedProvider.id}
            onChange={(event) => data.onSelectModelProvider?.(event.target.value)}
          >
            {providers.map((provider) => (
              <option
                key={provider.id}
                value={provider.id}
                disabled={provider.kind === 'placeholder'}
              >
                {provider.id === 'mock-mj-image'
                  ? 'Lib Image'
                  : providerOptionLabel(provider)}
              </option>
            ))}
          </select>
        </label>
        <span className="model-provider-badge">演示</span>
        <span className="image-generation-panel__parameter-row">
          16:9 · 标准画质 · 2K · 1张
        </span>
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
          <p>点画布其他节点建立引用连线</p>
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
        <span aria-label={`预计成本 ${cost}`}>
          <Zap aria-hidden="true" />预计成本 {cost}
        </span>
        <button
          type="button"
          aria-label={`生成图片，预计成本 ${cost}`}
          aria-describedby={!eligible ? 'image-generation-reason' : undefined}
          title="本地演示，不连接真实生成"
          disabled={!eligible}
          onClick={() => data.onLocalImageGenerate?.()}
        >
          <ArrowUp aria-hidden="true" />
          <span className="visually-hidden">生成</span>
        </button>
      </div>
      {!eligible ? (
        <p id="image-generation-reason" className="image-generation-panel__reason">
          请输入提示词或添加参考媒体后再生成。
        </p>
      ) : null}
      {styleOpen ? <ImageStyleGallery onClose={closeStyles} /> : null}
      {upscalePending ? createPortal(
        <div className="image-result-confirm nodrag">
          <div role="alertdialog" aria-modal="true" aria-label="将添加工具节点">
            <button type="button" aria-label="关闭添加工具节点提示" onClick={closeUpscale}>
              <X aria-hidden="true" />
            </button>
            <h2>将添加工具节点</h2>
            <p>图片高清会在当前节点下游创建一个本地工具节点，不会立即消耗积分。</p>
            <div>
              <button type="button" onClick={closeUpscale}>取消</button>
              <button
                type="button"
                aria-label="确认添加图片高清工具节点"
                onClick={() => {
                  closeUpscale()
                  data.onCreateImageToolNode?.('图片高清')
                }}
              >
                确认添加
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
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
