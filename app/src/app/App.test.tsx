import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { routes } from './router'

it.each([
  ['/', '只需一张画布 连接你的多种创意想法'],
  ['/projects', '全部项目'],
  ['/agents', 'Skill 全开，故事走起'],
  ['/challenges', '创作者挑战赛'],
  ['/challenges/director-master', 'LibTV Skill 导演大师赛'],
  ['/project/demo-project', '项目画布'],
  ['/project/demo-project/preview', '成片预览'],
  ['/discover', '发现与作品'],
  ['/discover/mine', '我的作品'],
  ['/discover/missing-work', '作品暂不可用'],
])('renders %s', async (path, heading) => {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />)
  expect(await screen.findByRole('heading', { name: heading })).toBeVisible()
  expect(
    screen.getByRole('navigation', {
      name: path === '/' ? '首页导航' : '平台导航',
    }),
  ).toBeVisible()
})

it('keeps discovery navigation active on community child routes', async () => {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/discover/missing-work'] })} />)

  await screen.findByRole('heading', { name: '作品暂不可用' })
  expect(screen.getByRole('link', { name: '发现与作品' })).toHaveAttribute(
    'aria-current',
    'page',
  )
})
