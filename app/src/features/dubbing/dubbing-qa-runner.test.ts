import { describe, expect, it } from 'vitest'
import { loadDubbingQaTemplate } from './dubbing-qa-standard'
import { createDubbingLocalizationPlan } from './dubbing-localization-plan'
import { runDubbingQa, DUBBING_SUBTITLE_SAFE_BOX, type DubbingQaInput } from './dubbing-qa-runner'

const plan = createDubbingLocalizationPlan({ id: 'plan', dramaId: 'drama', targetLanguage: 'es-ES', names: [], replacements: [], textReplacements: [] })
const base: DubbingQaInput = { language: plan.targetLanguage, numberRules: plan.numberRules, episodeNames: ['EP001', 'EP002'], expectedEpisodeCount: 2,
  originalText: '原文允许中文和123', localizedText: 'Hola', revisionCount: 0,
  subtitles: [{ startMs: 0, endMs: 1000, text: 'Hola', box: { x: .1, y: .8, width: .8, height: .1 } }],
  lipSyncOffsetsSeconds: [0, .3], volumeDeltaDb: 3, volumeReference: '客户确认参考音轨', channels: 2,
  file: { width: 1080, height: 1920, codec: 'H.264', bitrateMbps: 25, container: 'mp4', fps: 25, colorSpace: 'Rec.709' } }
const results = (input: Partial<DubbingQaInput> = {}) => runDubbingQa(loadDubbingQaTemplate(), { ...base, ...input })
const check = (id: string, input: Partial<DubbingQaInput> = {}) => results(input).find(item => item.checkId === id)!

describe('转绘自动检查边界', () => {
  it.each(['EP01', 'EP000', 'EP1000', 'ep001', ' EP001'])('拒绝非法集名 %s', name => expect(check('episode-name', { episodeNames: [name] }).result).toBe('FAIL'))
  it('精确三位集名、集号连续与完整性；缺集/重复/缺预期集数均有依据', () => {
    expect(check('episode-name').result).toBe('PASS')
    expect(check('episode-sequence').result).toBe('PASS')
    for (const episodeNames of [['EP001', 'EP003'], ['EP002'], ['EP001', 'EP001']]) expect(check('episode-sequence', { episodeNames }).result).toBe('FAIL')
    expect(check('episode-sequence', { expectedEpisodeCount: undefined }).result).toBe('WARN')
  })
  it('半开区间相邻不重叠，嵌套、相交、乱序均检测；跨集不比较', () => {
    const cue = base.subtitles![0]
    expect(check('subtitle-overlap', { subtitles: [cue, { ...cue, startMs: 1000, endMs: 2000 }] }).result).toBe('PASS')
    expect(check('subtitle-overlap', { subtitles: [{ ...cue, startMs: 100, endMs: 500 }, cue] }).result).toBe('FAIL')
    expect(check('subtitle-overlap', { subtitles: [cue, { ...cue, startMs: 999, endMs: 1500 }] }).result).toBe('FAIL')
    expect(check('subtitle-overlap', { subtitles: [{ ...cue, episode: 'EP001' }, { ...cue, episode: 'EP002' }] }).result).toBe('PASS')
    expect(check('subtitle-overlap', { subtitles: [{ ...cue, endMs: 0 }] }).result).toBe('FAIL')
  })
  it('字幕1到3行，安全框闭区间包含边界，空白/4行/越界/NaN拒绝', () => {
    const cue = base.subtitles![0], box = DUBBING_SUBTITLE_SAFE_BOX
    for (const text of ['a', 'a\nb', 'a\nb\nc']) expect(check('subtitle-layout', { subtitles: [{ ...cue, text, box: { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top } }] }).result).toBe('PASS')
    for (const text of ['', 'a\nb\nc\nd']) expect(check('subtitle-layout', { subtitles: [{ ...cue, text }] }).result).toBe('FAIL')
    for (const x of [-1, .91, NaN]) expect(check('subtitle-layout', { subtitles: [{ ...cue, box: { ...cue.box!, x } }] }).result).toBe('FAIL')
    expect(check('subtitle-layout', { subtitles: [{ ...cue, box: undefined }] }).result).toBe('WARN')
  })
  it.each([[.3, 'PASS'], [.30001, 'WARN'], [.5, 'WARN'], [.50001, 'FAIL'], [-.6, 'FAIL'], [NaN, 'FAIL']])('口型 %s 秒 => %s', (offset, status) => expect(check('lip-sync', { lipSyncOffsetsSeconds: [Number(offset)] }).result).toBe(status))
  it('本地化域检中文含扩展汉字，原文不误报；西语数字和显式例外', () => {
    expect(check('localized-chinese').result).toBe('PASS')
    for (const localizedText of ['hello中', '𠀀']) expect(check('localized-chinese', { localizedText }).result).toBe('FAIL')
    for (const localizedText of ['tengo 2', 'tengo ２']) expect(check('localized-numbers', { localizedText }).result).toBe('FAIL')
    expect(check('localized-numbers', { localizedText: '123', numberContext: 'phone' }).result).toBe('PASS')
    expect(check('localized-numbers', { numberRules: undefined }).result).toBe('WARN')
    expect(check('localized-chinese', { localizedText: undefined, subtitles: undefined }).result).toBe('WARN')
    expect(check('localized-chinese', { localizedExtraTexts: ['花字'] }).result).toBe('FAIL')
    expect(check('localized-chinese', { subtitles: [{ ...base.subtitles![0], text: '字幕残留' }] }).result).toBe('FAIL')
  })
  it('音量闭区间±3dB和双声道；没有确认基准不通过', () => {
    for (const volumeDeltaDb of [-3, 0, 3]) expect(check('audio-volume', { volumeDeltaDb }).result).toBe('PASS')
    for (const volumeDeltaDb of [-3.01, 3.01, NaN]) expect(check('audio-volume', { volumeDeltaDb }).result).toBe('FAIL')
    expect(check('audio-volume', { volumeReference: '' }).result).toBe('WARN')
    expect(check('audio-channels', { channels: 1 }).result).toBe('FAIL')
    expect(check('audio-channels', { channels: undefined }).result).toBe('WARN')
  })
  it('视频规格全字段验证，缺数据待确认，不能把局部PASS当整项通过', () => {
    expect(check('file-spec').result).toBe('PASS')
    for (const file of [{ ...base.file!, width: 1920 }, { ...base.file!, codec: 'HEVC' }, { ...base.file!, bitrateMbps: 24.99 }, { ...base.file!, fps: 24 }]) expect(check('file-spec', { file }).result).toBe('FAIL')
    expect(check('file-spec', { file: undefined }).result).toBe('WARN')
    expect(results().find(item => item.checkId === 'rule:DB-QA-DELIVERY-02')?.result).toBe('WARN')
  })
  it('人工和AI始终待确认；空数据不产生自动通过；未知标准安全降级', () => {
    const template = loadDubbingQaTemplate()
    const output = runDubbingQa(template, {})
    expect(output.some(item => item.result === 'PASS')).toBe(false)
    for (const rule of template.rules.filter(item => item.checkMethod !== '自动')) {
      expect(output.find(item => item.checkId === `rule:${rule.standardId}`)).toMatchObject({ result: 'WARN', pendingConfirmation: true, checkMethod: rule.checkMethod })
    }
    template.rules[0] = { ...template.rules[0], standardId: 'DB-QA-CUSTOM', checkMethod: '自动' }
    expect(runDubbingQa(template, base).find(item => item.standardId === 'DB-QA-CUSTOM')?.result).toBe('WARN')
  })
})
