import { expect, test } from 'vitest'
import * as THREE from 'three'
import { addDirectorSceneObject, applyDirectorLightingPreset, createDefaultDirectorScene } from './director-3d-scene'
import { createDirectorCamera, createDirectorContent, createDirectorObject, disposeDirectorObject } from './director-3d-rendering'

test('scene declarations drive actual Three lights and focal length', () => {
  const state = applyDirectorLightingPreset(createDefaultDirectorScene(), 'three-point')
  const content = createDirectorContent(state)
  const lights = content.children.filter(child => child instanceof THREE.DirectionalLight)
  expect(lights).toHaveLength(3)
  expect(lights[0].position.toArray()).toEqual([4, 5, 5])
  expect(lights[0].intensity).toBe(3)
  const camera = createDirectorCamera({ ...state.camera, focalLength: 85 }, 16 / 9)
  expect(camera).toBeInstanceOf(THREE.PerspectiveCamera)
  if (camera instanceof THREE.PerspectiveCamera) expect(camera.getFocalLength()).toBeCloseTo(85)
  disposeDirectorObject(content)
})

test.each(['table', 'chair', 'tree', 'column'] as const)('%s is real compound geometry, not an empty asset label', kind => {
  const object = addDirectorSceneObject(createDefaultDirectorScene(), kind).objects.at(-1)!
  const root = createDirectorObject(object)
  expect(root.children.length).toBeGreaterThan(1)
  expect(new THREE.Box3().setFromObject(root).isEmpty()).toBe(false)
  expect(root.userData.directorObjectId).toBe(object.id)
  disposeDirectorObject(root)
})
