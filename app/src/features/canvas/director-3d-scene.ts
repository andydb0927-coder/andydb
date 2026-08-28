import type {
  Director3DObject,
  Director3DObjectKind,
  Director3DSceneState,
  DirectorCameraProjection,
  DirectorCameraView,
  Director3DVector,
  DirectorCameraPreset,
  DirectorCameraState,
  DirectorLight,
  DirectorLightingPreset,
  DirectorLightingState,
  DirectorTrajectory,
} from '../project/model'

const cameraPositions: Record<DirectorCameraView, [number, number, number]> = {
  top: [0, 10, 0.01],
  front: [0, 3, 10],
  side: [10, 3, 0],
  free: [7, 6, 7],
}

export const directorObjectNames: Record<Director3DObjectKind, string> = {
  cube: '立方体',
  sphere: '球体',
  cylinder: '圆柱',
  plane: '平面',
  humanoid: '人形素模',
  table: '桌子', chair: '椅子', tree: '树', column: '柱体',
}

const objectColors: Record<Director3DObjectKind, string> = {
  cube: '#d96b55',
  sphere: '#d6a34d',
  cylinder: '#5f8fbf',
  plane: '#5f6b76',
  humanoid: '#b9bdc4',
  table: '#a57a52', chair: '#bc946c', tree: '#5c8957', column: '#c8c0ae',
}

export const directorAssetKinds = ['table', 'chair', 'tree', 'column'] as const
export const directorViewNames: Record<DirectorCameraView, string> = { top: '顶部', front: '前', side: '侧', free: '自由' }
export const directorCameraPresets: Record<DirectorCameraPreset, { name: string; position: Director3DVector; target: Director3DVector; focalLength: number }> = {
  'close-up': { name: '特写', position: [0, 2.6, 4], target: [0, 2.4, 0], focalLength: 85 },
  medium: { name: '中景', position: [3, 2.6, 7], target: [0, 1.6, 0], focalLength: 50 },
  wide: { name: '全景', position: [7, 6, 10], target: [0, 1, 0], focalLength: 28 },
  low: { name: '低角度', position: [3, .5, 6], target: [0, 1.8, 0], focalLength: 35 },
}
export const directorLightingPresets: Record<DirectorLightingPreset, string> = {
  'three-point': '三点布光', 'side-back': '侧逆光', top: '顶光', rim: '轮廓光',
}

function light(id: string, name: string, position: Director3DVector, intensity: number, color = '#fff4d6'): DirectorLight {
  return { id, name, position, intensity, color, target: [0, 1, 0] }
}

export function directorLightState(scene: Director3DSceneState): DirectorLightingState {
  return scene.lighting ?? { preset: 'legacy', ambientIntensity: 1.6, lights: [light('key', '主光', [5, 8, 6], 2.2)] }
}

export function applyDirectorLightingPreset(scene: Director3DSceneState, preset: DirectorLightingPreset): Director3DSceneState {
  const lights = preset === 'three-point'
    ? [light('key', '主光', [4, 5, 5], 3), light('fill', '补光', [-4, 3, 3], 1.2, '#d6e8ff'), light('rim', '轮廓光', [2, 4, -4], 2.5)]
    : preset === 'side-back'
      ? [light('key', '主光', [-4, 4, -3], 4), light('fill', '补光', [3, 2, 4], .6, '#d6e8ff')]
      : preset === 'top'
        ? [light('key', '主光', [0, 8, 0], 4), light('fill', '补光', [0, 2, 5], .5)]
        : [light('key', '主光', [-3, 4, -4], 4, '#d6e8ff'), light('rim', '轮廓光', [3, 4, -4], 4)]
  return { ...scene, lighting: { preset, ambientIntensity: .35, lights } }
}

export function moveDirectorLight(scene: Director3DSceneState, id: string, position: Director3DVector): Director3DSceneState {
  if (!position.every(Number.isFinite)) throw new Error('灯光坐标必须是有限数字。')
  const lighting = directorLightState(scene)
  if (!lighting.lights.some(light => light.id === id)) return scene
  const bounded = position.map((v, i) => Math.max(i === 1 ? 0 : -30, Math.min(30, v))) as Director3DVector
  return { ...scene, lighting: { ...lighting, preset: 'custom', lights: lighting.lights.map(light => light.id === id ? { ...light, position: bounded } : light) } }
}

export function applyDirectorCameraPreset(scene: Director3DSceneState, preset: DirectorCameraPreset): Director3DSceneState {
  const spec = directorCameraPresets[preset]
  return { ...scene, camera: { projection: 'perspective', view: 'free', preset, zoom: 1, position: [...spec.position], target: [...spec.target], focalLength: spec.focalLength } }
}

export function interpolateDirectorCamera(from: DirectorCameraState, to: DirectorCameraState, progress: number): DirectorCameraState {
  if (progress <= 0) return from
  if (progress >= 1) return to
  const lerp = (a: number, b: number) => a + (b - a) * progress
  return { ...to, position: from.position.map((v, i) => lerp(v, to.position[i])) as Director3DVector,
    target: from.target.map((v, i) => lerp(v, to.target[i])) as Director3DVector,
    zoom: lerp(from.zoom, to.zoom), focalLength: lerp(from.focalLength ?? 35, to.focalLength ?? 35) }
}

export function sampleDirectorTrajectory(trajectory: DirectorTrajectory, elapsedSeconds: number): Director3DVector | null {
  const { points } = trajectory
  if (!points.length) return null
  if (points.length === 1) return [...points[0]]
  const duration = Math.max(.1, trajectory.durationSeconds ?? 5)
  const fraction = Math.max(0, Math.min(1, elapsedSeconds / duration)) * (points.length - 1)
  const index = Math.min(points.length - 2, Math.floor(fraction))
  return points[index].map((v, axis) => v + (points[index + 1][axis] - v) * (fraction - index)) as Director3DVector
}

function objectTransform(kind: Director3DObjectKind) {
  if (kind === 'plane') {
    return {
      position: [0, 0.02, 0] as [number, number, number],
      rotation: [-Math.PI / 2, 0, 0] as [number, number, number],
      scale: [3, 3, 3] as [number, number, number],
    }
  }
  return {
    position: [0, kind === 'humanoid' || directorAssetKinds.some(asset => asset === kind) ? 0 : 0.75, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number],
  }
}

export function createDefaultDirectorScene(): Director3DSceneState {
  return {
    objects: [
      {
        id: 'director-humanoid',
        name: '人形素模 01',
        kind: 'humanoid',
        color: objectColors.humanoid,
        ...objectTransform('humanoid'),
      },
    ],
    camera: {
      projection: 'perspective',
      view: 'free',
      position: [...cameraPositions.free],
      target: [0, 1, 0],
      zoom: 1,
    },
  }
}

export function addDirectorSceneObject(
  scene: Director3DSceneState,
  kind: Director3DObjectKind,
  id: string = crypto.randomUUID(),
): Director3DSceneState {
  const number =
    scene.objects.filter((candidate) => candidate.kind === kind).length + 1
  const object: Director3DObject = {
    id,
    kind,
    name: `${directorObjectNames[kind]} ${String(number).padStart(2, '0')}`,
    color: objectColors[kind],
    ...objectTransform(kind),
  }
  return { ...scene, objects: [...scene.objects, object] }
}

export function renameDirectorSceneObject(
  scene: Director3DSceneState,
  objectId: string,
  name: string,
): Director3DSceneState {
  const normalized = name.trim()
  if (!normalized) return scene
  return {
    ...scene,
    objects: scene.objects.map((object) =>
      object.id === objectId ? { ...object, name: normalized } : object,
    ),
  }
}

export function removeDirectorSceneObject(
  scene: Director3DSceneState,
  objectId: string,
): Director3DSceneState {
  return {
    ...scene,
    objects: scene.objects.filter(({ id }) => id !== objectId),
  }
}

export function applyDirectorCameraView(
  scene: Director3DSceneState,
  view: DirectorCameraView,
  projection: DirectorCameraProjection = scene.camera.projection,
): Director3DSceneState {
  return {
    ...scene,
    camera: {
      projection,
      view,
      position: [...cameraPositions[view]],
      target: [0, 1, 0],
      zoom: 1,
    },
  }
}

export function serializeDirectorSceneState(scene: Director3DSceneState) {
  return JSON.stringify(scene)
}

export function parseDirectorSceneState(value: string): Director3DSceneState {
  const parsed = JSON.parse(value) as Director3DSceneState
  if (!Array.isArray(parsed.objects) || !parsed.camera) {
    throw new Error('导演台3D场景数据无效。')
  }
  return parsed
}
