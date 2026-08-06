import { forwardRef, type HTMLAttributes } from 'react'

import '../styles/global.css'

export type FloatingPanelProps = HTMLAttributes<HTMLDivElement>

export const FloatingPanel = forwardRef<HTMLDivElement, FloatingPanelProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={['floating-panel', className].filter(Boolean).join(' ')}
      {...props}
    />
  ),
)

FloatingPanel.displayName = 'FloatingPanel'
