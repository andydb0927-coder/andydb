/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/styles/global.css'), 'utf8')

function declarations(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`))?.groups?.body
}

describe('platform shell task layout', () => {
  test('uses a 340px desktop task column instead of a canvas overlay', () => {
    expect(declarations('.platform-shell--tasks-open')).toMatch(
      /--platform-task-drawer-width:\s*340px/,
    )
    expect(declarations('.platform-task-drawer')).not.toMatch(/position:\s*fixed/)
  })

  test('shrinks both fixed canvas surfaces by the same task column width', () => {
    expect(declarations('.platform-shell--workspace .canvas-top-bar')).toMatch(
      /right:\s*var\(--platform-task-drawer-width\)/,
    )
    expect(declarations('.platform-shell--workspace .canvas-page__viewport')).toMatch(
      /right:\s*var\(--platform-task-drawer-width\)/,
    )
  })
})
