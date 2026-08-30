import { expect, test, type Page } from '@playwright/test'

const baseAccount = {
  userId: 'user-e2e-account-0001',
  createdAt: '2026-08-30T09:00:00.000Z',
  usage: { imageCount: 1, videoSeconds: 5, textTokens: 120, audioCharacters: 30 },
  quota: {
    imageCount: { used: 1, limit: 10, remaining: 9 },
    videoSeconds: { used: 5, limit: 60, remaining: 55 },
    textTokens: { used: 120, limit: 10_000, remaining: 9_880 },
    audioCharacters: { used: 30, limit: 5_000, remaining: 4_970 },
  },
}

async function installAccountFixture(page: Page) {
  let account = structuredClone(baseAccount)
  await page.addInitScript(() => {
    localStorage.setItem('wireless-canvas.cloud.backend-url', '/fixture-account')
  })
  await page.route('**/fixture-account/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/fixture-account', '')
    if (path === '/api/auth/device') {
      expect(request.postDataJSON()).toMatchObject({ inviteCode: 'CREATOR-E2E' })
      await route.fulfill({ status: 200, json: { token: 'e2e-account-device-token' } })
      return
    }
    expect(request.headers().authorization).toBe('Bearer e2e-account-device-token')
    if (path === '/api/account/register') {
      await route.fulfill({ status: 201, json: account })
      return
    }
    if (path === '/api/account/me') {
      await route.fulfill({ status: 200, json: account })
      return
    }
    await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: '不存在' } } })
  })
  return {
    consumeImage() {
      account = {
        ...account,
        usage: { ...account.usage, imageCount: 2 },
        quota: {
          ...account.quota,
          imageCount: { used: 2, limit: 10, remaining: 8 },
        },
      }
    },
  }
}

test('邀请码登录后顶栏显示 user_id 和实时剩余配额', async ({ page }) => {
  const fixture = await installAccountFixture(page)
  await page.goto('/login')

  await page.getByRole('textbox', { name: '邀请码' }).fill('creator-e2e')
  await page.getByRole('button', { name: '登录云端账号' }).click()
  await expect(page.getByText(baseAccount.userId)).toBeVisible()
  await expect(page.getByText('图片 1 / 10 张')).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(`云端用户 ${baseAccount.userId}`, 'u') })).toBeVisible()

  fixture.consumeImage()
  await page.evaluate(() => window.dispatchEvent(new Event('wireless-canvas:account-usage-changed')))
  await expect(page.getByText('图片 2 / 10 张')).toBeVisible()
  await expect(page.getByText('剩余 8 张')).toBeVisible()
})
