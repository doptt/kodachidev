import type { CSSProperties, ReactNode } from 'react'
import { useReveal } from '../hooks/useReveal'

type RevealProps = {
  children: ReactNode
  /** ms to wait after the element enters the viewport */
  delay?: number
  /** 'up' slides in from below, 'scale' grows in slightly */
  variant?: 'up' | 'scale'
  distance?: number
  duration?: number
  className?: string
  style?: CSSProperties
}

/**
 * Scroll-reveal wrapper. Every wrapped element watches itself, so content
 * further down a section animates when *it* reaches the screen rather than
 * when the top of its section does. The reveal lives on this wrapper, so it
 * never fights with hover transforms/transitions on the child.
 */
export default function Reveal({
  children,
  delay = 0,
  variant = 'up',
  distance = 28,
  duration = 750,
  className,
  style,
}: RevealProps) {
  const { ref, visible } = useReveal<HTMLDivElement>()
  const hidden = variant === 'scale' ? 'scale(0.9)' : `translate3d(0, ${distance}px, 0)`

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : hidden,
        transition: `opacity ${duration}ms ease ${delay}ms, transform ${duration}ms ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}
