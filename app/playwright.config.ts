import { defineConfig, devices } from '@playwright/test'

const port = process.env.PLAYWRIGHT_PORT ?? '4174'
const offlineDist = process.env.PLAYWRIGHT_OFFLINE_DIST
const baseURL = offlineDist
  ? 'http://wireless-canvas.local'
  : `http://127.0.0.1:${port}`
const fixtureGenerationEnvironment = [
  'VITE_GENERATION_MODE=kling-direct-dev,seedream-direct-dev',
  'VITE_KLING_API_KEY=playwright-fixture-api-key',
  'VITE_KLING_API_BASE=https://fixture.kling.invalid',
  'VITE_KLING_MODEL_ID=kling-2.6',
  'VITE_SEEDREAM_API_KEY=playwright-fixture-seedream-key',
  'VITE_SEEDREAM_API_BASE=https://fixture.seedream.invalid/api/v3',
  'VITE_SEEDREAM_MODEL_ID=doubao-seedream-5-0-260128',
].join(' ')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: offlineDist
    ? undefined
    : {
        command: `${fixtureGenerationEnvironment} npm run dev -- --host 127.0.0.1 --port ${port}`,
        url: baseURL,
        reuseExistingServer: true,
      },
})
