import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { AssetImportError } from '../assets/asset-import'
import type { AssetLibraryRepository } from '../assets/asset-library-repository'
import type { LibraryAssetRecord } from '../assets/library-model'
import type { Project } from '../project/model'
import type { ProjectRepository } from '../project/project-repository'
import { useProjectStore } from '../project/project-store'
import { makeProjectFixture } from '../../test/fixtures'
import { AssetsHistoryPage } from './AssetsHistoryPage'

const imageRecord: LibraryAssetRecord = {
  id: 'library-rain-image',
  name: '雨夜参考',
  kind: 'image',
  mimeType: 'image/png',
  url: 'data:image/png;base64,cmFpbg==',
  createdAt: '2026-08-10T08:00:00.000Z',
  source: 'upload',
  fingerprint: 'sha256:rain',
  byteSize: 4,
  width: 1920,
  height: 1080,
}

const audioRecord: LibraryAssetRecord = {
  id: 'library-ambience-audio',
  name: '环境声.wav',
  kind: 'audio',
  mimeType: 'audio/wav',
  url: 'data:audio/wav;base64,c291bmQ=',
  createdAt: '2026-08-10T07:00:00.000Z',
  source: 'upload',
  fingerprint: 'sha256:ambience',
  byteSize: 5,
}

type PageRepository = Pick<ProjectRepository, 'listRecent' | 'load' | 'save'>
type PageLibraryRepository = Pick<AssetLibraryRepository, 'list' | 'importFile'>

function createProjectRepository(...projects: Project[]) {
  const storedProjects = new Map(projects.map((project) => [project.id, project]))
  let savedProject: Project | undefined
  const repository: PageRepository = {
    listRecent: vi.fn().mockResolvedValue(projects),
    load: vi.fn(async (projectId: string) => storedProjects.get(projectId)),
    save: vi.fn(async (project: Project) => {
      savedProject = project
      storedProjects.set(project.id, project)
    }),
  }

  return { repository, getSavedProject: () => savedProject }
}

function libraryRepositoryWith(...records: LibraryAssetRecord[]) {
  return {
    list: vi.fn().mockResolvedValue(records),
    importFile: vi.fn(),
  } satisfies PageLibraryRepository
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

function renderAssetsPage({
  repository = createProjectRepository(makeProjectFixture()).repository,
  libraryRepository = libraryRepositoryWith(),
}: {
  repository?: PageRepository
  libraryRepository?: PageLibraryRepository
} = {}) {
  return render(
    <MemoryRouter initialEntries={['/assets']}>
      <Routes>
        <Route
          path="/assets"
          element={(
            <AssetsHistoryPage
              repository={repository}
              libraryRepository={libraryRepository}
            />
          )}
        />
        <Route path="/project/:projectId" element={<h1>项目画布</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  useProjectStore.setState({
    projectsById: {},
    activeProjectId: undefined,
    activeProject: undefined,
    saveStatus: 'saved',
    past: [],
    future: [],
  })
})

describe('assets and history page', () => {
  test('advertises the supported media families to the file chooser', async () => {
    renderAssetsPage()

    await screen.findByRole('heading', { name: '素材与历史' })

    expect(screen.getByLabelText('上传本地素材')).toHaveAttribute(
      'accept',
      'image/*,video/*,audio/*',
    )
  })

  test('shows source, creation time, file size, and dimensions on a rich asset card', async () => {
    renderAssetsPage({ libraryRepository: libraryRepositoryWith(imageRecord) })

    const card = await screen.findByRole('article', { name: '雨夜参考' })
    expect(within(card).getByText('来源：本地上传')).toBeVisible()
    expect(within(card).getByText('创建时间：2026-08-10 08:00 UTC')).toBeVisible()
    expect(within(card).getByText('文件大小：4 B')).toBeVisible()
    expect(within(card).getByText('尺寸：1920 × 1080')).toBeVisible()
  })

  test('uploads, searches, and filters real library records', async () => {
    const user = userEvent.setup()
    const uploadedRecord = { ...imageRecord, name: '雨夜.png' }
    const libraryRepository = libraryRepositoryWith(audioRecord)
    vi.mocked(libraryRepository.importFile).mockResolvedValue({
      status: 'created',
      record: uploadedRecord,
    })
    renderAssetsPage({ libraryRepository })

    await user.upload(
      screen.getByLabelText('上传本地素材'),
      new File(['rain'], '雨夜.png', { type: 'image/png' }),
    )

    expect(await screen.findByRole('status')).toHaveTextContent('已导入 雨夜.png')
    await user.type(screen.getByLabelText('搜索素材'), '雨夜')
    await user.click(screen.getByRole('radio', { name: '图片' }))
    expect(screen.getByRole('article', { name: '雨夜.png' })).toBeVisible()
    expect(screen.queryByRole('article', { name: '环境声.wav' })).not.toBeInTheDocument()
  })

  test('keeps an uploaded record when the initial library snapshot resolves later', async () => {
    const user = userEvent.setup()
    const initialList = createDeferred<LibraryAssetRecord[]>()
    const uploadedRecord = { ...imageRecord, name: '雨夜.png' }
    const libraryRepository = libraryRepositoryWith()
    vi.mocked(libraryRepository.list).mockReturnValue(initialList.promise)
    vi.mocked(libraryRepository.importFile).mockResolvedValue({
      status: 'created',
      record: uploadedRecord,
    })
    renderAssetsPage({ libraryRepository })

    await user.upload(
      screen.getByLabelText('上传本地素材'),
      new File(['rain'], '雨夜.png', { type: 'image/png' }),
    )
    expect(await screen.findByRole('article', { name: '雨夜.png' })).toBeVisible()

    await act(async () => initialList.resolve([audioRecord]))

    expect(await screen.findByRole('article', { name: '环境声.wav' })).toBeVisible()
    expect(screen.getByRole('article', { name: '雨夜.png' })).toBeVisible()
  })

  test('keeps an uploaded record when the initial library request rejects later', async () => {
    const user = userEvent.setup()
    const initialList = createDeferred<LibraryAssetRecord[]>()
    const uploadedRecord = { ...imageRecord, name: '雨夜.png' }
    const libraryRepository = libraryRepositoryWith()
    vi.mocked(libraryRepository.list).mockReturnValue(initialList.promise)
    vi.mocked(libraryRepository.importFile).mockResolvedValue({
      status: 'created',
      record: uploadedRecord,
    })
    renderAssetsPage({ libraryRepository })

    await user.upload(
      screen.getByLabelText('上传本地素材'),
      new File(['rain'], '雨夜.png', { type: 'image/png' }),
    )
    expect(await screen.findByRole('article', { name: '雨夜.png' })).toBeVisible()

    await act(async () => initialList.reject(new Error('offline')))

    expect(screen.getByRole('article', { name: '雨夜.png' })).toBeVisible()
    expect(screen.getByText('目录可能未完整加载，已导入的素材仍然可用。')).toBeVisible()
    expect(screen.getByText('已导入 雨夜.png').closest('[role="status"]')).not.toBeNull()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('saves a selected asset into the target project before navigating', async () => {
    const user = userEvent.setup()
    const project = makeProjectFixture()
    const projectRepository = createProjectRepository(project)
    renderAssetsPage({
      repository: projectRepository.repository,
      libraryRepository: libraryRepositoryWith(imageRecord),
    })

    await user.click(
      await screen.findByRole('button', {
        name: '添加 雨夜参考 到项目并打开画布',
      }),
    )

    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
    expect(projectRepository.getSavedProject()?.nodes.at(-1)?.title).toBe('雨夜参考')
  })

  test('reports a duplicate import without adding a second card', async () => {
    const user = userEvent.setup()
    const duplicateRecord = { ...imageRecord, name: '雨夜.png' }
    const libraryRepository = libraryRepositoryWith(duplicateRecord)
    vi.mocked(libraryRepository.importFile).mockResolvedValue({
      status: 'existing',
      record: duplicateRecord,
    })
    renderAssetsPage({ libraryRepository })

    await user.upload(
      screen.getByLabelText('上传本地素材'),
      new File(['rain'], '雨夜.png', { type: 'image/png' }),
    )

    expect(await screen.findByRole('status')).toHaveTextContent('素材已存在')
    expect(screen.getAllByRole('article', { name: '雨夜.png' })).toHaveLength(1)
  })

  test('shows unsupported upload errors while keeping history visible', async () => {
    const project = makeProjectFixture()
    const libraryRepository = libraryRepositoryWith()
    vi.mocked(libraryRepository.importFile).mockRejectedValue(
      new AssetImportError('type'),
    )
    renderAssetsPage({
      repository: createProjectRepository(project).repository,
      libraryRepository,
    })

    fireEvent.change(screen.getByLabelText('上传本地素材'), {
      target: {
        files: [new File(['notes'], 'notes.txt', { type: 'text/plain' })],
      },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('仅支持图片、视频或音频文件')
    expect(screen.getByRole('heading', { name: project.title })).toBeVisible()
  })

  test('keeps audio browseable without offering a canvas action', async () => {
    renderAssetsPage({ libraryRepository: libraryRepositoryWith(audioRecord) })

    expect(await screen.findByRole('article', { name: '环境声.wav' })).toBeVisible()
    expect(screen.getByText('将在专业剪辑阶段使用')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /添加 环境声\.wav/ }),
    ).not.toBeInTheDocument()
  })

  test('keeps loaded history visible when the library fails to load', async () => {
    const project = makeProjectFixture()
    const libraryRepository = libraryRepositoryWith()
    vi.mocked(libraryRepository.list).mockRejectedValue(new Error('offline'))
    renderAssetsPage({
      repository: createProjectRepository(project).repository,
      libraryRepository,
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('无法读取本地素材库')
    expect(await screen.findByRole('heading', { name: project.title })).toBeVisible()
  })

  test('stays on the assets page when saving the target project fails', async () => {
    const user = userEvent.setup()
    const project = makeProjectFixture()
    const { repository } = createProjectRepository(project)
    vi.mocked(repository.save).mockRejectedValue(new Error('disk full'))
    renderAssetsPage({
      repository,
      libraryRepository: libraryRepositoryWith(imageRecord),
    })

    await user.click(
      await screen.findByRole('button', {
        name: '添加 雨夜参考 到项目并打开画布',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('无法添加素材到项目')
    expect(screen.getByRole('heading', { name: '素材与历史' })).toBeVisible()
  })

  test('retries opening without saving a duplicate after hydration fails', async () => {
    const user = userEvent.setup()
    const project = makeProjectFixture()
    const projectRepository = createProjectRepository(project)
    let loadCount = 0
    vi.mocked(projectRepository.repository.load).mockImplementation(async () => {
      loadCount += 1
      if (loadCount === 2) return undefined
      return projectRepository.getSavedProject() ?? project
    })
    renderAssetsPage({
      repository: projectRepository.repository,
      libraryRepository: libraryRepositoryWith(imageRecord),
    })

    await user.click(
      await screen.findByRole('button', {
        name: '添加 雨夜参考 到项目并打开画布',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '素材已添加，但暂时无法打开画布',
    )
    expect(screen.queryByText('无法添加素材到项目')).not.toBeInTheDocument()
    expect(projectRepository.repository.save).toHaveBeenCalledTimes(1)
    expect(projectRepository.getSavedProject()?.nodes).toHaveLength(
      project.nodes.length + 1,
    )

    await user.click(
      screen.getByRole('button', { name: '重试打开 雨夜参考 的画布' }),
    )

    expect(await screen.findByRole('heading', { name: '项目画布' })).toBeVisible()
    expect(projectRepository.repository.save).toHaveBeenCalledTimes(1)
    expect(projectRepository.getSavedProject()?.nodes).toHaveLength(
      project.nodes.length + 1,
    )
  })

  test('shows persisted assets and links an active version back to its source node', async () => {
    renderAssetsPage({
      repository: createProjectRepository(makeProjectFixture()).repository,
    })

    expect(await screen.findByRole('heading', { name: '素材与历史' })).toBeVisible()
    expect(await screen.findByText('asset-shot-river-v1')).toBeVisible()
    expect(screen.getByText('河岸寻人')).toBeVisible()
    expect(
      screen.getByRole('link', { name: '在画布中查看 河岸寻人' }),
    ).toHaveAttribute('href', '/project/project-frost-river?focus=shot-1')
  })

  test('resolves project asset references to rich catalog metadata and falls back to snapshots', async () => {
    const project = makeProjectFixture()
    const richRecord: LibraryAssetRecord = {
      id: 'asset-shot-river-v1',
      name: '河岸原片',
      kind: 'image',
      mimeType: 'image/tiff',
      url: 'blob:wireless-canvas/catalog-river',
      createdAt: '2026-08-09T10:30:00.000Z',
      source: 'generated',
      byteSize: 2 * 1024,
      width: 4096,
      height: 2160,
    }
    renderAssetsPage({
      repository: createProjectRepository(project).repository,
      libraryRepository: libraryRepositoryWith(richRecord),
    })

    const projectHeading = await screen.findByRole('heading', { name: project.title })
    const projectAssets = projectHeading.closest('section')
    expect(projectAssets).not.toBeNull()
    const history = within(projectAssets!)

    const richItem = history.getByText('河岸原片').closest('li')
    expect(richItem).not.toBeNull()
    expect(within(richItem!).getByText('图片 · image/tiff')).toBeVisible()
    expect(within(richItem!).getByText('来源：生成结果')).toBeVisible()
    expect(within(richItem!).getByText('创建时间：2026-08-09 10:30 UTC')).toBeVisible()
    expect(within(richItem!).getByText('文件大小：2 KiB')).toBeVisible()
    expect(within(richItem!).getByText('尺寸：4096 × 2160')).toBeVisible()

    const fallbackItem = history.getByText('asset-rain-audio').closest('li')
    expect(fallbackItem).not.toBeNull()
    expect(within(fallbackItem!).getByText('项目快照 · audio/mpeg')).toBeVisible()
    expect(within(fallbackItem!).getByText('目录记录不可用，已保留项目快照')).toBeVisible()
    expect(within(fallbackItem!).getByText('12 秒')).toBeVisible()
  })

  test('offers the project space when no local project exists', async () => {
    renderAssetsPage({ repository: createProjectRepository().repository })

    expect(
      await screen.findByRole('link', { name: '创建项目' }),
    ).toHaveAttribute('href', '/')
  })
})
