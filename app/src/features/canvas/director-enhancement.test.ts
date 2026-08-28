import { describe, expect, test } from 'vitest'
import {
  addDirectorSceneObject, applyDirectorCameraPreset, applyDirectorLightingPreset,
  createDefaultDirectorScene, directorAssetKinds, directorLightState,
  interpolateDirectorCamera, moveDirectorLight, sampleDirectorTrajectory,
  serializeDirectorSceneState, parseDirectorSceneState,
} from './director-3d-scene'

describe('director local scene enhancement', () => {
  test.each(['three-point', 'side-back', 'top', 'rim'] as const)('applies %s lights without mutating the old scene', preset => {
    const original = createDefaultDirectorScene()
    const next = applyDirectorLightingPreset(original, preset)
    expect(next.lighting?.preset).toBe(preset)
    expect(next.lighting?.lights.length).toBeGreaterThan(0)
    expect(next.lighting?.lights.every(light => light.intensity > 0)).toBe(true)
    expect(original.lighting).toBeUndefined()
    expect(parseDirectorSceneState(serializeDirectorSceneState(next))).toEqual(next)
  })

  test('updates only a chosen light, validates finite coordinates and preserves presets from alias mutation', () => {
    const scene = applyDirectorLightingPreset(createDefaultDirectorScene(), 'three-point')
    const next = moveDirectorLight(scene, 'key', [2, 4, 6])
    expect(next.lighting?.lights[0].position).toEqual([2, 4, 6])
    expect(next.lighting?.preset).toBe('custom')
    expect(scene.lighting?.lights[0].position).not.toEqual([2, 4, 6])
    expect(() => moveDirectorLight(scene, 'key', [NaN, 3, 0])).toThrow('灯光坐标')
    expect(moveDirectorLight(scene, 'missing', [0, 0, 0])).toBe(scene)
    expect(directorLightState(createDefaultDirectorScene()).lights[0].position).toEqual([5, 8, 6])
  })

  test.each(['close-up', 'medium', 'wide', 'low'] as const)('camera preset %s is serializable and preserves objects', preset => {
    const scene = createDefaultDirectorScene()
    const next = applyDirectorCameraPreset(scene, preset)
    expect(next.camera.preset).toBe(preset)
    expect(next.camera.focalLength).toBeGreaterThan(0)
    expect(next.camera.projection).toBe('perspective')
    expect(next.objects).toBe(scene.objects)
    expect(parseDirectorSceneState(serializeDirectorSceneState(next))).toEqual(next)
  })

  test('camera transition interpolates position, target and lens without writes', () => {
    const from = applyDirectorCameraPreset(createDefaultDirectorScene(), 'wide').camera
    const to = applyDirectorCameraPreset(createDefaultDirectorScene(), 'close-up').camera
    const mid = interpolateDirectorCamera(from, to, .5)
    expect(mid.position[2]).toBe((from.position[2] + to.position[2]) / 2)
    expect(mid.focalLength).toBe((from.focalLength! + to.focalLength!) / 2)
    expect(interpolateDirectorCamera(from, to, 5)).toEqual(to)
    expect(interpolateDirectorCamera(from, to, -1)).toEqual(from)
  })

  test.each(['table', 'chair', 'tree', 'column'] as const)('adds procedural %s asset at ground height', kind => {
    expect(directorAssetKinds).toContain(kind)
    const next = addDirectorSceneObject(createDefaultDirectorScene(), kind, 'prop')
    expect(next.objects.at(-1)).toMatchObject({ id: 'prop', kind, position: [0, 0, 0] })
    expect(parseDirectorSceneState(serializeDirectorSceneState(next))).toEqual(next)
  })

  test('trajectory uses equal-segment linear interpolation and clamps endpoints', () => {
    const trajectory = { points: [[0, 1, 0], [10, 3, 0], [10, 3, 10]] as [number, number, number][], durationSeconds: 4 }
    expect(sampleDirectorTrajectory(trajectory, 1)).toEqual([5, 2, 0])
    expect(sampleDirectorTrajectory(trajectory, 3)).toEqual([10, 3, 5])
    expect(sampleDirectorTrajectory(trajectory, 9)).toEqual([10, 3, 10])
    expect(sampleDirectorTrajectory(trajectory, -2)).toEqual([0, 1, 0])
    expect(sampleDirectorTrajectory({ points: [] }, 1)).toBeNull()
    expect(sampleDirectorTrajectory({ points: [[1, 2, 3]] }, 1)).toEqual([1, 2, 3])
  })
})
