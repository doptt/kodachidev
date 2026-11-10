import { useEffect, useRef, type CSSProperties, type ElementType, type HTMLAttributes, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/cn'
import { useCoarsePointer, usePrefersReducedMotion } from '@/hooks/useMediaQuery'

/*
 * Group motion for clusters of glass cards:
 *  - the whole group tilts at most 3° toward the pointer (perspective 1200px)
 *  - pointer is normalised to -1..1 inside the group box + 40px padding and
 *    resets to 0 when it leaves; smoothed with a 0.1 lerp per frame, and the
 *    rAF loop stops once settled
 *  - each card sits at depth 0–3 (translateZ 0/20/40/60px) and is offset by up
 *    to 6px × depth/3 (parallax), with its own slow float loop so nothing moves
 *    in sync, plus a ghost-in intro (opacity 0 + 6px blur → sharp).
 */

const MAX_GROUP_TILT = 3
const MAX_PARALLAX = 6
const PAD = 40
const Z = [0, 20, 40, 60] as const

export type TiltGroupProps = {
  as?: ElementType
  className?: string
  /** Classes for the inner tilting layer. */
  groupClassName?: string
  children: ReactNode
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'>

export function TiltGroup({ as, className, groupClassName, children, ...rest }: TiltGroupProps) {
  const Tag = (as ?? 'div') as ElementType
  const rootRef = useRef<HTMLDivElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  const coarse = useCoarsePointer()
  const reduced = usePrefersReducedMotion()
  const tiltOn = !coarse && !reduced

  useEffect(() => {
    const root = rootRef.current
    const group = groupRef.current
    if (!tiltOn || !root || !group) return
    let rect = root.getBoundingClientRect()
    let stale = false
    const cur = { x: 0, y: 0 }
    const tgt = { x: 0, y: 0 }
    let raf = 0

    const loop = () => {
      cur.x += (tgt.x - cur.x) * 0.1
      cur.y += (tgt.y - cur.y) * 0.1
      group.style.setProperty('--gx', `${(-cur.y * MAX_GROUP_TILT).toFixed(3)}deg`)
      group.style.setProperty('--gy', `${(cur.x * MAX_GROUP_TILT).toFixed(3)}deg`)
      group.style.setProperty('--par-x', `${(cur.x * MAX_PARALLAX).toFixed(2)}px`)
      group.style.setProperty('--par-y', `${(cur.y * MAX_PARALLAX).toFixed(2)}px`)
      const settled = Math.abs(tgt.x - cur.x) < 0.002 && Math.abs(tgt.y - cur.y) < 0.002
      raf = settled ? 0 : requestAnimationFrame(loop)
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop)
    }
    const onMove = (e: PointerEvent) => {
      if (stale) {
        rect = root.getBoundingClientRect()
        stale = false
      }
      const inside =
        e.clientX > rect.left - PAD &&
        e.clientX < rect.right + PAD &&
        e.clientY > rect.top - PAD &&
        e.clientY < rect.bottom + PAD
      const nx = inside ? Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width - 0.5) * 2)) : 0
      const ny = inside ? Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height - 0.5) * 2)) : 0
      if (nx !== tgt.x || ny !== tgt.y) {
        tgt.x = nx
        tgt.y = ny
        kick()
      }
    }
    const onLeave = () => {
      tgt.x = 0
      tgt.y = 0
      kick()
    }
    const bump = () => (stale = true)

    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    window.addEventListener('scroll', bump, { passive: true })
    window.addEventListener('resize', bump, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('scroll', bump)
      window.removeEventListener('resize', bump)
      cancelAnimationFrame(raf)
      for (const k of ['--gx', '--gy', '--par-x', '--par-y']) group.style.removeProperty(k)
    }
  }, [tiltOn])

  return (
    <div ref={rootRef} className={cn('relative [perspective:1200px]', className)}>
      <Tag
        ref={groupRef}
        className={cn('relative h-full preserve-3d', groupClassName)}
        style={{ transform: 'rotateX(var(--gx, 0deg)) rotateY(var(--gy, 0deg))' }}
        {...rest}
      >
        {children}
      </Tag>
    </div>
  )
}

export type FloatCardProps = {
  as?: ElementType
  /** Depth in the group: translateZ 0/20/40/60px, parallax up to 6px × depth/3. */
  depth?: 0 | 1 | 2 | 3
  /** Negative animation delay (s) so cards never float in sync. */
  floatDelay?: number
  /** Intro delay in seconds. */
  introDelay?: number
  className?: string
  style?: CSSProperties
  children: ReactNode
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children' | 'style'>

export function FloatCard({ as, depth = 0, floatDelay = 0, introDelay = 0, className, style, children, ...rest }: FloatCardProps) {
  const Tag = (as ?? 'div') as ElementType
  const reduced = usePrefersReducedMotion()
  return (
    <Tag
      className={cn('relative preserve-3d', className)}
      style={{
        transform: `translate3d(calc(var(--par-x, 0px) * ${depth / 3}), calc(var(--par-y, 0px) * ${depth / 3}), ${Z[depth]}px)`,
        ...style,
      }}
      {...rest}
    >
      <motion.div
        className={cn('h-full preserve-3d', !reduced && 'animate-float')}
        style={{ animationDuration: `${7 + depth * 0.8}s`, animationDelay: `${-floatDelay}s` }}
        initial={reduced ? false : { opacity: 0, filter: 'blur(6px)', y: 10 }}
        animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: introDelay }}
      >
        {children}
      </motion.div>
    </Tag>
  )
}
