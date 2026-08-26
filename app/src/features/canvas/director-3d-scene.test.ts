import { describe, expect, test } from 'vitest'

import {
  addDirectorSceneObject,
  applyDirectorCameraView,
  createDefaultDirectorScene,
  parseDirectorSceneState,
  removeDirectorSceneObject,
  renameDirectorSceneObject,
  serializeDirectorSceneState,
} from './director-3d-scene'

describe('director 3D scene state', () => {
  test('serializes and restores the mannequin, object transforms, and camera', () => {
    const initial = createDefaultDirectorScene()
    const withCube = addDirectorSceneObject(initial, 'cube', 'prop-cube')
    const restored = parseDirectorSceneState(
      serializeDirectorSceneState(withCube),
    )

    expect(restored).toEqual(withCube)
    expect(restored.objects.map(({ kind }) => kind)).toEqual([
      'humanoid',
      'cube',
    ])
    expect(restored.camera).toMatchObject({
      projection: 'perspective',
      view: 'free',
    })
  })

  test('adds, renames, and deletes scene objects without mutating prior state', () => {
    const initial = createDefaultDirectorScene()
    const added = addDirectorSceneObject(initial, 'sphere', 'prop-sphere')
    const renamed = renameDirectorSceneObject(
      added,
      'prop-sphere',
      '星球道具',
    )
    const removed = removeDirectorSceneObject(renamed, 'prop-sphere')

    expect(initial.objects).toHaveLength(1)
    expect(added.objects.at(-1)).toMatchObject({
      id: 'prop-sphere',
      kind: 'sphere',
      name: '球体 01',
    })
    expect(renamed.objects.at(-1)?.name).toBe('星球道具')
    expect(removed.objects).toEqual(initial.objects)
  })

  test.each([
    ['top', [0, 10, 0.01]],
    ['front', [0, 3, 10]],
    ['side', [10, 3, 0]],
    ['free', [7, 6, 7]],
  ] as const)('switches to the %s camera view', (view, position) => {
    const scene = applyDirectorCameraView(
      createDefaultDirectorScene(),
      view,
    )

    expect(scene.camera.view).toBe(view)
    expect(scene.camera.position).toEqual(position)
    expect(scene.camera.target).toEqual([0, 1, 0])
  })

  test('switches projection while preserving the active view', () => {
    const scene = applyDirectorCameraView(
      createDefaultDirectorScene(),
      'front',
      'orthographic',
    )

    expect(scene.camera).toMatchObject({
      projection: 'orthographic',
      view: 'front',
      zoom: 1,
    })
  })
})
