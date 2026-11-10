import { createContext, useContext, useEffect, useRef, type PointerEvent, type ReactNode } from 'react'
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react'
import { cn } from '@/lib/cn'
import { useCoarsePointer, usePrefersReducedMotion } from '@/hooks/useMediaQuery'

type SpotlightContextValue = {
  x: MotionValue<number>
  y: MotionValue<number>
  /** Light radius in px (as a plain number for consumers) */
  radius: number
}
const SpotlightContext = createContext<SpotlightContextValue | null>(null)

export type SpotlightProps = {
  className?: string
  /** Light radius in px (default 420). */
  radius?: number
  /** Resting position (fractions) used for reduced motion and before the first move. */
  rest?: [number, number]
  children: ReactNode
}

/**
 * A soft periwinkle light that follows the cursor over its container and
 * brightens whatever it passes over. Touch devices get a slow autonomous drift;
 * reduced motion gets a static light at `rest`.
 */
export function Spotlight({ className, radius = 420, rest = [0.34, 0.42], children }: SpotlightProps) {
  const ref = useRef<HTMLDivElement>(null)
  const coarse = useCoarsePointer()
  const reduced = usePrefersReducedMotion()

  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const x = useSpring(rawX, { stiffness: 60, damping: 18, mass: 0.9 })
  const y = useSpring(rawY, { stiffness: 60, damping: 18, mass: 0.9 })
  const presence = useMotionValue(0)
  const glow = useSpring(presence, { stiffness: 50, damping: 20 })
  const drift = useRef(0)

  // Position the light at rest once we know our size
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const place = () => {
      const r = el.getBoundingClientRect()
      rawX.jump(r.width * rest[0])
      rawY.jump(r.height * rest[1])
    }
    place()
    if (coarse || reduced) presence.set(1)
    const ro = new ResizeObserver(place)
    ro.observe(el)
    return () => ro.disconnect()
  }, [coarse, reduced, rest, rawX, rawY, presence])

  // Touch: slow wander around the resting point
  useAnimationFrame((_, delta) => {
    if (!coarse || reduced) return
    const el = ref.current
    if (!el) return
    drift.current += delta / 1000
    const s = drift.current
    const r = el.getBoundingClientRect()
    rawX.set(r.width * (rest[0] + Math.sin(s * 0.25) * 0.16))
    rawY.set(r.height * (rest[1] + Math.cos(s * 0.19) * 0.12))
  })

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (coarse || reduced) return
    const r = e.currentTarget.getBoundingClientRect()
    rawX.set(e.clientX - r.left)
    rawY.set(e.clientY - r.top)
    presence.set(1)
  }
  const onPointerLeave = () => {
    if (coarse || reduced) return
    presence.set(0.55)
  }

  const xPx = useTransform(x, (v) => `${v.toFixed(1)}px`)
  const yPx = useTransform(y, (v) => `${v.toFixed(1)}px`)
  const light = useMotionTemplate`
    radial-gradient(${radius}px circle at ${xPx} ${yPx}, rgb(142 150 255 / 0.34), rgb(142 150 255 / 0.1) 45%, rgb(142 150 255 / 0) 70%),
    radial-gradient(${radius * 0.35}px circle at ${xPx} ${yPx}, rgb(220 222 255 / 0.22), rgb(220 222 255 / 0) 70%)
  `

  return (
    <div
      ref={ref}
      data-spotlight-root=""
      className={cn('relative', className)}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{ backgroundImage: light, opacity: glow, mixBlendMode: 'screen' }}
      />
      <SpotlightContext.Provider value={{ x, y, radius }}>{children}</SpotlightContext.Provider>
    </div>
  )
}

export type SpotlightRevealProps = {
  className?: string
  /** The brighter layer shown through the light; defaults to `children` restyled by `revealClassName`. */
  revealClassName?: string
  /** Radius of the reveal mask in px (default: light radius * 0.75). */
  radius?: number
  /** Content for the bright copy; defaults to `children`. Pass this when children animate on their own. */
  reveal?: ReactNode
  children: ReactNode
}

/**
 * Renders `children` normally and a second, brighter copy masked to the light
 * so the light "catches" the content under it. The copy is aria-hidden.
 */
export function SpotlightReveal({ className, revealClassName, radius, reveal, children }: SpotlightRevealProps) {
  const ctx = useContext(SpotlightContext)
  if (!ctx) throw new Error('SpotlightReveal must be used inside <Spotlight>')
  const ref = useRef<HTMLDivElement>(null)
  const r = radius ?? ctx.radius * 0.75

  // Light position relative to this element
  const offX = useMotionValue(0)
  const offY = useMotionValue(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const parent = el.closest('[data-spotlight-root]') ?? el.offsetParent
      const pr = (parent as HTMLElement | null)?.getBoundingClientRect()
      const er = el.getBoundingClientRect()
      if (!pr) return
      offX.set(er.left - pr.left)
      offY.set(er.top - pr.top)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('scroll', update, { passive: true })
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', update)
    }
  }, [offX, offY])

  const mx = useTransform([ctx.x, offX], ([a, b]) => `${((a as number) - (b as number)).toFixed(1)}px`)
  const my = useTransform([ctx.y, offY], ([a, b]) => `${((a as number) - (b as number)).toFixed(1)}px`)
  const mask = useMotionTemplate`radial-gradient(${r}px circle at ${mx} ${my}, #000 0%, rgb(0 0 0 / 0.6) 40%, transparent 72%)`

  return (
    <div ref={ref} className={cn('relative', className)}>
      {children}
      <motion.div
        aria-hidden="true"
        className={cn('pointer-events-none absolute inset-0 select-none', revealClassName)}
        style={{ WebkitMaskImage: mask, maskImage: mask }}
      >
        {reveal ?? children}
      </motion.div>
    </div>
  )
}
