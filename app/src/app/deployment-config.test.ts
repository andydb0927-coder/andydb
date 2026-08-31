/// <reference types="node" />

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

import { expect, test } from 'vitest'

const repositoryRoot = resolve(process.cwd(), '..')

test('builds the offline artifact in mock mode without bundling the local API key', () => {
  const { scripts } = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }

  expect(scripts['build:mock']).toBe(
    scripts.build.replace(
      'vite build',
      'VITE_GENERATION_MODE=mock VITE_SEEDREAM_API_KEY= VITE_ARK_TTS_API_KEY= VITE_KLING_API_KEY= VITE_BACKEND_URL= VITE_BACKEND_INVITE_CODE= VITE_CODE_KEY= vite build && node scripts/verify-public-artifact.mjs',
    ),
  )
})

test('isolates public mock builds from local and shell VITE secrets', () => {
  const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')

  expect(viteConfig).toContain("process.env.VITE_GENERATION_MODE === 'mock'")
  expect(viteConfig).toContain('envDir: publicMockBuild ? false : undefined')
  expect(viteConfig).toContain("envPrefix: publicMockBuild ? ['VITE_GENERATION_MODE'] : 'VITE_'")
})

test('rejects a public artifact containing a non-empty client secret', () => {
  const outputDirectory = mkdtempSync(resolve(tmpdir(), 'wireless-canvas-public-artifact-'))
  try {
    writeFileSync(resolve(outputDirectory, 'safe.js'), 'const mode="mock"')
    execFileSync(process.execPath, [
      resolve(process.cwd(), 'scripts/verify-public-artifact.mjs'),
      outputDirectory,
    ])

    writeFileSync(
      resolve(outputDirectory, 'unsafe.js'),
      'const env={VITE_KLING_API_KEY:"fixture-secret"}',
    )
    expect(() => execFileSync(process.execPath, [
      resolve(process.cwd(), 'scripts/verify-public-artifact.mjs'),
      outputDirectory,
    ], { stdio: 'pipe' })).toThrow()
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true })
  }
})

test('gates both frontend and optional backend before publishing GitHub Pages', () => {
  const workflow = readFileSync(
    resolve(repositoryRoot, '.github/workflows/deploy.yml'),
    'utf8',
  )

  expect(workflow).toContain('npm --prefix backend ci')
  expect(workflow).toContain('npm --prefix backend run typecheck')
  expect(workflow).toContain('npm --prefix backend run test:run')
  expect(workflow.indexOf('npm --prefix backend run test:run')).toBeLessThan(
    workflow.indexOf('Publish app/dist to gh-pages'),
  )
})

test('runs the local gate in order with the mock artifact selected for offline checks', () => {
  const { scripts } = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }

  expect(scripts.verify).toBe(
    'npm run typecheck && npm run test:run && npm run build:mock && PLAYWRIGHT_OFFLINE_DIST=dist npm run e2e',
  )
})

test('selects the offline artifact without disabling the fixture-key development server', () => {
  const playwrightConfig = readFileSync(resolve(process.cwd(), 'playwright.config.ts'), 'utf8')
  const publicCatalogTest = readFileSync(resolve(process.cwd(), 'e2e/public-model-catalog.spec.ts'), 'utf8')

  expect(publicCatalogTest).toContain('resolveOfflineDist()')
  expect(playwrightConfig).not.toContain('PLAYWRIGHT_OFFLINE_DIST')
  expect(playwrightConfig).toContain('VITE_GENERATION_MODE=seedream-direct-dev')
  expect(playwrightConfig).toContain('VITE_SEEDREAM_API_KEY=playwright-fixture-seedream-key')
  expect(playwrightConfig).toContain('reuseExistingServer: false')
})

test('configures Vercel to build app and serve BrowserRouter routes', () => {
  const config = JSON.parse(readFileSync(resolve(repositoryRoot, 'vercel.json'), 'utf8')) as {
    buildCommand?: string
    outputDirectory?: string
    rewrites?: Array<{ source: string; destination: string }>
  }

  expect(config.buildCommand).toBe(
    'VITE_PUBLIC_BASE=/ npm --prefix app run build:mock',
  )
  expect(config.outputDirectory).toBe('app/dist')
  expect(config.rewrites).toEqual([{ source: '/(.*)', destination: '/index.html' }])
})

test('configures Netlify to publish app/dist with an SPA fallback', () => {
  const config = readFileSync(resolve(repositoryRoot, 'netlify.toml'), 'utf8')

  expect(config).toMatch(/\[build\][\s\S]*command\s*=\s*"VITE_PUBLIC_BASE=\/ npm --prefix app run build:mock"/)
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

  expect(viteConfig).toContain("process.env.VITE_PUBLIC_BASE || '/andydb/'")
  expect(viteConfig).toMatch(/base:\s*command\s*===\s*['"]build['"]\s*\|\|\s*isPreview/)
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
  expect(workflow).toMatch(
    /npm --prefix app run typecheck[\s\S]*npm --prefix app run test:run[\s\S]*npm --prefix app run build:mock[\s\S]*npm --prefix app run e2e/,
  )
  expect(workflow).toContain('npx playwright install --with-deps chromium')
  expect(workflow).toMatch(/PLAYWRIGHT_OFFLINE_DIST:\s*dist/)
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
