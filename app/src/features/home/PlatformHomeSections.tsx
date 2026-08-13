import {
  ArrowRight,
  Film,
  Layers3,
  Paperclip,
  Search,
  Send,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import type {
  CommunityWorkRepository,
} from '../community/community-repository'
import type { PublishedWork } from '../community/community-model'
import { WorkCard } from '../community/WorkCard'
import type {
  HomeActivityContent,
  HomeCapabilityContent,
  HomeContentRecord,
  HomeModeContent,
  HomeSkillCategory,
  HomeSkillContent,
} from './home-content'
import type { PlatformHomeContentRepository } from './home-content-repository'

type HomeCommunityRepository = Pick<
  CommunityWorkRepository,
  'ensureDemoWorks' | 'listPublished'
>

export interface HomePromptRequest {
  key: string
  title: string
  prompt: string
}

export interface PlatformHomeSectionsProps {
  contentRepository: PlatformHomeContentRepository
  communityRepository: HomeCommunityRepository
  disabled: boolean
  onStartPrompt(request: HomePromptRequest): void
}

type ContentState =
  | { status: 'loading' }
  | { status: 'loaded'; records: HomeContentRecord[] }
  | { status: 'error' }

type CommunityState =
  | { status: 'loading' }
  | { status: 'loaded'; works: PublishedWork[] }
  | { status: 'error' }

const skillCategories: HomeSkillCategory[] = ['专业影视', '商业广告', '音乐MV']
const showCategories = [
  '全部',
  '精选画布',
  '专业影视',
  '短剧漫剧',
  '商业广告',
  '动漫游戏',
  '教育生活',
] as const

function isActivity(record: HomeContentRecord): record is HomeActivityContent {
  return record.kind === 'activity'
}

function isMode(record: HomeContentRecord): record is HomeModeContent {
  return record.kind === 'mode'
}

function isSkill(record: HomeContentRecord): record is HomeSkillContent {
  return record.kind === 'skill'
}

function isCapability(
  record: HomeContentRecord,
): record is HomeCapabilityContent {
  return record.kind === 'capability'
}

function readableUsage(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function readableCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

export function PlatformHomeSections({
  contentRepository,
  communityRepository,
  disabled,
  onStartPrompt,
}: PlatformHomeSectionsProps) {
  const [content, setContent] = useState<ContentState>({ status: 'loading' })
  const [community, setCommunity] = useState<CommunityState>({
    status: 'loading',
  })
  const [activityVisible, setActivityVisible] = useState(true)
  const [countdown, setCountdown] = useState(0)
  const [agentIdea, setAgentIdea] = useState('')
  const [agentError, setAgentError] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [showCategory, setShowCategory] =
    useState<(typeof showCategories)[number]>('全部')
  const [showQuery, setShowQuery] = useState('')

  useEffect(() => {
    let active = true
    void contentRepository
      .ensureSeed()
      .then(() => contentRepository.list())
      .then((records) => {
        if (!active) return
        setContent({ status: 'loaded', records })
        setCountdown(records.find(isActivity)?.durationSeconds ?? 0)
      })
      .catch(() => {
        if (active) setContent({ status: 'error' })
      })
    return () => {
      active = false
    }
  }, [contentRepository])

  useEffect(() => {
    let active = true
    void communityRepository
      .ensureDemoWorks()
      .then(() =>
        communityRepository.listPublished({
          query: '',
          tag: 'all',
          sort: 'latest',
        }),
      )
      .then((works) => {
        if (active) setCommunity({ status: 'loaded', works })
      })
      .catch(() => {
        if (active) setCommunity({ status: 'error' })
      })
    return () => {
      active = false
    }
  }, [communityRepository])

  useEffect(() => {
    if (!activityVisible || countdown <= 0) return
    const timer = window.setInterval(() => {
      setCountdown((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [activityVisible, countdown > 0])

  const records = content.status === 'loaded' ? content.records : []
  const activity = records.find(isActivity)
  const modes = records.filter(isMode)
  const skills = records.filter(isSkill)
  const capabilities = records.filter(isCapability)
  const visibleWorks = useMemo(() => {
    if (community.status !== 'loaded') return []
    const query = showQuery.trim().toLocaleLowerCase()
    return community.works.filter((work) => {
      if (showCategory !== '全部' && !work.tags.includes(showCategory)) {
        return false
      }
      if (!query) return true
      return [work.title, work.author, ...work.tags].some((value) =>
        value.toLocaleLowerCase().includes(query),
      )
    })
  }, [community, showCategory, showQuery])

  const sendIdea = () => {
    const prompt = agentIdea.trim()
    if (!prompt) {
      setAgentError('请先说出你的创意')
      return
    }
    setAgentError('')
    onStartPrompt({ key: 'agent-idea', title: '创意草稿', prompt })
  }

  return (
    <>
      {activityVisible && activity ? (
        <aside className="home-activity" aria-label="限时活动">
          <div className="home-activity__copy">
            <strong>{activity.title}</strong>
            <span>{activity.description}</span>
          </div>
          <time className="home-activity__timer" role="timer">
            {readableCountdown(countdown)}
          </time>
          <a className="home-activity__cta focus-visible" href="#create-project">
            {activity.ctaLabel}<ArrowRight aria-hidden="true" />
          </a>
          <button
            className="home-activity__close focus-visible"
            type="button"
            aria-label="关闭活动横幅"
            onClick={() => setActivityVisible(false)}
          >
            <X aria-hidden="true" />
          </button>
        </aside>
      ) : null}

      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero__glow" aria-hidden="true" />
        <p className="home-kicker"><Sparkles aria-hidden="true" />LOCAL AI CREATIVE PLATFORM</p>
        <h1 id="home-hero-title">只需一张画布，连接你的多种创意想法</h1>
        <p className="home-hero__intro">
          从一句灵感到镜头、素材和时间线，把每一步都留在同一张画布里。
        </p>
        <a className="home-hero__primary focus-visible" href="#create-project">
          新建画布创作<ArrowRight aria-hidden="true" />
        </a>

        {content.status === 'loading' ? (
          <p className="home-section-state" role="status">正在加载创作模式…</p>
        ) : null}
        {content.status === 'error' ? (
          <p className="home-section-state home-section-state--error" role="alert">
            本地首页内容暂时无法载入，项目创建仍可继续使用。
          </p>
        ) : null}
        <div className="home-modes" role="group" aria-label="画布创作模式">
          {modes.map((mode, index) => (
            <button
              key={mode.id}
              className="home-mode-card focus-visible"
              type="button"
              disabled={disabled}
              onClick={() =>
                onStartPrompt({
                  key: mode.id,
                  title: mode.title,
                  prompt: mode.prompt,
                })
              }
            >
              <span className="home-mode-card__index">0{index + 1}</span>
              <strong>{mode.title}</strong>
              <span>{mode.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="home-agent" aria-labelledby="home-agent-title">
        <div className="home-section-heading">
          <p className="home-kicker"><WandSparkles aria-hidden="true" />LIBTV AGENT · LOCAL</p>
          <h2 id="home-agent-title">说出你的创意</h2>
          <p>描述你想看见的故事，让本地画布替你接住第一步。</p>
        </div>
        <div className="home-agent__composer">
          <textarea
            aria-label="说出你的创意"
            value={agentIdea}
            disabled={disabled}
            rows={4}
            placeholder="例如：一只纸鹤飞过未来城市，沿途点亮每一扇窗……"
            onChange={(event) => {
              setAgentIdea(event.target.value)
              if (agentError) setAgentError('')
            }}
          />
          <div className="home-agent__actions">
            <label className="home-agent__attachment focus-visible">
              <Paperclip aria-hidden="true" />附件
              <input
                className="visually-hidden"
                type="file"
                multiple
                aria-label="添加附件"
                onChange={(event) =>
                  setAttachments(
                    Array.from(event.target.files ?? [], ({ name }) => name),
                  )
                }
              />
            </label>
            <button
              className="home-agent__send focus-visible"
              type="button"
              disabled={disabled}
              onClick={sendIdea}
            >
              <Send aria-hidden="true" />发送创意
            </button>
          </div>
          {attachments.length > 0 ? (
            <p className="home-agent__files">已选择：{attachments.join('、')}</p>
          ) : null}
          {agentError ? <p className="home-agent__error" role="alert">{agentError}</p> : null}
        </div>

        <div className="home-skills" aria-labelledby="home-skills-title">
          <div className="home-skills__heading">
            <h2 id="home-skills-title">推荐 Skill</h2>
            <Link to="/agents">查看全部 Skill<ArrowRight aria-hidden="true" /></Link>
          </div>
          {skillCategories.map((category) => (
            <section
              key={category}
              className="home-skill-group"
              aria-label={category}
            >
              <h3>{category}</h3>
              <div className="home-skill-grid">
                {skills
                  .filter((skill) => skill.category === category)
                  .map((skill) => (
                    <article
                      key={skill.id}
                      className="home-skill-card"
                      aria-label={skill.title}
                    >
                      <img src={skill.imageUrl} alt="" />
                      <div className="home-skill-card__body">
                        <strong>{skill.title}</strong>
                        <p>{skill.description}</p>
                        <div className="home-skill-card__meta">
                          <span>{skill.author}</span>
                          <span>{readableUsage(skill.usageCount)} 次使用</span>
                        </div>
                        <button
                          type="button"
                          disabled={disabled}
                          aria-label={`使用 Skill：${skill.title}`}
                          onClick={() =>
                            onStartPrompt({
                              key: skill.id,
                              title: skill.title,
                              prompt: skill.prompt,
                            })
                          }
                        >
                          使用 Skill<ArrowRight aria-hidden="true" />
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="home-capabilities" aria-labelledby="home-capabilities-title">
        <div className="home-section-heading">
          <p className="home-kicker"><Layers3 aria-hidden="true" />LOCAL TOOLCHAIN</p>
          <h2 id="home-capabilities-title">模型与创作工具</h2>
        </div>
        <div className="home-capability-strip">
          {capabilities.map((capability) => (
            <Link
              key={capability.id}
              className="home-capability focus-visible"
              data-testid="home-capability"
              to={capability.targetPath}
            >
              <Film aria-hidden="true" />
              <span>
                <strong>{capability.title}</strong>
                <small>{capability.description}</small>
              </span>
              <em>{capability.ctaLabel}<ArrowRight aria-hidden="true" /></em>
            </Link>
          ))}
        </div>
      </section>

      <section
        className="home-show"
        aria-label="TV Show 社区作品"
        role="region"
      >
        <div className="home-show__heading">
          <div>
            <p className="home-kicker">TV SHOW · LOCAL COMMUNITY</p>
            <h2 id="home-show-title">看看大家如何把灵感变成作品</h2>
          </div>
          <Link to="/discover">进入完整作品墙<ArrowRight aria-hidden="true" /></Link>
        </div>
        <div className="home-show__toolbar">
          <div className="home-show__categories" role="group" aria-label="TV Show 分类">
            {showCategories.map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={showCategory === category}
                onClick={() => setShowCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <label className="home-show__search">
            <Search aria-hidden="true" />
            <input
              type="search"
              aria-label="搜索 TV Show"
              placeholder="搜索作品或创作者"
              value={showQuery}
              onChange={(event) => setShowQuery(event.target.value)}
            />
          </label>
        </div>
        {community.status === 'loading' ? (
          <p className="home-section-state" role="status">正在载入本地作品…</p>
        ) : null}
        {community.status === 'error' ? (
          <p className="home-section-state home-section-state--error" role="alert">
            TV Show 暂时无法载入，请前往作品墙重试。
          </p>
        ) : null}
        {community.status === 'loaded' && visibleWorks.length === 0 ? (
          <p className="home-section-state">没有匹配的作品</p>
        ) : null}
        <div className="home-show__waterfall">
          {visibleWorks.map((work) => <WorkCard key={work.id} work={work} />)}
        </div>
      </section>
    </>
  )
}
