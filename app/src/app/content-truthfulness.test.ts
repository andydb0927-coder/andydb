/// <reference types="node" />

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

function productSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return productSources(path)
    if (!/\.(?:ts|tsx)$/u.test(entry.name) || entry.name.includes('.test.')) return []
    return [path]
  })
}

test('does not advertise retired model names in product UI source', () => {
  const files = productSources(resolve(process.cwd(), 'src'))
  const retiredClaims = /SD2\.5|Seedance\s*2\.5|Seedance2\.5|Minimax\s*H3/iu
  const matches = files.filter((file) => retiredClaims.test(readFileSync(file, 'utf8')))

  expect(matches).toEqual([])
})

test('does not advertise the retired LibTV publishing action in product UI source', () => {
  const files = productSources(resolve(process.cwd(), 'src'))
  const retiredPublishingClaim = /在\s*LibTV\s*上发布/iu
  const matches = files.filter((file) => retiredPublishingClaim.test(readFileSync(file, 'utf8')))

  expect(matches).toEqual([])
})
