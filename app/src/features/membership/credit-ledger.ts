import type { Project } from '../project/model'

export const LOCAL_CREDIT_ALLOWANCE = 120

export interface CreditLedgerEntry {
  id: string
  projectId: string
  projectTitle: string
  jobId: string
  providerLabel: string
  prompt: string
  amount: number
  occurredAt: string
}

export interface CreditLedgerSummary {
  allowance: number
  spent: number
  balance: number
  entries: CreditLedgerEntry[]
}

export function summarizeCreditLedger(
  projects: readonly Project[],
  allowance = LOCAL_CREDIT_ALLOWANCE,
): CreditLedgerSummary {
  const entries = projects.flatMap((project) =>
    project.jobs.flatMap((job) => {
      if (typeof job.creditsSpent !== 'number' || job.creditsSpent <= 0) return []
      return [{
        id: `${project.id}:${job.id}`,
        projectId: project.id,
        projectTitle: project.title,
        jobId: job.id,
        providerLabel: [job.providerName, job.modelName].filter(Boolean).join(' · ') || '本地生成任务',
        prompt: job.prompt,
        amount: job.creditsSpent,
        occurredAt: job.updatedAt,
      }]
    }),
  ).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))

  const spent = entries.reduce((total, entry) => total + entry.amount, 0)
  return {
    allowance,
    spent,
    balance: Math.max(0, allowance - spent),
    entries,
  }
}
