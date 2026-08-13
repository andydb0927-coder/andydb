import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import type { GenerationProviderPreferenceStore } from '../generation/generation-provider-preference'
import type { LibTvCatalog } from '../generation/libtv-contract'
import { CanvasGenerationSettings } from './CanvasGenerationSettings'

const selection = {
  projectUuid: '11111111-2222-3333-4444-555555555555',
  projectName: '受控验收画布',
  imageModelKey: 'controlled-image',
  imageModelName: 'Controlled Image Model',
  videoModelKey: 'controlled-video',
  videoModelName: 'Controlled Video Model',
}

const catalog: LibTvCatalog = {
  cliInstalled: true,
  cliVersion: 'e2e-controlled',
  authenticated: true,
  writesEnabled: true,
  projects: [{ uuid: selection.projectUuid, name: selection.projectName }],
  imageModels: [{
    modelKey: selection.imageModelKey,
    modelName: selection.imageModelName,
  }],
  videoModels: [{
    modelKey: selection.videoModelKey,
    modelName: selection.videoModelName,
    vip: false,
  }],
}

test('persists a complete LibTV selection from the canvas workspace', async () => {
  const user = userEvent.setup()
  const write = vi.fn<GenerationProviderPreferenceStore['write']>()
  const preferenceStore: GenerationProviderPreferenceStore = {
    read: () => ({ provider: 'demo' }),
    write,
  }

  render(
    <CanvasGenerationSettings
      catalogLoader={() => Promise.resolve(catalog)}
      preferenceStore={preferenceStore}
    />,
  )

  expect(await screen.findByText('LibTV CLI e2e-controlled')).toBeVisible()
  await user.click(screen.getByRole('radio', { name: 'LibTV 实际生成' }))
  await user.selectOptions(screen.getByRole('combobox', { name: '远程画布' }), selection.projectUuid)
  await user.selectOptions(screen.getByRole('combobox', { name: '图片模型' }), selection.imageModelKey)
  await user.selectOptions(screen.getByRole('combobox', { name: '视频模型' }), selection.videoModelKey)
  await user.click(screen.getByRole('button', { name: '启用 LibTV 实际生成' }))

  expect(write).toHaveBeenCalledWith({ provider: 'libtv', selection })
  expect(screen.getByRole('status')).toHaveTextContent('已启用 LibTV 实际生成')
})
