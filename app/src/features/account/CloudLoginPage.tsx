import { Cloud, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '../../ui/Button'
import { useCloudAccount } from './CloudAccountProvider'

export function CloudLoginPage() {
  const { configured, status, account, error, register } = useCloudAccount()
  const [inviteCode, setInviteCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!inviteCode.trim() || submitting) return
    setSubmitting(true)
    try {
      await register(inviteCode.trim().toUpperCase())
    } catch {
      // CloudAccountProvider exposes a safe Chinese message in the page.
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="platform-page cloud-login-page">
      <header className="platform-page__header">
        <div>
          <p className="platform-page__eyebrow">云端账号</p>
          <h1>{account ? '账号与用量' : '输入邀请码登录'}</h1>
          <p>设备凭证只保存在当前浏览器，供应商密钥始终由 Worker 保管。</p>
        </div>
      </header>

      {!configured ? (
        <section className="platform-section cloud-login-card" role="status">
          <Cloud aria-hidden="true" />
          <h2>云端服务未配置</h2>
          <p>当前继续使用本地 IndexedDB，不影响项目创建、编辑和导出。</p>
        </section>
      ) : account ? (
        <section className="platform-section cloud-account-details">
          <div className="cloud-account-details__identity">
            <ShieldCheck aria-hidden="true" />
            <div><span>user_id</span><strong>{account.userId}</strong></div>
          </div>
          <div className="cloud-account-details__quota" aria-label="云端账号配额">
            <article><strong>图片 {account.usage.imageCount} / {account.quota.imageCount.limit} 张</strong><progress value={account.usage.imageCount} max={account.quota.imageCount.limit || 1} /><span>剩余 {account.quota.imageCount.remaining} 张</span></article>
            <article><strong>视频 {account.usage.videoSeconds} / {account.quota.videoSeconds.limit} 秒</strong><progress value={account.usage.videoSeconds} max={account.quota.videoSeconds.limit || 1} /><span>剩余 {account.quota.videoSeconds.remaining} 秒</span></article>
            <article><strong>文本 {account.usage.textTokens} / {account.quota.textTokens.limit} tokens</strong><progress value={account.usage.textTokens} max={account.quota.textTokens.limit || 1} /><span>剩余 {account.quota.textTokens.remaining} tokens</span></article>
            <article><strong>音频 {account.usage.audioCharacters} / {account.quota.audioCharacters.limit} 字符</strong><progress value={account.usage.audioCharacters} max={account.quota.audioCharacters.limit || 1} /><span>剩余 {account.quota.audioCharacters.remaining} 字符</span></article>
          </div>
          <Link className="cloud-login-page__continue focus-visible" to="/projects">返回项目</Link>
        </section>
      ) : (
        <form className="platform-section cloud-login-card" onSubmit={(event) => void submit(event)}>
          <label htmlFor="cloud-invite-code">邀请码</label>
          <input
            id="cloud-invite-code"
            aria-label="邀请码"
            autoComplete="one-time-code"
            maxLength={64}
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
          />
          {error ? <p role="alert">{error}</p> : <p>同一邀请码可把你的其他设备绑定到同一 user_id。</p>}
          <Button type="submit" disabled={!inviteCode.trim() || submitting || status === 'loading'}>
            {submitting ? '正在登录' : '登录云端账号'}
          </Button>
        </form>
      )}
    </main>
  )
}
