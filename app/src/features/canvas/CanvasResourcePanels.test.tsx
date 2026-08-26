import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import type { Project } from '../project/model'
import type { LibraryAssetRecord } from '../assets/library-model'
import type { SubjectAsset } from '../subjects/subject-model'
import {
  AssetLibraryPanel,
  CharacterLibraryPanel,
  EffectToolboxPanel,
  MaterialLibraryPanel,
} from './CanvasResourcePanels'

const project: Project = {
  id: 'resource-project',
  title: '资源库验收',
  intent: '本地演示',
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
  assets: [
    {
      id: 'asset-rain',
      kind: 'image',
      url: '/demo/scene-rain-street.png',
      mimeType: 'image/png',
      width: 1600,
      height: 900,
    },
    {
      id: 'asset-video',
      kind: 'video',
      url: '/demo/demo-video.mp4',
      mimeType: 'video/mp4',
      durationSeconds: 5,
    },
  ],
  nodes: [
    {
      id: 'rain-node',
      kind: 'scene',
      title: '雨夜长街',
      position: { x: 0, y: 0 },
      versions: [{
        id: 'rain-version',
        createdAt: '2026-08-15T00:00:00.000Z',
        prompt: '雨夜街景',
        assetId: 'asset-rain',
      }],
      activeVersionId: 'rain-version',
      sourceChanged: false,
    },
    {
      id: 'video-node',
      kind: 'video',
      title: '追逐片段',
      position: { x: 320, y: 0 },
      versions: [{
        id: 'video-version',
        createdAt: '2026-08-15T00:01:00.000Z',
        prompt: '追逐',
        assetId: 'asset-video',
      }],
      activeVersionId: 'video-version',
      sourceChanged: false,
    },
  ],
  edges: [],
  timeline: [],
  jobs: [],
  exportJobs: [],
}

test('offers the exact 17 effect templates and inserts the chosen effect', async () => {
  const user = userEvent.setup()
  const onInsert = vi.fn()
  render(<EffectToolboxPanel onInsert={onInsert} />)

  const grid = screen.getByRole('list', { name: '动效模板' })
  expect(within(grid).getAllByRole('button')).toHaveLength(17)
  for (const name of [
    '光效', '烟雾', '粒子', '水墨', '古风', '火焰', '雨雪', '星轨', '闪电',
    '爆炸', '流体', '霓虹', '烟雾消散', '飘带', '花瓣', '落叶', '极光',
  ]) {
    expect(within(grid).getByRole('button', { name: `使用${name}模板` })).toBeVisible()
  }

  await user.click(within(grid).getByRole('button', { name: '使用极光模板' }))
  expect(onInsert).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'aurora', name: '极光' }),
  )
})

test('searches, filters, renames, moves, deletes and sends library assets', async () => {
  const user = userEvent.setup()
  const onInsert = vi.fn()
  let records: LibraryAssetRecord[] = project.assets.map((asset, index) => ({
    ...asset,
    name: index === 0 ? '雨夜长街' : '追逐片段',
    createdAt: project.createdAt,
    source: 'project' as const,
    folderId: 'project' as const,
  }))
  const repository = {
    list: vi.fn(async () => records),
    rename: vi.fn(async (assetId: string, name: string) => {
      records = records.map((record) => record.id === assetId ? { ...record, name } : record)
      return records.find(({ id }) => id === assetId)!
    }),
    move: vi.fn(async (assetId: string, folderId: 'project' | 'generated' | 'inspiration') => {
      records = records.map((record) => record.id === assetId ? { ...record, folderId } : record)
      return records.find(({ id }) => id === assetId)!
    }),
    deleteAsset: vi.fn(async (assetId: string) => {
      records = records.filter(({ id }) => id !== assetId)
      return { status: 'deleted' as const, projectIds: [], nodeTitles: [] }
    }),
  }
  render(
    <AssetLibraryPanel
      project={project}
      repository={repository}
      onInsert={onInsert}
      onRemoveProjectAsset={vi.fn()}
    />,
  )

  const dialog = screen.getByRole('dialog', { name: '资产管理' })
  expect(within(dialog).getByRole('tree', { name: '文件夹' })).toBeVisible()
  await user.type(within(dialog).getByRole('searchbox', { name: '搜索素材' }), '雨夜')
  expect(within(dialog).getByRole('article', { name: '素材 雨夜长街' })).toBeVisible()
  expect(within(dialog).queryByRole('article', { name: '素材 追逐片段' })).not.toBeInTheDocument()
  await user.clear(within(dialog).getByRole('searchbox', { name: '搜索素材' }))
  await user.selectOptions(within(dialog).getByLabelText('类型筛选'), 'video')
  expect(within(dialog).getByRole('article', { name: '素材 追逐片段' })).toBeVisible()
  await user.selectOptions(within(dialog).getByLabelText('类型筛选'), 'all')

  const rain = within(dialog).getByRole('article', { name: '素材 雨夜长街' })
  await user.dblClick(within(rain).getByText('雨夜长街'))
  const rename = within(rain).getByRole('textbox', { name: '重命名雨夜长街' })
  await user.clear(rename)
  await user.type(rename, '蓝调雨夜{Enter}')
  expect(repository.rename).toHaveBeenCalledWith('asset-rain', '蓝调雨夜')
  expect(within(dialog).getByRole('article', { name: '素材 蓝调雨夜' })).toBeVisible()

  const renamed = within(dialog).getByRole('article', { name: '素材 蓝调雨夜' })
  await user.pointer({ target: renamed, keys: '[MouseRight]' })
  const menu = screen.getByRole('menu', { name: '素材操作' })
  expect(within(menu).getByRole('menuitem', { name: '重命名' })).toBeVisible()
  await user.click(within(menu).getByRole('menuitem', { name: '移动到' }))
  await user.click(screen.getByRole('menuitem', { name: '灵感收集' }))
  expect(repository.move).toHaveBeenCalledWith('asset-rain', 'inspiration')
  expect(within(renamed).getByText(/灵感收集/)).toBeVisible()

  await user.pointer({ target: renamed, keys: '[MouseRight]' })
  expect(screen.getByRole('menu', { name: '素材操作' })).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('menu', { name: '素材操作' })).not.toBeInTheDocument()

  await user.click(within(renamed).getByRole('button', { name: '发送蓝调雨夜到画布' }))
  expect(onInsert).toHaveBeenCalledWith(
    expect.objectContaining({ name: '蓝调雨夜', folderId: 'inspiration' }),
  )

  await user.pointer({ target: renamed, keys: '[MouseRight]' })
  await user.click(screen.getByRole('menuitem', { name: '删除' }))
  expect(repository.deleteAsset).toHaveBeenCalledWith('asset-rain')
  expect(within(dialog).queryByRole('article', { name: '素材 蓝调雨夜' })).not.toBeInTheDocument()
})

test('previews persisted video and audio assets with native controls', async () => {
  const records = [
    {
      id: 'library-video', name: '雨夜片段', kind: 'video' as const,
      mimeType: 'video/mp4', url: 'data:video/mp4;base64,AAAA',
      createdAt: project.createdAt, source: 'upload' as const, folderId: 'inspiration' as const,
    },
    {
      id: 'library-audio', name: '环境声', kind: 'audio' as const,
      mimeType: 'audio/mpeg', url: 'data:audio/mpeg;base64,AAAA',
      createdAt: project.createdAt, source: 'upload' as const, folderId: 'inspiration' as const,
    },
  ]
  render(
    <AssetLibraryPanel
      project={{ ...project, assets: [], nodes: [] }}
      repository={{
        list: async () => records,
        rename: vi.fn(), move: vi.fn(), deleteAsset: vi.fn(),
      }}
      onInsert={vi.fn()}
      onRemoveProjectAsset={vi.fn()}
    />,
  )

  expect(await screen.findByLabelText('预览雨夜片段')).toBeInstanceOf(HTMLVideoElement)
  expect(screen.getByLabelText('预览环境声')).toBeInstanceOf(HTMLAudioElement)
})

test('offers style and effect library entries as canvas reference nodes', async () => {
  const user = userEvent.setup()
  const onInsert = vi.fn()
  render(<MaterialLibraryPanel onInsert={onInsert} />)

  const dialog = screen.getByRole('dialog', { name: '素材库' })
  expect(within(dialog).getByRole('region', { name: '风格库' })).toBeVisible()
  expect(within(dialog).getByRole('region', { name: '特效库' })).toBeVisible()
  await user.click(within(dialog).getByRole('button', { name: '添加风格参考节点' }))
  expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'style' }))
  await user.click(within(dialog).getByRole('button', { name: '添加特效参考节点' }))
  expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'effect' }))
})

test('filters character cards, previews four images and applies selected characters', async () => {
  const user = userEvent.setup()
  const onApply = vi.fn()
  render(<CharacterLibraryPanel onApply={onApply} />)

  const dialog = screen.getByRole('dialog', { name: '角色库' })
  expect(within(dialog).getByRole('region', { name: '最近使用' })).toBeVisible()
  await user.selectOptions(within(dialog).getByLabelText('性别'), '女')
  await user.selectOptions(within(dialog).getByLabelText('时代'), '古代')
  const card = within(dialog).getByRole('article', { name: '角色 程野' })
  expect(within(card).getAllByRole('img')).toHaveLength(4)
  expect(within(card).getAllByText('侦查使')).not.toHaveLength(0)

  await user.click(within(card).getByRole('button', { name: '查看程野' }))
  expect(screen.getByRole('dialog', { name: '角色详情 程野' })).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: '角色详情 程野' })).not.toBeInTheDocument()

  await user.click(within(card).getByRole('button', { name: '使用程野' }))
  const selected = within(dialog).getByRole('region', { name: '已选角色' })
  expect(within(selected).getByText('程野')).toBeVisible()
  await user.click(within(dialog).getByRole('button', { name: '应用 1 个角色到画布' }))
  expect(onApply).toHaveBeenCalledWith([
    expect.objectContaining({ id: 'cheng-ye', name: '程野' }),
  ])
})

test('shows, edits, deletes and reuses locally persisted subjects', async () => {
  const user = userEvent.setup()
  let subjects: SubjectAsset[] = [{
    id: 'subject-rain',
    name: '雨夜旅人',
    description: '黑色风衣与冷色轮廓光',
    tags: ['主角', '雨夜'],
    coverUrl: 'data:image/png;base64,subject',
    sampleImages: ['data:image/png;base64,subject'],
    sourceProjectId: 'another-project',
    createdAt: '2026-08-27T08:00:00.000Z',
    updatedAt: '2026-08-27T08:00:00.000Z',
  }]
  const repository = {
    list: vi.fn(async () => subjects),
    update: vi.fn(async (id: string, changes: Pick<SubjectAsset, 'name' | 'description' | 'tags'>) => {
      subjects = subjects.map((subject) => subject.id === id ? { ...subject, ...changes } : subject)
      return subjects[0]
    }),
    delete: vi.fn(async (id: string) => {
      subjects = subjects.filter((subject) => subject.id !== id)
      return true
    }),
  }
  const onApplySubject = vi.fn()
  render(
    <CharacterLibraryPanel
      onApply={vi.fn()}
      onApplySubject={onApplySubject}
      subjectRepository={repository}
    />,
  )

  const local = await screen.findByRole('region', { name: '本地主体' })
  const card = within(local).getByRole('article', { name: '主体 雨夜旅人' })
  expect(card).toHaveAttribute('draggable', 'true')
  expect(within(card).getByText('来自其他项目')).toBeVisible()
  await user.click(within(card).getByRole('button', { name: '使用雨夜旅人' }))
  expect(onApplySubject).toHaveBeenCalledWith(expect.objectContaining({ id: 'subject-rain' }))

  await user.click(within(card).getByRole('button', { name: '编辑雨夜旅人' }))
  await user.clear(screen.getByLabelText('编辑主体名称'))
  await user.type(screen.getByLabelText('编辑主体名称'), '雨夜主角')
  await user.click(screen.getByRole('button', { name: '保存主体修改' }))
  expect(repository.update).toHaveBeenCalledWith('subject-rain', expect.objectContaining({ name: '雨夜主角' }))

  const renamed = await screen.findByRole('article', { name: '主体 雨夜主角' })
  await user.click(within(renamed).getByRole('button', { name: '删除雨夜主角' }))
  await user.click(screen.getByRole('button', { name: '确认删除主体' }))
  expect(repository.delete).toHaveBeenCalledWith('subject-rain')
  expect(screen.queryByRole('article', { name: '主体 雨夜主角' })).not.toBeInTheDocument()
})
