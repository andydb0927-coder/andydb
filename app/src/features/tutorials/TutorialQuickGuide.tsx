import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { tutorialCategories } from './tutorial-catalog'

export function TutorialQuickGuide() {
  return (
    <div className="workspace-tutorial-guide">
      <p className="workspace-tutorial-guide__intro">按当前界面文案快速完成一次创作；完整教程包含每项操作的详细步骤。</p>
      <div className="workspace-tutorial-guide__categories">
        {tutorialCategories.map((category) => {
          const lesson = category.lessons[0]
          return (
            <section key={category.id}>
              <h3>{category.title}</h3>
              <strong>{lesson.title}</strong>
              <p>{lesson.summary}</p>
              <ol>
                {lesson.steps.slice(0, 3).map((step) => <li key={step}>{step}</li>)}
              </ol>
            </section>
          )
        })}
      </div>
      <Link className="workspace-tutorial-guide__link focus-visible" to="/tutorials">
        查看完整教程 <ArrowRight aria-hidden="true" />
      </Link>
      <p className="workspace-tutorial-guide__local">当前为本地演示工作台；只有明确标注的开发验证模式才会调用真实模型。</p>
    </div>
  )
}
