/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

const css = readFileSync(
  resolve(process.cwd(), 'src/styles/deployed-ui-polish.css'),
  'utf8',
)
const marker = '/* Deployed canvas UI polish final overrides. */'

function finalOverrides() {
  const start = css.lastIndexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  return css.slice(start)
}

describe('deployed canvas UI polish contract', () => {
  test('uses a 68px compact standard rail without changing workspace mode', () => {
    const source = finalOverrides()
    expect(source).toMatch(
      /\.platform-shell--standard\.platform-shell--collapsed\s*\{[^}]*--platform-rail-width:\s*68px/s,
    )
  })

  test('keeps the hero compact and mode cards stable on hover', () => {
    const source = finalOverrides()
    expect(source).toMatch(
      /\.home-hero\s*\{[^}]*min-height:\s*clamp\(380px,[^;]*500px\)/s,
    )
    expect(source).toMatch(/\.home-mode-card\s*\{[^}]*min-height:\s*96px/s)
    expect(source).toMatch(
      /\.home-mode-card:hover:not\(:disabled\)\s*\{[^}]*transform:\s*none/s,
    )
  })

  test('turns the standard mobile rail into a full-width bottom navigation', () => {
    const source = finalOverrides()
    expect(source).toMatch(
      /@media \(max-width:\s*720px\)[\s\S]*\.platform-shell--standard\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    )
    expect(source).toMatch(
      /\.platform-shell--standard \.platform-shell__rail\s*\{[^}]*position:\s*fixed[^}]*bottom:\s*0[^}]*height:\s*64px/s,
    )
  })
})
