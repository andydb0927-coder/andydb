import {
  AtSign,
  Camera,
  ChevronDown,
  Film,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import type { VideoDerivedTool } from '../../project/model'
import type { CreativeNodeData } from '../node-types'

type VideoSurface =
  | 'reference'
  | 'mark'
  | 'effects'
  | 'subjects'
  | 'characters'
  | 'camera-motion'
  | 'references'

const cameraMotions = [
  '固定镜头',
  '跟随拍摄',
  '盘旋抬升',
  '盘旋下降',
  '镜头上摇',
  '镜头下摇',
  '镜头左摇',
  '镜头右摇',
  '镜头上升',
  '镜头下降',
  '镜头左移',
  '镜头右移',
  '镜头前推',
  '镜头后移',
  '变焦推进',
  '变焦拉远',
  '柯克变焦',
  '环绕拍摄',
  '滚筒旋转',
  '第一视角',
  '无人机',
  '高空航拍',
  '手持拍摄',
] as const

const effectSamples = [
  '小蜜蜂运镜',
  '穿云而入',
  '飞跃地平线',
  '逆转引力',
  '地球缩放',
  '产品扫光',
] as const

const subjectSamples = ['星月吊坠', 'Isabella 现代装', 'Sophia', 'Noah'] as const
const characterSamples = [
  '清新少女',
  '精英大佬',
  '温柔熟男',
  '古风男主',
  '古风女主',
] as const

function ToolConfirmation({
  tool,
  sourceTitle,
  onCancel,
  onConfirm,
}: {
  tool: VideoDerivedTool
  sourceTitle: string
  onCancel(): void
  onConfirm(): void
}) {
  return createPortal(
    <div
      className="video-tool-confirm nodrag"
      role="alertdialog"
      aria-modal="true"
      aria-label={`添加${tool}工具节点`}
    >
      <div>
        <button type="button" aria-label="关闭添加工具节点提示" onClick={onCancel}>
          <X aria-hidden="true" />
        </button>
        <h2>将添加工具节点</h2>
        <p>“{tool}”会作为“{sourceTitle}”的派生节点插入画布并建立连线。</p>
        <p>本地演示不会提交真实生成或消耗积分。</p>
        <div>
          <button type="button" onClick={onCancel}>取消</button>
          <button type="button" onClick={onConfirm}>确认添加</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ReferenceSurface({
  surface,
  data,
  onClose,
}: {
  surface: VideoSurface
  data: CreativeNodeData
  onClose(): void
}) {
  if (surface === 'reference' || surface === 'mark') {
    const reference = surface === 'reference'
    return (
      <section
        className="video-selection-mode"
        role="region"
        aria-label={reference ? '从画布选择参考' : '元素选择模式'}
      >
        <strong>{reference ? '从画布选择参考' : '元素选择模式'}</strong>
        <p>{reference ? '在当前画布中添加参考' : '点击图片选择局部元素'}</p>
        <div>
          <button type="button" onClick={onClose}>返回节点</button>
          <button type="button" onClick={onClose}>退出</button>
        </div>
      </section>
    )
  }

  if (surface === 'references') {
    return (
      <section className="video-reference-popover" role="region" aria-label={`${data.videoReferences?.length ?? 0} 个引用`}>
        <strong>{data.videoReferences?.length ?? 0} @</strong>
        {data.videoReferences?.map((reference) => (
          <figure key={reference.id}>
            <img src={reference.asset.url} alt="" />
            <figcaption>{reference.title}</figcaption>
          </figure>
        ))}
      </section>
    )
  }

  const config =
    surface === 'effects'
      ? {
          title: '特效面板',
          search: '搜索特效名称、作者',
          tabs: ['特效广场', '我的收藏', '最近使用'],
          items: effectSamples,
        }
      : surface === 'subjects'
        ? {
            title: '我的主体',
            search: '搜索主体',
            tabs: ['我的主体'],
            items: subjectSamples,
          }
        : surface === 'characters'
          ? {
              title: '角色库',
              search: '搜索角色',
              tabs: ['公共角色'],
              items: characterSamples,
            }
          : {
              title: '运镜面板',
              search: '搜索运镜名称',
              tabs: ['运镜广场', '我的收藏', '我的运镜'],
              items: cameraMotions,
            }

  return (
    <section className="video-library-dialog nodrag" role="dialog" aria-modal="false" aria-label={config.title}>
      <div className="video-library-dialog__heading">
        <h3>{config.title}</h3>
        <button type="button" aria-label={`关闭${config.title}`} onClick={onClose}><X aria-hidden="true" /></button>
      </div>
      <div className="video-library-dialog__tabs" role="tablist">
        {config.tabs.map((tab, index) => <button key={tab} type="button" role="tab" aria-selected={index === 0}>{tab}</button>)}
      </div>
      <label>搜索<input type="search" placeholder={config.search} /></label>
      {surface === 'subjects' ? <button type="button" disabled>创建主体</button> : null}
      {surface === 'characters' ? <p>第 1 页 · 每页 10 项</p> : null}
      <div className="video-library-dialog__grid">
        {config.items.map((item) => (
          <article key={item}>
            <span aria-hidden="true"><Sparkles /></span>
            <strong>{item}</strong>
            <button type="button" disabled>{surface === 'subjects' ? '查看 / 使用' : '预览'}</button>
          </article>
        ))}
      </div>
    </section>
  )
}

export function VideoGenerationPanel({ data }: { data: CreativeNodeData }) {
  const [advanced, setAdvanced] = useState(false)
  const [surface, setSurface] = useState<VideoSurface>()
  const [pendingTool, setPendingTool] = useState<VideoDerivedTool>()
  const activeVersion = data.node.versions.find(({ id }) => id === data.node.activeVersionId)
  const referenceCount = data.videoReferences?.length ?? 0

  useEffect(() => {
    setAdvanced(false)
    setSurface(undefined)
    setPendingTool(undefined)
  }, [data.node.id])

  useEffect(() => {
    if (!surface && !pendingTool) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSurface(undefined)
      setPendingTool(undefined)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [pendingTool, surface])

  const requestFrame = (tool: VideoDerivedTool) => {
    setSurface(undefined)
    setPendingTool(tool)
  }

  return (
    <section className="video-generation-panel nodrag" role="region" aria-label={`${data.node.title} 生成参数`}>
      <div className="video-layer-heading"><span>帧操作</span></div>
      <div className="video-frame-tools" role="toolbar" aria-label="帧操作">
        <button type="button" onClick={() => requestFrame('截取首帧')}>截取首帧</button>
        <button type="button" onClick={() => requestFrame('截取尾帧')}>截取尾帧</button>
        <button type="button" onClick={() => requestFrame('截取当前帧')}>截取当前帧</button>
        <button type="button" aria-label="相机截取当前帧" onClick={() => requestFrame('截取当前帧')}><Camera aria-hidden="true" /></button>
      </div>

      <div className="video-layer-heading"><span>引用与控制</span></div>
      <div className="video-reference-tools" role="toolbar" aria-label="引用与控制">
        <button type="button" onClick={() => setSurface('reference')}>参考</button>
        <button type="button" onClick={() => setSurface('mark')}>标记</button>
        <button type="button" onClick={() => setSurface('effects')}>特效</button>
        <button type="button" onClick={() => setSurface('subjects')}>主体</button>
        <button type="button" onClick={() => setSurface('characters')}>角色库</button>
        <button type="button" onClick={() => setSurface('camera-motion')}>运镜</button>
        <button type="button" onClick={() => setSurface('references')}><AtSign aria-hidden="true" />{referenceCount} @</button>
      </div>
      {surface
        ? createPortal(
            <ReferenceSurface
              surface={surface}
              data={data}
              onClose={() => setSurface(undefined)}
            />,
            document.body,
          )
        : null}

      <div className="video-layer-heading"><span>生成参数</span></div>
      <label className="video-generation-panel__prompt">
        <span>提示词</span>
        <textarea aria-label="提示词" maxLength={2000} rows={5} defaultValue={activeVersion?.prompt} />
        <small>最多 2000 字</small>
      </label>
      <div className="video-generation-panel__selectors">
        <label>模型<select aria-label="模型" defaultValue="Kling O3">
          {['Kling O3', 'Seedance 2.5', 'Hailuo 2.3', 'Wan 2.7', 'Vidu Q3 Pro'].map((model) => <option key={model}>{model}</option>)}
        </select></label>
        <label>生成模式<select aria-label="生成模式" defaultValue="全能参考">
          <option disabled>文生视频</option>
          <option>全能参考</option>
          <option>图生视频</option>
          <option>首尾帧</option>
          <option disabled>视频编辑</option>
        </select></label>
        <label>比例<select aria-label="比例" defaultValue="16:9"><option>16:9</option><option>1:1</option><option>9:16</option></select></label>
        <label>时长<select aria-label="时长" defaultValue="3">{Array.from({ length: 13 }, (_, index) => index + 3).map((seconds) => <option key={seconds} value={seconds}>{seconds} 秒</option>)}</select></label>
        <label>生成数量<select aria-label="生成数量" defaultValue="1"><option value="1">1 个</option></select></label>
        <label>画质<select aria-label="画质" defaultValue="标准"><option>标准</option><option>高清</option><option>4K</option></select></label>
        <label>声音<select aria-label="声音" defaultValue="关闭"><option>关闭</option><option>开启</option></select></label>
        <label className="video-generation-panel__toggle"><input type="checkbox" aria-label="智能分镜" />智能分镜</label>
      </div>
      <button
        type="button"
        className="video-generation-panel__advanced-toggle"
        aria-label={advanced ? '收起高级设置' : '展开高级设置'}
        aria-expanded={advanced}
        onClick={() => setAdvanced((value) => !value)}
      >
        <SlidersHorizontal aria-hidden="true" />高级设置<ChevronDown aria-hidden="true" />
      </button>
      {advanced ? (
        <label className="video-generation-panel__autolink">
          <input type="checkbox" aria-label="智能引用 AutoLink" defaultChecked />
          智能引用 AutoLink
        </label>
      ) : null}
      <div className="video-generation-panel__submit">
        <span><Zap aria-hidden="true" />预计成本 24</span>
        <button type="button" title="本地演示，不连接真实生成" onClick={data.onLocalVideoGenerate}>
          <Film aria-hidden="true" />生成视频
        </button>
      </div>

      {pendingTool ? (
        <ToolConfirmation
          tool={pendingTool}
          sourceTitle={data.node.title}
          onCancel={() => setPendingTool(undefined)}
          onConfirm={() => {
            data.onCreateVideoToolNode?.(pendingTool)
            setPendingTool(undefined)
          }}
        />
      ) : null}
    </section>
  )
}

export function VideoToolDetails({ data }: { data: CreativeNodeData }) {
  const config = data.node.videoTool
  if (!config) return null

  if (config.kind === 'upscale') {
    return (
      <section className="video-tool-node-panel nodrag" role="region" aria-label="视频高清参数">
        <label>模型<select defaultValue={config.model}><option>Topazlabs</option><option>HuoShan-画质增强</option></select></label>
        <label>分辨率<select defaultValue={config.resolution}><option>1080P</option><option>2K</option><option>4K</option></select></label>
        <label>补帧<select defaultValue={config.interpolation}><option>不补帧</option><option>高质量补帧</option></select></label>
        <label>慢放倍数<select defaultValue={config.slowMotion}><option>1x</option><option>2x</option><option>3x</option><option>5x</option></select></label>
        <div><span>预计成本 {config.cost}</span><button type="button" title="本地演示，不连接真实生成">提交高清</button></div>
      </section>
    )
  }

  if (config.kind === 'frame-analysis') {
    return (
      <section className="video-tool-node-panel nodrag" role="region" aria-label="逐帧拉片参数">
        <strong>{config.model}</strong>
        <p>00:03 · 1280×720</p>
        <button type="button">替换素材</button>
        {config.dimensions.map((dimension) => <label key={dimension}><input type="checkbox" defaultChecked />{dimension}</label>)}
        <button type="button" title="本地演示，不连接真实分析">开始拉片</button>
      </section>
    )
  }

  return (
    <section className="video-tool-node-panel nodrag" role="region" aria-label="截图参数">
      <strong>{config.frame}截图</strong>
      <p>来自上游视频的本地演示帧。</p>
    </section>
  )
}
