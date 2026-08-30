import { DeviceTokenManager } from '../project/cloud-storage'

export type CloudProxyKind = 'image' | 'video' | 'text' | 'tts'

export interface CloudProxyRuntimeOptions {
  mode: string
  backendUrl?: string
  inviteCode?: string
  fetchFn: typeof fetch
  storage?: Storage
}

function envValue(name: string) {
  const env = import.meta.env as Record<string, string | undefined>
  return env[name]?.trim() ?? ''
}

export function cloudProxyModeEnabled(mode: string) {
  return mode.split(',').some((value) => value.trim() === 'cloud-proxy')
}

export function cloudProxyBackendUrl(override?: string) {
  return (override?.trim() || envValue('VITE_BACKEND_URL')).replace(/\/+$/u, '')
}

export function cloudProxyInviteCode(override?: string) {
  return override?.trim() || envValue('VITE_BACKEND_INVITE_CODE')
}

export function cloudProxyConfigurationError(kind: CloudProxyKind) {
  const label = kind === 'image'
    ? '图片'
    : kind === 'video'
      ? '视频'
      : kind === 'text'
        ? '文本'
        : '语音'
  return `${label}云代理配置未完成`
}

export function cloudProxyConfigured(options: Pick<CloudProxyRuntimeOptions, 'mode' | 'backendUrl'>) {
  return cloudProxyModeEnabled(options.mode) && Boolean(cloudProxyBackendUrl(options.backendUrl))
}

export async function cloudProxyRequest(
  kind: CloudProxyKind,
  path: string,
  init: RequestInit,
  options: CloudProxyRuntimeOptions,
  retryAuth = true,
) {
  const backendUrl = cloudProxyBackendUrl(options.backendUrl)
  if (!backendUrl) throw new Error(cloudProxyConfigurationError(kind))
  const tokenManager = new DeviceTokenManager({
    backendUrl,
    inviteCode: cloudProxyInviteCode(options.inviteCode),
    fetchFn: options.fetchFn,
    ...(options.storage ? { storage: options.storage } : {}),
  })
  const response = await options.fetchFn(`${backendUrl}${path}`, {
    ...init,
    headers: {
      ...Object.fromEntries(new Headers(init.headers).entries()),
      Authorization: await tokenManager.authorizationHeader(),
    },
  })
  if (response.status === 401 && retryAuth) {
    await tokenManager.token(true)
    return cloudProxyRequest(kind, path, init, options, false)
  }
  return response
}
