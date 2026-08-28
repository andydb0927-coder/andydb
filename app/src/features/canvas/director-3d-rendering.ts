import * as THREE from 'three'
import type { Director3DObject, Director3DSceneState, DirectorCameraState } from '../project/model'
import { directorLightState } from './director-3d-scene'

export type DirectorCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera

export function applyCameraState(camera: DirectorCamera, state: DirectorCameraState) {
  camera.position.set(...state.position)
  camera.zoom = state.zoom
  if (camera instanceof THREE.PerspectiveCamera) {
    if (state.focalLength) camera.setFocalLength(state.focalLength)
    else camera.fov = 46
  }
  camera.lookAt(...state.target)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
}

export function createDirectorCamera(state: DirectorCameraState, aspect: number): DirectorCamera {
  const camera = state.projection === 'orthographic'
    ? new THREE.OrthographicCamera(-5 * aspect, 5 * aspect, 5, -5, .1, 100)
    : new THREE.PerspectiveCamera(46, aspect, .1, 100)
  applyCameraState(camera, state)
  return camera
}

export function createDirectorObject(object: Director3DObject): THREE.Group {
  const root = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({ color: object.color, roughness: .72, metalness: .04 })
  const add = (geometry: THREE.BufferGeometry, position: number[], color?: string) => {
    const mesh = new THREE.Mesh(geometry, color ? new THREE.MeshStandardMaterial({ color, roughness: .8 }) : material)
    mesh.position.set(position[0], position[1], position[2])
    root.add(mesh)
    return mesh
  }
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => add(new THREE.BoxGeometry(w, h, d), [x, y, z])
  switch (object.kind) {
    case 'humanoid':
      add(new THREE.SphereGeometry(.28, 24, 16), [0, 2.58, 0])
      add(new THREE.CapsuleGeometry(.38, .9, 8, 18), [0, 1.65, 0])
      box(.72, .34, .38, 0, .96, 0)
      for (const [x, y, rotation] of [[-.56, 1.68, -.14], [.56, 1.68, .14], [-.22, .38, 0], [.22, .38, 0]]) {
        add(new THREE.CapsuleGeometry(.11, .72, 6, 12), [x, y, 0]).rotation.z = rotation
      }
      break
    case 'table':
      box(2.6, .18, 1.6, 0, 1.45, 0)
      for (const x of [-1.08, 1.08]) for (const z of [-.58, .58]) box(.16, 1.36, .16, x, .68, z)
      break
    case 'chair':
      box(1, .15, 1, 0, .85, 0)
      box(1, 1, .15, 0, 1.42, -.44)
      for (const x of [-.38, .38]) for (const z of [-.38, .38]) box(.12, .8, .12, x, .4, z)
      break
    case 'tree':
      add(new THREE.CylinderGeometry(.18, .28, 2, 14), [0, 1, 0], '#79563a')
      add(new THREE.SphereGeometry(1.1, 18, 12), [0, 2.6, 0])
      add(new THREE.SphereGeometry(.8, 16, 12), [-.6, 2, .1])
      break
    case 'column':
      add(new THREE.CylinderGeometry(.52, .52, 3, 24), [0, 1.7, 0])
      box(1.3, .3, 1.3, 0, .15, 0)
      box(1.3, .3, 1.3, 0, 3.3, 0)
      break
    case 'cube': box(1.3, 1.3, 1.3, 0, 0, 0); break
    case 'sphere': add(new THREE.SphereGeometry(.8, 28, 20), [0, 0, 0]); break
    case 'cylinder': add(new THREE.CylinderGeometry(.62, .62, 1.6, 28), [0, 0, 0]); break
    case 'plane':
      material.side = THREE.DoubleSide
      add(new THREE.PlaneGeometry(2.8, 2.8), [0, 0, 0])
  }
  root.name = object.name
  root.userData.directorObjectId = object.id
  root.position.set(...object.position)
  root.rotation.set(...object.rotation)
  root.scale.set(...object.scale)
  return root
}

export function disposeDirectorObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
  })
  geometries.forEach(geometry => geometry.dispose())
  materials.forEach(material => material.dispose())
}

export function createDirectorContent(state: Director3DSceneState, selectedObjectId?: string) {
  const content = new THREE.Group()
  content.add(new THREE.GridHelper(20, 20, '#555b63', '#2d3238'))
  const lighting = directorLightState(state)
  content.add(new THREE.HemisphereLight('#f5f1e8', '#252a31', lighting.ambientIntensity))
  for (const spec of lighting.lights) {
    const light = new THREE.DirectionalLight(spec.color, spec.intensity)
    light.name = spec.id
    light.position.set(...spec.position)
    light.target.position.set(...spec.target)
    content.add(light, light.target)
  }
  for (const object of state.objects) {
    const root = createDirectorObject(object)
    if (object.id === selectedObjectId) root.traverse(child => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.emissive.set('#3b2418')
        child.material.emissiveIntensity = .5
      }
    })
    content.add(root)
  }
  return content
}

export function directorCanvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('场景 PNG 编码失败。')), 'image/png'))
}
