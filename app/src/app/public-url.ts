const externalUrlPattern = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i

export function withAppBase(
  url: string,
  base = import.meta.env.BASE_URL,
): string {
  if (!url || externalUrlPattern.test(url)) return url

  const normalizedBase = `/${base.replace(/^\/+|\/+$/g, '')}/`.replace(
    /^\/\/$/,
    '/',
  )
  const normalizedPath = url.replace(/^\/+/, '')
  return `${normalizedBase}${normalizedPath}`
}
