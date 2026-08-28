import { useId, useState } from 'react'
import type { Director3DSceneState, Director3DVector, DirectorCameraPreset, DirectorLightingPreset } from '../project/model'
import { applyDirectorCameraPreset, applyDirectorLightingPreset, directorCameraPresets, directorLightState, directorLightingPresets, moveDirectorLight } from './director-3d-scene'

function Coordinates({ name, value, onChange, ground = false }: { name: string; value: Director3DVector; onChange(value: Director3DVector): void; ground?: boolean }) {
  return <div className="director-3d__coordinates">{(['X', 'Y', 'Z'] as const).map((axis, index) => <label key={axis}>
    <span>{axis}</span><input type="number" aria-label={`${name} ${axis}`} min={ground && index === 1 ? 0 : -30} max={30} step={.1} value={Math.round(value[index] * 100) / 100}
      onChange={event => {
        const number = event.currentTarget.valueAsNumber
        if (!Number.isFinite(number)) return
        const next: Director3DVector = [...value]
        next[index] = Math.min(30, Math.max(ground && index === 1 ? 0 : -30, number))
        onChange(next)
      }} />
  </label>)}</div>
}

export function DirectorSceneControls({ scene, onChange, ready, playing, onPlay, onStop }: {
  scene: Director3DSceneState; onChange(scene: Director3DSceneState): void
  ready: boolean; playing: boolean; onPlay(): void; onStop(): void
}) {
  const reasonId = useId()
  const [selectedLight, setSelectedLight] = useState('key')
  const lighting = directorLightState(scene)
  const light = lighting.lights.find(item => item.id === selectedLight) ?? lighting.lights[0]
  const trajectory = scene.trajectory ?? { points: [], durationSeconds: 5 }
  const playReason = !ready ? 'WebGL 不可用，暂不能播放运镜预览。' : trajectory.points.length < 2 ? '至少记录两个位置关键帧后可播放。' : '仅本地预览，不生成视频、不消耗积分；结束后恢复保存机位。'
  return <>
    <div className="director-3d__presets" role="group" aria-label="相机预设">
      {(Object.entries(directorCameraPresets) as [DirectorCameraPreset, typeof directorCameraPresets[DirectorCameraPreset]][]).map(([id, preset]) =>
        <button key={id} type="button" aria-pressed={scene.camera.preset === id} onClick={() => onChange(applyDirectorCameraPreset(scene, id))}>{preset.name}机位</button>)}
      <label>焦距 <input type="number" min={12} max={200} step={1} aria-label="相机焦距（毫米）" value={scene.camera.focalLength ?? ''} placeholder="46°视角"
        disabled={scene.camera.projection === 'orthographic'} title={scene.camera.projection === 'orthographic' ? '正交投影不使用焦距，请切换透视投影。' : '毫米'}
        onChange={event => {
          const number = event.currentTarget.valueAsNumber
          if (Number.isFinite(number)) onChange({ ...scene, camera: { ...scene.camera, focalLength: Math.max(12, Math.min(200, number)) } })
        }} /> mm</label>
      {scene.camera.projection === 'orthographic' ? <small>正交投影不使用焦距，请切换透视投影。</small> : null}
    </div>
    <details className="director-3d__settings" open>
      <summary>灯光布置</summary>
      <div className="director-3d__presets" role="group" aria-label="灯光预设">
        {(Object.entries(directorLightingPresets) as [DirectorLightingPreset, string][]).map(([id, name]) =>
          <button key={id} type="button" aria-pressed={lighting.preset === id} onClick={() => onChange(applyDirectorLightingPreset(scene, id))}>{name}</button>)}
      </div>
      {light ? <div className="director-3d__light-editor">
        <label>定位灯光 <select aria-label="当前编辑灯光" value={light.id} onChange={event => setSelectedLight(event.currentTarget.value)}>
          {lighting.lights.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <Coordinates name={light.name} value={light.position} ground onChange={position => onChange(moveDirectorLight(scene, light.id, position))} />
      </div> : null}
      <small>拖动视口内灯光手柄定位，也可输入 XYZ。超出视野时请切换全景机位或输入坐标。</small>
    </details>
    <details className="director-3d__settings">
      <summary>运镜轨迹预览</summary>
      <div className="director-3d__presets">
        <button type="button" disabled={playing || trajectory.points.length >= 32} onClick={() => onChange({ ...scene, trajectory: { ...trajectory, points: [...trajectory.points, [...scene.camera.position]] } })}>记录当前位置为关键帧</button>
        <label>时长 <input type="number" aria-label="运镜时长（秒）" min={1} max={60} step={1} value={trajectory.durationSeconds ?? 5} disabled={playing}
          onChange={event => {
            const number = event.currentTarget.valueAsNumber
            if (Number.isFinite(number)) onChange({ ...scene, trajectory: { ...trajectory, durationSeconds: Math.min(60, Math.max(1, number)) } })
          }} /> 秒</label>
        <button type="button" disabled={!ready || trajectory.points.length < 2 || playing} aria-describedby={reasonId} onClick={onPlay}>播放运镜预览</button>
        <button type="button" disabled={!playing} onClick={onStop}>停止预览</button>
      </div>
      <small id={reasonId}>{playReason}</small>
      {trajectory.points.length >= 32 ? <small>最多 32 个关键帧，请先删除不需要的帧。</small> : null}
      <ol aria-label="位置关键帧" className="director-3d__keyframes">
        {trajectory.points.map((point, index) => <li key={index}>
          <span>#{index + 1}</span><fieldset disabled={playing}>
            <Coordinates name={`关键帧 ${index + 1}`} value={point} onChange={position => onChange({ ...scene, trajectory: { ...trajectory, points: trajectory.points.map((value, i) => i === index ? position : value) } })} />
          </fieldset>
          <button type="button" disabled={playing} aria-label={`删除关键帧 ${index + 1}`} onClick={() => onChange({ ...scene, trajectory: { ...trajectory, points: trajectory.points.filter((_, i) => i !== index) } })}>删除</button>
        </li>)}
      </ol>
      <p role="status" aria-label="运镜预览状态">{playing ? '正在播放本地运镜预览' : `已记录 ${trajectory.points.length} 个关键帧 · 线性插值`}</p>
    </details>
  </>
}
