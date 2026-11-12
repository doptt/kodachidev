import type { ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'motion/react'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * The entrance every card and block on the site shares: it rises a little and
 * comes into focus out of a blur. Spread onto a motion element; `delay`
 * staggers neighbours. Returns nothing under reduced motion.
 */
export function blurIn(reduced: boolean, delay = 0, opts: { y?: number; blur?: number; duration?: number } = {}) {
  if (reduced) return {}
  const { y = 22, blur = 10, duration = 0.8 } = opts
  return {
    initial: { opacity: 0, y, filter: `blur(${blur}px)` },
    whileInView: { opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } },
    viewport: { once: true, margin: '0px 0px -10% 0px' },
    transition: { duration, ease: EASE, delay },
  } satisfies HTMLMotionProps<'div'>
}

/** Brings its children in with the shared blur entrance the first time they scroll into view. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const reduced = usePrefersReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div className={className} {...blurIn(false, delay)}>
      {children}
    </motion.div>
  )
}
