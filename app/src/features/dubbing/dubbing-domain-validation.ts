/** Shared only within the dubbing namespace; no project, storage or provider imports. */
export function dubbingAssert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function dubbingText(value: unknown, label: string, allowEmpty = false): string {
  dubbingAssert(typeof value === 'string' && (allowEmpty || value.trim().length > 0), `${label}不能为空或格式无效。`)
  return value
}

export function dubbingInteger(value: number, label: string, min = 1, max = Number.MAX_SAFE_INTEGER) {
  dubbingAssert(Number.isSafeInteger(value) && value >= min && value <= max, `${label}必须为 ${min}–${max} 范围内的整数。`)
}

export function dubbingUniqueIds(values: readonly string[], label: string, allowEmpty = true) {
  dubbingAssert(Array.isArray(values) && (allowEmpty || values.length > 0), `${label}不能为空或格式无效。`)
  values.forEach(value => dubbingText(value, label))
  dubbingAssert(new Set(values.map(value => value.trim())).size === values.length, `${label}存在重复记录。`)
}

export function dubbingTimestamp(value: string): number {
  const time = Date.parse(value)
  dubbingAssert(Number.isFinite(time) && new Date(time).toISOString() === value, '时间必须为带毫秒的 ISO UTC 格式。')
  return time
}

export interface DubbingPdfSource {
  kind: '客户PDF'
  documentName: '审核交付验收标准.pdf'
  pages: number[]
}

export function validateDubbingPdfSource(source: DubbingPdfSource) {
  dubbingAssert(source?.kind === '客户PDF' && source.documentName === '审核交付验收标准.pdf', '规则来源必须标注客户 PDF。')
  dubbingAssert(Array.isArray(source.pages) && source.pages.length > 0, '规则来源页码不能为空。')
  source.pages.forEach(page => dubbingInteger(page, 'PDF 页码', 1, 26))
}

export function dubbingPdfSource(...pages: number[]): DubbingPdfSource {
  const source: DubbingPdfSource = { kind: '客户PDF', documentName: '审核交付验收标准.pdf', pages }
  validateDubbingPdfSource(source)
  return source
}
