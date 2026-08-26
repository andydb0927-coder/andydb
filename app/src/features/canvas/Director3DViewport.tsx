import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import type {
  Director3DObject,
  Director3DObjectKind,
  Director3DSceneState,
  DirectorCameraProjection,
  DirectorCameraState,
  DirectorCameraView,
} from '../project/model'
import {
  addDirectorSceneObject,
  applyDirectorCameraView,
  removeDirectorSceneObject,
  renameDirectorSceneObject,
} from './director-3d-scene'

type DirectorCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera

interface DirectorRuntime {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: DirectorCamera
  controls: OrbitControls
}

const viewCopy: Record<DirectorCameraView, string> = {
  top: '顶部',
  front: '前',
  side: '侧',
  free: '自由',
}

const objectCopy: Record<Director3DObjectKind, string> = {
  cube: '立方体',
  sphere: '球体',
  cylinder: '圆柱',
  plane: '平面',
  humanoid: '人形素模',
}

function tuple(vector: THREE.Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z]
}

function createCamera(
  state: DirectorCameraState,
  aspect: number,
): DirectorCamera {
  const camera = state.projection === 'orthographic'
    ? new THREE.OrthographicCamera(-5 * aspect, 5 * aspect, 5, -5, 0.1, 100)
    : new THREE.PerspectiveCamera(46, aspect, 0.1, 100)
  camera.position.set(...state.position)
  camera.zoom = state.zoom
  camera.lookAt(...state.target)
  camera.updateProjectionMatrix()
  return camera
}

function standardMaterial(color: string) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.04,
  })
}

function humanoidObject(color: string) {
  const group = new THREE.Group()
  const material = standardMaterial(color)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 16), material)
  head.position.y = 2.58
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.9, 8, 18), material)
  torso.position.y = 1.65
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.34, 0.38), material)
  hips.position.y = 0.96
  const limbGeometry = new THREE.CapsuleGeometry(0.11, 0.72, 6, 12)
  const limbs = [
    [-0.56, 1.68, 0, 0, 0, -0.14],
    [0.56, 1.68, 0, 0, 0, 0.14],
    [-0.22, 0.38, 0, 0, 0, 0],
    [0.22, 0.38, 0, 0, 0, 0],
  ] as const
  for (const [x, y, z, rx, ry, rz] of limbs) {
    const limb = new THREE.Mesh(limbGeometry, material)
    limb.position.set(x, y, z)
    limb.rotation.set(rx, ry, rz)
    group.add(limb)
  }
  group.add(head, torso, hips)
  return group
}

function sceneObjectMesh(object: Director3DObject) {
  let root: THREE.Object3D
  if (object.kind === 'humanoid') {
    root = humanoidObject(object.color)
  } else {
    const geometry = object.kind === 'cube'
      ? new THREE.BoxGeometry(1.3, 1.3, 1.3)
      : object.kind === 'sphere'
        ? new THREE.SphereGeometry(0.8, 28, 20)
        : object.kind === 'cylinder'
          ? new THREE.CylinderGeometry(0.62, 0.62, 1.6, 28)
          : new THREE.PlaneGeometry(2.8, 2.8)
    const material = standardMaterial(object.color)
    if (object.kind === 'plane') material.side = THREE.DoubleSide
    root = new THREE.Mesh(geometry, material)
  }
  root.name = object.name
  root.userData.directorObjectId = object.id
  root.position.set(...object.position)
  root.rotation.set(...object.rotation)
  root.scale.set(...object.scale)
  return root
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    materials.forEach((material) => material.dispose())
  })
}

function createThreeScene(
  state: Director3DSceneState,
  selectedObjectId: string | undefined,
) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#17191c')
  scene.add(new THREE.GridHelper(20, 20, '#555b63', '#2d3238'))
  scene.add(new THREE.HemisphereLight('#f5f1e8', '#252a31', 1.6))
  const keyLight = new THREE.DirectionalLight('#fff4d6', 2.2)
  keyLight.position.set(5, 8, 6)
  scene.add(keyLight)
  for (const object of state.objects) {
    const root = sceneObjectMesh(object)
    if (object.id === selectedObjectId) {
      root.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material]
        materials.forEach((material) => {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.emissive.set('#3b2418')
            material.emissiveIntensity = 0.5
          }
        })
      })
    }
    scene.add(root)
  }
  return scene
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('四视图 PNG 编码失败。'))
    }, 'image/png')
  })
}

export function Director3DViewport({
  title,
  scene,
  onChange,
  onExportViews,
}: {
  title: string
  scene: Director3DSceneState
  onChange(scene: Director3DSceneState): void
  onExportViews(blob: Blob): Promise<void> | void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const runtimeRef = useRef<DirectorRuntime | null>(null)
  const [selectedObjectId, setSelectedObjectId] = useState<string | undefined>(
    scene.objects[0]?.id,
  )
  const [rendererState, setRendererState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [exportStatus, setExportStatus] = useState('')

  useEffect(() => {
    if (
      !canvasRef.current ||
      !viewportRef.current ||
      typeof WebGLRenderingContext === 'undefined'
    ) {
      setRendererState('unavailable')
      return
    }
    const canvas = canvasRef.current
    const viewport = viewportRef.current
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        preserveDrawingBuffer: true,
      })
    } catch {
      setRendererState('unavailable')
      return
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    const width = Math.max(480, viewport.clientWidth || 720)
    const height = Math.max(280, viewport.clientHeight || 360)
    renderer.setSize(width, height, false)
    const threeScene = createThreeScene(scene, selectedObjectId)
    const camera = createCamera(scene.camera, width / height)
    const controls = new OrbitControls(camera, canvas)
    controls.target.set(...scene.camera.target)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.update()
    const saveCamera = () => {
      onChange({
        ...scene,
        camera: {
          ...scene.camera,
          position: tuple(camera.position),
          target: tuple(controls.target),
          zoom: camera.zoom,
          view: 'free',
        },
      })
    }
    controls.addEventListener('end', saveCamera)
    runtimeRef.current = { renderer, scene: threeScene, camera, controls }
    setRendererState('ready')
    let frame = 0
    const draw = () => {
      frame = window.requestAnimationFrame(draw)
      controls.update()
      renderer.render(threeScene, camera)
    }
    draw()

    return () => {
      window.cancelAnimationFrame(frame)
      controls.removeEventListener('end', saveCamera)
      controls.dispose()
      threeScene.children.forEach(disposeObject)
      renderer.dispose()
      runtimeRef.current = null
    }
  }, [onChange, scene, selectedObjectId])

  const addObject = (kind: Director3DObjectKind) => {
    const next = addDirectorSceneObject(scene, kind)
    setSelectedObjectId(next.objects.at(-1)?.id)
    onChange(next)
  }

  const changeView = (
    view: DirectorCameraView,
    projection: DirectorCameraProjection = scene.camera.projection,
  ) => onChange(applyDirectorCameraView(scene, view, projection))

  const exportViews = async () => {
    const runtime = runtimeRef.current
    if (!runtime) return
    setExportStatus('正在渲染四视图…')
    const tileWidth = 640
    const tileHeight = 360
    const output = document.createElement('canvas')
    output.width = tileWidth * 2
    output.height = tileHeight * 2
    const context = output.getContext('2d')
    if (!context) {
      setExportStatus('当前浏览器不支持 PNG 合成。')
      return
    }
    const viewport = viewportRef.current
    const restoreWidth = Math.max(480, viewport?.clientWidth || 720)
    const restoreHeight = Math.max(280, viewport?.clientHeight || 360)
    runtime.renderer.setSize(tileWidth, tileHeight, false)
    const views: DirectorCameraView[] = ['top', 'front', 'side', 'free']
    views.forEach((view, index) => {
      const cameraState = applyDirectorCameraView(scene, view).camera
      const camera = createCamera(cameraState, tileWidth / tileHeight)
      runtime.renderer.render(runtime.scene, camera)
      const x = (index % 2) * tileWidth
      const y = Math.floor(index / 2) * tileHeight
      context.drawImage(runtime.renderer.domElement, x, y, tileWidth, tileHeight)
      context.fillStyle = 'rgba(10, 12, 15, 0.82)'
      context.fillRect(x + 16, y + 16, 108, 36)
      context.fillStyle = '#ffffff'
      context.font = '20px sans-serif'
      context.fillText(`${viewCopy[view]}视图`, x + 28, y + 41)
    })
    runtime.renderer.setSize(restoreWidth, restoreHeight, false)
    runtime.renderer.render(runtime.scene, runtime.camera)
    try {
      await onExportViews(await canvasBlob(output))
      setExportStatus('四视图 PNG 已写入画布与资产库。')
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : '四视图导出失败。')
    }
  }

  return (
    <section className="director-3d" aria-label="导演台3D场景">
      <header className="director-3d__header">
        <div>
          <strong>3D 基础视口</strong>
          <span>网格地面 · OrbitControls</span>
        </div>
        <button
          type="button"
          disabled={rendererState !== 'ready'}
          onClick={() => void exportViews()}
        >
          导出四视图 PNG 到画布
        </button>
      </header>

      <div className="director-3d__workspace">
        <div
          ref={viewportRef}
          className="director-3d__viewport nodrag nopan nowheel"
          role="img"
          aria-label={`${title} 3D视口`}
          data-renderer={rendererState}
        >
          <canvas ref={canvasRef} />
          {rendererState === 'unavailable' ? (
            <p>WebGL 不可用，对象树与场景数据仍可编辑。</p>
          ) : null}
        </div>

        <aside className="director-3d__objects" aria-label="3D对象树面板">
          <strong>对象树</strong>
          <div className="director-3d__add-row" aria-label="添加3D对象">
            {(['cube', 'sphere', 'cylinder', 'plane', 'humanoid'] as const).map((kind) => (
              <button key={kind} type="button" onClick={() => addObject(kind)}>
                添加{objectCopy[kind]}
              </button>
            ))}
          </div>
          <ul role="tree" aria-label="3D对象树">
            {scene.objects.map((object) => (
              <li
                key={object.id}
                role="treeitem"
                aria-selected={selectedObjectId === object.id}
                aria-label={`${object.name} ${objectCopy[object.kind]}`}
              >
                <button
                  type="button"
                  aria-label={`选择${object.name}`}
                  onClick={() => setSelectedObjectId(object.id)}
                >
                  {objectCopy[object.kind]}
                </button>
                <input
                  aria-label={`${object.name}名称`}
                  value={object.name}
                  maxLength={40}
                  onChange={(event) =>
                    onChange(
                      renameDirectorSceneObject(
                        scene,
                        object.id,
                        event.currentTarget.value,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label={`删除${object.name}`}
                  onClick={() => {
                    const next = removeDirectorSceneObject(scene, object.id)
                    setSelectedObjectId(next.objects[0]?.id)
                    onChange(next)
                  }}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <div className="director-3d__camera" role="group" aria-label="3D相机控制">
        <button
          type="button"
          aria-pressed={scene.camera.projection === 'perspective'}
          onClick={() => changeView(scene.camera.view, 'perspective')}
        >
          透视投影
        </button>
        <button
          type="button"
          aria-pressed={scene.camera.projection === 'orthographic'}
          onClick={() => changeView(scene.camera.view, 'orthographic')}
        >
          正交投影
        </button>
        {(['top', 'front', 'side', 'free'] as const).map((view) => (
          <button
            key={view}
            type="button"
            aria-pressed={scene.camera.view === view}
            onClick={() => changeView(view)}
          >
            {viewCopy[view]}视图
          </button>
        ))}
        <button
          type="button"
          aria-describedby="director-trajectory-reason"
          disabled
        >
          运动轨迹（待接入）
        </button>
      </div>
      <p id="director-trajectory-reason" className="director-3d__disabled-reason">
        待接入运动运镜生成
      </p>
      {exportStatus ? <p role="status">{exportStatus}</p> : null}
    </section>
  )
}
