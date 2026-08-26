import { BookOpen, CircleHelp, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { helpCategories } from './help-catalog'

export function HelpCenterPage() {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleCategories = useMemo(() => helpCategories.flatMap((category) => {
    const faqs = normalizedQuery
      ? category.faqs.filter((faq) => `${faq.question} ${faq.answer}`.toLocaleLowerCase().includes(normalizedQuery))
      : category.faqs
    return faqs.length ? [{ ...category, faqs }] : []
  }), [normalizedQuery])
  const resultCount = visibleCategories.reduce((total, category) => total + category.faqs.length, 0)

  return (
    <main className="platform-page help-center-page">
      <header className="help-center__hero">
        <div>
          <p className="platform-page__eyebrow">PRODUCT HELP</p>
          <h1>帮助中心</h1>
          <p>围绕当前产品真实可用功能整理的本地帮助，不包含尚未接入的云端能力。</p>
        </div>
        <Link to="/tutorials"><BookOpen aria-hidden="true" />查看完整教程</Link>
      </header>

      <label className="help-center__search">
        <Search aria-hidden="true" />
        <span className="sr-only">搜索帮助内容</span>
        <input
          type="search"
          aria-label="搜索帮助内容"
          placeholder="搜索账号、画布、生成、资产或发布问题"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span role="status">{normalizedQuery ? `找到 ${resultCount} 条帮助` : `共 ${resultCount} 条帮助`}</span>
      </label>

      {visibleCategories.length ? (
        <div className="help-center__categories">
          {visibleCategories.map((category) => (
            <section key={category.id} className="help-category" aria-labelledby={`help-${category.id}`}>
              <header><CircleHelp aria-hidden="true" /><div><h2 id={`help-${category.id}`}>{category.title}</h2><p>{category.description}</p></div></header>
              <div className="help-category__faqs">
                {category.faqs.map((faq) => (
                  <details key={faq.id} open={Boolean(normalizedQuery)}>
                    <summary>{faq.question}</summary>
                    <p>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="help-center__empty"><CircleHelp aria-hidden="true" /><h2>没有找到相关帮助</h2><p>尝试搜索“节点”“模型”“上传”或“导出”。</p></div>
      )}
    </main>
  )
}
