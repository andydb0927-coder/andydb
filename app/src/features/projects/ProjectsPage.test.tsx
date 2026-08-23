import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

import { makeProjectFixture } from '../../test/fixtures'
import type { Project } from '../project/model'
import type {
  ProjectFolder,
  ProjectLocation,
} from './project-space-model'
import { ProjectsPage } from './ProjectsPage'

function projectFixture(
  id: string,
  title: string,
  intent: string,
  updatedAt: string,
): Project {
  return {
    ...makeProjectFixture(),
    id,
    title,
    intent,
    updatedAt,
  }
}

function createRepositories() {
  const projects = [
    projectFixture('project-new', '月下茶席', '东方茶饮广告', '2026-08-13T09:00:00.000Z'),
    projectFixture('project-old', '海边来信', '夏日叙事短片', '2026-08-12T09:00:00.000Z'),
  ]
  const folders: ProjectFolder[] = []
  const locations: ProjectLocation[] = []
  let sequence = 0

  return {
    projectRepository: {
      listAll: vi.fn(async () => projects),
    },
    projectSpaceRepository: {
      listFolders: vi.fn(async () => [...folders]),
      listLocations: vi.fn(async () => [...locations]),
      createFolder: vi.fn(async (name: string) => {
        const folder: ProjectFolder = {
          id: `folder-${++sequence}`,
          name: name.trim(),
          normalizedName: name.trim().toLocaleLowerCase(),
          createdAt: '2026-08-13T10:00:00.000Z',
          updatedAt: '2026-08-13T10:00:00.000Z',
        }
        folders.push(folder)
        return folder
      }),
      moveProject: vi.fn(async (projectId: string, folderId?: string) => {
        const existing = locations.findIndex((item) => item.projectId === projectId)
        if (existing >= 0) locations.splice(existing, 1)
        if (folderId) {
          locations.push({
            projectId,
            folderId,
            updatedAt: '2026-08-13T10:00:00.000Z',
          })
        }
      }),
    },
  }
}

function renderPage(repositories = createRepositories()) {
  return {
    ...repositories,
    ...render(
      <MemoryRouter>
        <ProjectsPage {...repositories} />
      </MemoryRouter>,
    ),
  }
}

describe('projects page', () => {
  test('shows every local project with a real canvas link and local-only boundary', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: '全部项目' })).toBeVisible()
    expect(screen.getByText('当前设备上的 2 个项目')).toBeVisible()
    expect(screen.getByText('数据保存在当前浏览器，不会自动同步到云端。')).toBeVisible()
    expect(screen.getByRole('link', { name: '开始创作' })).toHaveAttribute(
      'href',
      '/projects/new',
    )
    expect(screen.getByRole('link', { name: '新建项目' })).toHaveAttribute(
      'href',
      '/projects/new',
    )
    expect(screen.getByRole('img', { name: '月下茶席 缩略图' })).toHaveAttribute(
      'src',
      '/demo/shot-river.png',
    )
    expect(screen.getByRole('link', { name: '打开 月下茶席' })).toHaveAttribute(
      'href',
      '/project/project-new',
    )
  })

  test('gives each project card an accessible name and keeps its information hierarchy in DOM order', async () => {
    renderPage()

    const card = await screen.findByRole('article', { name: '月下茶席' })
    const thumbnail = within(card).getByRole('img', { name: '月下茶席 缩略图' })
    const title = within(card).getByRole('heading', { name: '月下茶席' })
    const updatedAt = within(card).getByText('2026/08/13')
    const assetSummary = within(card).getByText('2 节点 · 2 素材')
    const intent = within(card).getByText('东方茶饮广告')
    const category = within(card).getByRole('combobox', { name: '分类 月下茶席' })
    const open = within(card).getByRole('link', { name: '打开 月下茶席' })

    for (const [before, after] of [
      [thumbnail, title],
      [title, updatedAt],
      [updatedAt, assetSummary],
      [assetSummary, intent],
      [intent, category],
      [category, open],
    ]) {
      expect(before.compareDocumentPosition(after)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      )
    }
  })

  test('searches title and intent and sorts results by project name', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('月下茶席')

    await user.type(screen.getByRole('searchbox', { name: '搜索项目' }), '夏日')
    expect(screen.getByText('海边来信')).toBeVisible()
    expect(screen.queryByText('月下茶席')).not.toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: '搜索项目' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '项目排序' }), 'name')

    expect(screen.getAllByRole('article').map((card) => within(card).getByRole('heading').textContent)).toEqual([
      '海边来信',
      '月下茶席',
    ])
  })

  test('creates a folder, classifies a project and moves it back to unclassified', async () => {
    const user = userEvent.setup()
    const repositories = createRepositories()
    renderPage(repositories)
    await screen.findByText('月下茶席')

    await user.type(screen.getByRole('textbox', { name: '文件夹名称' }), '商业广告')
    await user.click(screen.getByRole('button', { name: '新建文件夹' }))

    expect(await screen.findByRole('button', { name: /商业广告/ })).toBeVisible()
    const selector = screen.getByRole('combobox', { name: '分类 月下茶席' })
    await user.selectOptions(selector, 'folder-1')
    await waitFor(() => {
      expect(repositories.projectSpaceRepository.moveProject).toHaveBeenCalledWith(
        'project-new',
        'folder-1',
      )
    })

    await user.click(screen.getByRole('button', { name: /商业广告/ }))
    expect(screen.getByText('月下茶席')).toBeVisible()
    expect(screen.queryByText('海边来信')).not.toBeInTheDocument()

    await user.selectOptions(selector, '')
    await waitFor(() => {
      expect(repositories.projectSpaceRepository.moveProject).toHaveBeenLastCalledWith(
        'project-new',
        undefined,
      )
    })
  })

  test('keeps loaded projects visible and reports a folder write failure', async () => {
    const repositories = createRepositories()
    repositories.projectSpaceRepository.createFolder.mockRejectedValueOnce(
      new Error('文件夹名称已存在'),
    )
    const user = userEvent.setup()
    renderPage(repositories)
    await screen.findByText('月下茶席')

    await user.type(screen.getByRole('textbox', { name: '文件夹名称' }), '重复')
    await user.click(screen.getByRole('button', { name: '新建文件夹' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('文件夹名称已存在')
    expect(screen.getByText('月下茶席')).toBeVisible()
  })
})
