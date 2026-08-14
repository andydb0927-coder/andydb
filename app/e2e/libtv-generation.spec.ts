import { expect, test, type Page } from '@playwright/test'

const remoteProject = {
  uuid: '11111111-2222-3333-4444-555555555555',
  name: '受控验收画布',
}
const imageModelName = 'Controlled Image Model'
const videoModelName = 'Controlled Video Model'

const catalog = {
  cliInstalled: true,
  cliVersion: 'e2e-controlled',
  authenticated: true,
  writesEnabled: true,
  projects: [remoteProject],
  imageModels: [
    {
      modelKey: 'controlled-image',
      modelName: imageModelName,
      description: '浏览器测试图片模型',
    },
  ],
  videoModels: [
    {
      modelKey: 'controlled-video',
      modelName: videoModelName,
      description: '浏览器测试视频模型',
      pricingRule: '受控测试不产生费用',
      estimatedTime: '立即返回',
      vip: false,
    },
  ],
}

async function createCinematicProject(page: Page) {
  await page.goto('/')
  await page.getByRole('link', { name: '新建项目', exact: true }).click()
  await expect(page.getByRole('region', { name: '项目画布' })).toBeVisible()
}

test('runs the complete LibTV provider path behind intercepted local evidence', async ({
  page,
}) => {
  const browserErrors: string[] = []
  const externalRequests: string[] = []
  const generationBodies: unknown[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname !== '127.0.0.1' &&
      url.hostname !== 'localhost'
    ) {
      externalRequests.push(request.url())
    }
  })

  await page.route('**/e2e/libtv-generated.mp4', (route) =>
    route.fulfill({ status: 200, contentType: 'video/mp4', body: '' }),
  )
  await page.route('**/api/libtv/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/libtv/catalog' && request.method() === 'GET') {
      await route.fulfill({ status: 200, json: catalog })
      return
    }
    if (url.pathname === '/api/libtv/generate' && request.method() === 'POST') {
      generationBodies.push(request.postDataJSON())
      await route.fulfill({
        status: 200,
        json: {
          kind: 'video',
          url: `${url.origin}/e2e/libtv-generated.mp4`,
          mimeType: 'video/mp4',
          width: 1280,
          height: 720,
          durationSeconds: 6,
        },
      })
      return
    }
    await route.abort('blockedbyclient')
  })

  await createCinematicProject(page)
  const canvasUrl = page.url()
  const projectId = new URL(canvasUrl).pathname.split('/').at(-1)
  expect(projectId).toBeTruthy()

  await page.getByRole('button', { name: '打开工具箱' }).click()
  await page.getByRole('tab', { name: '生成连接' }).click()
  await expect(page.getByText('LibTV CLI e2e-controlled')).toBeVisible()
  await page.getByRole('radio', { name: 'LibTV 实际生成' }).check()
  await page.getByRole('combobox', { name: '远程画布' }).selectOption(remoteProject.uuid)
  await page.getByRole('combobox', { name: '图片模型' }).selectOption(imageModelName)
  await page.getByRole('combobox', { name: '视频模型' }).selectOption(videoModelName)
  await page.getByRole('button', { name: '启用 LibTV 实际生成' }).click()
  await expect(page.getByRole('status')).toHaveText('已启用 LibTV 实际生成')

  await page.getByRole('button', { name: '关闭工具箱面板' }).click()
  await page.getByRole('button', { name: '分镜 01', exact: true }).click()
  const generateVideo = page.getByRole('button', { name: '生成视频' })
  await generateVideo.focus()
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('dialog', { name: '确认 LibTV 实际生成' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(remoteProject.name)
  await expect(dialog).toContainText(videoModelName)
  await expect(dialog).toContainText('生成视频')
  await expect(dialog).toContainText('会在远程画布创建生成节点')
  await expect(dialog).toContainText('1 个参考素材会先上传到 LibTV')
  await expect(dialog).toContainText('可能消耗 LibTV 积分')
  await expect(page.getByRole('button', { name: '取消' })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(generateVideo).toBeFocused()
  expect(generationBodies).toHaveLength(0)

  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: '确认并提交 LibTV' }).click()
  await expect.poll(() => generationBodies.length).toBe(1)

  expect(generationBodies[0]).toEqual({
    confirmed: true,
    selection: {
      projectUuid: remoteProject.uuid,
      projectName: remoteProject.name,
      imageModelKey: 'controlled-image',
      imageModelName,
      videoModelKey: 'controlled-video',
      videoModelName,
    },
    request: {
      projectId,
      nodeId: expect.any(String),
      operation: 'generate-video',
      targetKind: 'video',
      prompt: expect.any(String),
      referenceAssets: [
        {
          dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
          kind: 'image',
          mimeType: 'image/png',
        },
      ],
    },
  })

  const generatedVideo = page.getByRole('button', {
    name: '视频 01',
    exact: true,
  })
  await expect(generatedVideo).toBeVisible()
  await expect
    .poll(() =>
      generatedVideo.evaluate((element) =>
        element.closest('.react-flow__node')?.classList.contains('selected'),
      ),
    )
    .toBe(true)
  await expect(page.getByText('已保存')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: '视频 01', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '素材库' }).click()
  const generatedAsset = page.getByRole('complementary', { name: '资产' })
  const generatedVideoCard = generatedAsset.getByRole('article', { name: '素材 视频 01' })
  await expect(generatedVideoCard).toBeVisible()
  await expect(generatedVideoCard).toContainText('生成结果 · VIDEO')

  expect(generationBodies).toHaveLength(1)
  expect(externalRequests).toEqual([])
  expect(browserErrors).toEqual([])
})
