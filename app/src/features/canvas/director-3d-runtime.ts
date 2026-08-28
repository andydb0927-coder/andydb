import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Director3DSceneState, Director3DVector, DirectorCameraState, DirectorCameraView } from '../project/model'
import { applyDirectorCameraView, directorLightState, directorViewNames, interpolateDirectorCamera, moveDirectorLight, sampleDirectorTrajectory } from './director-3d-scene'
import { applyCameraState, createDirectorCamera, createDirectorContent, directorCanvasBlob, disposeDirectorObject } from './director-3d-rendering'

export const DIRECTOR_ASSET_MIME = 'application/x-director-local-asset'
export type DirectorSnapshotKind = 'views' | 'snapshot'

/** One runtime per mounted viewport. React updates declarations, never recreates the WebGL context. */
export function createDirectorRuntime(
  canvas: HTMLCanvasElement,
  viewport: HTMLElement,
  initial: Director3DSceneState,
  callbacks: {
    change(scene: Director3DSceneState): void
    preview(playing: boolean): void
    handles(points: { id: string; x: number; y: number; visible: boolean }[]): void
  },
) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  const world = new THREE.Scene()
  world.background = new THREE.Color('#17191c')
  let state = initial
  let width = Math.max(1, viewport.clientWidth)
  let height = Math.max(1, viewport.clientHeight)
  let camera = createDirectorCamera(state.camera, width / height)
  const controls = new OrbitControls(camera, canvas)
  controls.target.set(...state.camera.target)
  controls.update()
  let content = createDirectorContent(state)
  world.add(content)
  let selectedId: string | undefined
  let disposed = false
  let tween: { from: DirectorCameraState; to: DirectorCameraState; start: number } | null = null
  let previewStart: number | null = null
  let lightDrag: { id: string; light: THREE.DirectionalLight; plane: THREE.Plane; offset: THREE.Vector3 } | null = null
  const raycaster = new THREE.Raycaster()

  const readCamera = (): DirectorCameraState => ({ ...state.camera,
    position: camera.position.toArray() as Director3DVector,
    target: controls.target.toArray() as Director3DVector,
    zoom: camera.zoom,
    ...(camera instanceof THREE.PerspectiveCamera ? { focalLength: camera.getFocalLength() } : {}),
  })
  const setCamera = (value: DirectorCameraState) => {
    if ((value.projection === 'perspective') !== (camera instanceof THREE.PerspectiveCamera)) {
      camera = createDirectorCamera(value, width / height)
      controls.object = camera
    }
    applyCameraState(camera, value)
    controls.target.set(...value.target)
  }
  const finishPreview = () => {
    if (previewStart === null) return
    previewStart = null
    setCamera(state.camera)
    controls.enabled = true
    callbacks.preview(false)
  }
  const stopMotion = () => {
    tween = null
    finishPreview()
    setCamera(state.camera)
  }
  const cancelLightDrag = () => {
    if (!lightDrag) return
    const spec = directorLightState(state).lights.find(light => light.id === lightDrag?.id)
    if (spec) lightDrag.light.position.set(...spec.position)
    lightDrag = null
    controls.enabled = true
  }
  const resize = () => {
    width = Math.max(1, viewport.clientWidth)
    height = Math.max(1, viewport.clientHeight)
    renderer.setSize(width, height, false)
    if (camera instanceof THREE.PerspectiveCamera) camera.aspect = width / height
    else { camera.left = -5 * width / height; camera.right = 5 * width / height }
    camera.updateProjectionMatrix()
  }
  resize()
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(viewport)
  const saveCamera = () => {
    if (disposed || lightDrag || previewStart !== null || tween) return
    callbacks.change({ ...state, camera: { ...readCamera(), preset: undefined, view: 'free' } })
  }
  const manualCamera = () => { tween = null; finishPreview() }
  controls.addEventListener('start', manualCamera)
  controls.addEventListener('end', saveCamera)
  const rayAt = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect()
    raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), camera)
    return raycaster.ray
  }

  let frame = 0
  const draw = (now: number) => {
    if (disposed) return
    if (tween) {
      const progress = Math.min(1, (now - tween.start) / 600)
      setCamera(interpolateDirectorCamera(tween.from, tween.to, progress * progress * (3 - 2 * progress)))
      if (progress === 1) tween = null
    }
    if (previewStart !== null && state.trajectory) {
      const elapsed = (now - previewStart) / 1000
      const position = sampleDirectorTrajectory(state.trajectory, elapsed)
      if (position) setCamera({ ...state.camera, position })
      if (elapsed >= (state.trajectory.durationSeconds ?? 5)) finishPreview()
    }
    controls.update()
    renderer.render(world, camera)
    canvas.dataset.cameraMotion = previewStart !== null ? 'trajectory' : tween ? 'transition' : 'idle'
    callbacks.handles(directorLightState(state).lights.map(spec => {
      const light = content.getObjectByName(spec.id)
      const point = (light?.position.clone() ?? new THREE.Vector3(...spec.position)).project(camera)
      return { id: spec.id, x: (point.x + 1) / 2 * width, y: (1 - point.y) / 2 * height,
        visible: point.z > -1 && point.z < 1 && Math.abs(point.x) < .96 && Math.abs(point.y) < .92 && previewStart === null }
    }))
    frame = requestAnimationFrame(draw)
  }
  frame = requestAnimationFrame(draw)

  return {
    update(next: Director3DSceneState, selection?: string) {
      const cameraChanged = JSON.stringify(state.camera) !== JSON.stringify(next.camera)
      const contentChanged = state.objects !== next.objects || state.lighting !== next.lighting || selection !== selectedId
      if (next.trajectory !== state.trajectory || cameraChanged) finishPreview()
      if (contentChanged) cancelLightDrag()
      if (cameraChanged) {
        const from = readCamera()
        const animate = next.camera.preset !== undefined && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (animate) tween = { from, to: next.camera, start: performance.now() }
        else { tween = null; setCamera(next.camera) }
      }
      state = next
      selectedId = selection
      if (contentChanged) {
        world.remove(content)
        disposeDirectorObject(content)
        content = createDirectorContent(next, selection)
        world.add(content)
      }
    },
    groundPoint(clientX: number, clientY: number): Director3DVector {
      const hit = rayAt(clientX, clientY).intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3())
      return hit ? [THREE.MathUtils.clamp(hit.x, -20, 20), 0, THREE.MathUtils.clamp(hit.z, -20, 20)] : [0, 0, 0]
    },
    startLightDrag(id: string, x: number, y: number) {
      stopMotion()
      const light = content.getObjectByName(id)
      if (!(light instanceof THREE.DirectionalLight)) return
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), light.position)
      const hit = rayAt(x, y).intersectPlane(plane, new THREE.Vector3())
      if (!hit) return
      lightDrag = { id, light, plane, offset: hit.sub(light.position) }
      controls.enabled = false
    },
    moveLightDrag(x: number, y: number) {
      if (!lightDrag) return
      const hit = rayAt(x, y).intersectPlane(lightDrag.plane, new THREE.Vector3())
      if (hit) {
        hit.sub(lightDrag.offset).clamp(new THREE.Vector3(-30, 0, -30), new THREE.Vector3(30, 30, 30))
        lightDrag.light.position.copy(hit)
      }
    },
    endLightDrag(commit: boolean) {
      if (!lightDrag) return
      const next = moveDirectorLight(state, lightDrag.id, lightDrag.light.position.toArray() as Director3DVector)
      cancelLightDrag()
      if (commit) callbacks.change(next)
    },
    play() {
      if ((state.trajectory?.points.length ?? 0) < 2) return
      cancelLightDrag()
      tween = null
      previewStart = performance.now()
      controls.enabled = false
      callbacks.preview(true)
    },
    stop: stopMotion,
    async snapshot(kind: DirectorSnapshotKind): Promise<Blob> {
      stopMotion()
      cancelLightDrag()
      // Export a clean render, without selection highlighting or editor handles.
      const clean = createDirectorContent(state)
      world.remove(content)
      world.add(clean)
      const output = document.createElement('canvas')
      output.width = 1280; output.height = 720
      try {
        const context = output.getContext('2d')
        if (!context) throw new Error('当前浏览器不支持 PNG 合成。')
        const views: (DirectorCameraView | null)[] = kind === 'views' ? ['top', 'front', 'side', 'free'] : [null]
        const tileWidth = kind === 'views' ? 640 : 1280
        const tileHeight = kind === 'views' ? 360 : 720
        renderer.setSize(tileWidth, tileHeight, false)
        for (const [index, view] of views.entries()) {
          const exportCamera = createDirectorCamera(view ? applyDirectorCameraView(state, view).camera : state.camera, tileWidth / tileHeight)
          renderer.render(world, exportCamera)
          const x = index % 2 * tileWidth, y = Math.floor(index / 2) * tileHeight
          context.drawImage(canvas, x, y, tileWidth, tileHeight)
          if (view) {
            context.fillStyle = 'rgba(10,12,15,.82)'; context.fillRect(x + 16, y + 16, 108, 36)
            context.fillStyle = '#fff'; context.font = '20px sans-serif'
            context.fillText(`${directorViewNames[view]}视图`, x + 28, y + 41)
          }
        }
      } finally {
        world.remove(clean); disposeDirectorObject(clean); world.add(content)
        resize(); renderer.render(world, camera)
      }
      return directorCanvasBlob(output)
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      controls.removeEventListener('start', manualCamera)
      controls.removeEventListener('end', saveCamera)
      controls.dispose()
      disposeDirectorObject(content)
      renderer.dispose()
    },
  }
}

export type DirectorRuntime = ReturnType<typeof createDirectorRuntime>
