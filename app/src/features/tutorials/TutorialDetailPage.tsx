import { ArrowLeft, ArrowRight, BookOpen, ChevronLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { getTutorialLesson, tutorialCategories } from './tutorial-catalog'

export function TutorialDetailPage() {
  const { tutorialId } = useParams<{ tutorialId: string }>()
  const location = getTutorialLesson(tutorialId)

  if (!location) {
    return (
      <main className="platform-page tutorial-detail-page">
        <p className="platform-page__eyebrow">LEARNING CENTER</p>
        <h1>教程暂不可用</h1>
        <p>该本地教程不存在或已被移除。</p>
        <Link className="tutorial-detail__back focus-visible" to="/tutorials">
          <ArrowLeft aria-hidden="true" />返回教程中心
        </Link>
      </main>
    )
  }

  const { category, lesson, previous, next } = location

  return (
    <main className="platform-page tutorial-detail-page">
      <Link className="tutorial-detail__back focus-visible" to="/tutorials">
        <ChevronLeft aria-hidden="true" />返回教程中心
      </Link>
      <div className="tutorial-detail__layout">
        <nav className="tutorial-detail__categories" aria-label="教程分类导航">
          <strong><BookOpen aria-hidden="true" />教程目录</strong>
          {tutorialCategories.map((entry) => (
            <section key={entry.id} aria-label={`${entry.title}分类`}>
              <h2>{entry.title}</h2>
              {entry.lessons.map((item) => (
                <Link
                  key={item.id}
                  to={`/tutorials/${item.id}`}
                  aria-current={item.id === lesson.id ? 'page' : undefined}
                >
                  {item.title}
                </Link>
              ))}
            </section>
          ))}
        </nav>

        <article className="tutorial-detail__article" aria-label={lesson.title}>
          <header>
            <p className="platform-page__eyebrow">{category.title} · STEP BY STEP</p>
            <h1>{lesson.title}</h1>
            <p className="tutorial-detail__lead">{lesson.summary}</p>
          </header>
          <section aria-labelledby="tutorial-body-heading">
            <h2 id="tutorial-body-heading">开始之前</h2>
            <p>{category.description}</p>
            <p>
              以下操作完全对应当前产品界面。执行过程中可随时返回画布检查节点、连线与本地保存状态。
            </p>
          </section>
          <section aria-labelledby="tutorial-steps-heading">
            <h2 id="tutorial-steps-heading">操作步骤</h2>
            <ol className="tutorial-detail__steps">
              {lesson.steps.map((step, index) => (
                <li key={step}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <p>{step}</p>
                </li>
              ))}
            </ol>
          </section>
          <section className="tutorial-detail__tip" aria-label="完成提示">
            <h2>完成检查</h2>
            <p>确认界面反馈与教程描述一致，并在离开页面前等待项目保存状态完成。</p>
          </section>
          <nav className="tutorial-detail__pagination" aria-label="教程上一篇下一篇">
            {previous ? (
              <Link to={`/tutorials/${previous.id}`} aria-label={`上一篇：${previous.title}`}>
                <ArrowLeft aria-hidden="true" /><span>上一篇<strong>{previous.title}</strong></span>
              </Link>
            ) : <span />}
            {next ? (
              <Link to={`/tutorials/${next.id}`} aria-label={`下一篇：${next.title}`}>
                <span>下一篇<strong>{next.title}</strong></span><ArrowRight aria-hidden="true" />
              </Link>
            ) : null}
          </nav>
        </article>
      </div>
    </main>
  )
}
