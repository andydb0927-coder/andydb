/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/styles/global.css'), 'utf8')

function rules(selector: string, source = css) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return Array.from(
    source.matchAll(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`, 'g')),
    (match) => match.groups?.body ?? '',
  )
}

function expectRule(selector: string, declaration: RegExp, source = css) {
  expect(rules(selector, source).some((body) => declaration.test(body))).toBe(true)
}

function contractBlock() {
  const start = css.lastIndexOf('/* Platform functional pages final overrides. */')
  expect(start).toBeGreaterThanOrEqual(0)
  return css.slice(start)
}

describe('platform functional page density contract', () => {
  test('keeps secondary page headings compact', () => {
    const contract = contractBlock()
    expectRule('.platform-shell:not(.platform-shell--home) .platform-page', /padding:\s*clamp\(24px,[^;]*48px\)/, contract)
    expectRule('.platform-shell:not(.platform-shell--home) .platform-page h1', /font-size:\s*clamp\(1\.75rem,[^;]*2\.5rem\)/, contract)
  })

  test('uses compact project and skill card grids', () => {
    const contract = contractBlock()
    expectRule('.projects-grid', /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(240px,\s*1fr\)\)/, contract)
    expectRule('.agent-skill-grid', /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, contract)
    expectRule('.agent-skill-card', /min-height:\s*129px/, contract)
  })

  test('renders challenge cards as a three-column media gallery', () => {
    const contract = contractBlock()
    expectRule('.challenge-grid', /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, contract)
    expectRule('.challenge-card__cover', /aspect-ratio:\s*16\s*\/\s*9/, contract)
  })

  test('bounds challenge documents and stacks functional pages on mobile', () => {
    const contract = contractBlock()
    expectRule('.challenge-detail-page', /width:\s*min\(800px,\s*100%\)/, contract)
    expect(contract).toMatch(/@media \(max-width: 720px\)[\s\S]*\.platform-shell:not\(\.platform-shell--home\):not\(\.platform-shell--workspace\)[\s\S]*--platform-rail-width:\s*64px/)
    expect(contract).toMatch(/@media \(max-width: 720px\)[\s\S]*\.agent-skill-grid,[\s\S]*\.challenge-grid[\s\S]*grid-template-columns:\s*1fr/)
  })
})
