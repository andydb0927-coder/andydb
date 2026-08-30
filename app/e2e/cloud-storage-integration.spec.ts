import { expect, test, type Page } from '@playwright/test'

interface CloudProjectRecord {
  id: string
  name: string
  version: number
  updatedAt: string
  data: Record<string, unknown>
}

async function configureCloud(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('wireless-canvas.cloud.backend-url', '/fixture-cloud')
    localStorage.setItem('wireless-canvas.cloud.invite-code', 'FIXTURE-INVITE')
  })
}

function installCloudFixture(page: Page) {
  const projects = new Map<string, CloudProjectRecord>()
  const writes: string[] = []
  void page.route('**/fixture-cloud/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/fixture-cloud', '')
    const method = request.method()
    if (path === '/api/auth/device' && method === 'POST') {
      await route.fulfill({ status: 200, json: { token: 'e2e-device-token' } })
      return
    }
    expect(request.headers().authorization).toBe('Bearer e2e-device-token')
    if (path === '/api/data/projects' && method === 'GET') {
      await route.fulfill({
        status: 200,
        json: {
          projects: [...projects.values()].map(({ id, name, version, updatedAt }) => ({ id, name, version, updatedAt })),
        },
      })
      return
    }
    if (path === '/api/data/projects' && method === 'POST') {
      const body = request.postDataJSON() as { id: string; name: string; data: Record<string, unknown> }
      const updatedAt = String(body.data.updatedAt)
      const record = { ...body, version: 1, updatedAt }
      projects.set(body.id, record)
      writes.push(`POST:${body.id}`)
      await route.fulfill({ status: 201, json: record })
      return
    }
    const match = /^\/api\/data\/projects\/([^/]+)$/u.exec(path)
    if (match?.[1]) {
      const id = decodeURIComponent(match[1])
      const existing = projects.get(id)
      if (method === 'GET') {
        await route.fulfill(existing
          ? { status: 200, json: existing }
          : { status: 404, json: { error: { code: 'PROJECT_NOT_FOUND', message: '不存在' } } })
        return
      }
      if (method === 'PUT' && existing) {
        const body = request.postDataJSON() as { name: string; data: Record<string, unknown> }
        const updated = {
          id,
          name: body.name,
          data: body.data,
          version: existing.version + 1,
          updatedAt: String(body.data.updatedAt),
        }
        projects.set(id, updated)
        writes.push(`PUT:${id}`)
        await route.fulfill({ status: 200, json: updated })
        return
      }
    }
    await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'fixture missing' } } })
  })
  return { projects, writes }
}

test('云端迁移逐项目执行并对未变化项目保持幂等', async ({ page }) => {
  await configureCloud(page)
  const fixture = installCloudFixture(page)
  await page.goto('/projects/new')
  await expect(page).toHaveURL(/\/project\//u)
  await page.goto('/projects')

  await expect(page.getByRole('button', { name: '迁移到云端' })).toBeVisible()
  await page.getByRole('button', { name: '迁移到云端' }).click()
  await expect(page.getByRole('status')).toContainText('迁移完成')
  await expect(page.getByText('已迁移')).toBeVisible()
  const writesAfterFirstMigration = fixture.writes.length

  await page.getByRole('button', { name: '迁移到云端' }).click()
  await expect(page.getByRole('status')).toContainText('已是最新')
  expect(fixture.writes).toHaveLength(writesAfterFirstMigration)
  expect(fixture.projects.size).toBe(1)
})

test('云端断网时新项目仍写入本地并可刷新恢复', async ({ page }) => {
  await configureCloud(page)
  await page.route('**/fixture-cloud/api/**', (route) => route.abort('internetdisconnected'))

  await page.goto('/projects/new')
  await expect(page).toHaveURL(/\/project\//u)
  await expect(page.getByText('未命名项目', { exact: false }).first()).toBeVisible()
  await page.reload()

  await expect(page.getByText('未命名项目', { exact: false }).first()).toBeVisible()
  await expect(page.locator('main')).toBeVisible()
})
