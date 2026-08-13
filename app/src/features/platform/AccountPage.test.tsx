import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { createFreeSubscription, subscribe } from '../membership/membership-model'
import { serializeProjectPackage, type LocalProjectPackage } from '../collaboration/project-package'
import type { LocalAccountPreferenceStore } from '../account/local-account-preferences'
import { AccountPage } from './AccountPage'

function setup() {
  const project = makeProjectFixture()
  const subscription = createFreeSubscription(() => '2026-08-13T08:00:00.000Z')
  const packageValue: LocalProjectPackage = {
    kind: 'wireless-canvas-project',
    schemaVersion: 1,
    exportedAt: '2026-08-13T08:00:00.000Z',
    project,
    libraryAssets: [],
    collaboration: { collaborators: [], comments: [] },
  }
  const repository = { listRecent: vi.fn().mockResolvedValue([project]) }
  const membershipStore = {
    get: vi.fn().mockResolvedValue(subscription),
    subscribe: vi.fn().mockResolvedValue(subscribe(subscription, 'creator')),
    cancel: vi.fn(),
    renew: vi.fn(),
  }
  const collaborationStore = {
    listCollaborators: vi.fn().mockResolvedValue([
      { id: `${project.id}:local-owner`, projectId: project.id, name: '本机所有者', role: 'owner', createdAt: '', updatedAt: '' },
    ]),
    addCollaborator: vi.fn().mockResolvedValue({ id: 'editor-1', projectId: project.id, name: '小林', role: 'editor', createdAt: '', updatedAt: '' }),
    updateRole: vi.fn(),
    removeCollaborator: vi.fn(),
    listComments: vi.fn().mockResolvedValue([]),
  }
  const packageStore = {
    exportProject: vi.fn().mockResolvedValue(packageValue),
    importProject: vi.fn().mockResolvedValue(undefined),
    exportWorkspace: vi.fn().mockResolvedValue({ kind: 'wireless-canvas-workspace', schemaVersion: 1, exportedAt: '', projects: [packageValue] }),
  }
  return { project, packageValue, repository, membershipStore, collaborationStore, packageStore }
}

test('shows local membership matrix and persists a simulated upgrade', async () => {
  const user = userEvent.setup()
  const dependencies = setup()
  render(<MemoryRouter><AccountPage {...dependencies} /></MemoryRouter>)

  expect(await screen.findByText('1 个本地项目')).toBeVisible()
  expect(screen.getByText('2 个画布节点')).toBeVisible()
  expect(screen.getByText('当前：免费版')).toBeVisible()
  expect(screen.getByRole('columnheader', { name: '创作者版' })).toBeVisible()

  await user.click(screen.getByRole('button', { name: '本地开通创作者版' }))
  expect(dependencies.membershipStore.subscribe).toHaveBeenCalledWith('creator')
  expect(await screen.findByText('当前：创作者版')).toBeVisible()
})

test('manages collaborators and project package backup without network calls', async () => {
  const user = userEvent.setup()
  const dependencies = setup()
  const onCopy = vi.fn().mockResolvedValue(undefined)
  const onDownload = vi.fn()
  render(
    <MemoryRouter>
      <AccountPage {...dependencies} onCopy={onCopy} onDownload={onDownload} />
    </MemoryRouter>,
  )

  expect(await screen.findByText('本机所有者')).toBeVisible()
  await user.type(screen.getByLabelText('协作者名称'), '小林')
  await user.click(screen.getByRole('button', { name: '添加协作者' }))
  expect(dependencies.collaborationStore.addCollaborator).toHaveBeenCalledWith(
    dependencies.project.id,
    '小林',
    'editor',
  )
  expect(await screen.findByText('小林')).toBeVisible()

  await user.click(screen.getByRole('button', { name: '复制本地共享链接' }))
  expect(onCopy).toHaveBeenCalledWith(expect.stringContaining('#local-share='))
  await user.click(screen.getByRole('button', { name: '导出工作区备份' }))
  expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ kind: 'wireless-canvas-workspace' }), '无线画布-本地工作区备份.json')

  await user.upload(
    screen.getByLabelText('导入项目包'),
    new File([serializeProjectPackage(dependencies.packageValue)], 'project.json', { type: 'application/json' }),
  )
  expect(dependencies.packageStore.importProject).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'wireless-canvas-project' }),
  )
})

test('presents an honest local identity, personal space, and persisted device preferences', async () => {
  const user = userEvent.setup()
  const dependencies = setup()
  const preferenceStore: LocalAccountPreferenceStore = {
    read: vi.fn().mockReturnValue({
      version: 1,
      displayName: '本机创作者',
      aiWatermark: true,
      inAppNotifications: true,
    }),
    write: vi.fn().mockImplementation((value) => ({
      version: 1,
      ...value,
      displayName: value.displayName.trim() || '本机创作者',
      updatedAt: '2026-08-13T09:00:00.000Z',
    })),
  }

  render(
    <MemoryRouter>
      <AccountPage {...dependencies} preferenceStore={preferenceStore} />
    </MemoryRouter>,
  )

  expect(await screen.findByRole('heading', { name: '本地身份' })).toBeVisible()
  expect(screen.getByText('本地模式')).toBeVisible()
  expect(screen.getByRole('heading', { name: '个人本地空间' })).toBeVisible()
  expect(screen.getByText('云账户：未连接')).toBeVisible()
  expect(screen.getByText('团队空间：未接入')).toBeVisible()
  expect(screen.getByText(/本地数据约/)).toBeVisible()
  expect(screen.getByRole('link', { name: '打开项目空间' })).toHaveAttribute('href', '/projects')
  expect(screen.getByRole('link', { name: '打开素材库' })).toHaveAttribute('href', '/assets')
  expect(screen.getByRole('link', { name: '查看 Agent 与 CLI' })).toHaveAttribute('href', '/agents')

  await user.clear(screen.getByRole('textbox', { name: '本地创作者名称' }))
  await user.type(screen.getByRole('textbox', { name: '本地创作者名称' }), ' 安迪导演 ')
  await user.click(screen.getByRole('button', { name: '保存本地身份' }))

  expect(preferenceStore.write).toHaveBeenCalledWith(expect.objectContaining({
    displayName: ' 安迪导演 ',
  }))
  expect(await screen.findByText('本地身份已保存')).toBeVisible()

  await user.click(screen.getByRole('checkbox', { name: '生成内容默认添加 AI 标识' }))
  expect(preferenceStore.write).toHaveBeenLastCalledWith(expect.objectContaining({
    aiWatermark: false,
  }))
})
