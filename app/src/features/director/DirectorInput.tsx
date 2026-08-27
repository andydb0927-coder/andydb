import type { ChangeEventHandler, FormEventHandler, Ref } from 'react'

interface DirectorInputProps {
  input: string
  inputRef: Ref<HTMLTextAreaElement>
  referenceMenuOpen: boolean
  assetLibraryOpen: boolean
  onChange(value: string): void
  onSubmit: FormEventHandler<HTMLFormElement>
  onFiles: ChangeEventHandler<HTMLInputElement>
  onToggleReference(): void
  onToggleAssets(): void
}

/** Controlled input only; proposals and execution permission belong to the composer. */
export function DirectorInput({ input, inputRef, referenceMenuOpen, assetLibraryOpen,
  onChange, onSubmit, onFiles, onToggleReference, onToggleAssets,
}: DirectorInputProps) {
  return (
    <form onSubmit={onSubmit}>
      <label className="director-composer__input-label" htmlFor="director-command-input">告诉我下一步要做什么</label>
      <textarea ref={inputRef} id="director-command-input" value={input} rows={4} placeholder="例如：@节点 扩展这个镜头" onChange={(event) => onChange(event.target.value)} />
      <div className="agent-composer-actions">
        <button type="button" aria-expanded={referenceMenuOpen} onClick={onToggleReference}>添加 @ 引用</button>
        <label className="agent-upload-control">上传附件<input type="file" multiple onChange={onFiles} /></label>
        <button type="button" aria-expanded={assetLibraryOpen} onClick={onToggleAssets}>从资产库添加</button>
        <button type="submit" disabled={!input.trim()}>提交给 AI 导演</button>
      </div>
    </form>
  )
}
