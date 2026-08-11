export type RecipeId =
  | 'cinematic-story'
  | 'brand-atmosphere'
  | 'character-teaser'

export interface RecipeDefinition {
  id: RecipeId
  title: string
  description: string
  characterPrompt: string
  scenePrompt: string
  storyboardPrompt: string
}

export const RECIPE_QUERY_PARAM = 'recipe'
export const recipeDefinitions: RecipeDefinition[] = [
  {
    id: 'cinematic-story',
    title: '电影感叙事',
    description: '从角色动机出发，建立场景与首个叙事镜头',
    characterPrompt: '主角人物参考，克制的电影光影，清晰面部特征',
    scenePrompt: '核心场景设定，真实空间层次与氛围光',
    storyboardPrompt: '首个叙事分镜，宽银幕构图，建立人物与环境关系',
  },
  {
    id: 'brand-atmosphere',
    title: '品牌氛围片',
    description: '围绕品牌气质建立主角、环境与开场视觉',
    characterPrompt: '品牌主角人物参考，精致造型与统一视觉气质',
    scenePrompt: '品牌世界观场景，材质细节与氛围光线',
    storyboardPrompt: '品牌氛围片开场分镜，视觉焦点明确，节奏舒展',
  },
  {
    id: 'character-teaser',
    title: '角色概念预告',
    description: '先定义角色形象，再生成其世界与亮相镜头',
    characterPrompt: '角色概念参考，全身造型，鲜明轮廓与身份细节',
    scenePrompt: '角色所属世界的核心场景，环境叙事清晰',
    storyboardPrompt: '角色首次亮相分镜，强烈剪影与戏剧性光线',
  },
]

export function findRecipe(recipeId: string | null) {
  return recipeDefinitions.find((recipe) => recipe.id === recipeId)
}
