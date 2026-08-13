/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

const repositoryRoot = resolve(process.cwd(), '..')

test('configures Vercel to build app and serve BrowserRouter routes', () => {
  const config = JSON.parse(readFileSync(resolve(repositoryRoot, 'vercel.json'), 'utf8')) as {
    buildCommand?: string
    outputDirectory?: string
    rewrites?: Array<{ source: string; destination: string }>
  }

  expect(config.buildCommand).toBe('npm --prefix app run build')
  expect(config.outputDirectory).toBe('app/dist')
  expect(config.rewrites).toEqual([{ source: '/(.*)', destination: '/index.html' }])
})

test('configures Netlify to publish app/dist with an SPA fallback', () => {
  const config = readFileSync(resolve(repositoryRoot, 'netlify.toml'), 'utf8')

  expect(config).toMatch(/\[build\][\s\S]*command\s*=\s*"npm --prefix app run build"/)
  expect(config).toMatch(/\[build\][\s\S]*publish\s*=\s*"app\/dist"/)
  expect(config).toMatch(/\[\[redirects\]\][\s\S]*from\s*=\s*"\/\*"/)
  expect(config).toMatch(/\[\[redirects\]\][\s\S]*to\s*=\s*"\/index\.html"/)
  expect(config).toMatch(/\[\[redirects\]\][\s\S]*status\s*=\s*200/)
})

test('documents static deployment and unavailable server bridges', () => {
  const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8')

  expect(readme).toContain('## 部署上线')
  expect(readme).toContain('WIRELESS_CANVAS_ENABLE_LIBTV_WRITES')
  expect(readme).toContain('默认关闭')
  expect(readme).toContain('SPA fallback')
  expect(readme).toContain('LibTV 桥接')
  expect(readme).toContain('workspace CLI')
  expect(readme).toContain('静态托管不可用')
  expect(readme).toContain('中文错误')
})
