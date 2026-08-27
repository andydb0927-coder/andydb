import {
  ArrowUp,
  ChevronDown,
  Download,
  Grid3X3,
  Heart,
  Images,
  Languages,
  Maximize2,
  ScanSearch,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import { withAppBase } from '../../../app/public-url'
import {
  defaultImageGenerationSettings,
  type ImageGenerationSettings,
} from '../../project/model'
import {
  defaultProviderRegistry,
  groupProvidersForMenu,
  isProviderEnabled,
  providerGenerationCost,
  providerCapabilityLabel,
  providerDefaultParameters,
  providerOptionLabel,
} from '../../generation/model-provider-registry'
import type {
  ManagedAiPlaceholderId,
  ModelParameterName,
  ModelProvider,
} from '../../generation/model-provider-registry'
import {
  imageSizeResolver,
  simplifiedImageRatio,
} from '../../generation/image-size-resolver'
import type { CreativeNodeData } from '../node-types'
import { AiPlaceholderBadge, AiPlaceholderNotice } from '../AiPlaceholderNotice'
import { PromptAssist } from '../PromptAssist'
import { imageAiPlaceholderForLabel } from '../prompt-assist'
import { imagePrimaryActionsFor } from './image-result-action-policy'

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
    cover: withAppBase('/demo/character-lin-yuan.png'),
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
    cover: withAppBase('/demo/shot-rooftop.png'),
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
    cover: withAppBase('/demo/scene-rain-street.png'),
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
    cover: withAppBase('/demo/shot-river.png'),
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
    cover: withAppBase('/demo/scene-rain-street.png'),
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
    cover: withAppBase('/demo/shot-rooftop.png'),
    recent: false,
  },
] as const

type StyleTab = 'plaza' | 'favorites' | 'recent'

type ImageTemplateCategory = 'story' | 'texture' | 'space' | 'setting'

interface ImageCreationTemplate {
  label: string
  category: ImageTemplateCategory
  featured?: boolean
}

const imageCreationTemplateColumns: ReadonlyArray<
  ReadonlyArray<{ title: string; items: readonly ImageCreationTemplate[] }>
> = [
  [
    {
      title: '分镜叙事',
      items: [
        { label: '调度故事板', category: 'story', featured: true },
        { label: '故事板', category: 'story', featured: true },
        { label: '25宫格连贯分镜', category: 'story' },
        { label: '剧情推演四宫格', category: 'story' },
        { label: '画面推演 - 3秒后', category: 'story' },
        { label: '画面推演 - 5秒前', category: 'story' },
      ],
    },
    {
      title: '质感调节',
      items: [
        { label: '人像质感调节', category: 'texture', featured: true },
        { label: '电影级光影校正', category: 'texture' },
      ],
    },
  ],
  [
    {
      title: '空间与机位',
      items: [
        { label: '720全景', category: 'space' },
        { label: '多机位九宫格', category: 'space' },
      ],
    },
    {
      title: '设定图',
      items: [
        { label: '角色脸部三视图', category: 'setting' },
        { label: '角色设定图', category: 'setting' },
        { label: '角色三视图', category: 'setting' },
        { label: '场景设定图', category: 'setting' },
        { label: '产品设定图', category: 'setting' },
      ],
    },
  ],
]

type ImageParameterKey =
  | 'quality'
  | 'resolution'
  | 'aspectRatio'
  | 'count'
  | 'customWidth'
  | 'customHeight'
  | 'editStrength'

function imageEnumOptions(
  provider: ModelProvider,
  name: ModelParameterName,
) {
  const definition = provider.parameterSchema[name]
  return definition?.type === 'enum' ? definition.options : []
}

function normalizedImageSettings(
  provider: ModelProvider,
  imageGeneration: Partial<ImageGenerationSettings> | undefined,
  generationParameters: Record<string, string | number | boolean> | undefined,
): ImageGenerationSettings {
  const defaults = providerDefaultParameters(provider)
  const enumValue = (
    name: 'quality' | 'resolution' | 'aspectRatio',
    fallback: string,
  ) => {
    const options = imageEnumOptions(provider, name)
    const candidate = generationParameters?.[name] ?? imageGeneration?.[name]
    if (options.includes(String(candidate))) return String(candidate)
    return String(defaults[name] ?? options[0] ?? fallback)
  }
  const countOptions = imageEnumOptions(provider, 'count')
  const countCandidate = String(
    generationParameters?.count ?? imageGeneration?.count ?? '',
  )
  const count = Number(
    countOptions.includes(countCandidate)
      ? countCandidate
      : defaults.count ?? countOptions[0] ?? defaultImageGenerationSettings.count,
  ) as ImageGenerationSettings['count']
  const editStrengthDefinition = provider.parameterSchema.editStrength
  const editStrengthCandidate = Number(
    generationParameters?.editStrength ?? imageGeneration?.editStrength,
  )
  const numberValue = (
    name: 'customWidth' | 'customHeight',
    fallback: number,
  ) => {
    const definition = provider.parameterSchema[name]
    const candidate = Number(generationParameters?.[name] ?? imageGeneration?.[name])
    return definition?.type === 'number' && Number.isFinite(candidate)
      ? candidate
      : Number(defaults[name] ?? fallback)
  }

  return {
    ...defaultImageGenerationSettings,
    ...imageGeneration,
    quality: enumValue(
      'quality',
      defaultImageGenerationSettings.quality,
    ) as ImageGenerationSettings['quality'],
    resolution: enumValue(
      'resolution',
      defaultImageGenerationSettings.resolution,
    ) as ImageGenerationSettings['resolution'],
    aspectRatio: enumValue(
      'aspectRatio',
      defaultImageGenerationSettings.aspectRatio,
    ) as ImageGenerationSettings['aspectRatio'],
    customWidth: numberValue(
      'customWidth',
      defaultImageGenerationSettings.customWidth,
    ),
    customHeight: numberValue(
      'customHeight',
      defaultImageGenerationSettings.customHeight,
    ),
    count,
    editStrength:
      editStrengthDefinition?.type === 'number'
        ? Number.isFinite(editStrengthCandidate)
          ? editStrengthCandidate
          : editStrengthDefinition.defaultValue
        : defaultImageGenerationSettings.editStrength,
  }
}

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

function ImageParameterPicker({
  settings,
  provider,
  imageToImage,
  triggerRef,
  onChange,
  onClose,
}: {
  settings: ImageGenerationSettings
  provider: ModelProvider
  imageToImage: boolean
  triggerRef: RefObject<HTMLButtonElement | null>
  onChange<Key extends ImageParameterKey>(
    key: Key,
    value: ImageGenerationSettings[Key],
  ): void
  onClose(restoreFocus: boolean): void
}) {
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose(true)
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (
        pickerRef.current?.contains(event.target) ||
        triggerRef.current?.contains(event.target)
      ) {
        return
      }
      onClose(false)
    }
    window.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [onClose, triggerRef])

  const optionButton = <Key extends ImageParameterKey>(
    key: Key,
    value: ImageGenerationSettings[Key],
    label: string,
    content?: React.ReactNode,
  ) => (
    <button
      key={String(value)}
      type="button"
      aria-label={label}
      aria-pressed={settings[key] === value}
      onClick={() => onChange(key, value)}
    >
      {content ?? label}
    </button>
  )

  const qualityOptions = imageEnumOptions(provider, 'quality')
  const resolutionOptions = imageEnumOptions(provider, 'resolution')
  const aspectRatioOptions = imageEnumOptions(provider, 'aspectRatio')
  const countOptions = imageEnumOptions(provider, 'count').map(Number)
  const editStrength = provider.parameterSchema.editStrength
  const customWidth = provider.parameterSchema.customWidth
  const customHeight = provider.parameterSchema.customHeight
  const resolver = imageSizeResolver(provider.sizePolicy)
  const customSizeErrorMessage = resolver?.validationError(
    settings as unknown as Record<string, string | number | boolean>,
  )

  return (
    <div
      ref={pickerRef}
      className="image-parameter-picker nodrag nowheel"
      role="dialog"
      aria-label="图片生成参数"
    >
      {qualityOptions.length ? <fieldset>
        <legend>画质</legend>
        <div className="image-parameter-picker__three-column">
          {qualityOptions.map((option) =>
            optionButton(
              'quality',
              option as ImageGenerationSettings['quality'],
              option,
            ),
          )}
        </div>
      </fieldset> : null}
      {resolutionOptions.length ? <fieldset>
        <legend>清晰度</legend>
        <div className="image-parameter-picker__three-column">
          {resolutionOptions.map((option) =>
            optionButton(
              'resolution',
              option as ImageGenerationSettings['resolution'],
              option,
            ),
          )}
        </div>
      </fieldset> : null}
      {aspectRatioOptions.length ? <fieldset>
        <legend>比例</legend>
        <div className="image-parameter-picker__ratio-grid">
          {aspectRatioOptions.map((option) => {
            const [width, height] = option.split(':').map(Number)
            const orientation =
              option === '自适应'
                ? 'adaptive'
                : option === '自定义'
                  ? 'custom'
                  : width === height
                    ? 'square'
                    : width > height
                      ? 'landscape'
                      : 'portrait'
            return optionButton(
              'aspectRatio',
              option as ImageGenerationSettings['aspectRatio'],
              option,
              <>
                <span
                  className="image-parameter-picker__ratio-icon"
                  data-orientation={orientation}
                  aria-hidden="true"
                />
                <span>{option}</span>
              </>,
            )
          })}
        </div>
      </fieldset> : null}
      {settings.aspectRatio === '自定义' &&
      customWidth?.type === 'number' &&
      customHeight?.type === 'number' ? (
        <fieldset className="image-parameter-picker__custom-size">
          <legend>自定义尺寸</legend>
          <div>
            <label>
              宽度
              <input
                type="number"
                aria-label="自定义宽度"
                min={customWidth.min}
                max={customWidth.max}
                step={customWidth.step}
                value={settings.customWidth || ''}
                onChange={(event) =>
                  onChange('customWidth', event.currentTarget.valueAsNumber || 0)
                }
              />
            </label>
            <span aria-hidden="true">×</span>
            <label>
              高度
              <input
                type="number"
                aria-label="自定义高度"
                min={customHeight.min}
                max={customHeight.max}
                step={customHeight.step}
                value={settings.customHeight || ''}
                onChange={(event) =>
                  onChange('customHeight', event.currentTarget.valueAsNumber || 0)
                }
              />
            </label>
          </div>
          {customSizeErrorMessage ? (
            <p role="status" className="image-parameter-picker__size-error">
              {customSizeErrorMessage}
            </p>
          ) : (
            <p role="status" className="image-parameter-picker__size-summary">
              当前比例 {simplifiedImageRatio(settings.customWidth, settings.customHeight)} ·{' '}
              {settings.customWidth} × {settings.customHeight}
            </p>
          )}
          <small>自定义尺寸会覆盖上方清晰度档位。</small>
        </fieldset>
      ) : null}
      {countOptions.length ? <fieldset>
        <legend>生成数量</legend>
        <div className="image-parameter-picker__three-column">
          {countOptions.map((option) =>
            optionButton(
              'count',
              option as ImageGenerationSettings['count'],
              `${option}张`,
            ),
          )}
        </div>
      </fieldset> : null}
      {imageToImage && editStrength?.type === 'number' ? (
        <fieldset>
          <legend>图片编辑</legend>
          <label>
            编辑强度
            <input
              type="range"
              aria-label="编辑强度"
              min={editStrength.min}
              max={editStrength.max}
              step={editStrength.step}
              value={settings.editStrength}
              onChange={(event) =>
                onChange('editStrength', Number(event.currentTarget.value))
              }
            />
          </label>
        </fieldset>
      ) : null}
    </div>
  )
}

function ImageTemplateIcon({ category }: { category: ImageTemplateCategory }) {
  if (category === 'texture') return <Sparkles aria-hidden="true" />
  if (category === 'space') return <Maximize2 aria-hidden="true" />
  if (category === 'setting') return <ScanSearch aria-hidden="true" />
  return <Images aria-hidden="true" />
}

function ImageTemplatePicker({
  triggerRef,
  onSelect,
  onClose,
}: {
  triggerRef: RefObject<HTMLButtonElement | null>
  onSelect(template: string): void
  onClose(restoreFocus: boolean): void
}) {
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose(true)
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (
        pickerRef.current?.contains(event.target) ||
        triggerRef.current?.contains(event.target)
      ) {
        return
      }
      onClose(false)
    }
    window.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [onClose, triggerRef])

  return (
    <div
      ref={pickerRef}
      className="image-template-picker nodrag nowheel"
      role="dialog"
      aria-label="图片创作模板"
    >
      {imageCreationTemplateColumns.map((column, columnIndex) => (
        <div className="image-template-picker__column" key={columnIndex}>
          {column.map((group) => {
            const headingId = `image-template-${group.title}`
            return (
              <section
                key={group.title}
                role="group"
                aria-labelledby={headingId}
                className="image-template-picker__group"
              >
                <h3 id={headingId}>{group.title}</h3>
                <div>
                  {group.items.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      aria-label={item.label}
                      onClick={() => onSelect(item.label)}
                    >
                      <span className="image-template-picker__icon">
                        <ImageTemplateIcon category={item.category} />
                        {item.featured ? (
                          <span
                            className="image-template-picker__new-dot"
                            aria-hidden="true"
                          />
                        ) : null}
                      </span>
                      <span>{item.label}</span>
                      {imageAiPlaceholderForLabel(item.label) ? (
                        <AiPlaceholderBadge compact />
                      ) : null}
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      ))}
    </div>
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
  onImageToImageChange(enabled: boolean): void
  upscalePending: boolean
  onUpscalePendingChange(pending: boolean): void
  upscaleTriggerRef: RefObject<HTMLButtonElement | null>
}) {
  const [advanced, setAdvanced] = useState(false)
  const [styleOpen, setStyleOpen] = useState(false)
  const [marking, setMarking] = useState(false)
  const [composerExpanded, setComposerExpanded] = useState(false)
  const [parametersOpen, setParametersOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [pendingTemplate, setPendingTemplate] = useState<string>()
  const [pendingAiTemplate, setPendingAiTemplate] = useState<{
    label: string
    providerId: ManagedAiPlaceholderId
    promptText: string
  }>()
  const [liveConfirmationOpen, setLiveConfirmationOpen] = useState(false)
  const activeVersion = data.node.versions.find(
    ({ id }) => id === data.node.activeVersionId,
  )
  const imageGeneration = data.node.imageGeneration
  const initialPrompt = imageGeneration?.prompt ?? activeVersion?.prompt ?? ''
  const [prompt, setPrompt] = useState(initialPrompt)
  const promptRef = useRef<HTMLDivElement>(null)
  const promptDraftRef = useRef(initialPrompt)
  const styleTriggerRef = useRef<HTMLButtonElement>(null)
  const markingTriggerRef = useRef<HTMLButtonElement>(null)
  const parameterTriggerRef = useRef<HTMLButtonElement>(null)
  const templateTriggerRef = useRef<HTMLButtonElement>(null)
  const generateTriggerRef = useRef<HTMLButtonElement>(null)
  const incomingReferenceCount =
    data.incomingReferenceCount ?? data.imageReferences?.length ?? 0
  const hasMedia = Boolean(data.asset || incomingReferenceCount)
  const providerRegistry = data.providerRegistry ?? defaultProviderRegistry
  const providers = providerRegistry.menuProvidersFor([
    'text-to-image',
    'image-to-image',
  ])
  const selectedProvider = providerRegistry.defaultFor(
    ['text-to-image', 'image-to-image'],
    data.node.generationConfig?.providerId ?? data.node.modelProviderId,
  ) ?? defaultProviderRegistry.require('seedream-5-pro-api')
  const primaryActions = imagePrimaryActionsFor(
    selectedProvider.id,
    Boolean(data.asset || data.imageResults?.length),
  )
  const generationParameters =
    data.node.generationConfig?.providerId === selectedProvider.id
      ? data.node.generationConfig.parameters
      : undefined
  const [settings, setSettings] = useState(() =>
    normalizedImageSettings(
      selectedProvider,
      imageGeneration,
      generationParameters,
    ),
  )
  const resolver = imageSizeResolver(selectedProvider.sizePolicy)
  const customSizeErrorMessage = resolver?.validationError(
    settings as unknown as Record<string, string | number | boolean>,
  )
  const resolvedSize = resolver && !customSizeErrorMessage
    ? resolver.resolve(settings as unknown as Record<
        string,
        string | number | boolean
      >)
    : undefined
  const aspectRatioSummary = resolvedSize?.label ?? (
    settings.aspectRatio === '自定义'
      ? `${settings.customWidth}×${settings.customHeight}`
      : settings.aspectRatio
  )
  const parameterSummary = [
    selectedProvider.parameterSchema.aspectRatio ? aspectRatioSummary : undefined,
    selectedProvider.parameterSchema.quality ? settings.quality : undefined,
    selectedProvider.parameterSchema.resolution ? settings.resolution : undefined,
    selectedProvider.parameterSchema.count ? `${settings.count}张` : undefined,
  ].filter(Boolean).join(' · ')
  const cost = providerGenerationCost(selectedProvider, {
    count: settings.count,
  })
  const providerEnabled = isProviderEnabled(selectedProvider)
  const eligible =
    Boolean(prompt.trim() || hasMedia) &&
    cost > 0 &&
    providerEnabled &&
    !customSizeErrorMessage
  const generationUnavailableReason = !providerEnabled
    ? selectedProvider.disabledReason ?? '当前模型暂不可用。'
    : customSizeErrorMessage
      ? customSizeErrorMessage
    : !prompt.trim() && !hasMedia
      ? '请输入提示词或添加参考媒体后再生成。'
      : undefined
  const submitTitle = selectedProvider.kind === 'live'
    ? `调用真实 ${selectedProvider.apiDisplayName ?? selectedProvider.modelName} API；结果将保存到项目与生成历史`
    : selectedProvider.kind === 'placeholder'
      ? selectedProvider.disabledReason ?? '模型待接入'
      : '本地演示，不连接真实生成'

  useEffect(() => {
    setAdvanced(false)
    setStyleOpen(false)
    setMarking(false)
    setComposerExpanded(false)
    setParametersOpen(false)
    setTemplatesOpen(false)
    setPendingTemplate(undefined)
    setPendingAiTemplate(undefined)
    setLiveConfirmationOpen(false)
  }, [data.node.id])

  useEffect(() => {
    setLiveConfirmationOpen(false)
  }, [selectedProvider.id])

  useEffect(() => {
    if (!primaryActions.includes('mark')) setMarking(false)
  }, [primaryActions])

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
    if (!pendingTemplate) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      setPendingTemplate(undefined)
      queueMicrotask(() => templateTriggerRef.current?.focus())
    }
    window.addEventListener('keydown', handleEscape, true)
    return () => window.removeEventListener('keydown', handleEscape, true)
  }, [pendingTemplate])

  useEffect(() => {
    if (!liveConfirmationOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      setLiveConfirmationOpen(false)
      queueMicrotask(() => generateTriggerRef.current?.focus())
    }
    window.addEventListener('keydown', handleEscape, true)
    return () => window.removeEventListener('keydown', handleEscape, true)
  }, [liveConfirmationOpen])

  useEffect(() => {
    const nextPrompt = imageGeneration?.prompt ?? activeVersion?.prompt ?? ''
    promptDraftRef.current = nextPrompt
    setPrompt(nextPrompt)
    if (
      promptRef.current &&
      promptRef.current.textContent !== nextPrompt
    ) {
      promptRef.current.textContent = nextPrompt
    }
  }, [activeVersion?.prompt, data.node.id, imageGeneration?.prompt])

  useEffect(() => {
    setSettings(
      normalizedImageSettings(
        selectedProvider,
        imageGeneration,
        generationParameters,
      ),
    )
  }, [data.node.id, generationParameters, imageGeneration, selectedProvider])

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

  const closeParameters = (restoreFocus: boolean) => {
    setParametersOpen(false)
    if (restoreFocus) {
      queueMicrotask(() => parameterTriggerRef.current?.focus())
    }
  }

  const closeTemplates = (restoreFocus: boolean) => {
    setTemplatesOpen(false)
    if (restoreFocus) {
      queueMicrotask(() => templateTriggerRef.current?.focus())
    }
  }

  const closeTemplateConfirmation = () => {
    setPendingTemplate(undefined)
    queueMicrotask(() => templateTriggerRef.current?.focus())
  }

  const closeAiTemplate = () => {
    setPendingAiTemplate(undefined)
    queueMicrotask(() => templateTriggerRef.current?.focus())
  }

  const closeLiveConfirmation = () => {
    setLiveConfirmationOpen(false)
    queueMicrotask(() => generateTriggerRef.current?.focus())
  }

  const submitGeneration = () => {
    const currentPrompt = promptDraftRef.current
    data.onUpdateImageGenerationSettings?.({ prompt: currentPrompt })
    data.onLocalImageGenerate?.(currentPrompt)
  }

  const applyPrompt = (nextPrompt: string) => {
    promptDraftRef.current = nextPrompt
    setPrompt(nextPrompt)
    if (promptRef.current && promptRef.current.textContent !== nextPrompt) {
      promptRef.current.textContent = nextPrompt
    }
    data.onUpdateImageGenerationSettings?.({ prompt: nextPrompt })
  }

  const applyImageSettings = (changes: Partial<ImageGenerationSettings>) => {
    setSettings((current) => ({ ...current, ...changes }))
    data.onUpdateImageGenerationSettings?.(changes)
  }

  return (
    <section
      className={`image-generation-panel nodrag${
        composerExpanded ? ' image-generation-panel--expanded' : ''
      }`}
      role="region"
      aria-label={`${data.node.title} 生成参数`}
    >
      <div
        className="image-generation-panel__primary-actions"
        role="toolbar"
        aria-label="图片主操作"
      >
        {primaryActions.includes('reference') ? (
          <button
            ref={generateTriggerRef}
            type="button"
            aria-pressed={data.imageReferenceSelecting}
            onClick={(event) => {
              setMarking(false)
              data.onStartImageReferenceSelection?.(event.currentTarget)
            }}
          >
            <ScanSearch aria-hidden="true" />参考
          </button>
        ) : null}
        {primaryActions.includes('mark') ? (
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
        ) : null}
        {primaryActions.includes('style') ? (
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
        ) : null}
      </div>
      <button
        type="button"
        className="image-generation-panel__expand"
        aria-label={composerExpanded ? '退出放大编辑区' : '放大编辑区'}
        aria-pressed={composerExpanded}
        onClick={() => setComposerExpanded((expanded) => !expanded)}
      >
        <Maximize2 aria-hidden="true" />
      </button>
      {incomingReferenceCount ? (
        <span
          className="image-generation-panel__reference-count"
          aria-label={`${incomingReferenceCount} 个上游参考`}
        >
          <ScanSearch aria-hidden="true" />{incomingReferenceCount}
        </span>
      ) : null}
      {data.imageReferences?.some(({ asset }) => asset.kind === 'image') ? (
        <ul
          className="image-generation-panel__references"
          aria-label="图生图参考图片"
        >
          {data.imageReferences
            .filter(({ asset }) => asset.kind === 'image')
            .map((reference) => (
              <li key={reference.id}>
                <img src={reference.asset.url} alt={reference.title} />
                <span>{reference.title}</span>
              </li>
            ))}
        </ul>
      ) : null}
      {imageToImage ? (
        <p className="image-generation-panel__mode" role="status">
          {incomingReferenceCount
            ? `图生图模式 · 已添加 ${incomingReferenceCount} 个参考`
            : '已切换图生图模式，请上传参考图片或使用“参考”从画布选择'}
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
      <div
        ref={promptRef}
        className="image-generation-panel__prompt"
        role="textbox"
        aria-label="提示词"
        aria-multiline="true"
        aria-placeholder="可直接文字生图，或上传图片输入文字指令对图片进行编辑，如：将背景改为雪夜"
        contentEditable
        suppressContentEditableWarning
        onInput={(event) => {
          const nextPrompt = event.currentTarget.textContent ?? ''
          promptDraftRef.current = nextPrompt
          setPrompt(nextPrompt)
        }}
        onBlur={() =>
          data.onUpdateImageGenerationSettings?.({
            prompt: promptDraftRef.current,
          })
        }
      />
      <PromptAssist
        context="image"
        prompt={prompt}
        providerRegistry={providerRegistry}
        autoLinkEnabled={settings.autoLink}
        candidates={data.autoLinkCandidates ?? []}
        linkedNodeIds={data.linkedAutoLinkNodeIds ?? []}
        onPromptChange={applyPrompt}
        onImageSettings={applyImageSettings}
        onCreateNode={data.onCreatePromptNode}
        onApplyAutoLink={data.onApplyAutoLink}
      />
      <div className="image-generation-panel__controls">
        <label className="image-generation-panel__model">
          <span className="visually-hidden">图片模型</span>
          <select
            aria-label="图片模型"
            value={selectedProvider.id}
            onChange={(event) => data.onSelectModelProvider?.(event.target.value)}
          >
            {groupProvidersForMenu(providers).map((group) => (
              <optgroup key={group.id} label={group.label}>
                {group.providers.map((provider) => (
                  <option
                    key={provider.id}
                    value={provider.id}
                    disabled={!isProviderEnabled(provider)}
                  >
                    {providerOptionLabel(provider)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <span className="model-provider-badge">
          {selectedProvider.kind === 'live'
            ? '开发直连'
            : selectedProvider.kind === 'placeholder'
              ? '待接入'
              : '演示'}
        </span>
        <span className="model-provider-capability">
          {providerCapabilityLabel(selectedProvider)}
        </span>
        <button
          ref={parameterTriggerRef}
          type="button"
          className="image-generation-panel__parameter-row"
          aria-label="图片生成参数"
          aria-haspopup="dialog"
          aria-expanded={parametersOpen}
          onClick={() => {
            setTemplatesOpen(false)
            setParametersOpen((open) => !open)
          }}
        >
          <span>
            {parameterSummary}
          </span>
          <ChevronDown aria-hidden="true" />
        </button>
        <button
          ref={templateTriggerRef}
          type="button"
          className="image-generation-panel__template-trigger"
          aria-label="图片创作模板"
          aria-haspopup="dialog"
          aria-expanded={templatesOpen}
          onClick={() => {
            setMarking(false)
            setParametersOpen(false)
            setTemplatesOpen((open) => !open)
          }}
        >
          <Grid3X3 aria-hidden="true" />
          <span className="image-template-picker__new-dot" aria-hidden="true" />
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
        <div className="image-generation-panel__submit">
          <span aria-label={`预计成本 ${cost}`}>
            <Zap aria-hidden="true" />预计成本 {cost}
          </span>
          <button
            type="button"
            aria-label={`生成图片，预计成本 ${cost}`}
            aria-describedby={generationUnavailableReason ? 'image-generation-reason' : undefined}
            title={submitTitle}
            disabled={!eligible}
            onClick={() => {
              if (selectedProvider.kind === 'live') {
                setLiveConfirmationOpen(true)
                return
              }
              submitGeneration()
            }}
          >
            <ArrowUp aria-hidden="true" />
            <span className="visually-hidden">生成</span>
          </button>
        </div>
      </div>
      {parametersOpen ? (
        <ImageParameterPicker
          settings={settings}
          provider={selectedProvider}
          imageToImage={imageToImage}
          triggerRef={parameterTriggerRef}
          onChange={updateSetting}
          onClose={closeParameters}
        />
      ) : null}
      {templatesOpen ? (
        <ImageTemplatePicker
          triggerRef={templateTriggerRef}
          onSelect={(template) => {
            setTemplatesOpen(false)
            const aiPreset = imageAiPlaceholderForLabel(template)
            if (aiPreset) {
              setPendingAiTemplate({ label: template, ...aiPreset })
            } else {
              setPendingTemplate(template)
            }
          }}
          onClose={closeTemplates}
        />
      ) : null}
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
      {generationUnavailableReason ? (
        <p id="image-generation-reason" className="image-generation-panel__reason">
          {generationUnavailableReason}
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
      {liveConfirmationOpen ? createPortal(
        <div className="image-result-confirm nodrag">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="确认真实图片生成"
          >
            <button
              type="button"
              aria-label="关闭真实图片生成确认"
              onClick={closeLiveConfirmation}
            >
              <X aria-hidden="true" />
            </button>
            <h2>确认真实图片生成</h2>
            <p>
              {settings.count} 张 × {selectedProvider.sizePolicy?.costMode.amount ?? selectedProvider.pricing.amount} 积分
            </p>
            <p>总成本 {cost} 积分</p>
            <p>
              {selectedProvider.sizePolicy?.multiImageStrategy === 'serial'
                ? `将串行调用 ${selectedProvider.apiDisplayName ?? selectedProvider.modelName} ${settings.count} 次`
                : selectedProvider.sizePolicy?.multiImageStrategy === 'batch'
                  ? `将批量请求 ${selectedProvider.apiDisplayName ?? selectedProvider.modelName} ${settings.count} 张`
                  : `将调用 ${selectedProvider.apiDisplayName ?? selectedProvider.modelName}`}
              ；结果将写入节点版本、项目资产与生成历史。
            </p>
            <div>
              <button type="button" onClick={closeLiveConfirmation}>取消</button>
              <button
                type="button"
                aria-label={`确认生成 ${settings.count} 张图片`}
                onClick={() => {
                  setLiveConfirmationOpen(false)
                  submitGeneration()
                }}
              >
                确认生成
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
      {pendingTemplate ? createPortal(
        <div className="image-result-confirm nodrag">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={`添加${pendingTemplate}工具节点`}
          >
            <button
              type="button"
              aria-label="关闭添加工具节点提示"
              onClick={closeTemplateConfirmation}
            >
              <X aria-hidden="true" />
            </button>
            <h2>将添加工具节点</h2>
            <p>
              {pendingTemplate}会在当前节点下游创建一个本地工具节点，不会立即消耗积分。
            </p>
            <div>
              <button type="button" onClick={closeTemplateConfirmation}>取消</button>
              <button
                type="button"
                aria-label={`确认添加${pendingTemplate}工具节点`}
                onClick={() => {
                  const template = pendingTemplate
                  setPendingTemplate(undefined)
                  data.onCreateImageToolNode?.(template)
                }}
              >
                确认添加
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
      {pendingAiTemplate ? (
        <AiPlaceholderNotice
          provider={providerRegistry.require(pendingAiTemplate.providerId)}
          prompt={pendingAiTemplate.promptText}
          onCopy={(templatePrompt) => {
            const currentPrompt = promptDraftRef.current.trim()
            applyPrompt(
              currentPrompt
                ? `${currentPrompt}\n${templatePrompt}`
                : templatePrompt,
            )
          }}
          onClose={closeAiTemplate}
        />
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
        {results.length}张
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

export function ImageToolDetails({ data }: { data: CreativeNodeData }) {
  const config = data.node.imageTool
  if (!config) return null

  return (
    <section
      className="image-tool-node-panel nodrag"
      role="region"
      aria-label="图片高清参数"
    >
      <header>
        <div>
          <span>IMAGE UPSCALE</span>
          <strong>{config.model}</strong>
        </div>
        <span className="model-provider-badge">本地演示</span>
      </header>
      <p>基于上游图片增强清晰度，并尽量保持原始构图、人物身份与文字细节。</p>
      <div className="image-tool-node-panel__settings">
        <label>
          放大倍数
          <select
            aria-label="放大倍数"
            value={config.scale}
            onChange={(event) =>
              data.onUpdateImageTool?.({
                scale: event.target.value as typeof config.scale,
              })
            }
          >
            <option value="2x">2x</option>
            <option value="4x">4x</option>
          </select>
        </label>
        <label>
          输出清晰度
          <select
            aria-label="输出清晰度"
            value={config.resolution}
            onChange={(event) =>
              data.onUpdateImageTool?.({
                resolution: event.target.value as typeof config.resolution,
              })
            }
          >
            <option value="2K">2K</option>
            <option value="4K">4K</option>
          </select>
        </label>
        <label className="image-tool-node-panel__toggle">
          <input
            type="checkbox"
            checked={config.detailProtection}
            onChange={(event) =>
              data.onUpdateImageTool?.({ detailProtection: event.target.checked })
            }
          />
          保护人物与文字细节
        </label>
      </div>
      <footer>
        <span><Zap aria-hidden="true" />预计成本 {config.cost}</span>
        <button
          type="button"
          aria-label={`生成高清图片，预计成本 ${config.cost}`}
          title="本地演示，不连接真实生成"
          onClick={() => {
            const activePrompt = data.node.versions.find(
              (version) => version.id === data.node.activeVersionId,
            )?.prompt ?? ''
            data.onLocalImageGenerate?.(activePrompt)
          }}
        >
          <ArrowUp aria-hidden="true" />
          <span className="visually-hidden">生成高清图片</span>
        </button>
      </footer>
    </section>
  )
}
