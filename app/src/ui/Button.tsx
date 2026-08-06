import { forwardRef, type ButtonHTMLAttributes } from 'react'

import '../styles/global.css'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={['ui-button', 'focus-visible', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  ),
)

Button.displayName = 'Button'
