import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

import { libTvGenerationBridgePlugin } from './server/libtv/vite-plugin.js'
import { workspaceCliBridgePlugin } from './server/workspace/vite-plugin.js'

// GitHub Pages publishes this repository below /andydb/. Keep local development
// at / so existing localhost workflows and Playwright routes remain unchanged.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/andydb/' : '/',
  plugins: [react(), workspaceCliBridgePlugin(), libTvGenerationBridgePlugin()],
  test: {
    environment: 'happy-dom',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
}))
