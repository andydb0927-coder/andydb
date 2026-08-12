import { useEffect, useMemo, useState } from 'react'

import {
  createGenerationProviderPreferenceStore,
  type GenerationProviderPreference,
  type GenerationProviderPreferenceStore,
} from '../generation/generation-provider-preference'
import { fetchLibTvCatalog } from '../generation/libtv-generation-adapter'
import type {
  LibTvCatalog,
  LibTvModelSummary,
} from '../generation/libtv-contract'
import {
  modelCapabilities,
  modelProviderStatus,
  type ModelCapabilityKind,
} from './model-capabilities'

type ModelFilter = 'all' | ModelCapabilityKind
type DraftProvider = GenerationProviderPreference['provider']
type CatalogLoader = (signal?: AbortSignal) => Promise<LibTvCatalog>

export interface ModelsPageProps {
  catalogLoader?: CatalogLoader
  preferenceStore?: GenerationProviderPreferenceStore
}

const filters: Array<{ id: ModelFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
]

const defaultPreferenceStore = createGenerationProviderPreferenceStore()
const defaultCatalogLoader: CatalogLoader = (signal) =>
  fetchLibTvCatalog({ signal })

export function ModelsPage({
  catalogLoader = defaultCatalogLoader,
  preferenceStore = defaultPreferenceStore,
}: ModelsPageProps) {
  const initialPreference = useMemo(
    () => safeReadPreference(preferenceStore),
    [preferenceStore],
  )
  const [filter, setFilter] = useState<ModelFilter>('all')
  const [draftProvider, setDraftProvider] = useState<DraftProvider>(
    initialPreference.provider,
  )
  const [projectUuid, setProjectUuid] = useState(
    initialPreference.provider === 'libtv'
      ? initialPreference.selection.projectUuid
      : '',
  )
  const [imageModelName, setImageModelName] = useState(
    initialPreference.provider === 'libtv'
      ? initialPreference.selection.imageModelName
      : '',
  )
  const [videoModelName, setVideoModelName] = useState(
    initialPreference.provider === 'libtv'
      ? initialPreference.selection.videoModelName
      : '',
  )
  const [catalog, setCatalog] = useState<LibTvCatalog>()
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  )
  const [loadRevision, setLoadRevision] = useState(0)
  const [savedStatus, setSavedStatus] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setCatalogState('loading')
    setSavedStatus(undefined)
    void catalogLoader(controller.signal).then(
      (nextCatalog) => {
        if (!active) return
        setCatalog(nextCatalog)
        setCatalogState('ready')
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return
        setCatalog(undefined)
        setCatalogState('error')
      },
    )
    return () => {
      active = false
      controller.abort()
    }
  }, [catalogLoader, loadRevision])

  const visibleCapabilities = useMemo(
    () =>
      filter === 'all'
        ? modelCapabilities
        : modelCapabilities.filter((capability) => capability.kind === filter),
    [filter],
  )
  const selectedProject = catalog?.projects.find(
    (project) => project.uuid === projectUuid,
  )
  const imageModelIsCurrent = catalog?.imageModels.some(
    (model) => model.modelName === imageModelName,
  ) ?? false
  const videoModelIsCurrent = catalog?.videoModels.some(
    (model) => model.modelName === videoModelName,
  ) ?? false
  const canEnableLibTv = Boolean(
    catalogState === 'ready' &&
    catalog?.cliInstalled &&
    catalog.authenticated &&
    catalog.writesEnabled &&
    selectedProject &&
    imageModelIsCurrent &&
    videoModelIsCurrent,
  )

  function updateProvider(provider: DraftProvider) {
    setDraftProvider(provider)
    setSavedStatus(undefined)
  }

  function saveProvider() {
    if (draftProvider === 'demo') {
      preferenceStore.write({ provider: 'demo' })
      setSavedStatus('已启用 Demo 本地演示')
      return
    }
    if (!canEnableLibTv || !selectedProject) return
    preferenceStore.write({
      provider: 'libtv',
      selection: {
        projectUuid: selectedProject.uuid,
        projectName: selectedProject.name,
        imageModelName,
        videoModelName,
      },
    })
    setSavedStatus('已启用 LibTV 实际生成')
  }

  return (
    <main className="platform-page">
      <header className="platform-page__header">
        <p className="platform-page__eyebrow">CAPABILITY BOUNDARY</p>
        <h1>模型能力</h1>
        <p>
          <strong>本地演示适配器</strong>始终可用于验证画布内的生成与版本流转。
          <strong>{modelProviderStatus}</strong>。
        </p>
      </header>

      <section className="platform-provider" aria-labelledby="provider-title">
        <div className="platform-section__heading">
          <div>
            <p>GENERATION PROVIDER</p>
            <h2 id="provider-title">生成提供方</h2>
          </div>
          {catalogState === 'ready' && (
            <button type="button" onClick={() => setLoadRevision((value) => value + 1)}>
              刷新 LibTV 目录
            </button>
          )}
        </div>

        {catalogState === 'loading' && (
          <p className="platform-provider__feedback" role="status">
            正在读取 LibTV 目录…
          </p>
        )}
        {catalogState === 'error' && (
          <div className="platform-provider__feedback platform-provider__feedback--error" role="alert">
            <p>无法读取 LibTV 目录，请重试。</p>
            <button type="button" onClick={() => setLoadRevision((value) => value + 1)}>
              重试 LibTV 目录
            </button>
          </div>
        )}
        {catalogState === 'ready' && catalog && (
          <div className="platform-provider__catalog-status">
            <strong>
              {catalog.cliVersion
                ? `LibTV CLI ${catalog.cliVersion}`
                : catalog.cliInstalled
                  ? 'LibTV CLI 已安装'
                  : 'LibTV CLI 不可用'}
            </strong>
            <span>{catalog.authenticated ? '已登录' : '未登录'}</span>
            <span>{catalog.writesEnabled ? '远程写入已启用' : '远程写入未启用'}</span>
          </div>
        )}
        {catalog?.error && (
          <p className="platform-provider__feedback platform-provider__feedback--error" role="alert">
            LibTV 目录当前不可用，请检查 CLI 状态后重试。
          </p>
        )}

        <fieldset className="platform-provider__radios">
          <legend>选择生成提供方</legend>
          <label>
            <input
              checked={draftProvider === 'demo'}
              name="generation-provider"
              type="radio"
              onChange={() => updateProvider('demo')}
            />
            Demo 本地演示
          </label>
          <label>
            <input
              checked={draftProvider === 'libtv'}
              name="generation-provider"
              type="radio"
              onChange={() => updateProvider('libtv')}
            />
            LibTV 实际生成
          </label>
        </fieldset>

        <div className="platform-provider__controls">
          <label>
            <span>远程画布</span>
            <select
              aria-label="远程画布"
              disabled={!catalog}
              value={projectUuid}
              onChange={(event) => {
                setProjectUuid(event.target.value)
                setSavedStatus(undefined)
              }}
            >
              <option value="">请选择远程画布</option>
              {catalog?.projects.map((project) => (
                <option key={project.uuid} value={project.uuid}>{project.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>图片模型</span>
            <select
              aria-label="图片模型"
              disabled={!catalog}
              value={imageModelName}
              onChange={(event) => {
                setImageModelName(event.target.value)
                setSavedStatus(undefined)
              }}
            >
              <option value="">请选择图片模型</option>
              {catalog?.imageModels.map((model) => (
                <option key={model.modelKey} value={model.modelName}>{model.modelName}</option>
              ))}
            </select>
          </label>
          <label>
            <span>视频模型</span>
            <select
              aria-label="视频模型"
              disabled={!catalog}
              value={videoModelName}
              onChange={(event) => {
                setVideoModelName(event.target.value)
                setSavedStatus(undefined)
              }}
            >
              <option value="">请选择视频模型</option>
              {catalog?.videoModels.map((model) => (
                <option key={model.modelKey} value={model.modelName}>{model.modelName}</option>
              ))}
            </select>
          </label>
        </div>

        {draftProvider === 'libtv' && !canEnableLibTv && (
          <p className="platform-provider__reason">
            需要可用且已登录的 LibTV CLI、服务端写入门禁，以及目录内完整的画布和模型选择。
          </p>
        )}
        <div className="platform-provider__actions">
          <button
            type="button"
            disabled={draftProvider === 'libtv' && !canEnableLibTv}
            onClick={saveProvider}
          >
            {draftProvider === 'libtv'
              ? '启用 LibTV 实际生成'
              : '启用 Demo 本地演示'}
          </button>
          {savedStatus && <p role="status">{savedStatus}</p>}
        </div>
      </section>

      {catalog && (catalog.imageModels.length > 0 || catalog.videoModels.length > 0) && (
        <section className="platform-live-models" aria-label="LibTV 实时模型目录">
          {[...catalog.imageModels.map((model) => ({ model, kind: '图片模型' })),
            ...catalog.videoModels.map((model) => ({ model, kind: '视频模型' }))]
            .map(({ model, kind }) => (
              <LiveModelCard key={`${kind}-${model.modelKey}`} kind={kind} model={model} />
            ))}
        </section>
      )}

      <fieldset className="platform-filter-group">
        <legend>按能力类型筛选</legend>
        {filters.map((candidate) => (
          <label key={candidate.id}>
            <input
              checked={filter === candidate.id}
              name="model-capability-kind"
              type="radio"
              value={candidate.id}
              onChange={() => setFilter(candidate.id)}
            />
            {candidate.label}
          </label>
        ))}
      </fieldset>

      <section className="platform-card-grid" aria-label="当前能力目录">
        {visibleCapabilities.map((capability) => (
          <article className="platform-card" key={capability.id}>
            <p>{capability.kind === 'image' ? '图片流程' : '视频流程'}</p>
            <h2>{capability.label}</h2>
            <p>{capability.description}</p>
            <span className="platform-card__status">{capability.status}</span>
          </article>
        ))}
      </section>
    </main>
  )
}

function LiveModelCard({
  model,
  kind,
}: {
  model: LibTvModelSummary
  kind: string
}) {
  return (
    <article className="platform-card">
      <p>{kind}</p>
      <h2>{model.modelName}</h2>
      {model.description && <p>{model.description}</p>}
      <dl>
        {model.estimatedTime && (
          <div><dt>预计耗时</dt><dd>{model.estimatedTime}</dd></div>
        )}
        <div>
          <dt>费用说明</dt>
          <dd>{model.pricingRule ?? '费用以 LibTV 提交时为准'}</dd>
        </div>
      </dl>
    </article>
  )
}

function safeReadPreference(
  store: GenerationProviderPreferenceStore,
): GenerationProviderPreference {
  try {
    return store.read()
  } catch {
    return { provider: 'demo' }
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
