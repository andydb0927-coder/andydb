import type {
  Director3DObject,
  Director3DObjectKind,
  Director3DSceneState,
  DirectorCameraProjection,
  DirectorCameraView,
} from '../project/model'

const cameraPositions: Record<DirectorCameraView, [number, number, number]> = {
  top: [0, 10, 0.01],
  front: [0, 3, 10],
  side: [10, 3, 0],
  free: [7, 6, 7],
}

const objectNames: Record<Director3DObjectKind, string> = {
  cube: '立方体',
  sphere: '球体',
  cylinder: '圆柱',
  plane: '平面',
  humanoid: '人形素模',
}

const objectColors: Record<Director3DObjectKind, string> = {
  cube: '#d96b55',
  sphere: '#d6a34d',
  cylinder: '#5f8fbf',
  plane: '#5f6b76',
  humanoid: '#b9bdc4',
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
    position: [0, kind === 'humanoid' ? 0 : 0.75, 0] as [number, number, number],
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
    name: `${objectNames[kind]} ${String(number).padStart(2, '0')}`,
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
