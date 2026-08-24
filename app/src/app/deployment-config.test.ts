/// <reference types="node" />

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

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

test('configures the GitHub Pages repository base and BrowserRouter basename', () => {
  const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')
  const router = readFileSync(resolve(process.cwd(), 'src/app/router.tsx'), 'utf8')

  expect(viteConfig).toMatch(
    /base:\s*command\s*===\s*['"]build['"]\s*\?\s*['"]\/andydb\/['"]\s*:\s*['"]\/['"]/,
  )
  expect(router).toContain('basename: import.meta.env.BASE_URL')
})

test('copies the built index document to 404.html for GitHub Pages SPA fallback', () => {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), 'wireless-canvas-pages-'))
  try {
    writeFileSync(resolve(outputDirectory, 'index.html'), '<main>wireless canvas</main>')
    execFileSync(process.execPath, [
      resolve(process.cwd(), 'scripts/github-pages-fallback.mjs'),
      outputDirectory,
    ])

    expect(readFileSync(resolve(outputDirectory, '404.html'), 'utf8')).toBe(
      '<main>wireless canvas</main>',
    )
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true })
  }
})

test('deploys app/dist to gh-pages after pushes to the platform branch', () => {
  const workflow = readFileSync(
    resolve(repositoryRoot, '.github/workflows/deploy.yml'),
    'utf8',
  )

  expect(workflow).toMatch(/branches:\s*\[?['"]?codex\/platform-shell-phase['"]?\]?/)
  expect(workflow).toContain('npm --prefix app ci')
  expect(workflow).toContain('npm --prefix app run build')
  expect(workflow).toContain('peaceiris/actions-gh-pages@v4.0.0')
  expect(workflow).toMatch(/publish_dir:\s*\.\/app\/dist/)
  expect(workflow).toMatch(/publish_branch:\s*gh-pages/)
})

test('documents the GitHub Pages URL, branch source, and local serve check', () => {
  const deploymentGuide = readFileSync(resolve(repositoryRoot, 'DEPLOY.md'), 'utf8')

  expect(deploymentGuide).toContain('## GitHub Pages')
  expect(deploymentGuide).toContain('https://andydb0927-coder.github.io/andydb/')
  expect(deploymentGuide).toContain('codex/platform-shell-phase')
  expect(deploymentGuide).toContain('gh-pages')
  expect(deploymentGuide).toContain('npx serve dist')
})
