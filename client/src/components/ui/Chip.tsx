import type { ReactNode } from 'react'
import { inkOn } from '@/core/contrast'

interface ChipProps {
  children: ReactNode
  color?: string
  variant?: 'soft' | 'solid'
  className?: string
}

// Chip uses an inline color style so team colors work dynamically.
//
// - `soft` (default): 10% alpha fill + colored text. Good for status/counter
//   chips where the colour is a semantic accent (LIVE, M 4/4, etc).
// - `solid`: full team-colour fill + luminance-aware ink. Used for team
//   identity badges so dark brand colours (navy, maroon) stay legible on
//   the dark app background.
export function Chip({ children, color = '#666666', variant = 'soft', className = '' }: ChipProps) {
  const style = variant === 'solid'
    ? { background: color,         color: inkOn(color), borderColor: color }
    : { background: `${color}1a`,  color,               borderColor: `${color}33` }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono
        whitespace-nowrap border tracking-wide ${className}`}
      style={style}
    >
      {children}
    </span>
  )
}
