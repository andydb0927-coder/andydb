import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  CloudAccountClient,
  CLOUD_ACCOUNT_USAGE_EVENT,
  type CloudAccount,
} from './cloud-account'

export interface CloudAccountClientContract {
  configured: boolean
  cached(): CloudAccount | undefined
  me(): Promise<CloudAccount | undefined>
  register(inviteCode: string): Promise<CloudAccount>
}

export type CloudAccountStatus = 'disabled' | 'loading' | 'guest' | 'authenticated' | 'error'

interface CloudAccountContextValue {
  configured: boolean
  status: CloudAccountStatus
  account?: CloudAccount
  error?: string
  register(inviteCode: string): Promise<void>
  refresh(): Promise<void>
}

const CloudAccountContext = createContext<CloudAccountContextValue | undefined>(undefined)

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function CloudAccountProvider({
  children,
  client,
}: {
  children: ReactNode
  client?: CloudAccountClientContract
}) {
  const resolvedClient = useMemo<CloudAccountClientContract>(
    () => client ?? new CloudAccountClient(),
    [client],
  )
  const cached = useMemo(() => resolvedClient.cached(), [resolvedClient])
  const [account, setAccount] = useState<CloudAccount | undefined>(cached)
  const [status, setStatus] = useState<CloudAccountStatus>(() =>
    !resolvedClient.configured ? 'disabled' : cached ? 'authenticated' : 'loading',
  )
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    if (!resolvedClient.configured) {
      setStatus('disabled')
      return
    }
    try {
      const next = await resolvedClient.me()
      setAccount(next)
      setError(undefined)
      setStatus(next ? 'authenticated' : 'guest')
    } catch (cause) {
      setError(errorMessage(cause, '无法读取云端账号'))
      setStatus((current) => current === 'authenticated' ? 'authenticated' : 'error')
    }
  }, [resolvedClient])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const handleUsage = () => void refresh()
    window.addEventListener(CLOUD_ACCOUNT_USAGE_EVENT, handleUsage)
    return () => window.removeEventListener(CLOUD_ACCOUNT_USAGE_EVENT, handleUsage)
  }, [refresh])

  const register = useCallback(async (inviteCode: string) => {
    setStatus('loading')
    setError(undefined)
    try {
      const next = await resolvedClient.register(inviteCode)
      setAccount(next)
      setStatus('authenticated')
    } catch (cause) {
      setAccount(undefined)
      setError(errorMessage(cause, '云端账号登录失败'))
      setStatus('guest')
      throw cause
    }
  }, [resolvedClient])

  const value = useMemo<CloudAccountContextValue>(() => ({
    configured: resolvedClient.configured,
    status,
    ...(account ? { account } : {}),
    ...(error ? { error } : {}),
    register,
    refresh,
  }), [account, error, refresh, register, resolvedClient.configured, status])

  return <CloudAccountContext.Provider value={value}>{children}</CloudAccountContext.Provider>
}

export function useCloudAccount() {
  const value = useOptionalCloudAccount()
  if (!value) throw new Error('useCloudAccount 必须在 CloudAccountProvider 内使用')
  return value
}

export function useOptionalCloudAccount() {
  return useContext(CloudAccountContext)
}
