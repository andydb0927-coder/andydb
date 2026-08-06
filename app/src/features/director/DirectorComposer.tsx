import { useState, type FormEvent } from 'react'

import {
  parseDirectorCommand,
  type DirectorCommand,
} from './director-command'

interface DirectorComposerProps {
  selectedNodeId?: string
  onExecute(command: Exclude<DirectorCommand, { type: 'unknown' }>): void
}

function describeCommand(command: DirectorCommand) {
  switch (command.type) {
    case 'regenerate':
      return '重新生成所选节点，并保留当前版本。'
    case 'extend-shot':
      return '从所选节点扩展一个新的下游分镜。'
    case 'generate-video':
      return '从所选分镜生成一个新的下游视频节点。'
    case 'add-to-timeline':
      return '把所选片段加入时间线。'
    case 'remove-node':
      return '删除所选节点；相关下游内容会标记为来源已变更。'
    case 'replace-node':
      return '替换所选节点的内容，并保留旧版本。'
    case 'unknown':
      return command.suggestion
  }
}

export function DirectorComposer({
  selectedNodeId,
  onExecute,
}: DirectorComposerProps) {
  const [input, setInput] = useState('')
  const [proposal, setProposal] = useState<DirectorCommand>()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setProposal(parseDirectorCommand(input, { selectedNodeId }))
  }

  const execute = () => {
    if (!proposal || proposal.type === 'unknown') return
    onExecute(proposal)
    setProposal(undefined)
    setInput('')
  }

  return (
    <section
      className="floating-panel director-composer nodrag nopan"
      aria-labelledby="director-composer-title"
    >
      <div className="director-composer__heading">
        <h2 id="director-composer-title">AI 导演</h2>
        <span>{selectedNodeId ? '已读取所选节点' : '请先选择节点'}</span>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="director-command-input">告诉我下一步要做什么</label>
        <div className="director-composer__input-row">
          <textarea
            id="director-command-input"
            value={input}
            rows={2}
            placeholder="例如：扩展这个镜头"
            onChange={(event) => {
              setInput(event.target.value)
              setProposal(undefined)
            }}
          />
          <button type="submit" disabled={!input.trim()}>
            提交给 AI 导演
          </button>
        </div>
      </form>
      {proposal ? (
        <div className="director-composer__proposal" aria-live="polite">
          <p>{describeCommand(proposal)}</p>
          {proposal.type !== 'unknown' ? (
            <button type="button" onClick={execute}>
              执行
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
