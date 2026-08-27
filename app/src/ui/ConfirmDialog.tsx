import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface ConfirmDialogProps {
  children: ReactNode
  onClose(): void
  label?: string
  labelledBy?: string
  describedBy?: string
  role?: 'dialog' | 'alertdialog'
  as?: 'div' | 'section'
  className?: string
  overlayClassName?: string
  overlayRole?: 'presentation'
  portal?: boolean
  dismissOnBackdrop?: boolean
  initialFocus?: string
  focusableSelector?: string
  restoreFocus?: boolean
}

/** Presentation only. Drafts, validation, billing and submission stay with the caller. */
export function ConfirmDialog({
  children, onClose, label, labelledBy, describedBy, role = 'dialog', as: Tag = 'div',
  className, overlayClassName, overlayRole, portal = false, dismissOnBackdrop = false,
  initialFocus, focusableSelector, restoreFocus = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const trigger = document.activeElement
    if (initialFocus) dialogRef.current?.querySelector<HTMLElement>(initialFocus)?.focus()
    return () => {
      if (restoreFocus && trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
    }
  }, [initialFocus, restoreFocus])

  const dialog = (
    <div className={overlayClassName} role={overlayRole} onPointerDown={event => {
      if (dismissOnBackdrop && event.target === event.currentTarget) onClose()
    }}>
      <Tag ref={dialogRef} className={className} role={role} aria-modal="true"
        aria-label={label} aria-labelledby={labelledBy} aria-describedby={describedBy}
        onKeyDown={event => {
          event.stopPropagation()
          if (event.key === 'Escape') { event.preventDefault(); onClose() }
          if (event.key === 'Tab' && focusableSelector) {
            const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])]
            const first = controls[0], last = controls.at(-1)
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
          }
        }}>
        {children}
      </Tag>
    </div>
  )
  return portal ? createPortal(dialog, document.body) : dialog
}
