import { dubbingAssert, dubbingPdfSource, dubbingText, dubbingUniqueIds, validateDubbingPdfSource, type DubbingPdfSource } from './dubbing-domain-validation'
import { DUBBING_REPLACEMENT_CATEGORIES } from './dubbing-localization-plan'

export const DUBBING_QA_CATEGORIES = ['资产', '场景', '道具', '画面', '声音', '字幕', '修改', '交付', '中国元素'] as const
export const DUBBING_QA_LEVELS = { P0: { color: '红', label: '严重问题' }, P1: { color: '黄', label: '一般问题' }, P2: { color: '白', label: '轻微问题' } } as const
export interface DubbingQaRule {
  standardId: string
  category: typeof DUBBING_QA_CATEGORIES[number]
  requirement: string
  level: keyof typeof DUBBING_QA_LEVELS
  checkMethod: '自动' | 'AI辅助' | '人工'
  source: DubbingPdfSource
}
export interface DubbingQaTemplate {
  namespace: 'dubbing.qa'
  schemaVersion: 1
  id: string
  p1BlockingThreshold: number | null
  rules: DubbingQaRule[]
  notes: string[]
}

const rule = (standardId: string, category: DubbingQaRule['category'], requirement: string, level: DubbingQaRule['level'], checkMethod: DubbingQaRule['checkMethod'], ...pages: number[]): DubbingQaRule =>
  ({ standardId, category, requirement, level, checkMethod, source: dubbingPdfSource(...pages) })

const template: DubbingQaTemplate = {
  namespace: 'dubbing.qa', schemaVersion: 1, id: 'customer-delivery-v1', p1BlockingThreshold: null,
  notes: [
    '模板依据客户 PDF 摘要化；检查方式是后续能力规划，不代表已执行自动、AI 或人工验收。',
    '等级为项目初始化建议，可逐项调整；PDF 未给出 P1 累计阻断数，保留 null 等待项目确认。',
    '数字 10 的包含边界在 PDF 第 9 与 17、23 页表述不一致，须在方案中显式确认。',
    '不将族裔排除描述作为通用自动规则；面孔项只人工核对获确认的虚构角色设计，不推断真人族裔。',
    '本批不实现检测器、版权核验、导出器或自动验收通过；部分工具单位和音量基准需交付双方确认。',
  ],
  rules: [
    rule('DB-QA-ASSET-01', '资产', '角色姓名及姓氏全剧唯一，并保持角色、服装与参考资产一致。', 'P0', '人工', 2, 3),
    rule('DB-QA-ASSET-02', '资产', '保留角色多角度和必要服装资产，来源及使用授权可追溯。', 'P1', '人工', 3, 13),
    rule('DB-QA-SCENE-01', '场景', '场景空间关系、镜头轴线及人物进出方向与剧情一致。', 'P0', 'AI辅助', 3, 4, 20),
    rule('DB-QA-SCENE-02', '场景', '光线、天气、时段和前后镜头环境连续，替换不得改变剧情功能。', 'P1', 'AI辅助', 4, 7, 20),
    rule('DB-QA-PROP-01', '道具', '关键道具的数量、持握、交互和剧情用途保持一致。', 'P0', '人工', 5, 6, 21),
    rule('DB-QA-PROP-02', '道具', '黑板、叫车标志、饮品设备等按已确认替换清单逐项核对。', 'P1', '人工', 4, 5, 21),
    rule('DB-QA-FRAME-01', '画面', '无人物结构异常、穿模、明显闪烁或关键内容缺失。', 'P0', 'AI辅助', 6, 7, 22),
    rule('DB-QA-FRAME-02', '画面', '保持镜头构图、动作衔接与剧情可理解性，时长不强求逐帧等同原片。', 'P1', '人工', 7, 10),
    rule('DB-QA-SOUND-01', '声音', '人工核对口型同步：偏差不超过 0.3 秒；0.3–0.5 秒记一般问题，超过 0.5 秒记严重问题。', 'P0', '人工', 8),
    rule('DB-QA-SOUND-02', '声音', '台词完整且本地化准确，角色音色连续，无缺音、杂音或错配。', 'P0', '人工', 8, 23),
    rule('DB-QA-SOUND-03', '声音', '对照客户音量要求检查音轨；±3 dB 的测量基准须先确认，不能默认等同 LUFS。', 'P1', '人工', 16),
    rule('DB-QA-SUBTITLE-01', '字幕', '字幕与花字完整替换，姓名、数字、货币和标点服从全剧本地化方案。', 'P0', '人工', 9, 17, 23),
    rule('DB-QA-SUBTITLE-02', '字幕', '字幕位于安全区域、行数和换行便于阅读；工具字体数值按交付软件核对。', 'P1', '人工', 14, 15),
    rule('DB-QA-SUBTITLE-03', '字幕', '检查非关键字幕的轻微排版和间距差异，并记录白色问题。', 'P2', '人工', 1, 14, 15),
    rule('DB-QA-REVISION-01', '修改', '每镜头正式返修最多 3 次，意见、责任人及对应版本只追加保留。', 'P0', '自动', 12),
    rule('DB-QA-REVISION-02', '修改', '原片、反馈与修改版本并存，不得覆盖旧版本或通过删镜、模糊、裁切、静音规避问题。', 'P0', '人工', 10, 17),
    rule('DB-QA-REVISION-03', '修改', '先完成自审再送审；返修后重新自审，不沿用旧版本通过记录。', 'P0', '人工', 1, 17),
    rule('DB-QA-DELIVERY-01', '交付', '视频采用 H.264 MP4、1080×1920、至少 25 Mbps、25 或 30 fps、Rec.709 与立体声。', 'P0', '自动', 13, 14),
    rule('DB-QA-DELIVERY-02', '交付', '集号使用 EP001 等三位编号，按要求交付 1080×1440 与 1080×1920 海报。', 'P1', '自动', 12),
    rule('DB-QA-DELIVERY-03', '交付', '发布前人工确认素材、音乐及字体使用授权，交付包文件齐全。', 'P0', '人工', 13),
    ...DUBBING_REPLACEMENT_CATEGORIES.map((category, index) => rule(`DB-QA-ELEMENT-${String(index + 1).padStart(2, '0')}`, '中国元素',
      category === '面孔' ? '面孔：人工核对已确认的虚构角色外观与跨镜头一致性，不进行真人族裔识别。' : `${category}：按项目已确认的源元素与目标替换清单核对，保留剧情意义和镜头连续性。`,
      'P1', '人工', 18, 26)),
  ],
}

export function validateDubbingQaTemplate(value: DubbingQaTemplate): void {
  dubbingAssert(value.namespace === 'dubbing.qa' && value.schemaVersion === 1, '验收模板命名空间或版本无效。')
  dubbingText(value.id, '验收模板 ID')
  dubbingAssert(value.p1BlockingThreshold === null || (Number.isSafeInteger(value.p1BlockingThreshold) && value.p1BlockingThreshold > 0), 'P1 阻断阈值无效。')
  dubbingUniqueIds(value.rules.map(item => item.standardId), '标准 ID', false)
  for (const item of value.rules) {
    dubbingAssert(/^DB-QA-/.test(item.standardId), '标准 ID 前缀无效。')
    dubbingAssert(DUBBING_QA_CATEGORIES.includes(item.category), '验收分类无效。')
    dubbingAssert(['P0', 'P1', 'P2'].includes(item.level), '验收等级无效。')
    dubbingAssert(['自动', 'AI辅助', '人工'].includes(item.checkMethod), '验收检查方式无效。')
    dubbingText(item.requirement, '验收要求')
    validateDubbingPdfSource(item.source)
  }
  dubbingAssert(DUBBING_QA_CATEGORIES.every(category => value.rules.some(item => item.category === category)), '验收模板缺失分类。')
  value.notes.forEach(note => dubbingText(note, '模板说明'))
}

export function loadDubbingQaTemplate(): DubbingQaTemplate {
  const copy = structuredClone(template)
  validateDubbingQaTemplate(copy)
  return copy
}
