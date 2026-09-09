import { dubbingNumberNotation, type DubbingNumberContext, type DubbingNumberRules } from './dubbing-localization-plan'
import type { DubbingQaRule, DubbingQaTemplate } from './dubbing-qa-standard'

/** Normalized coordinates; project defaults, not a claim about a measured customer safe area. */
export const DUBBING_SUBTITLE_SAFE_BOX = { left: .05, top: .05, right: .95, bottom: .95 } as const
export const DUBBING_LIP_SYNC_THRESHOLDS = { warningSeconds: .3, failureSeconds: .5 } as const
export interface DubbingSubtitleCue {
  episode?: string
  startMs: number
  endMs: number
  text: string
  box?: { x: number; y: number; width: number; height: number }
}
export interface DubbingQaInput {
  language?: string
  numberRules?: DubbingNumberRules
  numberContext?: DubbingNumberContext
  originalText?: string
  localizedText?: string
  localizedExtraTexts?: string[]
  episodeNames?: string[]
  expectedEpisodeCount?: number
  subtitles?: DubbingSubtitleCue[]
  lipSyncOffsetsSeconds?: number[]
  volumeDeltaDb?: number
  volumeReference?: string
  channels?: number
  file?: { width: number; height: number; codec: string; bitrateMbps: number; container: string; fps: number; colorSpace: string }
  revisionCount?: number
}
export interface DubbingQaResult {
  standardId: string
  checkId: string
  result: 'PASS' | 'FAIL' | 'WARN'
  evidence: string
  checkMethod: DubbingQaRule['checkMethod']
  pendingConfirmation: boolean
}
type Finding = Pick<DubbingQaResult, 'result' | 'evidence'>
const finding = (result: Finding['result'], evidence: string): Finding => ({ result, evidence })
const missing = (label: string) => finding('WARN', `${label}缺少数据，待人工确认；未执行检测不代表通过。`)
const numeric = (value: number) => Number.isFinite(value)
const episodeValid = (name: string) => /^EP(?!000)[0-9]{3}$/.test(name)

function episodes(input: DubbingQaInput, sequence: boolean): Finding {
  const names = input.episodeNames
  if (!names?.length) return missing('剧集清单')
  if (names.some(name => !episodeValid(name))) return finding('FAIL', '集名必须为 EP001–EP999，且不能带空格或后缀。')
  if (!sequence) return finding('PASS', `${names.length} 个集名符合三位编号。仅检查清单，不核验磁盘文件名。`)
  const numbers = names.map(name => Number(name.slice(2))).sort((a, b) => a - b)
  if (numbers.some((value, index) => value !== index + 1)) return finding('FAIL', '集号须从 EP001 连续排列，不得缺集或重复。')
  if (input.expectedEpisodeCount === undefined) return missing('预期总集数（无法确认末尾是否缺集）')
  return finding(Number.isInteger(input.expectedEpisodeCount) && names.length === input.expectedEpisodeCount ? 'PASS' : 'FAIL', `提供 ${names.length} 集，预期 ${input.expectedEpisodeCount} 集。`)
}
function subtitles(input: DubbingQaInput, layout: boolean): Finding {
  const cues = input.subtitles
  if (!cues?.length) return missing('字幕时间轴')
  if (cues.some(cue => !numeric(cue.startMs) || !numeric(cue.endMs) || cue.startMs < 0 || cue.endMs <= cue.startMs)) return finding('FAIL', '字幕时间必须是非负有限毫秒，终点大于起点。')
  if (!layout) {
    const sorted = [...cues].sort((a, b) => a.startMs - b.startMs)
    const ends = new Map<string, number>()
    for (const cue of sorted) {
      const episode = cue.episode ?? 'current'
      if (cue.startMs < (ends.get(episode) ?? -1)) return finding('FAIL', `字幕在 ${cue.startMs}ms 存在区间重叠（含嵌套）；相邻端点不算重叠。`)
      ends.set(episode, cue.endMs)
    }
    return finding('PASS', `${cues.length} 条字幕在各自集内无区间相交。`)
  }
  const safe = DUBBING_SUBTITLE_SAFE_BOX
  for (const cue of cues) {
    const lines = cue.text.trim().split(/\r?\n/)
    if (!cue.text.trim() || lines.length > 3 || lines.some(line => !line.trim())) return finding('FAIL', '字幕须有 1–3 行非空文字。')
    const b = cue.box
    if (b && (![b.x, b.y, b.width, b.height].every(numeric) || b.width <= 0 || b.height <= 0 || b.x < safe.left || b.y < safe.top || b.x + b.width > safe.right + 1e-9 || b.y + b.height > safe.bottom + 1e-9)) return finding('FAIL', '字幕超出归一化安全框 5%–95%，或尺寸无效。')
  }
  return cues.some(cue => !cue.box) ? missing('字幕安全框坐标') : finding('PASS', '字幕 1–3 行且位于默认 5%–95% 安全框内；仍需核对最终画面。')
}
function localized(input: DubbingQaInput, numbers: boolean): Finding {
  const text = [input.localizedText, ...(input.localizedExtraTexts ?? []), ...(input.subtitles ?? []).map(cue => cue.text)].filter(item => item !== undefined).join('\n')
  if (text === undefined || !text.trim()) return missing('本地化文本（无台词镜头需人工确认不适用）')
  if (!numbers) return finding(/\p{Script=Han}/u.test(text) ? 'FAIL' : 'PASS', '仅扫描本地化文本的汉字；原文允许中文，不检测图像烧录文字。')
  if (!input.language || !input.numberRules || input.numberRules.mode === 'unconfigured') return missing('已确认语种数字规则')
  const tokens = text.normalize('NFKC').match(/[0-9]+(?:[.,][0-9]+)*/g) ?? []
  try {
    const decisions = tokens.map(token => dubbingNumberNotation(input.numberRules!, Number(token.replaceAll(',', '')), input.numberContext ?? 'ordinary'))
    if (decisions.includes('words')) return finding('FAIL', '本地化文本含本语种要求改为文字的阿拉伯数字；电话号码等须显式声明上下文例外。')
    if (decisions.includes('needs-confirmation')) return missing('数字阈值包含边界')
    return finding('PASS', '数字形式符合所给语种规则和上下文；不代表翻译语义通过。')
  } catch { return finding('WARN', '数字规则配置无效，待修正后重新检查。') }
}
function lipSync(input: DubbingQaInput): Finding {
  if (!input.lipSyncOffsetsSeconds?.length) return missing('口型时间差')
  if (input.lipSyncOffsetsSeconds.some(value => !numeric(value))) return finding('FAIL', '口型时间差必须为有限秒数。')
  const delta = Math.max(...input.lipSyncOffsetsSeconds.map(Math.abs))
  return finding(delta > DUBBING_LIP_SYNC_THRESHOLDS.failureSeconds ? 'FAIL' : delta > DUBBING_LIP_SYNC_THRESHOLDS.warningSeconds ? 'WARN' : 'PASS', `已提供偏差最大 ${delta}s；≤0.3s 通过，>0.3–0.5s 一般问题，>0.5s 严重问题。不是自动口型识别。`)
}
function fileSpec(input: DubbingQaInput): Finding {
  const f = input.file
  if (!f) return missing('交付视频元数据')
  const ok = f.width === 1080 && f.height === 1920 && /^(h\.?264|avc)$/i.test(f.codec) && numeric(f.bitrateMbps) && f.bitrateMbps >= 25 && f.container.toLowerCase() === 'mp4' && [25, 30].includes(f.fps) && /^rec\.?709$/i.test(f.colorSpace)
  return finding(ok ? 'PASS' : 'FAIL', `提供规格 ${f.width}×${f.height} / ${f.codec} / ${f.bitrateMbps}Mbps / ${f.fps}fps / ${f.container} / ${f.colorSpace}；要求1080×1920、H.264、≥25Mbps、25/30fps、MP4、Rec.709。未读取实际文件。`)
}

/** Pure, deterministic checks. Supplemental checks never promote a broader manual rule to PASS. */
export function runDubbingQa(template: DubbingQaTemplate, input: DubbingQaInput): DubbingQaResult[] {
  const output: DubbingQaResult[] = template.rules.map(rule => ({ standardId: rule.standardId, checkId: `rule:${rule.standardId}`, result: 'WARN',
    evidence: `${rule.checkMethod === '自动' ? '规则的完整范围尚需人工核对，自动子项见下方。' : `${rule.checkMethod}未执行，待人工确认。`} ${rule.requirement}`,
    checkMethod: rule.checkMethod, pendingConfirmation: true }))
  const add = (standardId: string, checkId: string, value: Finding) => {
    if (template.rules.some(rule => rule.standardId === standardId)) output.push({ standardId, checkId, ...value, checkMethod: '自动', pendingConfirmation: value.result === 'WARN' })
  }
  add('DB-QA-DELIVERY-02', 'episode-name', episodes(input, false))
  add('DB-QA-DELIVERY-02', 'episode-sequence', episodes(input, true))
  add('DB-QA-SUBTITLE-02', 'subtitle-overlap', subtitles(input, false))
  add('DB-QA-SUBTITLE-02', 'subtitle-layout', subtitles(input, true))
  add('DB-QA-SUBTITLE-01', 'localized-chinese', localized(input, false))
  add('DB-QA-SUBTITLE-01', 'localized-numbers', localized(input, true))
  add('DB-QA-SOUND-01', 'lip-sync', lipSync(input))
  add('DB-QA-SOUND-03', 'audio-volume', input.volumeDeltaDb === undefined || !input.volumeReference?.trim() ? missing('音量差及确认的测量基准') : finding(numeric(input.volumeDeltaDb) && Math.abs(input.volumeDeltaDb) <= 3 ? 'PASS' : 'FAIL', `相对 ${input.volumeReference} 的音量差 ${input.volumeDeltaDb}dB，允许 ±3dB（不是 LUFS）。`))
  add('DB-QA-DELIVERY-01', 'audio-channels', input.channels === undefined ? missing('声道元数据') : finding(input.channels === 2 ? 'PASS' : 'FAIL', `声道数 ${input.channels}，要求双声道。`))
  add('DB-QA-DELIVERY-01', 'file-spec', fileSpec(input))
  add('DB-QA-REVISION-01', 'revision-count', input.revisionCount === undefined ? missing('返修计数') : finding(Number.isInteger(input.revisionCount) && input.revisionCount >= 0 && input.revisionCount <= 3 ? 'PASS' : 'FAIL', `已记录 ${input.revisionCount} 次正式返修，上限3次；仍须人工核对历史完整性。`))
  return output
}
