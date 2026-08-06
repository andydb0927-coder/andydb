import { type HTMLAttributes, type ReactNode } from 'react'

import '../styles/global.css'

export type StatusTextStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'saving'
  | 'saved'
  | 'succeeded'
  | 'failed'
  | 'offline'

export interface StatusTextProps extends HTMLAttributes<HTMLSpanElement> {
  status: StatusTextStatus
  children: ReactNode
}

export function StatusText({
  status,
  className,
  children,
  ...props
}: StatusTextProps) {
  return (
    <span
      className={['status-text', `status-text--${status}`, className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      <span
        className="status-text__icon"
        data-testid="status-icon"
        aria-hidden="true"
      />
      <span>{children}</span>
    </span>
  )
}
