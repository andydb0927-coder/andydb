import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { routes } from './router'

function allRoutePaths() {
  return routes.flatMap((route) => [
    route.path,
    ...(route.children?.map((child) => child.path) ?? []),
  ]).filter(Boolean)
}

it.each([
  ['/', '只需一张画布 连接你的多种创意想法'],
  ['/projects', '全部项目'],
  ['/agents', 'Skill 全开，故事走起'],
  ['/challenges', '创作者挑战赛'],
  ['/activity/director-master', 'LibTV Skill 导演大师赛'],
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
  const paths = allRoutePaths()
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

it('registers the activity, immersive detail and read-only process routes', () => {
  const paths = allRoutePaths()
  expect(paths).toEqual(expect.arrayContaining([
    '/activity/:challengeId',
    '/detail/:workId',
    '/detail/:workId/process',
  ]))
  expect(paths).not.toContain('/challenges/:challengeId')
})
