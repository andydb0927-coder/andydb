import { Command, Link2, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import type { ImageGenerationSettings, NodeKind } from '../project/model'
import {
  defaultProviderRegistry,
  type ProviderRegistry,
} from '../generation/model-provider-registry'
import { AiPlaceholderBadge, AiPlaceholderNotice } from './AiPlaceholderNotice'
import { isImageAnalysisToolId } from '../generation/ark-image-analysis-provider'
import { optimizePromptLocally } from './local-prompt-optimizer'
import {
  executePromptCommand,
  filterPromptCommands,
  insertAutoLinkMention,
  matchAutoLinkCandidates,
  promptCommandSectionLabels,
  slashQuery,
  type AutoLinkCandidate,
  type PromptCommand,
  type PromptCommandContext,
} from './prompt-assist'

interface PromptAssistProps {
  context: PromptCommandContext
  prompt: string
  autoLinkEnabled: boolean
  candidates: AutoLinkCandidate[]
  linkedNodeIds: string[]
  providerRegistry?: ProviderRegistry
  onPromptChange(prompt: string): void
  onImageSettings?(settings: Partial<ImageGenerationSettings>): void
  onVideoParameters?(parameters: Record<string, string | number | boolean>): void
  onCreateNode?(kind: Extract<NodeKind, 'image' | 'storyboard' | 'video'>): void
  onApplyAutoLink?(candidate: AutoLinkCandidate): void
  onOpenAnalysisTool?(toolId: string, prompt?: string): void
}

export function PromptAssist({
  context,
  prompt,
  autoLinkEnabled,
  candidates,
  linkedNodeIds,
  providerRegistry = defaultProviderRegistry,
  onPromptChange,
  onImageSettings,
  onVideoParameters,
  onCreateNode,
  onApplyAutoLink,
  onOpenAnalysisTool,
}: PromptAssistProps) {
  const detectedQuery = slashQuery(prompt)
  const [forcedOpen, setForcedOpen] = useState(false)
  const [commandIndex, setCommandIndex] = useState(0)
  const [autoLinkIndex, setAutoLinkIndex] = useState(0)
  const [pendingAiCommand, setPendingAiCommand] = useState<PromptCommand>()
  const [optimizeStatus, setOptimizeStatus] = useState('')
  const commandOpen = !pendingAiCommand && (forcedOpen || detectedQuery !== undefined)
  const commands = useMemo(
    () => filterPromptCommands(context, detectedQuery ?? ''),
    [context, detectedQuery],
  )
  const autoLinkMatches = useMemo(
    () => commandOpen || !autoLinkEnabled
      ? []
      : matchAutoLinkCandidates(prompt, candidates, new Set(linkedNodeIds)),
    [autoLinkEnabled, candidates, commandOpen, linkedNodeIds, prompt],
  )

  useEffect(() => setCommandIndex(0), [context, detectedQuery, forcedOpen])
  useEffect(() => setAutoLinkIndex(0), [prompt])

  const runCommand = (index: number) => {
    const command = commands[index]
    if (!command) return
    if (command.aiProviderId) {
      if (isImageAnalysisToolId(command.aiProviderId) && onOpenAnalysisTool) {
        setForcedOpen(false)
        const scene = detectedQuery !== undefined ? prompt.slice(0, prompt.lastIndexOf('/')).trim() : prompt
        if (detectedQuery !== undefined) onPromptChange(scene)
        onOpenAnalysisTool(command.aiProviderId, scene)
        return
      }
      setPendingAiCommand(command)
      setForcedOpen(false)
      return
    }
    const result = executePromptCommand(command, prompt)
    onPromptChange(result.prompt)
    if (result.imageSettings) onImageSettings?.(result.imageSettings)
    if (result.videoParameters) onVideoParameters?.(result.videoParameters)
    if (result.createNodeKind) onCreateNode?.(result.createNodeKind)
    setForcedOpen(false)
  }

  const closeAiNotice = () => {
    setPendingAiCommand(undefined)
    if (detectedQuery !== undefined) {
      onPromptChange(prompt.slice(0, prompt.lastIndexOf('/')))
    }
  }

  const applyAutoLink = (index: number) => {
    const candidate = autoLinkMatches[index]
    if (!candidate) return
    onPromptChange(insertAutoLinkMention(prompt, candidate.title))
    onApplyAutoLink?.(candidate)
  }

  useEffect(() => {
    if (!commandOpen && autoLinkMatches.length === 0) return
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || !target.closest('.creative-node-composer')) {
        return
      }
      const count = commandOpen ? commands.length : autoLinkMatches.length
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        setForcedOpen(false)
        if (detectedQuery !== undefined) {
          onPromptChange(prompt.slice(0, prompt.lastIndexOf('/')))
        }
        return
      }
      if (!count || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.key === 'Enter') {
        if (commandOpen) runCommand(commandIndex)
        else applyAutoLink(autoLinkIndex)
        return
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1
      if (commandOpen) {
        setCommandIndex((current) => (current + delta + count) % count)
      } else {
        setAutoLinkIndex((current) => (current + delta + count) % count)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  })

  return (
    <div className="prompt-assist nodrag">
      <button
        type="button"
        className="prompt-assist__trigger"
        aria-label="打开 Slash 命令"
        aria-expanded={commandOpen}
        onClick={() => setForcedOpen((open) => !open)}
      >
        <Command aria-hidden="true" />/
      </button>
      <button
        type="button"
        className="prompt-assist__optimizer"
        aria-label="本地优化提示词"
        disabled={!prompt.trim()}
        title="本地规则立即可用；待接入Seedance提示词优化服务"
        onClick={() => {
          const optimized = optimizePromptLocally(prompt, context)
          if (!optimized) return
          onPromptChange(optimized)
          setOptimizeStatus('本地规则优化完成；真实 AI 优化待接入。')
        }}
      >
        <Sparkles aria-hidden="true" />优化<AiPlaceholderBadge compact />
      </button>
      {commandOpen ? (
        <section className="prompt-command-panel" role="dialog" aria-label="Slash 命令面板">
          <header>
            <strong>Slash 命令</strong>
            <span>↑↓ 选择 · Enter 执行 · Esc 关闭</span>
          </header>
          {(['preset', 'tool', 'parameter'] as const).map((section) => {
            const sectionCommands = commands.filter((command) => command.section === section)
            if (!sectionCommands.length) return null
            return (
              <div key={section} className="prompt-command-panel__section">
                <p>{promptCommandSectionLabels[section]}</p>
                <div role="listbox" aria-label={promptCommandSectionLabels[section]}>
                  {sectionCommands.map((command) => {
                    const index = commands.indexOf(command)
                    return (
                      <button
                        key={command.id}
                        type="button"
                        role="option"
                        aria-selected={index === commandIndex}
                        onMouseEnter={() => setCommandIndex(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => runCommand(index)}
                      >
                        <span>/{command.slash}</span>
                        <strong>{command.label}</strong>
                        <small>{command.description}</small>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {commands.length === 0 ? <p>没有匹配的已注册命令</p> : null}
        </section>
      ) : null}
      {autoLinkMatches.length ? (
        <section className="autolink-candidates" aria-label="AutoLink 本地候选">
          <header><Link2 aria-hidden="true" /><strong>AutoLink 本地匹配</strong></header>
          <div role="listbox" aria-label="AutoLink 本地候选列表">
            {autoLinkMatches.map((candidate, index) => (
              <button
                key={candidate.nodeId}
                type="button"
                role="option"
                aria-selected={index === autoLinkIndex}
                onMouseEnter={() => setAutoLinkIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyAutoLink(index)}
              >
                <strong>{candidate.title}</strong>
                <span>{candidate.tags.slice(0, 3).join(' · ')}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {optimizeStatus ? <p className="prompt-assist__status" role="status">{optimizeStatus}</p> : null}
      {pendingAiCommand?.aiProviderId ? (
        <AiPlaceholderNotice
          provider={providerRegistry.require(pendingAiCommand.aiProviderId)}
          prompt={pendingAiCommand.promptText ?? ''}
          onCopy={() => {
            const result = executePromptCommand(pendingAiCommand, prompt)
            onPromptChange(result.prompt)
          }}
          onClose={closeAiNotice}
        />
      ) : null}
    </div>
  )
}
