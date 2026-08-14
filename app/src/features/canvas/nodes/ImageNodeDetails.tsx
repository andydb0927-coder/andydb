import { Download, SlidersHorizontal, X, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import type { CreativeNodeData } from '../node-types'

function downloadUrl(url: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
}

export function ImageGenerationPanel({ data }: { data: CreativeNodeData }) {
  const [advanced, setAdvanced] = useState(false)
  const activeVersion = data.node.versions.find(
    ({ id }) => id === data.node.activeVersionId,
  )

  useEffect(() => setAdvanced(false), [data.node.id])

  return (
    <section
      className="image-generation-panel nodrag"
      role="region"
      aria-label={`${data.node.title} 生成参数`}
    >
      <label className="image-generation-panel__prompt">
        <span>提示词</span>
        <textarea defaultValue={activeVersion?.prompt} rows={4} />
      </label>
      <div className="image-generation-panel__controls">
        <button type="button" aria-label="模型 Style Image V8.2">
          Style Image V8.2
        </button>
        <button type="button">4 张</button>
        <button type="button">16:9</button>
        <button type="button">自适应</button>
        <button type="button">参考</button>
        <button type="button">风格</button>
        <button
          type="button"
          aria-label={advanced ? '收起高级设置' : '展开高级设置'}
          aria-expanded={advanced}
          onClick={() => setAdvanced((open) => !open)}
        >
          <SlidersHorizontal aria-hidden="true" />
        </button>
      </div>
      {advanced ? (
        <div className="image-generation-panel__advanced">
          <label>个性化风格 P 值<input type="text" defaultValue="" /></label>
          <label>风格化程度<input type="range" min="0" max="1000" step="50" defaultValue="150" /></label>
          <label>怪异度<input type="range" min="0" max="3000" step="50" defaultValue="50" /></label>
          <label>多样性<input type="range" min="0" max="100" step="5" defaultValue="5" /></label>
          <label className="image-generation-panel__autolink">
            <input type="checkbox" defaultChecked />
            智能引用 AutoLink
          </label>
        </div>
      ) : null}
      <div className="image-generation-panel__submit">
        <span><Zap aria-hidden="true" />预计成本 15</span>
        <button
          type="button"
          aria-label="生成图片，预计成本 15"
          title="本地演示，不连接真实生成"
          onClick={data.onLocalImageGenerate}
        >
          生成
        </button>
      </div>
    </section>
  )
}

export function ImageResults({ data }: { data: CreativeNodeData }) {
  const [open, setOpen] = useState(false)
  const [pendingResultId, setPendingResultId] = useState<string>()
  const results = data.imageResults ?? []
  const activeResultId = data.node.activeResultId ?? results[0]?.id

  useEffect(() => {
    if (!data.contextual) {
      setOpen(false)
      setPendingResultId(undefined)
    }
  }, [data.contextual])

  if (results.length < 2) return null

  return (
    <>
      <button
        type="button"
        className="creative-node__result-count nodrag"
        aria-label={`${open ? '收起' : '查看'} ${results.length} 张结果`}
        aria-expanded={open}
        onClick={() => {
          data.onSelect()
          setOpen((expanded) => !expanded)
        }}
      >
        {results.length} 张
      </button>
      {open ? (
        <section
          className="image-results-grid nodrag"
          role="region"
          aria-label={`${data.node.title} 的 ${results.length} 张结果`}
        >
          {results.map((result, index) => {
            const active = result.id === activeResultId
            return (
              <article key={result.id} data-active={active}>
                <img src={result.asset.url} alt={`结果 ${index + 1}`} />
                <div>
                  <button
                    type="button"
                    aria-label={`下载结果 ${index + 1}`}
                    onClick={() => downloadUrl(result.asset.url, `${data.node.title}-${index + 1}.png`)}
                  >
                    <Download aria-hidden="true" />下载
                  </button>
                  {active ? (
                    <button type="button" onClick={() => setOpen(false)}>
                      收起
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`将结果 ${index + 1} 设为主图`}
                      onClick={() => setPendingResultId(result.id)}
                    >
                      设为主图
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </section>
      ) : null}
      {pendingResultId ? createPortal(
        <div className="image-result-confirm nodrag" role="alertdialog" aria-modal="true" aria-label="设为主图">
          <div>
            <button type="button" aria-label="关闭设为主图提示" onClick={() => setPendingResultId(undefined)}>
              <X aria-hidden="true" />
            </button>
            <h2>设为主图</h2>
            <p>下游引用将使用新的主图。</p>
            <div>
              <button type="button" onClick={() => setPendingResultId(undefined)}>取消</button>
              <button
                type="button"
                onClick={() => {
                  data.onSetActiveResult?.(pendingResultId)
                  setPendingResultId(undefined)
                }}
              >
                确认设为主图
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  )
}
