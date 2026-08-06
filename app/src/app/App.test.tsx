import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { routes } from './router'

it.each([
  ['/', '创建你的第一部短片'],
  ['/project/demo-project', '项目画布'],
  ['/project/demo-project/preview', '成片预览'],
])('renders %s', async (path, heading) => {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />)
  expect(await screen.findByRole('heading', { name: heading })).toBeVisible()
})
