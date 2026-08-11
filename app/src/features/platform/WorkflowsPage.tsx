import { Link } from 'react-router-dom'

import {
  RECIPE_QUERY_PARAM,
  recipeDefinitions,
} from '../project/recipe-catalog'

export function WorkflowsPage() {
  return (
    <main className="platform-page">
      <header className="platform-page__header">
        <p className="platform-page__eyebrow">STARTER WORKFLOWS</p>
        <h1>工作流与模板</h1>
        <p>选定配方后回到项目空间补充创作意图，再建立真实项目。</p>
      </header>
      <section className="platform-card-grid" aria-label="可用创作配方">
        {recipeDefinitions.map((recipe) => (
          <article className="platform-card" key={recipe.id}>
            <p>创作配方</p>
            <h2>{recipe.title}</h2>
            <p>{recipe.description}</p>
            <dl>
              <div><dt>角色</dt><dd>{recipe.characterPrompt}</dd></div>
              <div><dt>场景</dt><dd>{recipe.scenePrompt}</dd></div>
              <div><dt>镜头</dt><dd>{recipe.storyboardPrompt}</dd></div>
            </dl>
            <Link to={`/?${RECIPE_QUERY_PARAM}=${recipe.id}`}>
              使用{recipe.title}
            </Link>
          </article>
        ))}
      </section>
    </main>
  )
}
