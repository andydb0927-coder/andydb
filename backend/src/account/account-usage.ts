import type { AccountRepository, UsageModality } from './account-repository'

export type MeteredProxyRoute = 'image' | 'video' | 'text' | 'tts'

export interface UsageReservation {
  userId: string
  modality: UsageModality
  amount: number
  label: string
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function integer(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

export function usageReservation(
  route: MeteredProxyRoute,
  input: unknown,
  userId: string,
): UsageReservation {
  const body = record(input)
  if (route === 'image') {
    return { userId, modality: 'imageCount', amount: 1, label: '图片生成' }
  }
  if (route === 'video') {
    return {
      userId,
      modality: 'videoSeconds',
      amount: integer(body?.duration, 5),
      label: '视频生成',
    }
  }
  if (route === 'tts') {
    return {
      userId,
      modality: 'audioCharacters',
      amount: typeof body?.text === 'string' ? [...body.text].length : 0,
      label: '语音生成',
    }
  }
  const promptLength = typeof body?.prompt === 'string' ? [...body.prompt].length : 0
  return {
    userId,
    modality: 'textTokens',
    amount: promptLength + integer(body?.maxTokens, 2_048),
    label: '文本生成',
  }
}

export async function actualUsageAmount(
  route: MeteredProxyRoute,
  response: Response,
  reservedAmount: number,
) {
  if (route !== 'text') return reservedAmount
  try {
    const body = record(await response.clone().json())
    const usage = record(body?.usage)
    const total = usage?.total_tokens
    return typeof total === 'number' && Number.isInteger(total) && total >= 0
      ? total
      : reservedAmount
  } catch {
    return reservedAmount
  }
}

export async function releaseUnusedReservation(
  repository: AccountRepository,
  reservation: UsageReservation,
  actualAmount: number,
) {
  if (actualAmount < reservation.amount) {
    await repository.releaseUsage(
      reservation.userId,
      reservation.modality,
      reservation.amount - actualAmount,
    )
  }
}
