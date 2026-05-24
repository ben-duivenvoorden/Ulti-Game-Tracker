import type { ReactNode } from 'react'

interface LabelProps {
  children: ReactNode
  color?: string
  block?: boolean
  className?: string
}

export function Label({ children, color, block = false, className = '' }: LabelProps) {
  const Tag = block ? 'div' : 'span'
  return (
    <Tag
      className={`text-xs font-mono tracking-widest ${className}`}
      style={{ color: color ?? 'var(--color-muted)' }}
    >
      {children}
    </Tag>
  )
}
