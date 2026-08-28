import { useEffect, useId, useRef, useState } from 'react'
import type { Director3DObjectKind, Director3DSceneState, Director3DVector, DirectorCameraProjection, DirectorCameraView } from '../project/model'
import { addDirectorSceneObject, applyDirectorCameraView, directorAssetKinds, directorLightState, directorObjectNames, directorViewNames, removeDirectorSceneObject, renameDirectorSceneObject } from './director-3d-scene'
import { createDirectorRuntime, DIRECTOR_ASSET_MIME, type DirectorRuntime, type DirectorSnapshotKind } from './director-3d-runtime'
import { DirectorSceneControls } from './DirectorSceneControls'

export function Director3DViewport({ title, scene, onChange, onExportViews }: {
  title: string
  scene: Director3DSceneState
  onChange(scene: Director3DSceneState): void
  onExportViews(blob: Blob, kind?: DirectorSnapshotKind): Promise<void> | void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const runtimeRef = useRef<DirectorRuntime | null>(null)
  const lightHandles = useRef(new Map<string, HTMLButtonElement>())
  const propsRef = useRef({ scene, onChange, onExportViews })
  propsRef.current = { scene, onChange, onExportViews }
  const exportingRef = useRef(false)
  const aliveRef = useRef(true)
  const reasonId = useId()
  const [selectedObjectId, setSelectedObjectId] = useState<string | undefined>(scene.objects[0]?.id)
  const [rendererState, setRendererState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [exportStatus, setExportStatus] = useState('')
  const [exporting, setExporting] = useState(false)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    aliveRef.current = true
    if (!canvasRef.current || !viewportRef.current || typeof WebGLRenderingContext === 'undefined') {
      setRendererState('unavailable')
      return () => { aliveRef.current = false }
    }
    let runtime: DirectorRuntime
    try {
      runtime = createDirectorRuntime(canvasRef.current, viewportRef.current, propsRef.current.scene, {
        change: next => propsRef.current.onChange(next), preview: setPlaying,
        handles: points => points.forEach(point => {
          const button = lightHandles.current.get(point.id)
          if (button) {
            button.style.left = `${point.x}px`; button.style.top = `${point.y}px`
            button.style.visibility = point.visible ? 'visible' : 'hidden'
          }
        }),
      })
    } catch {
      setRendererState('unavailable')
      return () => { aliveRef.current = false }
    }
    runtimeRef.current = runtime
    setRendererState('ready')
    return () => { aliveRef.current = false; runtime.dispose(); runtimeRef.current = null }
  }, [])

  useEffect(() => { runtimeRef.current?.update(scene, selectedObjectId) }, [scene, selectedObjectId])
  const addObject = (kind: Director3DObjectKind, position?: Director3DVector) => {
    const next = addDirectorSceneObject(propsRef.current.scene, kind)
    const object = next.objects.at(-1)!
    if (position) object.position = position
    setSelectedObjectId(object.id)
    onChange(next)
  }
  const changeView = (view: DirectorCameraView, projection: DirectorCameraProjection = scene.camera.projection) => onChange(applyDirectorCameraView(scene, view, projection))
  const exportImage = async (kind: DirectorSnapshotKind) => {
    const runtime = runtimeRef.current
    if (!runtime || exportingRef.current) return
    exportingRef.current = true; setExporting(true)
    const label = kind === 'views' ? '四视图' : '场景快照'
    setExportStatus(`正在渲染${label}…`)
    const save = propsRef.current.onExportViews
    try {
      const blob = await runtime.snapshot(kind)
      if (!aliveRef.current) return
      await save(blob, kind)
      if (aliveRef.current) setExportStatus(`${label} PNG 已写入画布与资产库。`)
    } catch (error) {
      if (aliveRef.current) setExportStatus(error instanceof Error ? error.message : `${label}导出失败，请重试。`)
    } finally {
      exportingRef.current = false
      if (aliveRef.current) setExporting(false)
    }
  }

  return <section className="director-3d" aria-label="导演台3D场景">
    <header className="director-3d__header">
      <div><strong>3D 导演视口</strong><span>本地场景 · 布光 / 机位 / 运镜</span></div>
      {(['snapshot', 'views'] as const).map(kind => <button key={kind} type="button" disabled={rendererState !== 'ready' || exporting} onClick={() => void exportImage(kind)}>
        导出{kind === 'views' ? '四视图' : '场景快照'} PNG 到画布
      </button>)}
    </header>
    <div className="director-3d__workspace">
      <div ref={viewportRef} className="director-3d__viewport nodrag nopan nowheel" role="group" aria-label={`${title} 3D场景操作`} data-renderer={rendererState}
        onDragOver={event => { if (event.dataTransfer.types.includes(DIRECTOR_ASSET_MIME)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy' } }}
        onDrop={event => {
          const value = event.dataTransfer.getData(DIRECTOR_ASSET_MIME)
          const kind = directorAssetKinds.find(kind => kind === value)
          if (!kind) return
          event.preventDefault(); event.stopPropagation()
          addObject(kind, runtimeRef.current?.groundPoint(event.clientX, event.clientY))
        }}>
        <canvas ref={canvasRef} role="img" aria-label={`${title} 3D视口`} data-renderer={rendererState} />
        {rendererState === 'ready' ? directorLightState(scene).lights.map(light => <button type="button" key={light.id} className="director-3d__light-handle"
          ref={element => { if (element) lightHandles.current.set(light.id, element); else lightHandles.current.delete(light.id) }}
          aria-label={`拖动${light.name}`} title={`拖动${light.name}，或在灯光布置中输入 XYZ`}
          onPointerDown={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); runtimeRef.current?.startLightDrag(light.id, event.clientX, event.clientY) }}
          onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) runtimeRef.current?.moveLightDrag(event.clientX, event.clientY) }}
          onPointerUp={event => { event.stopPropagation(); runtimeRef.current?.endLightDrag(true); event.currentTarget.releasePointerCapture(event.pointerId) }}
          onPointerCancel={() => runtimeRef.current?.endLightDrag(false)} onLostPointerCapture={() => runtimeRef.current?.endLightDrag(false)}>☀<span>{light.name}</span></button>) : null}
        {rendererState === 'unavailable' ? <p>WebGL 不可用，对象树与场景数据仍可编辑。</p> : null}
      </div>
      <aside className="director-3d__objects" aria-label="3D对象树面板">
        <strong>本地 3D 资产 · 拖入视口</strong>
        <div className="director-3d__add-row" role="group" aria-label="本地3D资产库">
          {directorAssetKinds.map(kind => <button type="button" key={kind} draggable onClick={() => addObject(kind)}
            onDragStart={event => { event.stopPropagation(); event.dataTransfer.setData(DIRECTOR_ASSET_MIME, kind); event.dataTransfer.effectAllowed = 'copy' }}>添加{directorObjectNames[kind]}</button>)}
        </div>
        <strong>对象树</strong>
        <div className="director-3d__add-row" aria-label="添加3D对象">
          {(['cube', 'sphere', 'cylinder', 'plane', 'humanoid'] as const).map(kind => <button key={kind} type="button" onClick={() => addObject(kind)}>添加{directorObjectNames[kind]}</button>)}
        </div>
        <ul role="tree" aria-label="3D对象树">{scene.objects.map(object => <li key={object.id} role="treeitem" aria-selected={selectedObjectId === object.id} aria-label={`${object.name} ${directorObjectNames[object.kind]}`}>
          <button type="button" aria-label={`选择${object.name}`} onClick={() => setSelectedObjectId(object.id)}>{directorObjectNames[object.kind]}</button>
          <input aria-label={`${object.name}名称`} value={object.name} maxLength={40} onChange={event => onChange(renameDirectorSceneObject(scene, object.id, event.currentTarget.value))} />
          <button type="button" aria-label={`删除${object.name}`} onClick={() => { const next = removeDirectorSceneObject(scene, object.id); setSelectedObjectId(next.objects[0]?.id); onChange(next) }}>删除</button>
        </li>)}</ul>
      </aside>
    </div>
    <div className="director-3d__camera" role="group" aria-label="3D相机控制">
      {(['perspective', 'orthographic'] as const).map(projection => <button key={projection} type="button" aria-pressed={scene.camera.projection === projection} onClick={() => changeView(scene.camera.view, projection)}>{projection === 'perspective' ? '透视' : '正交'}投影</button>)}
      {(['top', 'front', 'side', 'free'] as const).map(view => <button key={view} type="button" aria-pressed={scene.camera.view === view && !scene.camera.preset} onClick={() => changeView(view)}>{directorViewNames[view]}视图</button>)}
      <button type="button" disabled aria-describedby={reasonId}>AI 运镜生成（待接入）</button>
    </div>
    <p id={reasonId} className="director-3d__disabled-reason">待接入运动运镜生成</p>
    <DirectorSceneControls scene={scene} onChange={onChange} ready={rendererState === 'ready'} playing={playing} onPlay={() => runtimeRef.current?.play()} onStop={() => runtimeRef.current?.stop()} />
    {exportStatus ? <p role="status" aria-label="3D导出状态">{exportStatus}</p> : null}
  </section>
}
