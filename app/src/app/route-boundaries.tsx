import { Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router-dom'
import { RouteErrorPage } from './RouteErrorPage'

export function RouteLoading() {
  return (
    <div className="route-loading" role="status">
      <p>正在加载页面…</p>
    </div>
  )
}

export function withSuspense(node: ReactNode) {
  return <Suspense fallback={<RouteLoading />}>{node}</Suspense>
}

/** Keep the existing shell/immersive boundaries, including their child route identity. */
export function withRouteRecovery(definitions: RouteObject[]): RouteObject[] {
  const errorElement = <RouteErrorPage />
  return definitions.map(route => route.path === '*'
    ? route
    : { ...route, errorElement: route.errorElement ?? errorElement })
}
