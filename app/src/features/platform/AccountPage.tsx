import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  createLocalAccountPreferenceStore,
  LOCAL_ACCOUNT_PREFERENCES_KEY,
  type LocalAccountPreferenceStore,
} from '../account/local-account-preferences'

import { CollaborationRepository } from '../collaboration/collaboration-repository'
import {
  canCollaborator,
  collaboratorCapabilities,
  type Collaborator,
  type CollaboratorCapability,
  type CollaboratorRole,
} from '../collaboration/collaboration-model'
import {
  createShareLink,
  downloadJson,
  parseProjectPackage,
  type LocalProjectPackage,
  type LocalWorkspacePackage,
} from '../collaboration/project-package'
import { ProjectPackageRepository } from '../collaboration/project-package-repository'
import {
  membershipPlan,
  membershipPlans,
  type MembershipPlanId,
  type MembershipSubscription,
} from '../membership/membership-model'
import { MembershipRepository, type MembershipStore } from '../membership/membership-repository'
import type { Project } from '../project/model'
import { ProjectRepository, WirelessCanvasDatabase } from '../project/project-repository'

type ProjectStore = Pick<ProjectRepository, 'listRecent'>
type CollaborationStore = Pick<
  CollaborationRepository,
  'listCollaborators' | 'addCollaborator' | 'updateRole' | 'removeCollaborator' | 'listComments'
>
type PackageStore = Pick<ProjectPackageRepository, 'exportProject' | 'importProject' | 'exportWorkspace'>

export interface AccountPageProps {
  repository?: ProjectStore
  membershipStore?: MembershipStore
  collaborationStore?: CollaborationStore
  packageStore?: PackageStore
  preferenceStore?: LocalAccountPreferenceStore
  onCopy?(value: string): Promise<void>
  onDownload?(value: LocalProjectPackage | LocalWorkspacePackage, filename: string): void
}

const database = new WirelessCanvasDatabase()
const defaultRepository = new ProjectRepository(database)
const defaultMembershipStore = new MembershipRepository(database)
const defaultCollaborationStore = new CollaborationRepository(database)
const defaultPackageStore = new ProjectPackageRepository(database)
const defaultPreferenceStore = createLocalAccountPreferenceStore()

const roleCopy: Record<CollaboratorRole, string> = {
  owner: '所有者', editor: '编辑者', viewer: '只读',
}

const capabilityCopy: Record<CollaboratorCapability, string> = {
  'edit-project': '编辑项目',
  comment: '发表评论',
  'resolve-comments': '解决评论',
  'manage-members': '管理成员',
  'export-project': '导出项目包',
}

async function copyToClipboard(value: string) {
  if (!navigator.clipboard) throw new Error('当前浏览器不支持剪贴板')
  await navigator.clipboard.writeText(value)
}

function readableLocalBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 ** 2).toFixed(1)} MB`
}

export function AccountPage({
  repository = defaultRepository,
  membershipStore = defaultMembershipStore,
  collaborationStore = defaultCollaborationStore,
  packageStore = defaultPackageStore,
  preferenceStore = defaultPreferenceStore,
  onCopy = copyToClipboard,
  onDownload = downloadJson,
}: AccountPageProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [subscription, setSubscription] = useState<MembershipSubscription>()
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [commentCount, setCommentCount] = useState(0)
  const [collaboratorName, setCollaboratorName] = useState('')
  const [collaboratorRole, setCollaboratorRole] = useState<'editor' | 'viewer'>('editor')
  const [feedback, setFeedback] = useState<string>()
  const [preferences, setPreferences] = useState(() => preferenceStore.read())
  const [displayName, setDisplayName] = useState(() => preferences.displayName)

  const loadProjects = useCallback(async () => {
    const records = await repository.listRecent(100)
    setProjects(records)
    setSelectedProjectId((current) => current || records[0]?.id || '')
  }, [repository])

  useEffect(() => {
    void Promise.all([loadProjects(), membershipStore.get().then(setSubscription)]).catch(() => {
      setFeedback('无法读取本地工作区')
    })
  }, [loadProjects, membershipStore])

  useEffect(() => {
    const next = preferenceStore.read()
    setPreferences(next)
    setDisplayName(next.displayName)
  }, [preferenceStore])

  useEffect(() => {
    const syncPreferences = (event: StorageEvent) => {
      if (event.key !== LOCAL_ACCOUNT_PREFERENCES_KEY) return
      const next = preferenceStore.read()
      setPreferences(next)
      setDisplayName(next.displayName)
    }
    window.addEventListener('storage', syncPreferences)
    return () => window.removeEventListener('storage', syncPreferences)
  }, [preferenceStore])

  useEffect(() => {
    if (!selectedProjectId) {
      setCollaborators([])
      setCommentCount(0)
      return
    }
    let active = true
    void Promise.all([
      collaborationStore.listCollaborators(selectedProjectId),
      collaborationStore.listComments(selectedProjectId),
    ]).then(([members, comments]) => {
      if (!active) return
      setCollaborators(members)
      setCommentCount(comments.filter(({ status }) => status === 'open').length)
    }).catch(() => { if (active) setFeedback('无法读取项目协作信息') })
    return () => { active = false }
  }, [collaborationStore, selectedProjectId])

  const selectedProject = projects.find(({ id }) => id === selectedProjectId)
  const stats = useMemo(() => ({
    nodes: projects.reduce((total, project) => total + project.nodes.length, 0),
    assets: projects.reduce((total, project) => total + project.assets.length, 0),
  }), [projects])
  const localBytes = useMemo(
    () => new TextEncoder().encode(JSON.stringify(projects)).byteLength,
    [projects],
  )

  const savePreferences = (
    next: Pick<typeof preferences, 'displayName' | 'aiWatermark' | 'inAppNotifications'>,
    message: string,
  ) => {
    const saved = preferenceStore.write(next)
    setPreferences(saved)
    setDisplayName(saved.displayName)
    setFeedback(message)
  }

  const changePlan = async (plan: Exclude<MembershipPlanId, 'free'>) => {
    try {
      setSubscription(await membershipStore.subscribe(plan))
      setFeedback(`已在本地开通${membershipPlan(plan).name}，未发生真实支付`)
    } catch { setFeedback('无法更新本地会员状态') }
  }

  const addCollaborator = async () => {
    if (!selectedProjectId) return
    try {
      const created = await collaborationStore.addCollaborator(
        selectedProjectId, collaboratorName, collaboratorRole,
      )
      setCollaborators((current) => [...current, created])
      setCollaboratorName('')
      setFeedback('协作者已保存到本地')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '无法添加协作者')
    }
  }

  const updateRole = async (id: string, role: 'editor' | 'viewer') => {
    try {
      const updated = await collaborationStore.updateRole(id, role)
      setCollaborators((current) => current.map((item) => item.id === id ? updated : item))
    } catch { setFeedback('无法更新协作者角色') }
  }

  const removeCollaborator = async (id: string) => {
    try {
      await collaborationStore.removeCollaborator(id)
      setCollaborators((current) => current.filter((item) => item.id !== id))
    } catch (error) { setFeedback(error instanceof Error ? error.message : '无法移除协作者') }
  }

  const exportSelected = async (mode: 'download' | 'share') => {
    if (!selectedProject) return
    try {
      const value = await packageStore.exportProject(selectedProject.id)
      if (mode === 'download') {
        onDownload(value, `${selectedProject.title}-无线画布项目包.json`)
        setFeedback('项目包已开始下载')
      } else {
        await onCopy(createShareLink(value))
        setFeedback('本地共享链接已复制；链接内容不会上传')
      }
    } catch { setFeedback('无法导出本地项目包') }
  }

  const importFile = async (file: File | undefined) => {
    if (!file) return
    try {
      await packageStore.importProject(parseProjectPackage(await file.text()))
      await loadProjects()
      setFeedback('项目包已恢复到当前本地工作区')
    } catch (error) { setFeedback(error instanceof Error ? error.message : '无法导入项目包') }
  }

  return (
    <main className="platform-page account-page">
      <header className="platform-page__header">
        <p className="platform-page__eyebrow">ACCOUNT & SPACE · 本地模式</p>
        <h1>账户与本地空间</h1>
        <p>身份偏好、会员、角色、评论和分享只保存在当前浏览器；未连接云账户、实时团队或真实支付。</p>
      </header>

      <div className="account-identity-grid">
        <section className="platform-section account-identity" aria-labelledby="local-identity-title">
          <div className="platform-section__heading">
            <div><p>LOCAL IDENTITY</p><h2 id="local-identity-title">本地身份</h2></div>
            <span className="account-local-status">本地模式</span>
          </div>
          <div className="account-profile">
            <span className="account-profile__avatar" aria-hidden="true">
              {preferences.displayName.slice(0, 1).toLocaleUpperCase()}
            </span>
            <div><strong>{preferences.displayName}</strong><span>当前设备创作者</span></div>
          </div>
          <label className="account-profile__field">
            本地创作者名称
            <input value={displayName} onChange={(event) => setDisplayName(event.currentTarget.value)} />
          </label>
          <button
            className="account-secondary-action"
            type="button"
            onClick={() => savePreferences({ ...preferences, displayName }, '本地身份已保存')}
          >
            保存本地身份
          </button>
          <ul className="account-capability-list">
            <li><span>云账户</span><strong>云账户：未连接</strong></li>
            <li><span>认证数据</span><strong>不保存邮箱、密码或令牌</strong></li>
          </ul>
        </section>

        <section className="platform-section account-space" aria-labelledby="local-space-title">
          <div className="platform-section__heading">
            <div><p>PERSONAL SPACE</p><h2 id="local-space-title">个人本地空间</h2></div>
            <strong>当前空间</strong>
          </div>
          <p className="account-space__summary">
            {projects.length} 个项目 · {stats.nodes} 个节点 · {stats.assets} 个素材
          </p>
          <p className="account-space__storage">本地数据约 {readableLocalBytes(localBytes)}</p>
          <div className="account-space__links">
            <Link to="/projects">打开项目空间</Link>
            <Link to="/assets">打开素材库</Link>
          </div>
          <div className="account-space__boundary">
            <strong>团队空间：未接入</strong>
            <p>需要服务端身份、成员权限和云端项目隔离后才能启用。</p>
          </div>
        </section>
      </div>

      <section className="platform-section account-preferences" aria-labelledby="preferences-title">
        <div className="platform-section__heading">
          <div><p>DEVICE PREFERENCES</p><h2 id="preferences-title">设备创作偏好</h2></div>
          <Link to="/agents">查看 Agent 与 CLI</Link>
        </div>
        <div className="account-preference-list">
          <label>
            <input
              type="checkbox"
              aria-label="生成内容默认添加 AI 标识"
              checked={preferences.aiWatermark}
              onChange={(event) => savePreferences(
                { ...preferences, aiWatermark: event.currentTarget.checked },
                'AI 标识偏好已保存',
              )}
            />
            <span><strong>生成内容默认添加 AI 标识</strong><small>仅保存偏好；真实生成器接入时读取。</small></span>
          </label>
          <label>
            <input
              type="checkbox"
              aria-label="显示站内任务状态提醒"
              checked={preferences.inAppNotifications}
              onChange={(event) => savePreferences(
                { ...preferences, inAppNotifications: event.currentTarget.checked },
                '站内提醒偏好已保存',
              )}
            />
            <span><strong>显示站内任务状态提醒</strong><small>不申请系统通知权限，不向外部发送消息。</small></span>
          </label>
        </div>
        <p className="account-boundary-note">Access key 未生成；当前 CLI 仅通过本地工作区桥接运行。</p>
      </section>

      <section className="account-summary" aria-label="我的项目统计">
        <div><span>项目</span><strong>{projects.length} 个本地项目</strong></div>
        <div><span>画布</span><strong>{stats.nodes} 个画布节点</strong></div>
        <div><span>素材</span><strong>{stats.assets} 个项目素材</strong></div>
        <div><span>评论</span><strong>{commentCount} 条待处理</strong></div>
      </section>

      <section className="platform-section account-membership" aria-labelledby="membership-title">
        <div className="platform-section__heading">
          <div><p>MEMBERSHIP · 本地模拟</p><h2 id="membership-title">会员状态</h2></div>
          <strong>{subscription ? `当前：${membershipPlan(subscription.plan).name}` : '正在读取'}</strong>
        </div>
        <table className="membership-matrix">
          <thead><tr><th>功能</th>{membershipPlans.map((plan) => <th key={plan.id}>{plan.name}</th>)}</tr></thead>
          <tbody>
            <tr><th>本地项目与基础时间线</th><td>可用</td><td>可用</td><td>可用</td></tr>
            <tr><th>项目包、角色与评论</th><td>可用</td><td>可用</td><td>可用</td></tr>
            <tr><th>高级导出</th><td>—</td><td>可用</td><td>可用</td></tr>
            <tr><th>批量 / 并行工作流</th><td>—</td><td>—</td><td>可用</td></tr>
          </tbody>
        </table>
        <div className="membership-actions">
          <button type="button" disabled={subscription?.plan === 'creator'} onClick={() => void changePlan('creator')}>本地开通创作者版</button>
          <button type="button" disabled={subscription?.plan === 'professional'} onClick={() => void changePlan('professional')}>本地开通专业版</button>
          {subscription?.plan !== 'free' ? <button type="button" onClick={() => void membershipStore.cancel().then(setSubscription)}>取消本地订阅</button> : null}
          {subscription?.status === 'cancelled' ? <button type="button" onClick={() => void membershipStore.renew().then(setSubscription)}>续期上次方案</button> : null}
        </div>
      </section>

      <section className="platform-section account-collaboration" aria-labelledby="collaboration-title">
        <div className="platform-section__heading">
          <div><p>COLLABORATION · 本地模拟</p><h2 id="collaboration-title">协作者与项目共享</h2></div>
          <Link to={selectedProject ? `/project/${selectedProject.id}` : '/'}>打开画布</Link>
        </div>
        <table className="membership-matrix collaboration-permission-matrix" aria-label="本地协作角色权限">
          <thead><tr><th>能力</th><th>所有者</th><th>编辑者</th><th>只读</th></tr></thead>
          <tbody>
            {collaboratorCapabilities.map((capability) => (
              <tr key={capability}>
                <th>{capabilityCopy[capability]}</th>
                {(['owner', 'editor', 'viewer'] as const).map((role) => (
                  <td key={role}>{canCollaborator(role, capability) ? '可用' : '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="account-boundary-note">权限矩阵仅用于当前设备的交互预览；尚无服务端身份与强制授权。</p>
        <label className="account-project-picker">项目<select aria-label="协作项目" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.currentTarget.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
        <ul className="collaborator-list">
          {collaborators.map((collaborator) => (
            <li key={collaborator.id}><strong>{collaborator.name}</strong>{collaborator.role === 'owner' ? <span>{roleCopy.owner}</span> : <><select aria-label={`${collaborator.name}角色`} value={collaborator.role} onChange={(event) => void updateRole(collaborator.id, event.currentTarget.value as 'editor' | 'viewer')}><option value="editor">编辑者</option><option value="viewer">只读</option></select><button type="button" onClick={() => void removeCollaborator(collaborator.id)}>移除{collaborator.name}</button></>}</li>
          ))}
        </ul>
        <div className="collaborator-form"><label>协作者名称<input value={collaboratorName} onChange={(event) => setCollaboratorName(event.currentTarget.value)} /></label><label>角色<select value={collaboratorRole} onChange={(event) => setCollaboratorRole(event.currentTarget.value as 'editor' | 'viewer')}><option value="editor">编辑者</option><option value="viewer">只读</option></select></label><button type="button" disabled={!collaboratorName.trim() || !selectedProjectId} onClick={() => void addCollaborator()}>添加协作者</button></div>
        <div className="account-backup-actions"><button type="button" disabled={!selectedProject} onClick={() => void exportSelected('share')}>复制本地共享链接</button><button type="button" disabled={!selectedProject} onClick={() => void exportSelected('download')}>下载项目包</button></div>
        <p className="account-boundary-note">共享链接将完整 JSON 放入 URL hash，不上传服务器；含大素材时请使用项目包文件。</p>
      </section>

      <section className="platform-section account-backup" aria-labelledby="backup-title">
        <div className="platform-section__heading"><div><p>BACKUP</p><h2 id="backup-title">导出备份与恢复</h2></div></div>
        <div className="account-backup-actions"><button type="button" onClick={() => void packageStore.exportWorkspace().then((value) => { onDownload(value, '无线画布-本地工作区备份.json'); setFeedback('工作区备份已开始下载') })}>导出工作区备份</button><label className="account-import">导入项目包<input aria-label="导入项目包" type="file" accept="application/json,.json" onChange={(event) => void importFile(event.currentTarget.files?.[0])} /></label></div>
        <p className="account-boundary-note">导入相同项目 ID 会覆盖该项目的本地快照、时间线和协作记录。</p>
      </section>
      {feedback ? <p className="account-feedback" role="status">{feedback}</p> : null}
    </main>
  )
}
