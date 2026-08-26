import type { GenerationJob } from '../project/model'

export interface GenerationNotification {
  id: string
  jobId: string
  title: string
  detail: string
  timestamp: string
  status: GenerationJob['status']
}

const kindLabels = {
  image: '图片',
  video: '视频',
  audio: '音频',
  text: '文本',
} as const

function inferKind(job: GenerationJob): keyof typeof kindLabels {
  if (job.generationConfig?.targetKind) return job.generationConfig.targetKind
  const fingerprint = `${job.nodeId} ${job.modelName ?? ''}`.toLocaleLowerCase()
  if (fingerprint.includes('video') || fingerprint.includes('视频') || fingerprint.includes('seedance')) return 'video'
  if (fingerprint.includes('audio') || fingerprint.includes('音频') || fingerprint.includes('tts')) return 'audio'
  if (fingerprint.includes('text') || fingerprint.includes('script') || fingerprint.includes('文本')) return 'text'
  return 'image'
}

function notificationTitle(job: GenerationJob) {
  const kind = kindLabels[inferKind(job)]
  if (job.status === 'queued') return `${kind}生成已提交`
  if (job.status === 'running') return `${kind}生成中${typeof job.progress === 'number' ? ` · ${job.progress}%` : ''}`
  if (job.status === 'succeeded') return `${kind}生成完成`
  if (job.status === 'failed') return `${kind}生成失败`
  return `${kind}生成已取消`
}

function notificationDetail(job: GenerationJob) {
  if (job.status === 'failed' && job.error) return job.error
  const provider = [job.providerName, job.modelName].filter(Boolean).join(' · ')
  if (provider) return provider
  return job.prompt || '生成任务状态已更新'
}

export function deriveGenerationNotifications(
  jobs: readonly GenerationJob[],
): GenerationNotification[] {
  return jobs.map((job) => ({
    id: `generation:${job.id}:${job.status}`,
    jobId: job.id,
    title: notificationTitle(job),
    detail: notificationDetail(job),
    timestamp: job.updatedAt,
    status: job.status,
  })).sort((left, right) => right.timestamp.localeCompare(left.timestamp))
}
