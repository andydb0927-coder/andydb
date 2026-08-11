import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { ProjectRepository } from '../project/project-repository'

export interface AccountPageProps {
  repository?: Pick<ProjectRepository, 'listRecent'>
}

const defaultRepository = new ProjectRepository()

export function AccountPage({ repository = defaultRepository }: AccountPageProps) {
  const [projectCount, setProjectCount] = useState<number>()

  useEffect(() => {
    let active = true
    void repository
      .listRecent(100)
      .then((projects) => {
        if (active) setProjectCount(projects.length)
      })
      .catch(() => {
        if (active) setProjectCount(0)
      })
    return () => {
      active = false
    }
  }, [repository])

  return (
    <main className="platform-page">
      <header className="platform-page__header">
        <p className="platform-page__eyebrow">LOCAL WORKSPACE</p>
        <h1>本地工作区</h1>
        <p>此阶段的项目数据只保存在当前浏览器的 IndexedDB 中。</p>
      </header>

      <section className="platform-workspace-summary" aria-labelledby="workspace-state-title">
        <div>
          <p>已保存的创作记录</p>
          <h2 id="workspace-state-title">
            {projectCount === undefined ? '正在统计本地项目' : `${projectCount} 个本地项目`}
          </h2>
        </div>
        <Link to="/">前往项目空间</Link>
      </section>

      <section className="platform-section" aria-labelledby="availability-title">
        <div className="platform-section__heading">
          <div>
            <p>功能可用性</p>
            <h2 id="availability-title">当前边界</h2>
          </div>
        </div>
        <ul className="platform-availability-list">
          <li><strong>项目、画布、预览与本地持久化：已可用</strong></li>
          <li><strong>登录、团队与会员：未接入</strong></li>
          <li><strong>云端同步与协作：后续阶段</strong></li>
        </ul>
      </section>
    </main>
  )
}
