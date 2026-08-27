import { lazy } from 'react'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom'
import { expect, test } from 'vitest'
import { RouteLoading, withSuspense, withRouteRecovery } from './route-boundaries'
import { RouteErrorPage } from './RouteErrorPage'

test('central loading keeps its accessible status while a lazy page is pending', () => {
  const Pending = lazy(() => new Promise<{ default: () => null }>(() => {}))
  render(withSuspense(<Pending />))
  expect(screen.getByRole('status')).toHaveClass('route-loading')
  expect(screen.getByRole('status')).toHaveTextContent('正在加载页面…')
})

test('recovery policy preserves tree shape, loaders, children and explicit boundaries', () => {
  const children: RouteObject[] = [{ path: '/project/:projectId', element: <p>画布</p> }]
  const original: RouteObject[] = [{ children }, { path: '/view/:id', element: <p>分享</p> }, { path: '*', element: <p>不存在</p> }]
  const output = withRouteRecovery(original)
  expect(output[0].children).toBe(children)
  expect(output[0].errorElement).toEqual(<RouteErrorPage />)
  expect(output[1].errorElement).toBe(output[0].errorElement)
  expect(output[2]).toBe(original[2])
  expect(original[0].errorElement).toBeUndefined()
  const custom = <p>专属恢复</p>
  expect(withRouteRecovery([{ path: '/', errorElement: custom }])[0].errorElement).toBe(custom)
})

test.each([404, 500])('deep route %s failure uses safe Chinese recovery without clearing data', async status => {
  localStorage.setItem('batch3-route-sentinel', '保留')
  const router = createMemoryRouter(withRouteRecovery([{
    hydrateFallbackElement: <RouteLoading />,
    children: [{ path: '/deep/:id/preview', element: <p>就绪</p>, loader: () => { throw new Response('private diagnostic', { status }) } }],
  }]), { initialEntries: ['/deep/project/preview'] })
  render(<RouterProvider router={router} />)
  expect(await screen.findByRole('heading', { name: status === 404 ? '页面不存在' : '页面暂时无法打开' })).toBeVisible()
  expect(screen.queryByText('private diagnostic')).not.toBeInTheDocument()
  expect(localStorage.getItem('batch3-route-sentinel')).toBe('保留')
  localStorage.removeItem('batch3-route-sentinel')
})
