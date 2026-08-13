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

type DraftProvider = GenerationProviderPreference['provider']
type CatalogLoader = (signal?: AbortSignal) => Promise<LibTvCatalog>

export interface CanvasGenerationSettingsProps {
  catalogLoader?: CatalogLoader
  preferenceStore?: GenerationProviderPreferenceStore
}

const defaultPreferenceStore = createGenerationProviderPreferenceStore()
const defaultCatalogLoader: CatalogLoader = (signal) =>
  fetchLibTvCatalog({ signal })

export function CanvasGenerationSettings({
  catalogLoader = defaultCatalogLoader,
  preferenceStore = defaultPreferenceStore,
}: CanvasGenerationSettingsProps) {
  const initialPreference = useMemo(
    () => safeReadPreference(preferenceStore),
    [preferenceStore],
  )
  const [draftProvider, setDraftProvider] = useState<DraftProvider>(
    initialPreference.provider,
  )
  const [projectUuid, setProjectUuid] = useState(
    initialPreference.provider === 'libtv'
      ? initialPreference.selection.projectUuid
      : '',
  )
  const [imageModelKey, setImageModelKey] = useState(
    initialPreference.provider === 'libtv'
      ? initialPreference.selection.imageModelKey
      : '',
  )
  const [imageModelName, setImageModelName] = useState(
    initialPreference.provider === 'libtv'
      ? initialPreference.selection.imageModelName
      : '',
  )
  const [videoModelKey, setVideoModelKey] = useState(
    initialPreference.provider === 'libtv'
      ? initialPreference.selection.videoModelKey
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

  const selectedProject = catalog?.projects.find(
    (project) => project.uuid === projectUuid,
  )
  const selectedImageModel = catalog?.imageModels.find(
    (model) =>
      model.modelKey === imageModelKey && model.modelName === imageModelName,
  )
  const selectedVideoModel = catalog?.videoModels.find(
    (model) =>
      model.modelKey === videoModelKey && model.modelName === videoModelName,
  )
  const canEnableLibTv = Boolean(
    catalogState === 'ready' &&
      catalog?.cliInstalled &&
      catalog.authenticated &&
      catalog.writesEnabled &&
      selectedProject &&
      selectedImageModel &&
      selectedVideoModel,
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
    if (
      !canEnableLibTv ||
      !selectedProject ||
      !selectedImageModel ||
      !selectedVideoModel
    ) return
    preferenceStore.write({
      provider: 'libtv',
      selection: {
        projectUuid: selectedProject.uuid,
        projectName: selectedProject.name,
        imageModelKey: selectedImageModel.modelKey,
        imageModelName: selectedImageModel.modelName,
        videoModelKey: selectedVideoModel.modelKey,
        videoModelName: selectedVideoModel.modelName,
      },
    })
    setSavedStatus('已启用 LibTV 实际生成')
  }

  return (
    <section className="platform-provider canvas-generation-settings" aria-label="生成提供方">
      <div className="canvas-generation-settings__heading">
        <div>
          <span>GENERATION PROVIDER</span>
          <h3>生成提供方</h3>
        </div>
        {catalogState === 'ready' ? (
          <button type="button" onClick={() => setLoadRevision((value) => value + 1)}>
            刷新目录
          </button>
        ) : null}
      </div>

      {catalogState === 'loading' ? (
        <p className="platform-provider__feedback" role="status">
          正在读取 LibTV 目录…
        </p>
      ) : null}
      {catalogState === 'error' ? (
        <div className="platform-provider__feedback platform-provider__feedback--error" role="alert">
          <p>无法读取 LibTV 目录，请重试。</p>
          <button type="button" onClick={() => setLoadRevision((value) => value + 1)}>
            重试
          </button>
        </div>
      ) : null}
      {catalogState === 'ready' && catalog ? (
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
      ) : null}

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
            value={imageModelKey}
            onChange={(event) => {
              const model = catalog?.imageModels.find(
                (candidate) => candidate.modelKey === event.target.value,
              )
              setImageModelKey(model?.modelKey ?? '')
              setImageModelName(model?.modelName ?? '')
              setSavedStatus(undefined)
            }}
          >
            <option value="">请选择图片模型</option>
            {catalog?.imageModels.map((model) => (
              <option key={model.modelKey} value={model.modelKey}>
                {modelOptionLabel(model, catalog.imageModels)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>视频模型</span>
          <select
            aria-label="视频模型"
            disabled={!catalog}
            value={videoModelKey}
            onChange={(event) => {
              const model = catalog?.videoModels.find(
                (candidate) => candidate.modelKey === event.target.value,
              )
              setVideoModelKey(model?.modelKey ?? '')
              setVideoModelName(model?.modelName ?? '')
              setSavedStatus(undefined)
            }}
          >
            <option value="">请选择视频模型</option>
            {catalog?.videoModels.map((model) => (
              <option key={model.modelKey} value={model.modelKey}>
                {modelOptionLabel(model, catalog.videoModels)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {draftProvider === 'libtv' && !canEnableLibTv ? (
        <p className="platform-provider__reason">
          需要可用且已登录的 LibTV CLI、远程写入权限，以及完整的画布和模型选择。
        </p>
      ) : null}
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
        {savedStatus ? <p role="status">{savedStatus}</p> : null}
      </div>
    </section>
  )
}

function modelOptionLabel(
  model: LibTvModelSummary,
  models: readonly LibTvModelSummary[],
) {
  const duplicateName = models.some(
    (candidate) =>
      candidate.modelKey !== model.modelKey &&
      candidate.modelName === model.modelName,
  )
  return duplicateName
    ? `${model.modelName} · ${model.modelKey.slice(0, 8)}`
    : model.modelName
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
