/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { render, screen } from '@testing-library/react'
import { RouteLoading } from './route-boundaries'

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
  render(createElement(RouteLoading))
  expect(screen.getByRole('status')).toHaveClass('route-loading')
  expect(screen.getByRole('status')).toHaveTextContent('正在加载页面…')
})
