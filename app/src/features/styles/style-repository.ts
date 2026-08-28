import { WirelessCanvasDatabase } from '../project/project-repository'
import { builtInStyles, type StyleCard, type StylePreference } from './style-model'

export interface CustomStyleInput { name: string; promptFragment: string; cover?: string }
export interface StyleLibrary { cards: StyleCard[]; preferences: StylePreference[] }

export class StyleRepository {
  private readonly database: WirelessCanvasDatabase
  constructor(database: WirelessCanvasDatabase) { this.database = database }

  async load(): Promise<StyleLibrary> {
    const [custom, preferences] = await Promise.all([this.database.styles.toArray(), this.database.stylePreferences.toArray()])
    return { cards: [...builtInStyles, ...custom], preferences }
  }

  async create(input: CustomStyleInput): Promise<StyleCard> {
    const name = input.name.trim(), promptFragment = input.promptFragment.trim()
    if (!name || name.length > 80) throw new Error('风格名称需为 1–80 字。')
    if (!promptFragment || promptFragment.length > 2000) throw new Error('提示词片段需为 1–2000 字。')
    if (input.cover && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(input.cover) || input.cover.length > 2_800_000)) {
      throw new Error('封面仅支持不超过 2MB 的 PNG、JPEG 或 WebP 图片。')
    }
    const card: StyleCard = {
      id: `custom-style-${crypto.randomUUID()}`, name, promptFragment,
      compatibility: { targetKinds: ['image', 'video', 'text'] },
      author: '我', heat: '0', commercial: false, model: '通用提示词模板', category: '创意玩法', custom: true,
      ...(input.cover ? { cover: input.cover } : {}),
    }
    await this.database.styles.add(card)
    return card
  }

  async setFavorite(id: string, favorite: boolean) {
    await this.database.transaction('rw', this.database.stylePreferences, async () => {
      const preference = await this.database.stylePreferences.get(id)
      await this.database.stylePreferences.put({ ...preference, id, favorite })
    })
  }

  async markUsed(id: string) {
    await this.database.transaction('rw', this.database.stylePreferences, async () => {
      const preference = await this.database.stylePreferences.get(id)
      await this.database.stylePreferences.put({ favorite: false, ...preference, id, lastUsedAt: new Date().toISOString() })
    })
  }
}

export const defaultStyleRepository = new StyleRepository(new WirelessCanvasDatabase())
