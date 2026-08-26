import { Coins, Crown, LockKeyhole, ReceiptText, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { Project } from '../project/model'
import { ProjectRepository, WirelessCanvasDatabase } from '../project/project-repository'
import {
  membershipPlans,
  type MembershipSubscription,
} from './membership-model'
import { MembershipRepository, type MembershipStore } from './membership-repository'
import { summarizeCreditLedger } from './credit-ledger'

type ProjectLedgerRepository = Pick<ProjectRepository, 'listAll'>
type MembershipReader = Pick<MembershipStore, 'get'>

type MembershipPageState =
  | { status: 'loading' }
  | { status: 'ready'; projects: Project[]; membership: MembershipSubscription }
  | { status: 'error'; message: string }

const defaultDatabase = new WirelessCanvasDatabase()
const defaultProjectRepository = new ProjectRepository(defaultDatabase)
const defaultMembershipStore = new MembershipRepository(defaultDatabase)

const featureLabels = {
  'local-projects': '本地项目与画布持久化',
  collaboration: '评论与本地协作标记',
  'advanced-export': '高级导出与发布快照',
  'batch-workflow': '工作流整组执行',
} as const

function formatLedgerTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export interface MembershipPageProps {
  projectRepository?: ProjectLedgerRepository
  membershipStore?: MembershipReader
}

export function MembershipPage({
  projectRepository = defaultProjectRepository,
  membershipStore = defaultMembershipStore,
}: MembershipPageProps) {
  const [state, setState] = useState<MembershipPageState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    Promise.all([projectRepository.listAll(), membershipStore.get()])
      .then(([projects, membership]) => {
        if (active) setState({ status: 'ready', projects, membership })
      })
      .catch((error: unknown) => {
        if (!active) return
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : '无法读取本地积分数据',
        })
      })
    return () => { active = false }
  }, [membershipStore, projectRepository])

  const ledger = summarizeCreditLedger(state.status === 'ready' ? state.projects : [])

  return (
    <main className="platform-page membership-page">
      <header className="membership-page__hero">
        <div>
          <p className="platform-page__eyebrow">LOCAL CREDITS & MEMBERSHIP</p>
          <h1>积分与会员</h1>
          <p>余额与流水来自当前浏览器保存的真实生成任务；套餐购买尚未连接支付服务。</p>
        </div>
        <div className="membership-balance" aria-label="本地积分余额">
          <Coins aria-hidden="true" />
          <span>可用积分</span>
          <strong>{ledger.balance}</strong>
          <small>累计消耗 {ledger.spent} 积分</small>
        </div>
      </header>

      {state.status === 'loading' ? <p role="status">正在汇总本地积分…</p> : null}
      {state.status === 'error' ? <p role="alert">{state.message}</p> : null}

      <section className="membership-page__plans" aria-labelledby="membership-plan-title">
        <div className="membership-section-heading">
          <div><Crown aria-hidden="true" /><h2 id="membership-plan-title">套餐</h2></div>
          <span><LockKeyhole aria-hidden="true" />支付待接入</span>
        </div>
        <div className="membership-plan-grid">
          {membershipPlans.map((plan) => {
            const current = state.status === 'ready' && state.membership.plan === plan.id
            return (
              <article key={plan.id} className="membership-plan-card" data-current={current || undefined}>
                <header>
                  <Sparkles aria-hidden="true" />
                  <div><h3>{plan.name}</h3><strong>{plan.priceLabel}</strong></div>
                </header>
                <p>{plan.description}</p>
                <ul>
                  {Object.entries(plan.features).map(([feature, enabled]) => (
                    <li key={feature} data-enabled={enabled}>{enabled ? '✓' : '—'} {featureLabels[feature as keyof typeof featureLabels]}</li>
                  ))}
                </ul>
                <button type="button" disabled title={current ? '当前本地套餐' : '支付服务尚未接入'}>
                  {current ? '当前套餐' : '支付待接入'}
                </button>
              </article>
            )
          })}
        </div>
      </section>

      <section className="membership-page__ledger" aria-labelledby="credit-ledger-title">
        <div className="membership-section-heading">
          <div><ReceiptText aria-hidden="true" /><h2 id="credit-ledger-title">积分消耗流水</h2></div>
          <span>{ledger.entries.length} 条真实记录</span>
        </div>
        {ledger.entries.length ? (
          <div className="membership-ledger-scroll">
            <table aria-label="积分消耗流水">
              <thead><tr><th>时间</th><th>项目</th><th>模型</th><th>提示词</th><th>积分</th></tr></thead>
              <tbody>
                {ledger.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatLedgerTime(entry.occurredAt)}</td>
                    <td>{entry.projectTitle}</td>
                    <td>{entry.providerLabel}</td>
                    <td title={entry.prompt}>{entry.prompt || '未填写提示词'}</td>
                    <td className="membership-ledger__amount">-{entry.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="membership-ledger-empty"><ReceiptText aria-hidden="true" /><p>暂无积分消耗记录</p><span>完成本地或真实模型生成后，流水会从项目 jobs 自动汇总。</span></div>}
      </section>
    </main>
  )
}
