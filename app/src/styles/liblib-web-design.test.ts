import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const css = readFileSync('src/styles/liblib-web-design.css', 'utf8')
const router = readFileSync('src/app/router.tsx', 'utf8')

function rule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? ''
}

describe('LibLib-aligned web design', () => {
  test('loads after the existing platform polish and replaces the gold brand with cyan', () => {
    expect(router.indexOf("../styles/liblib-web-design.css")).toBeGreaterThan(
      router.indexOf("../styles/deployed-ui-polish.css"),
    )
    expect(css).toContain('--brand-primary: #09caf5')
    expect(css).toContain('--surface-canvas: #141414')
    expect(css).toContain('--surface-floating: #1f1f1f')
    expect(css.toLowerCase()).not.toContain('#d8ad69')
    expect(css.toLowerCase()).not.toContain('#c99852')
    expect(css.toLowerCase()).not.toContain('#daab55')
  })

  test('uses the measured LibLib card hover without vertical motion', () => {
    expect(rule('.home-mode-card')).toContain('background: rgb(31 31 31 / 95%)')
    expect(rule('.home-mode-card:hover:not(:disabled)')).toContain(
      'background: rgb(255 255 255 / 8%)',
    )
    expect(rule('.home-mode-card:hover:not(:disabled)')).toContain('transform: none')
    expect(rule('.home-mode-card')).toContain('150ms ease-out')
  })

  test('widens and densifies the project workspace on desktop', () => {
    expect(rule('.projects-page')).toContain('width: min(1440px, 100%)')
    expect(rule('.projects-page__layout')).toContain(
      'grid-template-columns: 176px minmax(0, 1fr)',
    )
    expect(rule('.projects-grid')).toContain(
      'repeat(auto-fill, minmax(230px, 1fr))',
    )
    expect(rule('.project-directory-card')).toContain('border-radius: 12px')
  })

  test('uses horizontal compact project cards and cyan navigation on mobile', () => {
    const mobile = css.match(/@media \(max-width: 720px\)\s*\{([\s\S]+)\}\s*$/)?.[1] ?? ''
    expect(mobile).toContain('.project-directory-card')
    expect(mobile).toContain('grid-template-columns: 112px minmax(0, 1fr)')
    expect(mobile).toContain('.platform-shell--standard .platform-shell__new-project')
    expect(mobile).toContain('background: #09caf5')
  })
})
