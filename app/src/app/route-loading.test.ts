/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

test('styles the route loading status as a centered dark-theme surface', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/styles/global.css'), 'utf8')
  const rule = source.match(/\.route-loading\s*\{(?<declarations>[^}]*)\}/)?.groups?.declarations

  expect(rule).toBeDefined()
  expect(rule).toMatch(/display:\s*grid/)
  expect(rule).toMatch(/min-height:\s*100svh/)
  expect(rule).toMatch(/place-items:\s*center/)
  expect(rule).toMatch(/color:\s*var\(--text-muted\)/)
  expect(rule).toMatch(/background:\s*var\(--surface-canvas\)/)
})

test('exposes the route loading message as an accessible status', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/app/router.tsx'), 'utf8')

  expect(source).toContain('className="route-loading" role="status"')
})
