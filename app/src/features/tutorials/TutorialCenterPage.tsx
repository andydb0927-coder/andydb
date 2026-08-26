import { ArrowRight, BookOpen, Clapperboard, Image, WandSparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { tutorialCategories, type TutorialCategoryId } from './tutorial-catalog'

const categoryIcons: Record<TutorialCategoryId, typeof BookOpen> = {
  'getting-started': BookOpen,
  image: Image,
  video: Clapperboard,
  advanced: WandSparkles,
}

export function TutorialCenterPage() {
  return (
    <main className="platform-page tutorial-center-page">
      <header className="tutorial-center__hero">
        <div>
          <p className="platform-page__eyebrow">LEARNING CENTER</p>
          <h1>教程中心</h1>
          <p>从第一个节点到本地发布，按照无线画布当前界面逐步完成创作。</p>
        </div>
        <Link to="/projects/new" className="tutorial-center__start focus-visible">
          新建项目 <ArrowRight aria-hidden="true" />
        </Link>
      </header>

      <nav className="tutorial-center__nav" aria-label="教程分类导航">
        {tutorialCategories.map((category) => (
          <a key={category.id} href={`#tutorial-${category.id}`}>{category.title}</a>
        ))}
      </nav>

      <div className="tutorial-center__categories">
        {tutorialCategories.map((category, categoryIndex) => {
          const Icon = categoryIcons[category.id]
          return (
            <section
              key={category.id}
              id={`tutorial-${category.id}`}
              className="tutorial-category"
              aria-label={`${category.title}教程`}
            >
              <header>
                <span>{String(categoryIndex + 1).padStart(2, '0')}</span>
                <Icon aria-hidden="true" />
                <div>
                  <h2>{category.title}</h2>
                  <p>{category.description}</p>
                </div>
              </header>
              <div className="tutorial-category__lessons">
                {category.lessons.map((lesson, lessonIndex) => (
                  <article key={lesson.id} aria-labelledby={`lesson-${lesson.id}`}>
                    <div className="tutorial-lesson__number">{categoryIndex + 1}.{lessonIndex + 1}</div>
                    <h3 id={`lesson-${lesson.id}`}>{lesson.title}</h3>
                    <p>{lesson.summary}</p>
                    <ol>
                      {lesson.steps.map((step) => <li key={step}>{step}</li>)}
                    </ol>
                    <Link
                      className="tutorial-lesson__link focus-visible"
                      to={`/tutorials/${lesson.id}`}
                      aria-label={`查看教程：${lesson.title}`}
                    >
                      查看完整教程 <ArrowRight aria-hidden="true" />
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
