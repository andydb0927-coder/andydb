import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { expect, test } from 'vitest'
import { RouteErrorPage, RouteNotFoundPage } from './RouteErrorPage'

test('unknown routes provide a Chinese return path without touching stored data', async () => {
  const router = createMemoryRouter([
    { path: '/', element: <h1>首页</h1> },
    { path: '*', element: <RouteNotFoundPage /> },
  ], { initialEntries: ['/missing'] })
  render(<RouterProvider router={router} />)
  expect(screen.getByRole('heading', { name: '页面不存在' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: '返回首页' }))
  expect(screen.getByRole('heading', { name: '首页' })).toBeInTheDocument()
})

test('loader failures keep a safe retry screen and do not expose underlying diagnostics', async () => {
  const router = createMemoryRouter([{
    path: '/', element: <h1>就绪</h1>, errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <p>正在加载页面…</p>,
    loader: () => { throw new Error('sensitive-local-diagnostic') },
  }])
  render(<RouterProvider router={router} />)
  expect(await screen.findByRole('heading', { name: '页面暂时无法打开' })).toBeInTheDocument()
  expect(screen.getByText(/不会清除/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '重新加载' })).toBeEnabled()
  expect(screen.queryByText(/sensitive-local-diagnostic/)).not.toBeInTheDocument()
})
