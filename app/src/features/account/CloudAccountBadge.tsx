import { Cloud, LogIn } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useOptionalCloudAccount } from './CloudAccountProvider'

function shortUserId(userId: string) {
  return userId.length > 18 ? `${userId.slice(0, 12)}…${userId.slice(-4)}` : userId
}

export function CloudAccountBadge({ compact = false }: { compact?: boolean }) {
  const cloudAccount = useOptionalCloudAccount()
  if (!cloudAccount) return null
  const { configured, status, account } = cloudAccount
  if (!configured) return null
  if (!account) {
    return (
      <Link className="cloud-account-badge cloud-account-badge--guest focus-visible" to="/login">
        <LogIn aria-hidden="true" />
        {status === 'loading' ? '读取账号' : '邀请码登录'}
      </Link>
    )
  }
  return (
    <Link
      className="cloud-account-badge focus-visible"
      to="/login"
      aria-label={`云端用户 ${account.userId}，查看配额`}
    >
      <Cloud aria-hidden="true" />
      <span>
        <strong>{shortUserId(account.userId)}</strong>
        <small>
          图片 {account.quota.imageCount.remaining} 张
          {compact ? '' : ` · 视频 ${account.quota.videoSeconds.remaining} 秒`}
        </small>
      </span>
    </Link>
  )
}
