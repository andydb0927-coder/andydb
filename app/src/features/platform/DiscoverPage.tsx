import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ensureExampleProject, exampleProject } from '../project/example-project'
import { ProjectRepository } from '../project/project-repository'
import { useProjectStore } from '../project/project-store'

export interface DiscoverPageProps {
  repository?: Pick<ProjectRepository, 'load' | 'save'>
}

const defaultRepository = new ProjectRepository()

export function DiscoverPage({
  repository = defaultRepository,
}: DiscoverPageProps) {
  const navigate = useNavigate()
  const [state, setState] = useState<'idle' | 'opening' | 'error'>('idle')

  const openExample = async () => {
    setState('opening')
    try {
      const project = await ensureExampleProject(repository)
      const hydrated = await useProjectStore.getState().hydrate(project.id, repository)
      if (!hydrated) throw new Error('无法载入示例项目')
      navigate(`/project/${project.id}`)
    } catch {
      setState('error')
    }
  }

  return (
    <main className="platform-page">
      <header className="platform-page__header">
        <p className="platform-page__eyebrow">BUILT-IN SHOWCASE</p>
        <h1>发现与作品</h1>
        <p>先从内置的完整画布示例查看角色、场景与分镜如何连接。</p>
      </header>
      <article className="platform-showcase">
        <div>
          <p>完整示例 · 本地可打开</p>
          <h2>{exampleProject.title}</h2>
          <p>{exampleProject.intent}</p>
          <ol aria-label="示例创作流程">
            <li>角色参考</li>
            <li>场景设定</li>
            <li>分镜 01</li>
          </ol>
        </div>
        <div className="platform-showcase__actions">
          {state === 'error' ? (
            <p role="alert">示例项目暂时无法打开，请重试。</p>
          ) : null}
          <button
            className="ui-button focus-visible"
            disabled={state === 'opening'}
            type="button"
            onClick={() => void openExample()}
          >
            {state === 'opening' ? '正在打开示例项目' : '打开示例项目'}
          </button>
        </div>
      </article>
    </main>
  )
}
