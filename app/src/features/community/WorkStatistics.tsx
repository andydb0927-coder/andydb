import type { PublishedWork } from './community-model'
import { summarizePortfolio } from './work-portfolio'

export function WorkStatistics({ works }: { works: readonly PublishedWork[] }) {
  const stats = summarizePortfolio(works)
  const maxCount = Math.max(1, ...stats.models.map((model) => model.count))
  return (
    <section className="work-statistics" aria-label="作品数据看板">
      <header><h2>作品数据看板</h2><span>仅个人已发布作品 · 不含首页示例</span></header>
      <dl className="work-statistics__totals">
        <div><dt>作品总数</dt><dd>{stats.total}</dd></div>
        <div><dt>已收藏</dt><dd>{stats.favorites}</dd></div>
        <div><dt>成功生成任务</dt><dd>{stats.successfulJobs}</dd></div>
        <div><dt>积分消耗估算</dt><dd>{stats.estimatedCredits}</dd></div>
      </dl>
      <h3>各模型使用次数</h3>
      {stats.models.length ? <ul className="work-statistics__bars" aria-label="模型使用次数">
        {stats.models.map((model) => <li key={model.name}>
          <span>{model.name}</span><span className="work-statistics__bar" aria-hidden="true"><i style={{ width: `${model.count / maxCount * 100}%` }} /></span>
          <strong>{model.count} 次</strong>
        </li>)}
      </ul> : <p>暂无成功生成任务记录</p>}
      <p className="work-statistics__note">来源：作品发布快照中的生成历史，按项目与任务去重；优先已记积分，否则使用成功任务估算。并非供应商账单；筛选不影响统计。</p>
      {stats.unknownCostJobs > 0 ? <p>{stats.unknownCostJobs} 个成功任务未记录费用，未计入估算。</p> : null}
    </section>
  )
}
