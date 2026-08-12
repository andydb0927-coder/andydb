import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

import { libTvGenerationBridgePlugin } from './server/libtv/vite-plugin.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), libTvGenerationBridgePlugin()],
  test: {
    environment: 'happy-dom',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
