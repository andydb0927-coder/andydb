import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { vi } from 'vitest'

// Never let a developer's local live-provider credentials affect the test suite.
// Contract tests inject fixture credentials directly into the provider.
vi.stubEnv('VITE_GENERATION_MODE', 'mock')
vi.stubEnv('VITE_ARK_VIDEO_MODEL_ID', '')
vi.stubEnv('VITE_SEEDREAM_API_KEY', '')
vi.stubEnv('VITE_SEEDREAM_API_BASE', '')
vi.stubEnv('VITE_SEEDREAM_MODEL_ID', '')
vi.stubEnv('VITE_ARK_TEXT_MODEL_ID', '')
vi.stubEnv('VITE_ARK_TTS_MODEL_ID', '')
vi.stubEnv('VITE_ARK_AUDIO_MODEL_ID', '')
