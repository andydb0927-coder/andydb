import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { expect, test } from 'vitest'

function importsOf(path: string) {
  const text = readFileSync(resolve('src/features', path), 'utf8')
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  return source.statements.filter(ts.isImportDeclaration).map(item => ({
    module: ts.isStringLiteral(item.moduleSpecifier) ? item.moduleSpecifier.text : '',
    typeOnly: item.importClause?.isTypeOnly === true,
  }))
}

test('3D scene domain has type-only model dependencies and cannot import UI, store or transport', () => {
  expect(importsOf('canvas/director-3d-scene.ts')).toEqual([{ module: '../project/model', typeOnly: true }])
})

test('Agent command composer does not own 3D state; renderer consumes the pure scene domain', () => {
  const agent = importsOf('director/DirectorComposer.tsx').map(item => item.module)
  expect(agent).toContain('./director-command')
  expect(agent.some(item => /three|director-3d|project-store|Director3DViewport/.test(item))).toBe(false)
  const viewport = importsOf('canvas/Director3DViewport.tsx').map(item => item.module)
  expect(viewport).toContain('./director-3d-scene')
  expect(viewport.some(item => /DirectorComposer|director-command|generation-queue/.test(item))).toBe(false)
})
