/// <reference types="node" />

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'

import { resolveOfflineDist, resolveStaticFixtureFile } from '../../e2e/static-dist-fixture'

let root: string

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), 'canvas-static-fixture-'))
  mkdirSync(resolve(root, 'assets'))
  writeFileSync(resolve(root, 'index.html'), '<main>SPA fixture</main>')
  writeFileSync(resolve(root, 'assets/app.js'), 'export const loaded = true')
  writeFileSync(resolve(root, 'assets/app.css'), 'body { color: white }')
  writeFileSync(resolve(root, 'NOTICE'), 'An extensionless file is not a route document')
  mkdirSync(resolve(root, 'folder.html'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

test('treats the offline flag as app/dist and preserves explicit output directories', () => {
  expect(resolveOfflineDist('1')).toBe(resolve('dist'))
  expect(resolveOfflineDist('')).toBe(resolve('dist'))
  expect(resolveOfflineDist('dist')).toBe(resolve('dist'))
  expect(resolveOfflineDist('/private/tmp/custom-dist')).toBe('/private/tmp/custom-dist')
})

test('serves the SPA entry for extensionless canvas routes and missing nested documents', () => {
  for (const pathname of [
    '/andydb/', '/andydb/projects/new', '/andydb/1', '/andydb/1/index.html',
    '/andydb/project/canvas-123', '/andydb/missing.js', '/andydb/folder.html', '/andydb/NOTICE',
    '/api/workspace/manifest', '/favicon.ico', '/andydb//missing.js',
  ]) {
    const target = resolveStaticFixtureFile(root, pathname)
    expect(target, pathname).toBe(resolve(root, 'index.html'))
    expect(readFileSync(target, 'utf8')).toBe('<main>SPA fixture</main>')
  }
})

test('reads existing static assets with their original filenames and contents', () => {
  for (const file of ['index.html', 'assets/app.js', 'assets/app.css']) {
    const target = resolveStaticFixtureFile(root, `/andydb/${file}`)
    expect(target).toBe(resolve(root, file))
    expect(readFileSync(target, 'utf8')).toBe(readFileSync(resolve(root, file), 'utf8'))
  }
})

test('rejects paths outside the output directory instead of falling back to external files', () => {
  expect(() => resolveStaticFixtureFile(root, '/andydb/../outside.js')).toThrow('Invalid production fixture path')
  expect(() => resolveStaticFixtureFile(root, '/andydb/../../outside.js')).toThrow('Invalid production fixture path')
})
