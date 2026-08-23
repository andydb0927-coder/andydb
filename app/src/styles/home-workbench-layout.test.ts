/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/styles/global.css'), 'utf8')

function declarations(source: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return Array.from(
    source.matchAll(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`, 'g')),
    (match) => match.groups?.body ?? '',
  )
}

function expectRule(selector: string, declaration: RegExp, source = css) {
  expect(
    declarations(source, selector).some((body) => declaration.test(body)),
  ).toBe(true)
}

function finalMediaBlock(maxWidth: number) {
  const marker = `@media (max-width: ${maxWidth}px)`
  const start = css.lastIndexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = css.indexOf('\n@media ', start + marker.length)
  return css.slice(start, end < 0 ? undefined : end)
}

describe('home workbench density contract', () => {
  test('keeps the homepage rail and topbar compact', () => {
    expectRule('.platform-shell--home', /--platform-rail-width:\s*184px/)
    expectRule('.platform-shell--home .platform-shell__topbar', /height:\s*52px/)
    expectRule('.launcher-page', /font-size:\s*16px/)
  })

  test('bounds the hero and fits six creation modes on wide screens', () => {
    expectRule('.home-hero', /min-height:\s*clamp\(430px,[^;]*620px\)/)
    expectRule('.home-hero h1', /font-size:\s*clamp\(3rem,[^;]*4\.25rem\)/)
    expectRule('.home-modes', /grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/)
    expectRule('.home-mode-card', /min-height:\s*112px/)
  })

  test('keeps every recent project reachable in one horizontal row', () => {
    expectRule('.launcher-recent__list', /display:\s*flex/)
    expectRule('.launcher-recent__list', /flex-wrap:\s*nowrap/)
    expectRule('.launcher-recent__list', /overflow-x:\s*auto/)
    expectRule('.recent-project', /flex:\s*0\s+0\s+min\(280px,\s*82vw\)/)
  })

  test('uses compact agent, feature, skill, and TV Show cards', () => {
    expectRule('.home-agent__composer', /min-height:\s*104px/)
    expectRule('.home-feature-card', /min-height:\s*176px/)
    expectRule('.home-skill-grid', /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
    expectRule('.home-show__waterfall', /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/)
  })

  test('defines the expected homepage breakpoints', () => {
    expectRule(
      '.home-show__waterfall',
      /grid-template-columns:\s*repeat\(3,/,
      finalMediaBlock(1100),
    )
    const tablet = finalMediaBlock(820)
    expectRule('.platform-shell--home', /--platform-rail-width:\s*64px/, tablet)
    expectRule('.home-show__waterfall', /grid-template-columns:\s*repeat\(2,/, tablet)
    expectRule(
      '.home-show__waterfall',
      /grid-template-columns:\s*1fr/,
      finalMediaBlock(560),
    )
  })
})
