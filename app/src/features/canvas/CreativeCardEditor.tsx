import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from 'react'

import { FloatingPanel } from '../../ui/FloatingPanel'
import type { AssetLibraryRepository } from '../assets/asset-library-repository'
import type { LibraryAssetRecord } from '../assets/library-model'
import {
  validateCreativeCardDraft,
  type CreativeCardDraft,
  type CreativeCardField,
  type CreativeCardValidationErrors,
} from '../project/creative-card'
import type { CreativeCard, CreativeCardKind } from '../project/model'
import { clampDraftPanelPosition } from './draft-panel-position'

type CardTextField = Exclude<CreativeCardField, 'title' | 'image'>

interface FieldDescriptor {
  name: CardTextField
  label: string
  required: boolean
}

const kindCopy: Record<CreativeCardKind, string> = {
  script: '剧本卡',
  'character-card': '角色卡',
  worldview: '世界观卡',
}

const fieldsByKind: Record<CreativeCardKind, readonly FieldDescriptor[]> = {
  script: [
    { name: 'scenes', label: '分场', required: true },
    { name: 'dialogue', label: '对白', required: false },
    { name: 'shotNotes', label: '镜头备注', required: false },
  ],
  'character-card': [
    { name: 'name', label: '姓名', required: true },
    { name: 'appearance', label: '外貌锚点', required: true },
    { name: 'wardrobe', label: '服化道', required: false },
    { name: 'relationships', label: '关系', required: false },
  ],
  worldview: [
    { name: 'background', label: '背景', required: true },
    { name: 'artStyle', label: '美术风格', required: true },
    { name: 'rules', label: '规则', required: false },
  ],
}

export interface CreativeCardEditorProps {
  kind: CreativeCardKind
  initialTitle: string
  initialCard?: CreativeCard
  initialImage?: LibraryAssetRecord
  anchor: { x: number; y: number }
  bounds: { width: number; height: number }
  libraryRepository: Pick<AssetLibraryRepository, 'list'>
  onCancel(): void
  onSubmit(value: CreativeCardDraft): void | Promise<void>
}

const emptyValues = (): Record<CardTextField, string> => ({
  scenes: '',
  dialogue: '',
  shotNotes: '',
  name: '',
  appearance: '',
  wardrobe: '',
  relationships: '',
  background: '',
  artStyle: '',
  rules: '',
})

function initialValues(card?: CreativeCard): Record<CardTextField, string> {
  const values = emptyValues()
  if (!card) return values
  if (card.kind === 'script') {
    return {
      ...values,
      scenes: card.scenes,
      dialogue: card.dialogue,
      shotNotes: card.shotNotes,
    }
  }
  if (card.kind === 'character-card') {
    return {
      ...values,
      name: card.name,
      appearance: card.appearance,
      wardrobe: card.wardrobe,
      relationships: card.relationships,
    }
  }
  return {
    ...values,
    background: card.background,
    artStyle: card.artStyle,
    rules: card.rules,
  }
}

function makeDraft(
  kind: CreativeCardKind,
  title: string,
  values: Record<CardTextField, string>,
  image?: LibraryAssetRecord,
): CreativeCardDraft {
  if (kind === 'script') {
    return {
      kind,
      title,
      scenes: values.scenes,
      dialogue: values.dialogue,
      shotNotes: values.shotNotes,
      ...(image ? { image } : {}),
    }
  }
  if (kind === 'character-card') {
    return {
      kind,
      title,
      name: values.name,
      appearance: values.appearance,
      wardrobe: values.wardrobe,
      relationships: values.relationships,
      ...(image ? { image } : {}),
    }
  }
  return {
    kind,
    title,
    background: values.background,
    artStyle: values.artStyle,
    rules: values.rules,
    ...(image ? { image } : {}),
  }
}

export function CreativeCardEditor({
  kind,
  initialTitle,
  initialCard,
  initialImage,
  anchor,
  bounds,
  libraryRepository,
  onCancel,
  onSubmit,
}: CreativeCardEditorProps) {
  const titleRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const submittingRef = useRef(false)
  const headingId = useId()
  const titleId = useId()
  const imageId = useId()
  const [title, setTitle] = useState(initialTitle)
  const [values, setValues] = useState(() => initialValues(initialCard))
  const [images, setImages] = useState<LibraryAssetRecord[]>(
    initialImage ? [initialImage] : [],
  )
  const [imageIdValue, setImageIdValue] = useState(
    initialCard?.imageAssetId ?? '',
  )
  const [errors, setErrors] = useState<CreativeCardValidationErrors>({})
  const [libraryStatus, setLibraryStatus] = useState<
    'loading' | 'ready' | 'error'
  >('loading')
  const [submitting, setSubmitting] = useState(false)
  const editing = initialCard !== undefined
  const position = clampDraftPanelPosition(anchor, bounds)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    let active = true
    setLibraryStatus('loading')
    void libraryRepository
      .list()
      .then((records) => {
        if (!active) return
        const byId = new Map<string, LibraryAssetRecord>()
        if (initialImage) byId.set(initialImage.id, initialImage)
        for (const record of records) {
          if (record.kind === 'image') byId.set(record.id, record)
        }
        setImages([...byId.values()])
        setLibraryStatus('ready')
      })
      .catch(() => {
        if (active) setLibraryStatus('error')
      })
    return () => {
      active = false
    }
  }, [initialImage, libraryRepository])

  const clearError = (field: CreativeCardField) => {
    setErrors((current) =>
      current[field] === undefined ? current : { ...current, [field]: undefined },
    )
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submittingRef.current) return
    const image = images.find(({ id }) => id === imageIdValue)
    const draft = makeDraft(kind, title, values, image)
    const validationErrors = validateCreativeCardDraft(draft)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    submittingRef.current = true
    setSubmitting(true)
    try {
      await onSubmit(draft)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!submittingRef.current) onCancel()
      return
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      if (!submittingRef.current) formRef.current?.requestSubmit()
    }
  }

  const panelStyle: CSSProperties = {
    left: position.left,
    top: position.top,
    width: position.width,
    maxHeight: position.maxHeight,
    overflow: 'auto',
  }
  const titleErrorId = `${titleId}-error`

  return (
    <FloatingPanel
      className="node-draft-panel creative-card-editor nodrag nopan"
      role="dialog"
      aria-labelledby={headingId}
      style={panelStyle}
    >
      <form
        ref={formRef}
        onSubmit={submit}
        onKeyDown={handleKeyDown}
        aria-busy={submitting}
      >
        <div className="node-draft-panel__heading">
          <div>
            <span>{editing ? '更新结构化节点' : '放置结构化节点'}</span>
            <h2 id={headingId}>
              {editing ? '编辑' : '创建'}{kindCopy[kind]}
            </h2>
          </div>
          <kbd>Esc</kbd>
        </div>

        <label className="node-draft-panel__field" htmlFor={titleId}>
          <span>标题</span>
          <input
            ref={titleRef}
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

        {fieldsByKind[kind].map((field) => {
          const fieldId = `${headingId}-${field.name}`
          const errorId = `${fieldId}-error`
          const error = errors[field.name]
          return (
            <div className="creative-card-editor__field" key={field.name}>
              <label className="node-draft-panel__field" htmlFor={fieldId}>
                <span>
                  {field.label}{field.required ? ' *' : ''}
                </span>
                <textarea
                  id={fieldId}
                  value={values[field.name]}
                  maxLength={2001}
                  rows={field.required ? 4 : 3}
                  aria-label={field.label}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value
                    setValues((current) => ({
                      ...current,
                      [field.name]: nextValue,
                    }))
                    clearError(field.name)
                  }}
                />
              </label>
              {error ? (
                <p id={errorId} className="node-draft-panel__error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          )
        })}

        <label className="node-draft-panel__field" htmlFor={imageId}>
          <span>引用图片素材（选填）</span>
          <select
            id={imageId}
            aria-label="引用图片素材"
            value={imageIdValue}
            onChange={(event) => {
              setImageIdValue(event.currentTarget.value)
              clearError('image')
            }}
          >
            <option value="">不引用图片</option>
            {images.map((image) => (
              <option value={image.id} key={image.id}>
                {image.name}
              </option>
            ))}
          </select>
        </label>
        {libraryStatus === 'loading' ? (
          <p className="node-draft-panel__file-status" role="status">
            正在读取图片素材
          </p>
        ) : null}
        {libraryStatus === 'error' ? (
          <p className="node-draft-panel__error" role="alert">
            素材库暂不可用，仍可保存卡片
          </p>
        ) : null}

        <p className="node-draft-panel__hint">
          Command/Ctrl + Enter {editing ? '保存' : '创建'}
        </p>
        <div className="node-draft-panel__actions">
          <button type="button" disabled={submitting} onClick={onCancel}>
            取消
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? '保存中…' : editing ? '确认保存' : '确认创建'}
          </button>
        </div>
      </form>
    </FloatingPanel>
  )
}
