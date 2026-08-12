import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import { createFreeSubscription, subscribe } from '../membership/membership-model'
import { serializeProjectPackage, type LocalProjectPackage } from '../collaboration/project-package'
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
