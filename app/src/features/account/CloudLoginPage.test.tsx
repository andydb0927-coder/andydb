import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

import {
  CloudAccountProvider,
  type CloudAccountClientContract,
} from './CloudAccountProvider'
import { CloudLoginPage } from './CloudLoginPage'

test('registers an invite and replaces the login form with user quota details', async () => {
  const user = userEvent.setup()
  const account = {
    userId: 'user-fixture-0001',
    createdAt: '2026-08-30T09:00:00.000Z',
    usage: { imageCount: 1, videoSeconds: 5, textTokens: 120, audioCharacters: 30 },
    quota: {
      imageCount: { used: 1, limit: 10, remaining: 9 },
      videoSeconds: { used: 5, limit: 60, remaining: 55 },
      textTokens: { used: 120, limit: 10_000, remaining: 9_880 },
      audioCharacters: { used: 30, limit: 5_000, remaining: 4_970 },
    },
  }
  const client: CloudAccountClientContract = {
    configured: true,
    cached: vi.fn().mockReturnValue(undefined),
    me: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(account),
  }
  render(
    <MemoryRouter>
      <CloudAccountProvider client={client}>
        <CloudLoginPage />
      </CloudAccountProvider>
    </MemoryRouter>,
  )

  await screen.findByText('输入邀请码登录')
  await user.type(screen.getByRole('textbox', { name: '邀请码' }), 'creator-001')
  await user.click(screen.getByRole('button', { name: '登录云端账号' }))

  expect(client.register).toHaveBeenCalledWith('CREATOR-001')
  expect(await screen.findByText('user-fixture-0001')).toBeVisible()
  expect(screen.getByText('图片 1 / 10 张')).toBeVisible()
  expect(screen.getByText('视频 5 / 60 秒')).toBeVisible()
})
