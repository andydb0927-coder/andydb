/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

test('declares the Chinese product language and title in the served document', () => {
  const source = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
  const document = new DOMParser().parseFromString(source, 'text/html')

  expect(document.documentElement.lang).toBe('zh-CN')
  expect(document.title).toBe('无线画布')
})
