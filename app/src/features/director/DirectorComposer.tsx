import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { Link } from 'react-router-dom'

import { builtinAgentSkills } from '../agent/builtin-skills'
import {
  defaultProviderRegistry,
  providerOptionLabel,
  type ProviderRegistry,
} from '../generation/model-provider-registry'
import {
  parseDirectorCommand,
  type DirectorCommand,
} from './director-command'

type AgentUtility = 'history' | 'share' | 'settings' | 'cli'
type SkillTab = '创建' | '全部' | '通用' | '收藏' | '我的'
type GenerationMode = 'manual' | 'automatic'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

interface LocalSkill {
  id: string
  name: string
  description: string
}

interface AgentPreferences {
  version: 1
  imageProviderId: string
  videoProviderId: string
  generationMode: GenerationMode
  autoGenerate: boolean
  browserNotifications: boolean
  sound: boolean
  favoriteSkillIds: string[]
  selectedSkillId?: string
  localSkills: LocalSkill[]
}

interface DirectorComposerProps {
  selectedNodeId?: string
  projectTitle?: string
  selectedNodeTitle?: string
  assetNames?: readonly string[]
  providerRegistry?: ProviderRegistry
  storage?: StorageLike
  onExecute(
    command: Exclude<DirectorCommand, { type: 'unknown' }>,
    focusReturnTarget?: HTMLElement,
  ): void
}

interface SkillChoice {
  id: string
  name: string
  description: string
  source: 'builtin' | 'mine'
}

const PREFERENCES_KEY = 'wireless-canvas.agent-panel.v1'

function defaultPreferences(registry: ProviderRegistry): AgentPreferences {
  return {
    version: 1,
    imageProviderId:
      registry.matching(['text-to-image', 'image-to-image']).find(({ kind }) => kind === 'demo')?.id ?? '',
    videoProviderId:
      registry.matching(['text-to-video', 'image-to-video']).find(({ kind }) => kind === 'demo')?.id ?? '',
    generationMode: 'manual',
    autoGenerate: false,
    browserNotifications: false,
    sound: false,
    favoriteSkillIds: [],
    localSkills: [],
  }
}

function loadPreferences(
  storage: StorageLike | undefined,
  registry: ProviderRegistry,
): AgentPreferences {
  const fallback = defaultPreferences(registry)
  if (!storage) return fallback
  try {
    const parsed = JSON.parse(storage.getItem(PREFERENCES_KEY) ?? 'null') as Partial<AgentPreferences> | null
    if (!parsed || parsed.version !== 1) return fallback
    const knownProviders = new Set(registry.list().map(({ id }) => id))
    return {
      ...fallback,
      imageProviderId:
        typeof parsed.imageProviderId === 'string' && knownProviders.has(parsed.imageProviderId)
          ? parsed.imageProviderId
          : fallback.imageProviderId,
      videoProviderId:
        typeof parsed.videoProviderId === 'string' && knownProviders.has(parsed.videoProviderId)
          ? parsed.videoProviderId
          : fallback.videoProviderId,
      generationMode: parsed.generationMode === 'automatic' ? 'automatic' : 'manual',
      autoGenerate: parsed.autoGenerate === true,
      browserNotifications: parsed.browserNotifications === true,
      sound: parsed.sound === true,
      favoriteSkillIds: Array.isArray(parsed.favoriteSkillIds)
        ? parsed.favoriteSkillIds.filter((id): id is string => typeof id === 'string')
        : [],
      selectedSkillId:
        typeof parsed.selectedSkillId === 'string' ? parsed.selectedSkillId : undefined,
      localSkills: Array.isArray(parsed.localSkills)
        ? parsed.localSkills.filter(
            (skill): skill is LocalSkill =>
              typeof skill === 'object' &&
              skill !== null &&
              'id' in skill &&
              typeof skill.id === 'string' &&
              'name' in skill &&
              typeof skill.name === 'string' &&
              'description' in skill &&
              typeof skill.description === 'string',
          )
        : [],
    }
  } catch {
    return fallback
  }
}

function describeCommand(command: DirectorCommand) {
  switch (command.type) {
    case 'regenerate':
      return '重新生成所选节点，并保留当前版本。'
    case 'extend-shot':
      return '从所选节点扩展一个新的下游分镜。'
    case 'generate-video':
      return '从所选分镜生成一个新的下游视频节点。'
    case 'add-to-timeline':
      return '把所选片段加入时间线。'
    case 'remove-node':
      return '删除所选节点；相关下游内容会标记为来源已变更。'
    case 'replace-node':
      return '替换所选节点的内容，并保留旧版本。'
    case 'unknown':
      return command.suggestion
  }
}

export function DirectorComposer({
  selectedNodeId,
  projectTitle = '当前项目',
  selectedNodeTitle = '未选择节点',
  assetNames = ['当前项目素材'],
  providerRegistry = defaultProviderRegistry,
  storage,
  onExecute,
}: DirectorComposerProps) {
  const browserStorage = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
  const [preferences, setPreferences] = useState(() =>
    loadPreferences(browserStorage, providerRegistry),
  )
  const [input, setInput] = useState('')
  const [proposal, setProposal] = useState<DirectorCommand>()
  const [activeUtility, setActiveUtility] = useState<AgentUtility>()
  const [notice, setNotice] = useState('本地演示已连接当前画布，不会调用真实模型或消耗积分。')
  const [referenceMenuOpen, setReferenceMenuOpen] = useState(false)
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false)
  const [attachments, setAttachments] = useState<string[]>([])
  const [recommendationOffset, setRecommendationOffset] = useState(0)
  const [skillPickerOpen, setSkillPickerOpen] = useState(false)
  const [skillTab, setSkillTab] = useState<SkillTab>('全部')
  const [skillQuery, setSkillQuery] = useState('')
  const [skillDetailId, setSkillDetailId] = useState<string>()
  const [newSkillName, setNewSkillName] = useState('')
  const [newSkillDescription, setNewSkillDescription] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const imageProviders = useMemo(
    () => providerRegistry.matching(['text-to-image', 'image-to-image']),
    [providerRegistry],
  )
  const videoProviders = useMemo(
    () => providerRegistry.matching(['text-to-video', 'image-to-video']),
    [providerRegistry],
  )
  const skills = useMemo<SkillChoice[]>(
    () => [
      ...builtinAgentSkills.map(({ id, name, description }) => ({
        id,
        name,
        description,
        source: 'builtin' as const,
      })),
      ...preferences.localSkills.map((skill) => ({
        ...skill,
        source: 'mine' as const,
      })),
    ],
    [preferences.localSkills],
  )
  const selectedSkill = skills.find(({ id }) => id === preferences.selectedSkillId)
  const detailSkill = skills.find(({ id }) => id === skillDetailId)
  const recommendedSkills = skills.length
    ? [
        skills[recommendationOffset % skills.length],
        skills[(recommendationOffset + 1) % skills.length],
      ].filter((skill, index, list): skill is SkillChoice =>
        Boolean(skill) && list.findIndex(({ id }) => id === skill?.id) === index,
      )
    : []
  const hasConversation = Boolean(input.trim() || proposal || attachments.length)
  const visibleSkills = skills.filter((skill) => {
    const queryMatches = `${skill.name} ${skill.description}`.toLowerCase().includes(skillQuery.trim().toLowerCase())
    if (!queryMatches) return false
    if (skillTab === '收藏') return preferences.favoriteSkillIds.includes(skill.id)
    if (skillTab === '我的') return skill.source === 'mine'
    if (skillTab === '通用') return skill.source === 'builtin'
    return skillTab !== '创建'
  })

  useEffect(() => {
    setProposal(undefined)
  }, [selectedNodeId])

  useEffect(() => {
    try {
      browserStorage?.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
    } catch {
      // Storage can be unavailable in private browsing; the current session still works.
    }
  }, [browserStorage, preferences])

  useEffect(() => {
    const closeTransientLayer = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (
        !skillPickerOpen &&
        !referenceMenuOpen &&
        !assetLibraryOpen &&
        !activeUtility
      ) return
      event.preventDefault()
      event.stopImmediatePropagation()
      setSkillPickerOpen(false)
      setReferenceMenuOpen(false)
      setAssetLibraryOpen(false)
      setActiveUtility(undefined)
      queueMicrotask(() => inputRef.current?.focus())
    }
    window.addEventListener('keydown', closeTransientLayer, true)
    return () => window.removeEventListener('keydown', closeTransientLayer, true)
  }, [activeUtility, assetLibraryOpen, referenceMenuOpen, skillPickerOpen])

  const updatePreferences = (patch: Partial<AgentPreferences>) => {
    setPreferences((current) => ({ ...current, ...patch }))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setProposal(parseDirectorCommand(input, { selectedNodeId }))
  }

  const execute = () => {
    if (!proposal || proposal.type === 'unknown') return
    onExecute(proposal, inputRef.current ?? undefined)
    setProposal(undefined)
    setInput('')
  }

  const startNewConversation = () => {
    setInput('')
    setProposal(undefined)
    setAttachments([])
    setActiveUtility(undefined)
    setNotice('已开始新对话，仍使用当前画布上下文。')
    queueMicrotask(() => inputRef.current?.focus())
  }

  const toggleUtility = (utility: AgentUtility) => {
    setActiveUtility((current) => current === utility ? undefined : utility)
  }

  const addMention = (value: string) => {
    setInput((current) => `${current.trimEnd()}${current.trimEnd() ? ' ' : ''}${value} `)
    setProposal(undefined)
    setReferenceMenuOpen(false)
    queueMicrotask(() => inputRef.current?.focus())
  }

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const names = [...(event.target.files ?? [])].map(({ name }) => name)
    setAttachments((current) => [...new Set([...current, ...names])])
    event.target.value = ''
  }

  const selectSkill = (skill: SkillChoice) => {
    updatePreferences({ selectedSkillId: skill.id })
    setNotice(`已选择 Skill：${skill.name}`)
    setSkillPickerOpen(false)
    setSkillDetailId(undefined)
  }

  const createLocalSkill = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = newSkillName.trim()
    const description = newSkillDescription.trim()
    if (!name || !description) return
    const skill = { id: `local.${Date.now()}`, name, description }
    setPreferences((current) => ({
      ...current,
      localSkills: [...current.localSkills, skill],
      selectedSkillId: skill.id,
    }))
    setNewSkillName('')
    setNewSkillDescription('')
    setNotice(`已选择 Skill：${name}`)
    setSkillPickerOpen(false)
  }

  const toggleFavorite = (skillId: string) => {
    setPreferences((current) => ({
      ...current,
      favoriteSkillIds: current.favoriteSkillIds.includes(skillId)
        ? current.favoriteSkillIds.filter((id) => id !== skillId)
        : [...current.favoriteSkillIds, skillId],
    }))
  }

  return (
    <section className="floating-panel director-composer nodrag nopan" aria-labelledby="director-composer-title">
      <div className="director-composer__heading">
        <h2 id="director-composer-title">AI 导演</h2>
        <div className="director-composer__meta">
          <span>{selectedNodeId ? '已读取所选节点' : '请先选择节点'}</span>
          <p className="director-composer__disclosure">本地演示生成 · 视频结果使用 PNG 视觉缩略图</p>
          <Link className="director-composer__skills-link" to="/agents">浏览 Agent 技能</Link>
        </div>
      </div>

      <div className="agent-conversation-toolbar" role="toolbar" aria-label="Agent 对话工具">
        <button type="button" onClick={startNewConversation}>新对话</button>
        <button type="button" aria-pressed={activeUtility === 'history'} onClick={() => toggleUtility('history')}>历史</button>
        <button type="button" disabled={!hasConversation} aria-pressed={activeUtility === 'share'} onClick={() => toggleUtility('share')}>分享</button>
        <button type="button" aria-pressed={activeUtility === 'settings'} onClick={() => toggleUtility('settings')}>设置</button>
        <button type="button" aria-pressed={activeUtility === 'cli'} onClick={() => toggleUtility('cli')}>CLI 与 Skill</button>
      </div>

      <p className="agent-local-notice" role="status" aria-live="polite">{notice}</p>

      {activeUtility === 'history' ? (
        <section className="agent-utility-card" aria-label="对话历史">
          <strong>最近对话</strong>
          <button type="button" onClick={() => setInput('检查当前画布的生成资格')}>当前画布诊断</button>
          <button type="button" onClick={() => setInput('继续完善所选分镜')}>分镜续写建议</button>
        </section>
      ) : null}
      {activeUtility === 'share' ? (
        <section className="agent-utility-card" aria-label="分享当前对话">
          <label htmlFor="agent-local-share-link">本地分享链接</label>
          <input id="agent-local-share-link" readOnly value={`local://agent/${projectTitle}`} />
          <small>演示链接仅在当前设备用于界面预览。</small>
        </section>
      ) : null}
      {activeUtility === 'settings' ? (
        <section className="agent-utility-card agent-settings" aria-label="Agent 设置">
          <label><input type="checkbox" checked={preferences.autoGenerate} onChange={(event) => updatePreferences({ autoGenerate: event.target.checked })} />自动生成</label>
          <label><input type="checkbox" checked={preferences.browserNotifications} onChange={(event) => updatePreferences({ browserNotifications: event.target.checked })} />浏览器通知</label>
          <label><input type="checkbox" checked={preferences.sound} onChange={(event) => updatePreferences({ sound: event.target.checked })} />提示音</label>
          <small>仅保存本机偏好；不申请系统权限。危险操作仍需人工确认。</small>
        </section>
      ) : null}
      {activeUtility === 'cli' ? (
        <section className="agent-utility-card" aria-label="CLI 与 Skill">
          <strong>CLI 本地演示</strong>
          <code>libtv canvas inspect --local</code>
          <span>{selectedSkill ? `当前 Skill：${selectedSkill.name}` : '尚未选择 Skill'}</span>
        </section>
      ) : null}

      <section className="agent-recommendations" aria-label="推荐 Skill">
        <div><strong>推荐 Skill</strong><button type="button" onClick={() => setRecommendationOffset((offset) => offset + 1)}>刷新</button></div>
        <span>基于当前画布的本地推荐</span>
        {recommendedSkills.map((skill) => (
          <button key={skill.id} type="button" onClick={() => selectSkill(skill)}>
            <strong>{skill.name}</strong><small>{skill.description}</small>
          </button>
        ))}
      </section>

      <div className="agent-model-grid">
        <label>图片模型<select value={preferences.imageProviderId} onChange={(event) => updatePreferences({ imageProviderId: event.target.value })}>{imageProviders.map((provider) => <option key={provider.id} value={provider.id} disabled={provider.kind === 'placeholder'}>{providerOptionLabel(provider)}</option>)}</select></label>
        <label>视频模型<select value={preferences.videoProviderId} onChange={(event) => updatePreferences({ videoProviderId: event.target.value })}>{videoProviders.map((provider) => <option key={provider.id} value={provider.id} disabled={provider.kind === 'placeholder'}>{providerOptionLabel(provider)}</option>)}</select></label>
        <p>模型选择只保存到本机，不会发起第三方请求。</p>
      </div>

      <div className="agent-skill-selection">
        <button type="button" onClick={() => { setSkillPickerOpen(true); setSkillTab('全部'); setSkillQuery('') }}>选择 Skill</button>
        <span>{selectedSkill ? `已选择 Skill：${selectedSkill.name}` : '未选择 Skill'}</span>
      </div>

      <fieldset className="agent-generation-mode">
        <legend>生成模式</legend>
        <label><input type="radio" name="agent-generation-mode" checked={preferences.generationMode === 'manual'} onChange={() => updatePreferences({ generationMode: 'manual' })} />手动</label>
        <label><input type="radio" name="agent-generation-mode" checked={preferences.generationMode === 'automatic'} onChange={() => updatePreferences({ generationMode: 'automatic' })} />自动</label>
      </fieldset>
      <p className="agent-generation-mode__note">
        {preferences.generationMode === 'manual'
          ? '手动模式：每次执行前先展示可审阅建议。'
          : '自动模式：只自动编排本地草稿；删除和生成仍需确认。'}
      </p>

      <form onSubmit={submit}>
        <label className="director-composer__input-label" htmlFor="director-command-input">告诉我下一步要做什么</label>
        <textarea ref={inputRef} id="director-command-input" value={input} rows={4} placeholder="例如：@节点 扩展这个镜头" onChange={(event) => { setInput(event.target.value); setProposal(undefined) }} />
        <div className="agent-composer-actions">
          <button type="button" aria-expanded={referenceMenuOpen} onClick={() => setReferenceMenuOpen((open) => !open)}>添加 @ 引用</button>
          <label className="agent-upload-control">上传附件<input type="file" multiple onChange={addFiles} /></label>
          <button type="button" aria-expanded={assetLibraryOpen} onClick={() => setAssetLibraryOpen((open) => !open)}>从资产库添加</button>
          <button type="submit" disabled={!input.trim()}>提交给 AI 导演</button>
        </div>
      </form>

      {referenceMenuOpen ? (
        <div className="agent-popover-list" role="menu" aria-label="可引用的画布上下文">
          <button type="button" role="menuitem" onClick={() => addMention(`@工作流:${projectTitle}`)}>引用工作流 {projectTitle}</button>
          <button type="button" role="menuitem" onClick={() => addMention(`@节点:${selectedNodeTitle}`)}>引用节点 {selectedNodeTitle}</button>
          <button type="button" role="menuitem" onClick={() => addMention(`@资源:${assetNames[0] ?? '当前项目素材'}`)}>引用资源 {assetNames[0] ?? '当前项目素材'}</button>
        </div>
      ) : null}
      {assetLibraryOpen ? (
        <div className="agent-popover-list" role="listbox" aria-label="资产库">
          {assetNames.map((assetName) => <button key={assetName} type="button" role="option" aria-selected="false" onClick={() => { setAttachments((current) => [...new Set([...current, assetName])]); setAssetLibraryOpen(false) }}>{assetName}</button>)}
        </div>
      ) : null}
      {attachments.length ? (
        <ul className="agent-attachments" aria-label="已添加附件">
          {attachments.map((attachment) => <li key={attachment}>{attachment}<button type="button" aria-label={`移除附件 ${attachment}`} onClick={() => setAttachments((current) => current.filter((item) => item !== attachment))}>×</button></li>)}
        </ul>
      ) : null}

      {proposal ? (
        <div className="director-composer__proposal" aria-live="polite">
          <p>{describeCommand(proposal)}</p>
          {proposal.type !== 'unknown' ? <button type="button" onClick={execute}>执行</button> : null}
        </div>
      ) : null}

      {skillPickerOpen ? (
        <div className="agent-skill-dialog" role="dialog" aria-modal="false" aria-label="Skill 选择器">
          <div className="agent-skill-dialog__heading"><strong>Skill 选择器</strong><button type="button" aria-label="关闭 Skill 选择器" onClick={() => setSkillPickerOpen(false)}>×</button></div>
          <div className="agent-skill-tabs" role="tablist" aria-label="Skill 分类">
            {(['创建', '全部', '通用', '收藏', '我的'] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={skillTab === tab} onClick={() => { setSkillTab(tab); setSkillDetailId(undefined) }}>{tab}</button>)}
          </div>
          {skillTab === '创建' ? (
            <form className="agent-skill-create" onSubmit={createLocalSkill}>
              <label>Skill 名称<input value={newSkillName} onChange={(event) => setNewSkillName(event.target.value)} /></label>
              <label>Skill 描述<textarea value={newSkillDescription} onChange={(event) => setNewSkillDescription(event.target.value)} /></label>
              <button type="submit" disabled={!newSkillName.trim() || !newSkillDescription.trim()}>保存为本地 Skill</button>
            </form>
          ) : (
            <>
              <label className="agent-skill-search">搜索 Skill<input type="search" value={skillQuery} onChange={(event) => setSkillQuery(event.target.value)} /></label>
              <div className="agent-skill-list">
                {visibleSkills.map((skill) => <article key={skill.id}><div><strong>{skill.name}</strong><small>{skill.source === 'mine' ? '我的' : '通用'} · 本地</small></div><p>{skill.description}</p><button type="button" aria-label={`查看${skill.name}详情`} onClick={() => setSkillDetailId(skill.id)}>详情</button></article>)}
                {!visibleSkills.length ? <p>没有匹配的 Skill</p> : null}
              </div>
            </>
          )}
          {detailSkill ? (
            <section className="agent-skill-detail" aria-label="Skill 详情">
              <strong>{detailSkill.name}</strong><p>{detailSkill.description}</p>
              <button type="button" onClick={() => toggleFavorite(detailSkill.id)}>{preferences.favoriteSkillIds.includes(detailSkill.id) ? '取消收藏此 Skill' : '收藏此 Skill'}</button>
              <button type="button" onClick={() => selectSkill(detailSkill)}>使用此 Skill</button>
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
