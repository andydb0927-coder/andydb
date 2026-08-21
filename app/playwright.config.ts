import { defineConfig, devices } from '@playwright/test'

const port = process.env.PLAYWRIGHT_PORT ?? '4174'
const offlineDist = process.env.PLAYWRIGHT_OFFLINE_DIST
const baseURL = offlineDist
  ? 'http://wireless-canvas.local'
  : `http://127.0.0.1:${port}`
const fixtureKlingEnvironment = [
  'VITE_GENERATION_MODE=kling-direct-dev',
  'VITE_KLING_API_KEY=playwright-fixture-api-key',
  'VITE_KLING_API_BASE=https://fixture.kling.invalid',
  'VITE_KLING_MODEL_ID=kling-2.6',
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
        command: `${fixtureKlingEnvironment} npm run dev -- --host 127.0.0.1 --port ${port}`,
        url: baseURL,
        reuseExistingServer: true,
      },
})
