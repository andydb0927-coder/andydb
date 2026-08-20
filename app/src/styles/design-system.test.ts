import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const css = readFileSync('src/styles/global.css', 'utf8')

function rule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? ''
}

describe('global design system', () => {
  test('defines the complete brand, surface, state, radius, shadow, and motion scales', () => {
    for (const token of [
      '--brand-primary',
      '--brand-secondary',
      '--surface-canvas',
      '--surface-panel',
      '--space-1',
      '--space-8',
      '--radius-button',
      '--radius-card',
      '--radius-panel',
      '--radius-pill',
      '--shadow-card',
      '--shadow-panel',
      '--shadow-overlay',
      '--status-success',
      '--status-error',
      '--status-progress',
      '--status-disabled',
      '--motion-fast',
      '--motion-standard',
      '--motion-slow',
      '--ease-standard',
    ]) {
      expect(css).toContain(`${token}:`)
    }
  })

  test('applies shared tokens to core canvas surfaces and interactions', () => {
    expect(rule('.floating-panel')).toContain('var(--radius-panel)')
    expect(rule('.floating-panel')).toContain('var(--shadow-panel)')
    expect(rule('.creative-node')).toContain('var(--radius-card)')
    expect(rule('.creative-node')).toContain('var(--shadow-card)')
    expect(rule('.creative-node--selected')).toContain('var(--selection-ring)')
    expect(rule('.canvas-context-menu')).toContain('var(--radius-menu)')
    expect(rule('.canvas-context-menu')).toContain('var(--shadow-overlay)')
  })

  test('uses the cinnabar and warm-gold palette instead of the legacy purple accent', () => {
    expect(css).not.toContain('#7268f0')
    expect(css).not.toContain('rgb(114 104 240')
    expect(css).not.toContain('rgb(169 162 255')
  })

  test('animates selection, edges, and panel entry with reduced-motion fallback', () => {
    expect(rule('.creative-node')).toContain('var(--motion-standard)')
    expect(rule('.react-flow__edge-path.dependency-edge')).toContain(
      'var(--motion-fast)',
    )
    expect(css).toContain('@keyframes panel-enter')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
