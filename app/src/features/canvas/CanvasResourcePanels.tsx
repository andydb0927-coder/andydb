import {
  Check,
  ChevronRight,
  Eye,
  Folder,
  MoreHorizontal,
  Pencil,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'

import { withAppBase } from '../../app/public-url'
import { AssetDeleteDialog } from '../assets/AssetDeleteDialog'
import type {
  DeleteLibraryAssetResult,
} from '../assets/asset-library-repository'
import type { AssetLibraryRepository } from '../assets/asset-library-repository'
import type {
  LibraryAssetFolderId,
  LibraryAssetRecord,
} from '../assets/library-model'
import type { Asset, Project } from '../project/model'
import type { SubjectAsset } from '../subjects/subject-model'
import type { SubjectRepository } from '../subjects/subject-repository'

export const SUBJECT_DRAG_MIME = 'application/x-wireless-canvas-subject'

export interface EffectTemplate {
  id: string
  name: string
  colors: [string, string, string]
}

export interface MaterialLibraryEntry {
  id: 'style-reference' | 'effect-reference'
  kind: 'style' | 'effect'
  name: string
  description: string
  colors: [string, string, string]
}

const materialLibraryEntries: MaterialLibraryEntry[] = [
  {
    id: 'style-reference',
    kind: 'style',
    name: '电影胶片风格',
    description: '作为下游生成的风格参考',
    colors: ['#b99862', '#563227', '#181516'],
  },
  {
    id: 'effect-reference',
    kind: 'effect',
    name: '雨夜粒子特效',
    description: '作为下游画面的特效参考',
    colors: ['#7cc8db', '#344a69', '#151929'],
  },
]

export function MaterialLibraryPanel({
  onInsert,
}: {
  onInsert(entry: MaterialLibraryEntry): void
}) {
  return (
    <div className="canvas-resource-dialog material-library" role="dialog" aria-label="素材库">
      <div className="resource-panel__intro">
        <span>REFERENCE LIBRARY</span>
        <h3>风格与特效参考</h3>
        <p>选择后在画布中插入参考节点，不会触发真实生成。</p>
      </div>
      {materialLibraryEntries.map((entry) => (
        <section key={entry.id} className="material-library__section" aria-label={entry.kind === 'style' ? '风格库' : '特效库'}>
          <span
            className="material-library__preview"
            style={{
              '--effect-a': entry.colors[0],
              '--effect-b': entry.colors[1],
              '--effect-c': entry.colors[2],
            } as CSSProperties}
          />
          <div>
            <strong>{entry.name}</strong>
            <p>{entry.description}</p>
          </div>
          <button
            type="button"
            aria-label={`添加${entry.kind === 'style' ? '风格' : '特效'}参考节点`}
            onClick={() => onInsert(entry)}
          >
            <Send aria-hidden="true" />添加到画布
          </button>
        </section>
      ))}
    </div>
  )
}

const effectTemplates: EffectTemplate[] = [
  ['light', '光效', ['#f7d778', '#ff8f70', '#6439d5']],
  ['smoke', '烟雾', ['#cbd4e6', '#69768f', '#202536']],
  ['particles', '粒子', ['#fee18a', '#ff6f91', '#34216f']],
  ['ink', '水墨', ['#eef3e7', '#65796b', '#111820']],
  ['ancient', '古风', ['#d8aa6d', '#8a4d3d', '#1f2d2a']],
  ['flame', '火焰', ['#fff1a1', '#ff5b32', '#5b1020']],
  ['rain-snow', '雨雪', ['#e7f7ff', '#65a7d4', '#1b3159']],
  ['star-trail', '星轨', ['#9fe6ff', '#7057d9', '#17113f']],
  ['lightning', '闪电', ['#f9ffff', '#56c6ff', '#3d228d']],
  ['explosion', '爆炸', ['#ffe56f', '#ee5431', '#3a1723']],
  ['fluid', '流体', ['#75f1d1', '#3975db', '#47205d']],
  ['neon', '霓虹', ['#f24bd4', '#4cf4ef', '#171528']],
  ['smoke-fade', '烟雾消散', ['#f4e6db', '#8e8591', '#232331']],
  ['ribbon', '飘带', ['#ff90b4', '#f3cd6e', '#5862d8']],
  ['petals', '花瓣', ['#ffe4ed', '#f789ac', '#66477e']],
  ['leaves', '落叶', ['#f6c858', '#b35d31', '#39472f']],
  ['aurora', '极光', ['#8fffd1', '#54a5e8', '#7946c7']],
].map(([id, name, colors]) => ({
  id: id as string,
  name: name as string,
  colors: colors as [string, string, string],
}))

export interface WorkspaceAsset {
  id: string
  name: string
  kind: Asset['kind']
  url: string
  mimeType: string
  width?: number
  height?: number
  durationSeconds?: number
  folderId: LibraryAssetFolderId
  folderName: string
  existingProjectAsset: boolean
}

export interface CharacterProfile {
  id: string
  name: string
  gender: '男' | '女'
  age: '少年' | '青年' | '中年'
  era: '现代' | '古代' | '未来'
  role: '主角' | '配角' | '反派' | '导师'
  position: string
  tags: string[]
  images: string[]
}

const characterProfiles: CharacterProfile[] = [
  {
    id: 'lin-yuan',
    name: '林渊',
    gender: '男',
    age: '青年',
    era: '现代',
    role: '主角',
    position: '独立记者',
    tags: ['冷静', '雨夜', '电影感'],
    images: ['/demo/character-lin-yuan.png', '/demo/shot-rooftop.png', '/demo/character-lin-yuan.png', '/demo/shot-river.png'].map((url) => withAppBase(url)),
  },
  {
    id: 'cheng-ye',
    name: '程野',
    gender: '女',
    age: '青年',
    era: '古代',
    role: '配角',
    position: '侦查使',
    tags: ['侦查使', '宋制', '果断'],
    images: ['/demo/character-lin-yuan.png', '/demo/shot-river.png', '/demo/shot-rooftop.png', '/demo/scene-rain-street.png'].map((url) => withAppBase(url)),
  },
  {
    id: 'qiao-feng',
    name: '乔锋',
    gender: '男',
    age: '中年',
    era: '古代',
    role: '导师',
    position: '镖局教习',
    tags: ['沉稳', '武侠', '领路人'],
    images: ['/demo/shot-rooftop.png', '/demo/character-lin-yuan.png', '/demo/shot-river.png', '/demo/scene-rain-street.png'].map((url) => withAppBase(url)),
  },
  {
    id: 'a-ning',
    name: '阿宁',
    gender: '女',
    age: '少年',
    era: '未来',
    role: '主角',
    position: '边城导航员',
    tags: ['未来', '敏捷', '星际'],
    images: ['/demo/scene-rain-street.png', '/demo/shot-rooftop.png', '/demo/character-lin-yuan.png', '/demo/shot-river.png'].map((url) => withAppBase(url)),
  },
]

export function EffectToolboxPanel({
  onInsert,
}: {
  onInsert(template: EffectTemplate): void
}) {
  return (
    <section className="effect-toolbox" aria-label="动效工具箱">
      <div className="resource-panel__intro">
        <span>EFFECT LAB</span>
        <h3>17 种画面动效</h3>
        <p>选择模板会在画布中心创建可调参的特效节点。</p>
      </div>
      <div className="effect-toolbox__grid" role="list" aria-label="动效模板">
        {effectTemplates.map((template) => (
          <div key={template.id} role="listitem">
            <button
              type="button"
              aria-label={`使用${template.name}模板`}
              onClick={() => onInsert(template)}
            >
              <span
                className="effect-toolbox__preview"
                style={{
                  '--effect-a': template.colors[0],
                  '--effect-b': template.colors[1],
                  '--effect-c': template.colors[2],
                } as CSSProperties}
              />
              <strong>{template.name}</strong>
              <small>本地演示</small>
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

function assetsFromProject(project: Project): WorkspaceAsset[] {
  const rows = project.assets.map((asset): WorkspaceAsset => {
    const node = project.nodes.find((candidate) =>
      candidate.versions.some((version) => version.assetId === asset.id),
    )
    const generated = project.jobs.some((job) => job.assetId === asset.id)
    return {
      ...asset,
      name: node?.title ?? asset.id,
      folderId: generated ? 'generated' : 'project',
      folderName: generated ? '生成结果' : '当前项目',
      existingProjectAsset: true,
    }
  })
  const urls = new Set(rows.map(({ url }) => url))
  const demos: WorkspaceAsset[] = [
    {
      id: 'demo-inspiration-rooftop',
      name: '屋顶夜色',
      kind: 'image',
      url: withAppBase('/demo/shot-rooftop.png'),
      mimeType: 'image/png',
      width: 1600,
      height: 900,
      folderId: 'inspiration',
      folderName: '灵感收集',
      existingProjectAsset: false,
    },
    {
      id: 'demo-inspiration-character',
      name: '林渊角色参考',
      kind: 'image',
      url: withAppBase('/demo/character-lin-yuan.png'),
      mimeType: 'image/png',
      width: 960,
      height: 1200,
      folderId: 'inspiration',
      folderName: '灵感收集',
      existingProjectAsset: false,
    },
  ]
  return [...rows, ...demos.filter(({ url }) => !urls.has(url))]
}

const assetFolderNames: Record<LibraryAssetFolderId, string> = {
  project: '当前项目',
  generated: '生成结果',
  inspiration: '灵感收集',
}

function workspaceAssetFromRecord(
  record: LibraryAssetRecord,
  project: Project,
): WorkspaceAsset {
  const generated = record.source === 'generated'
  const folderId = record.folderId ?? (generated ? 'generated' : 'project')
  return {
    ...record,
    folderId,
    folderName: assetFolderNames[folderId],
    existingProjectAsset: project.assets.some(({ id }) => id === record.id),
  }
}

type AssetContextState = {
  assetId: string
  x: number
  y: number
  moving: boolean
}

export function AssetLibraryPanel({
  project,
  repository,
  onInsert,
  onRemoveProjectAsset,
}: {
  project: Project
  repository: Pick<AssetLibraryRepository, 'list' | 'rename' | 'move' | 'deleteAsset'>
  onInsert(asset: WorkspaceAsset): void
  onRemoveProjectAsset(assetId: string): void
}) {
  const [assets, setAssets] = useState(() => assetsFromProject(project))
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | Asset['kind']>('all')
  const [folder, setFolder] = useState<'all' | WorkspaceAsset['folderId']>('all')
  const [editingId, setEditingId] = useState<string>()
  const [draftName, setDraftName] = useState('')
  const [context, setContext] = useState<AssetContextState>()
  const [feedback, setFeedback] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{
    asset: WorkspaceAsset
    trigger: HTMLElement
    impact: Extract<DeleteLibraryAssetResult, { status: 'referenced' }>
  }>()
  const [deleteBusy, setDeleteBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void repository.list().then((records) => {
      if (cancelled) return
      const persisted = records.map((record) =>
        workspaceAssetFromRecord(record, project),
      )
      const persistedIds = new Set(persisted.map(({ id }) => id))
      const fallbacks = assetsFromProject(project).filter(
        ({ id }) => !persistedIds.has(id),
      )
      setAssets([...persisted, ...fallbacks])
    }).catch(() => {
      if (!cancelled) setFeedback('资产读取失败，请稍后重试。')
    })
    return () => {
      cancelled = true
    }
  }, [project, repository])

  useEffect(() => {
    if (!context) return
    const closeContext = (event: Event) => {
      if (
        event.type === 'keydown' &&
        (event as KeyboardEvent).key !== 'Escape'
      ) return
      if (
        event.type === 'pointerdown' &&
        event.target instanceof Element &&
        event.target.closest('.asset-library__context')
      ) return
      setContext(undefined)
    }
    window.addEventListener('keydown', closeContext)
    window.addEventListener('pointerdown', closeContext)
    return () => {
      window.removeEventListener('keydown', closeContext)
      window.removeEventListener('pointerdown', closeContext)
    }
  }, [context])

  const visible = assets.filter((asset) =>
    (kind === 'all' || asset.kind === kind) &&
    (folder === 'all' || asset.folderId === folder) &&
    asset.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )

  const renameAsset = async (assetId: string) => {
    const name = draftName.trim()
    if (name) {
      try {
        const record = await repository.rename(assetId, name)
        setAssets((current) => current.map((asset) =>
          asset.id === assetId ? { ...asset, name: record.name } : asset,
        ))
        setFeedback(`已重命名为${record.name}。`)
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : '重命名失败。')
      }
    }
    setEditingId(undefined)
    setDraftName('')
  }
  const startRename = (asset: WorkspaceAsset) => {
    setEditingId(asset.id)
    setDraftName(asset.name)
    setContext(undefined)
  }
  const moveAsset = async (assetId: string, target: WorkspaceAsset['folderId']) => {
    setContext(undefined)
    try {
      const record = await repository.move(assetId, target)
      const folderId = record.folderId ?? target
      setAssets((current) => current.map((asset) =>
        asset.id === assetId
          ? { ...asset, folderId, folderName: assetFolderNames[folderId] }
          : asset,
      ))
      setFeedback(`已移动到${assetFolderNames[folderId]}。`)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '移动失败。')
    }
  }

  const removeAsset = async (asset: WorkspaceAsset, trigger: HTMLElement) => {
    setContext(undefined)
    try {
      const result = await repository.deleteAsset(asset.id)
      if (result.status === 'referenced') {
        setPendingDelete({ asset, trigger, impact: result })
        return
      }
      if (result.status === 'deleted' || result.status === 'missing') {
        setAssets((current) => current.filter(({ id }) => id !== asset.id))
        setFeedback(result.status === 'deleted' ? '素材已删除。' : '素材已不存在。')
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '删除失败。')
    }
  }

  return (
    <div className="canvas-resource-dialog asset-library" role="dialog" aria-label="资产管理">
      <div className="resource-panel__controls">
        <label className="resource-panel__search">
          <Search aria-hidden="true" />
          <input
            type="search"
            aria-label="搜索素材"
            value={query}
            placeholder="搜索名称或文件"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span>分类</span>
          <select aria-label="类型筛选" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
            <option value="all">全部</option>
            <option value="image">图片</option>
            <option value="video">视频</option>
            <option value="audio">音频</option>
          </select>
        </label>
      </div>
      <div className="asset-library__body">
        <nav className="asset-library__folders" role="tree" aria-label="文件夹">
          {([
            ['all', '全部素材'],
            ['project', '当前项目'],
            ['generated', '生成结果'],
            ['inspiration', '灵感收集'],
          ] as const).map(([id, name]) => (
            <button
              key={id}
              type="button"
              role="treeitem"
              aria-selected={folder === id}
              onClick={() => setFolder(id)}
            >
              <Folder aria-hidden="true" />{name}
            </button>
          ))}
        </nav>
        <div className="asset-library__grid">
          {visible.map((asset) => (
            <article
              key={asset.id}
              aria-label={`素材 ${asset.name}`}
              onContextMenu={(event) => {
                event.preventDefault()
                setContext({ assetId: asset.id, x: event.clientX, y: event.clientY, moving: false })
              }}
            >
              <span className="asset-library__preview">
                {asset.kind === 'image' ? (
                  <img src={asset.url} alt="" />
                ) : asset.kind === 'video' ? (
                  <video aria-label={`预览${asset.name}`} src={asset.url} controls preload="metadata" />
                ) : (
                  <audio aria-label={`预览${asset.name}`} src={asset.url} controls preload="metadata" />
                )}
              </span>
              <div>
                {editingId === asset.id ? (
                  <input
                    autoFocus
                    aria-label={`重命名${asset.name}`}
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    onBlur={() => renameAsset(asset.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void renameAsset(asset.id)
                      if (event.key === 'Escape') setEditingId(undefined)
                    }}
                  />
                ) : (
                  <strong onDoubleClick={() => startRename(asset)}>{asset.name}</strong>
                )}
                <small>{asset.folderName} · {asset.kind.toUpperCase()}</small>
              </div>
              <button type="button" aria-label={`发送${asset.name}到画布`} onClick={() => onInsert(asset)}>
                <Send aria-hidden="true" />发送到画布
              </button>
              <button
                type="button"
                aria-label={`更多${asset.name}操作`}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  setContext({ assetId: asset.id, x: rect.left, y: rect.bottom, moving: false })
                }}
              >
                <MoreHorizontal aria-hidden="true" />
              </button>
            </article>
          ))}
          {!visible.length ? <p className="resource-panel__empty">没有匹配的素材</p> : null}
        </div>
      </div>
      {context ? (() => {
        const asset = assets.find(({ id }) => id === context.assetId)
        if (!asset) return null
        return (
          <div className="asset-library__context" role="menu" aria-label="素材操作" style={{ left: context.x, top: context.y }}>
            {context.moving ? (
              <>
                {([
                  ['project', '当前项目'],
                  ['generated', '生成结果'],
                  ['inspiration', '灵感收集'],
                ] as const).map(([id, name]) => (
                  <button key={id} type="button" role="menuitem" onClick={() => void moveAsset(asset.id, id)}>{name}</button>
                ))}
              </>
            ) : (
              <>
                <button type="button" role="menuitem" onClick={() => startRename(asset)}>重命名</button>
                <button type="button" role="menuitem" onClick={() => setContext({ ...context, moving: true })}>移动到<ChevronRight aria-hidden="true" /></button>
                <button type="button" role="menuitem" onClick={(event) => void removeAsset(asset, event.currentTarget)}><Trash2 aria-hidden="true" />删除</button>
              </>
            )}
          </div>
        )
      })() : null}
      {feedback ? <p className="resource-panel__feedback" role="status">{feedback}</p> : null}
      {pendingDelete ? (
        <AssetDeleteDialog
          assetName={pendingDelete.asset.name}
          busy={deleteBusy}
          returnFocusTo={pendingDelete.trigger}
          impact={{
            projectIds: pendingDelete.impact.projectIds,
            nodeTitles: pendingDelete.impact.nodeTitles ?? [],
          }}
          onCancel={() => setPendingDelete(undefined)}
          onConfirm={() => {
            setDeleteBusy(true)
            void repository.deleteAsset(pendingDelete.asset.id, { detachReferences: true })
              .then((result) => {
                if (result.status !== 'deleted') throw new Error('素材删除未完成。')
                onRemoveProjectAsset(pendingDelete.asset.id)
                setAssets((current) => current.filter(({ id }) => id !== pendingDelete.asset.id))
                setFeedback('素材及其项目引用已删除。')
                setPendingDelete(undefined)
              })
              .catch((error) => {
                setFeedback(error instanceof Error ? error.message : '删除失败。')
              })
              .finally(() => setDeleteBusy(false))
          }}
        />
      ) : null}
    </div>
  )
}

export function CharacterLibraryPanel({
  onApply,
  onApplySubject,
  subjectRepository,
  currentProjectId,
}: {
  onApply(characters: CharacterProfile[]): void
  onApplySubject?(subject: SubjectAsset): void
  subjectRepository?: Pick<SubjectRepository, 'list' | 'update' | 'delete'>
  currentProjectId?: string
}) {
  const [gender, setGender] = useState('全部')
  const [age, setAge] = useState('全部')
  const [era, setEra] = useState('全部')
  const [role, setRole] = useState('全部')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [preview, setPreview] = useState<CharacterProfile>()
  const [subjects, setSubjects] = useState<SubjectAsset[]>([])
  const [editingSubject, setEditingSubject] = useState<SubjectAsset>()
  const [deletingSubject, setDeletingSubject] = useState<SubjectAsset>()
  const [subjectFeedback, setSubjectFeedback] = useState<string>()

  useEffect(() => {
    let live = true
    if (!subjectRepository) {
      setSubjects([])
      return () => { live = false }
    }
    void subjectRepository.list()
      .then((records) => { if (live) setSubjects(records) })
      .catch(() => { if (live) setSubjectFeedback('本地主体读取失败。') })
    return () => { live = false }
  }, [subjectRepository])

  useEffect(() => {
    if (!preview) return
    const closePreview = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreview(undefined)
    }
    window.addEventListener('keydown', closePreview)
    return () => window.removeEventListener('keydown', closePreview)
  }, [preview])
  const visible = useMemo(() => characterProfiles.filter((character) =>
    (gender === '全部' || character.gender === gender) &&
    (age === '全部' || character.age === age) &&
    (era === '全部' || character.era === era) &&
    (role === '全部' || character.role === role),
  ), [age, era, gender, role])
  const selected = characterProfiles.filter(({ id }) => selectedIds.has(id))

  return (
    <div className="canvas-resource-dialog character-library" role="dialog" aria-label="角色库">
      <section className="subject-library" aria-label="本地主体">
        <div className="subject-library__heading">
          <div><strong>本地主体</strong><span>{subjects.length}</span></div>
          <p>主体保存在当前浏览器，可在所有本地项目中复用。</p>
        </div>
        {subjects.length ? (
          <div className="subject-library__grid">
            {subjects.map((subject) => (
              <article
                key={subject.id}
                aria-label={`主体 ${subject.name}`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'copy'
                  event.dataTransfer.setData(SUBJECT_DRAG_MIME, subject.id)
                }}
              >
                <img src={subject.coverUrl} alt={`${subject.name}封面`} />
                <div className="subject-library__copy">
                  <strong>{subject.name}</strong>
                  <p>{subject.description || '暂无描述'}</p>
                  <div>{subject.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                  {subject.sourceProjectId && subject.sourceProjectId !== currentProjectId
                    ? <small>来自其他项目</small>
                    : <small>当前项目主体</small>}
                </div>
                <div className="subject-library__actions">
                  <button type="button" aria-label={`使用${subject.name}`} onClick={() => onApplySubject?.(subject)}><Send aria-hidden="true" />使用</button>
                  <button type="button" aria-label={`编辑${subject.name}`} onClick={() => setEditingSubject(subject)}><Pencil aria-hidden="true" />编辑</button>
                  <button type="button" aria-label={`删除${subject.name}`} onClick={() => setDeletingSubject(subject)}><Trash2 aria-hidden="true" />删除</button>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="subject-library__empty">还没有本地主体。可在带图片结果的节点右键选择“创建主体”。</p>}
        {subjectFeedback ? <p role="status">{subjectFeedback}</p> : null}
      </section>
      <section className="character-library__selected" aria-label="已选角色">
        <div><strong>已选</strong><span>{selected.length}/4</span></div>
        <div>{selected.length ? selected.map((character) => <span key={character.id}>{character.name}</span>) : <small>选择角色后批量应用到画布</small>}</div>
        <button type="button" disabled={!selected.length} aria-label={`应用 ${selected.length} 个角色到画布`} onClick={() => onApply(selected)}>
          <Send aria-hidden="true" />应用到画布
        </button>
      </section>
      <div className="character-library__filters" aria-label="角色筛选">
        {([
          ['性别', gender, setGender, ['全部', '男', '女']],
          ['年龄', age, setAge, ['全部', '少年', '青年', '中年']],
          ['时代', era, setEra, ['全部', '现代', '古代', '未来']],
          ['定位', role, setRole, ['全部', '主角', '配角', '反派', '导师']],
        ] as const).map(([label, value, setter, options]) => (
          <label key={label}>{label}
            <select aria-label={label} value={value} onChange={(event) => setter(event.target.value)}>
              {options.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
        ))}
      </div>
      <section className="character-library__recent" aria-label="最近使用">
        <span>最近使用</span>
        {characterProfiles.slice(0, 2).map((character) => <button key={character.id} type="button" onClick={() => setSelectedIds(new Set([character.id]))}>{character.name}</button>)}
      </section>
      <div className="character-library__grid">
        {visible.map((character) => (
          <article key={character.id} aria-label={`角色 ${character.name}`}>
            <div className="character-library__portraits">
              {character.images.map((image, index) => <img key={`${character.id}-${index}`} src={image} alt={`${character.name}预览 ${index + 1}`} />)}
            </div>
            <div><strong>{character.name}</strong><small>{character.gender} · {character.age} · {character.era}</small></div>
            <div className="character-library__tags"><span>{character.position}</span>{character.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
            <div className="character-library__actions">
              <button type="button" aria-label={`查看${character.name}`} onClick={() => setPreview(character)}><Eye aria-hidden="true" />查看</button>
              <button type="button" aria-label={`使用${character.name}`} aria-pressed={selectedIds.has(character.id)} onClick={() => setSelectedIds((current) => {
                const next = new Set(current)
                if (next.has(character.id)) next.delete(character.id)
                else if (next.size < 4) next.add(character.id)
                return next
              })}>{selectedIds.has(character.id) ? <Check aria-hidden="true" /> : <Send aria-hidden="true" />}使用</button>
            </div>
          </article>
        ))}
      </div>
      {preview ? (
        <div className="canvas-resource-dialog__overlay" role="dialog" aria-modal="true" aria-label={`角色详情 ${preview.name}`}>
          <button type="button" aria-label="关闭角色详情" onClick={() => setPreview(undefined)}><X aria-hidden="true" /></button>
          <div className="character-library__detail-images">{preview.images.map((image, index) => <img key={index} src={image} alt={`${preview.name}详情 ${index + 1}`} />)}</div>
          <h3>{preview.name}</h3><p>{preview.position} · {preview.tags.join(' / ')}</p>
        </div>
      ) : null}
      {editingSubject ? (
        <SubjectEditDialog
          subject={editingSubject}
          onCancel={() => setEditingSubject(undefined)}
          onSave={(changes) => {
            if (!subjectRepository) return
            void subjectRepository.update(editingSubject.id, changes).then((updated) => {
              setSubjects((current) => current.map((subject) => subject.id === updated.id ? updated : subject))
              setEditingSubject(undefined)
              setSubjectFeedback('主体资料已保存。')
            }).catch(() => setSubjectFeedback('主体资料保存失败。'))
          }}
        />
      ) : null}
      {deletingSubject ? (
        <div className="canvas-resource-dialog__overlay" role="dialog" aria-modal="true" aria-label={`删除主体 ${deletingSubject.name}`}>
          <h3>删除“{deletingSubject.name}”？</h3>
          <p>这会从本地主体库移除记录，已放入画布的引用节点会保留自己的快照。</p>
          <div className="subject-library__confirm-actions">
            <button type="button" onClick={() => setDeletingSubject(undefined)}>取消</button>
            <button type="button" aria-label="确认删除主体" onClick={() => {
              if (!subjectRepository) return
              void subjectRepository.delete(deletingSubject.id).then(() => {
                setSubjects((current) => current.filter(({ id }) => id !== deletingSubject.id))
                setDeletingSubject(undefined)
                setSubjectFeedback('主体已从本地库删除。')
              }).catch(() => setSubjectFeedback('主体删除失败。'))
            }}>确认删除</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SubjectEditDialog({
  subject,
  onCancel,
  onSave,
}: {
  subject: SubjectAsset
  onCancel(): void
  onSave(changes: Pick<SubjectAsset, 'name' | 'description' | 'tags'>): void
}) {
  const [name, setName] = useState(subject.name)
  const [description, setDescription] = useState(subject.description)
  const [tags, setTags] = useState(subject.tags.join(', '))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      description: description.trim(),
      tags: tags.split(/[，,]/).map((value) => value.trim()).filter(Boolean),
    })
  }
  return (
    <form className="canvas-resource-dialog__overlay" role="dialog" aria-modal="true" aria-label={`编辑主体 ${subject.name}`} onSubmit={submit}>
      <button type="button" aria-label="关闭编辑主体" onClick={onCancel}><X aria-hidden="true" /></button>
      <h3>编辑主体</h3>
      <label>名称<input aria-label="编辑主体名称" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>描述<textarea aria-label="编辑主体描述" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <label>标签<input aria-label="编辑主体标签" value={tags} onChange={(event) => setTags(event.target.value)} /></label>
      <div className="subject-library__confirm-actions">
        <button type="button" onClick={onCancel}>取消</button>
        <button type="submit" aria-label="保存主体修改">保存</button>
      </div>
    </form>
  )
}
