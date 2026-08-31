import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

import { libTvGenerationBridgePlugin } from './server/libtv/vite-plugin.js'
import { workspaceCliBridgePlugin } from './server/workspace/vite-plugin.js'

// GitHub Pages publishes this repository below /andydb/. Keep local development
// at / so existing localhost workflows and Playwright routes remain unchanged.
export default defineConfig(({ command, isPreview }) => {
  const publicMockBuild = command === 'build' && process.env.VITE_GENERATION_MODE === 'mock'

  return {
    base:
      command === 'build' || isPreview
        ? process.env.VITE_PUBLIC_BASE || '/andydb/'
        : '/',
    // Public mock artifacts must not read .env.local or expose unrelated VITE_*
    // shell variables. VITE_PUBLIC_BASE is consumed above and never needs to be
    // available to browser code.
    envDir: publicMockBuild ? false : undefined,
    envPrefix: publicMockBuild ? ['VITE_GENERATION_MODE'] : 'VITE_',
    plugins: [react(), workspaceCliBridgePlugin(), libTvGenerationBridgePlugin()],
    test: {
      environment: 'happy-dom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      globals: true,
      setupFiles: './src/test/setup.ts',
    },
  }
})
