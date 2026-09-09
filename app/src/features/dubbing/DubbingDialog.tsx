import type { ReactNode } from 'react'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import './dubbing-workbench.css'

export function DubbingDialog({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose(): void; busy?: boolean }) {
  return <ConfirmDialog label={title} className="dubbing-dialog" overlayClassName="dubbing-overlay" portal restoreFocus
    initialFocus="input, textarea, select, button" focusableSelector="button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]"
    onClose={() => { if (!busy) onClose() }} dismissOnBackdrop>
    <header><h2>{title}</h2><button type="button" disabled={busy} aria-label={`关闭${title}`} onClick={onClose}>关闭</button></header>
    {children}
  </ConfirmDialog>
}
