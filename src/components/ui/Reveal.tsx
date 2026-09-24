import type { CSSProperties, ReactNode } from 'react'
import { useReveal } from '../../hooks/useReveal'

type RevealProps = {
  children: ReactNode
  /** ms to wait after the element scrolls into view */
  delay?: number
  /** "up" slides in from below, "scale" grows in slightly */
  variant?: 'up' | 'scale'
  /** px to slide when variant is "up" */
  distance?: number
  duration?: number
  className?: string
  style?: CSSProperties
}

/*
 * Fades its children in the first time they scroll into view.
 *
 * Each Reveal watches itself, so a card halfway down a section animates when
 * you actually reach it. The animation sits on this wrapper rather than the
 * child, which leaves the child free to use its own hover transforms.
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
