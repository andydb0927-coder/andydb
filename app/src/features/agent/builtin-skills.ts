import { clipDuration } from '../timeline/timeline-project'
import {
  AgentSkillRegistry,
  type AgentSkillDefinition,
  type AgentSkillResult,
} from './agent-skill'

const storyboardPromptBatch: AgentSkillDefinition = {
  id: 'storyboard.prompt-batch',
  version: 1,
  name: '批量生成分镜提示词',
  description: '根据项目意图和已有分镜生成一组顺序稳定的镜头提示词。',
  category: 'preproduction',
  outputMode: 'card-or-node',
  inputSchema: {
    type: 'object',
    required: ['count'],
    properties: {
      count: { type: 'number', label: '镜头数量', minimum: 1, maximum: 12, default: 4 },
      style: { type: 'string', label: '视觉风格', minLength: 1, default: '电影感写实' },
    },
  },
  execute(input, { project }) {
    const count = Math.floor(Number(input.count))
    const style = String(input.style)
    const existing = project.nodes
      .filter(({ kind }) => kind === 'storyboard')
      .map(({ title }) => title)
      .join('、') || '暂无既有分镜'
    const beats = ['建立环境与人物关系', '推进动作与视线', '突出关键冲突', '落到情绪余韵']
    const content = Array.from({ length: count }, (_, index) => {
      const beat = beats[index % beats.length]
      return `镜头 ${String(index + 1).padStart(2, '0')}｜${style}｜${beat}；项目意图：${project.intent}；连续性参考：${existing}。`
    }).join('\n')
    return {
      title: `${project.title} · 分镜提示词`,
      summary: `已生成 ${count} 条本地分镜提示词`,
      content,
      format: 'markdown',
    }
  },
}

const assetOrganizeReport: AgentSkillDefinition = {
  id: 'assets.organize-report',
  version: 1,
  name: '素材整理报告',
  description: '统计项目素材类型、引用关系和未引用素材。',
  category: 'assets',
  outputMode: 'card-or-node',
  inputSchema: { type: 'object', properties: {} },
  execute(_input, { project }) {
    const counts = { image: 0, video: 0, audio: 0, text: 0 }
    project.assets.forEach(({ kind }) => { counts[kind] += 1 })
    const referenced = new Set(
      project.nodes.flatMap(({ versions }) =>
        versions.flatMap(({ assetId }) => assetId ? [assetId] : []),
      ),
    )
    const orphaned = project.assets.filter(({ id }) => !referenced.has(id))
    return {
      title: `${project.title} · 素材整理报告`,
      summary: `${project.assets.length} 个素材，${orphaned.length} 个未被画布引用`,
      content: [
        `图片 ${counts.image} · 视频 ${counts.video} · 音频 ${counts.audio} · 文本 ${counts.text}`,
        `未被画布引用：${orphaned.length}`,
        orphaned.length ? orphaned.map(({ id, mimeType }) => `- ${id}（${mimeType}）`).join('\n') : '- 无',
      ].join('\n'),
      format: 'markdown',
    }
  },
}

const timelineDurationStats: AgentSkillDefinition = {
  id: 'timeline.duration-stats',
  version: 1,
  name: '时间线时长统计',
  description: '按轨道统计片段数量和时长，并计算成片长度。',
  category: 'timeline',
  outputMode: 'card-or-node',
  inputSchema: { type: 'object', properties: {} },
  execute(_input, { project, timeline }) {
    const tracks = timeline?.tracks.map((track) => ({
      name: track.name,
      clips: track.clips.length,
      duration: track.clips.reduce((sum, clip) => sum + clipDuration(clip), 0),
      end: track.clips.reduce((end, clip) => Math.max(end, clip.startSeconds + clipDuration(clip)), 0),
    })) ?? [{
      name: '基础时间线',
      clips: project.timeline.length,
      duration: project.timeline.reduce((sum, item) => sum + item.durationSeconds, 0),
      end: project.timeline.reduce((sum, item) => sum + item.durationSeconds, 0),
    }]
    const total = tracks.reduce((end, track) => Math.max(end, track.end), 0)
    return {
      title: `${project.title} · 时间线统计`,
      summary: `成片时长 ${total.toFixed(2)} 秒`,
      content: [
        `成片时长：${total.toFixed(2)} 秒`,
        ...tracks.map(({ name, clips, duration }) => `${name}：${clips} 个片段 / ${duration.toFixed(2)} 秒`),
      ].join('\n'),
      format: 'text',
    }
  },
}

const publishingCopywriter: AgentSkillDefinition = {
  id: 'publishing.copywriter',
  version: 1,
  name: '作品发布文案生成',
  description: '根据项目标题、意图和亮点生成一版本地发布草稿。',
  category: 'writing',
  outputMode: 'card-or-node',
  inputSchema: {
    type: 'object',
    properties: {
      tone: { type: 'string', label: '文案语气', minLength: 1, default: '创作手记' },
      highlights: { type: 'string', label: '作品亮点', minLength: 1, default: '镜头、故事、氛围' },
    },
  },
  execute(input, { project }) {
    const tone = String(input.tone)
    const highlights = String(input.highlights)
    const tags = highlights.split(/[、，,\s]+/).filter(Boolean).slice(0, 5).map((tag) => `#${tag}`).join(' ')
    return {
      title: `${project.title} · 发布文案`,
      summary: `已生成“${tone}”语气的本地草稿`,
      content: `《${project.title}》｜${tone}\n\n${project.intent}\n\n这次创作想分享：${highlights}。\n\n${tags}`,
      format: 'markdown',
    }
  },
}

const backupCheck: AgentSkillDefinition = {
  id: 'project.backup-check',
  version: 1,
  name: '项目备份检查',
  description: '检查未引用素材、失败任务和来源变化节点，不读取文件系统。',
  category: 'maintenance',
  outputMode: 'card-or-node',
  inputSchema: { type: 'object', properties: {} },
  execute(_input, { project }) {
    const referenced = new Set(project.nodes.flatMap(({ versions }) =>
      versions.flatMap(({ assetId }) => assetId ? [assetId] : []),
    ))
    const orphaned = project.assets.filter(({ id }) => !referenced.has(id)).length
    const failed = project.jobs.filter(({ status }) => status === 'failed').length
    const changed = project.nodes.filter(({ sourceChanged }) => sourceChanged).length
    const issues = [
      orphaned ? `存在 ${orphaned} 个未被引用素材` : undefined,
      failed ? `存在 ${failed} 个失败任务` : undefined,
      changed ? `存在 ${changed} 个来源已变化节点` : undefined,
    ].filter((item): item is string => Boolean(item))
    return {
      title: `${project.title} · 备份检查`,
      summary: issues.length ? `${issues.length} 项需关注` : '本地结构检查通过',
      content: issues.length ? issues.map((item) => `- ${item}`).join('\n') : '- 未发现结构风险\n- 可导出本地项目包留档',
      format: 'markdown',
    }
  },
}

export const builtinAgentSkills: readonly AgentSkillDefinition[] = [
  storyboardPromptBatch,
  assetOrganizeReport,
  timelineDurationStats,
  publishingCopywriter,
  backupCheck,
]

export const builtinSkillRegistry = new AgentSkillRegistry(builtinAgentSkills)

export function emptySkillResult(title: string, message: string): AgentSkillResult {
  return { title, summary: message, content: message, format: 'text' }
}
