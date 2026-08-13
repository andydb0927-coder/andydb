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
])('renders %s', async (path, heading) => {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />)
  expect(await screen.findByRole('heading', { name: heading })).toBeVisible()
  expect(
    screen.getByRole('navigation', {
      name: path === '/' ? '首页导航' : '平台导航',
    }),
  ).toBeVisible()
})

it('removes the redundant full-page feature domains from the route table', () => {
  const paths = routes.flatMap((route) => route.children?.map((child) => child.path).filter(Boolean) ?? [])
  expect(paths).not.toEqual(expect.arrayContaining([
    '/models',
    '/discover',
    '/assets',
    '/story',
    '/editor',
    '/delivery',
    '/workflows',
    '/account',
  ]))
})
