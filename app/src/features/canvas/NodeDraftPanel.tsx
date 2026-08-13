import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from 'react'

import { FloatingPanel } from '../../ui/FloatingPanel'
import {
  ACCEPTED_IMAGE_TYPES,
  ImagePreparationError,
  prepareImageFile,
} from './image-file'
import {
  validateNodeDraft,
  type CreatableNodeKind,
  type DraftValidationErrors,
  type PreparedImage,
} from './node-draft'
import { clampDraftPanelPosition } from './draft-panel-position'

export interface NodeDraftFormValue {
  title: string
  content: string
  image?: PreparedImage
}

export interface NodeDraftPanelProps {
  kind: CreatableNodeKind
  presentation?: 'add-node' | 'free-generation' | 'upload'
  initialTitle: string
  anchor: { x: number; y: number }
  bounds: { width: number; height: number }
  onCancel(): void
  onSubmit(value: NodeDraftFormValue): void | Promise<void>
}

const kindCopy: Record<CreatableNodeKind, string> = {
  text: '文本',
  image: '图片',
  storyboard: '分镜',
  video: '视频',
}

const contentLabels: Record<CreatableNodeKind, string> = {
  text: '文字内容',
  image: '图片描述（选填）',
  storyboard: '画面提示词',
  video: '视频提示词',
}

export function NodeDraftPanel({
  kind,
  presentation = 'add-node',
  initialTitle,
  anchor,
  bounds,
  onCancel,
  onSubmit,
}: NodeDraftPanelProps) {
  const titleInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const fileRequestId = useRef(0)
  const titleId = useId()
  const contentId = useId()
  const imageId = useId()
  const headingId = useId()
  const titleErrorId = `${titleId}-error`
  const contentErrorId = `${contentId}-error`
  const imageErrorId = `${imageId}-error`
  const [title, setTitle] = useState(initialTitle)
  const [content, setContent] = useState('')
  const [image, setImage] = useState<PreparedImage>()
  const [imageName, setImageName] = useState('')
  const [errors, setErrors] = useState<DraftValidationErrors>({})
  const [readingImage, setReadingImage] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const position = clampDraftPanelPosition(anchor, bounds)

  useEffect(() => {
    titleInputRef.current?.focus()
  }, [])

  const clearError = (field: keyof DraftValidationErrors) => {
    setErrors((current) =>
      current[field] === undefined ? current : { ...current, [field]: undefined },
    )
  }

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return

    const requestId = ++fileRequestId.current
    setReadingImage(true)
    setImage(undefined)
    setImageName('')
    clearError('image')

    try {
      const prepared = await prepareImageFile(file)
      if (requestId !== fileRequestId.current) return
      setImage(prepared)
      setImageName(file.name)
      clearError('image')
    } catch (error) {
      if (requestId !== fileRequestId.current) return
      setErrors((current) => ({
        ...current,
        image:
          error instanceof ImagePreparationError
            ? error.message
            : '无法读取图片，请重新选择',
      }))
      input.value = ''
    } finally {
      if (requestId === fileRequestId.current) setReadingImage(false)
    }
  }

  const submitDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (readingImage || submitting) return

    const validationErrors = validateNodeDraft({
      kind,
      title,
      content,
      image,
    })
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    setSubmitting(true)
    try {
      await onSubmit({
        title,
        content,
        ...(image ? { image } : {}),
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!submitting) onCancel()
      return
    }

    if (event.key !== 'Enter') return
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      if (!readingImage && !submitting) formRef.current?.requestSubmit()
      return
    }

    if (event.target instanceof HTMLInputElement && event.target.type !== 'file') {
      event.preventDefault()
    }
  }

  const panelStyle: CSSProperties = {
    left: position.left,
    top: position.top,
    width: position.width,
    maxHeight: position.maxHeight,
    overflow: 'auto',
  }
  const confirmLabel = readingImage
    ? '读取图片中…'
    : submitting
      ? '创建中…'
      : '确认创建'
  const heading =
    presentation === 'free-generation'
      ? '自由生成节点'
      : presentation === 'upload'
        ? '上传图片到画布'
        : `创建${kindCopy[kind]}节点`
  const eyebrow =
    presentation === 'free-generation'
      ? '双击画布 · 自由生成'
      : presentation === 'upload'
        ? '右键画布 · 上传素材'
        : '右键画布 · 添加节点'

  return (
    <FloatingPanel
      className="node-draft-panel nodrag nopan"
      role="dialog"
      aria-labelledby={headingId}
      style={panelStyle}
    >
      <form
        ref={formRef}
        onSubmit={submitDraft}
        onKeyDown={handleKeyDown}
        aria-busy={readingImage || submitting}
      >
        <div className="node-draft-panel__heading">
          <div>
            <span>{eyebrow}</span>
            <h2 id={headingId}>{heading}</h2>
          </div>
          <kbd>Esc</kbd>
        </div>

        <label className="node-draft-panel__field" htmlFor={titleId}>
          <span>标题</span>
          <input
            ref={titleInputRef}
            id={titleId}
            value={title}
            maxLength={41}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? titleErrorId : undefined}
            onChange={(event) => {
              setTitle(event.currentTarget.value)
              clearError('title')
            }}
          />
        </label>
        {errors.title ? (
          <p id={titleErrorId} className="node-draft-panel__error" role="alert">
            {errors.title}
          </p>
        ) : null}

        <label className="node-draft-panel__field" htmlFor={contentId}>
          <span>{contentLabels[kind]}</span>
          <textarea
            id={contentId}
            value={content}
            maxLength={1001}
            rows={kind === 'image' ? 3 : 5}
            aria-invalid={errors.content ? true : undefined}
            aria-describedby={errors.content ? contentErrorId : undefined}
            onChange={(event) => {
              setContent(event.currentTarget.value)
              clearError('content')
            }}
          />
        </label>
        {errors.content ? (
          <p id={contentErrorId} className="node-draft-panel__error" role="alert">
            {errors.content}
          </p>
        ) : null}

        {kind === 'image' ? (
          <>
            <label className="node-draft-panel__file" htmlFor={imageId}>
              <span>本地图片</span>
              <input
                id={imageId}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                aria-invalid={errors.image ? true : undefined}
                aria-describedby={errors.image ? imageErrorId : undefined}
                disabled={submitting}
                onChange={handleImageChange}
              />
            </label>
            {imageName ? (
              <p className="node-draft-panel__file-status">已选择 {imageName}</p>
            ) : null}
            {errors.image ? (
              <p id={imageErrorId} className="node-draft-panel__error" role="alert">
                {errors.image}
              </p>
            ) : null}
          </>
        ) : null}

        <p className="node-draft-panel__hint">Command/Ctrl + Enter 创建</p>
        <div className="node-draft-panel__actions">
          <button type="button" disabled={submitting} onClick={onCancel}>
            取消
          </button>
          <button type="submit" disabled={readingImage || submitting}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </FloatingPanel>
  )
}
