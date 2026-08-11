import { useMemo, useState } from 'react'

import {
  modelCapabilities,
  type ModelCapabilityKind,
} from './model-capabilities'

type ModelFilter = 'all' | ModelCapabilityKind

const filters: Array<{ id: ModelFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
]

export function ModelsPage() {
  const [filter, setFilter] = useState<ModelFilter>('all')
  const visibleCapabilities = useMemo(
    () =>
      filter === 'all'
        ? modelCapabilities
        : modelCapabilities.filter((capability) => capability.kind === filter),
    [filter],
  )

  return (
    <main className="platform-page">
      <header className="platform-page__header">
        <p className="platform-page__eyebrow">CAPABILITY BOUNDARY</p>
        <h1>模型能力</h1>
        <p>
          当前应用使用<strong>本地演示适配器</strong>，用于验证画布内的生成与版本流转；尚未连接远程模型服务。
        </p>
      </header>

      <fieldset className="platform-filter-group">
        <legend>按能力类型筛选</legend>
        {filters.map((candidate) => (
          <label key={candidate.id}>
            <input
              checked={filter === candidate.id}
              name="model-capability-kind"
              type="radio"
              value={candidate.id}
              onChange={() => setFilter(candidate.id)}
            />
            {candidate.label}
          </label>
        ))}
      </fieldset>

      <section className="platform-card-grid" aria-label="当前能力目录">
        {visibleCapabilities.map((capability) => (
          <article className="platform-card" key={capability.id}>
            <p>{capability.kind === 'image' ? '图片流程' : '视频流程'}</p>
            <h2>{capability.label}</h2>
            <p>{capability.description}</p>
            <span className="platform-card__status">{capability.status}</span>
          </article>
        ))}
      </section>
    </main>
  )
}
