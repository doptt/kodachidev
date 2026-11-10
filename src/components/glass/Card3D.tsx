import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
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

/* ------------------------------------------------------------------ */
/* Context                                                              */
/* ------------------------------------------------------------------ */
type Card3DContextValue = {
  /** 0..1 pointer position inside the card (springed) */
  px: MotionValue<number>
  py: MotionValue<number>
  /** 0 = resting, 1 = hovered/focused/dragging */
  active: MotionValue<number>
  isActive: boolean
  staticMode: boolean
  /** Touch-first device: no cursor tilt, text layers stay flat for crisp rasterization */
  coarse: boolean
}

const Card3DContext = createContext<Card3DContextValue | null>(null)

function useCard3D() {
  const ctx = useContext(Card3DContext)
  if (!ctx) throw new Error('Card3DItem must be used inside <Card3D>')
  return ctx
}

/* ------------------------------------------------------------------ */
/* Card3D (container with perspective)                                  */
/* ------------------------------------------------------------------ */
export type Card3DProps = {
  as?: ElementType
  className?: string
  /** Max per-card tilt in degrees (default 0: use a TiltGroup for group motion; 8–10 for a standalone card). */
  tilt?: number
  children: ReactNode
}

const spring = { stiffness: 170, damping: 22, mass: 0.6 }
const softSpring = { stiffness: 90, damping: 20, mass: 0.8 }

export function Card3D({ as, className, tilt = 0, children }: Card3DProps) {
  const Tag = (as ?? 'div') as ElementType
  const coarse = useCoarsePointer()
  const reduced = usePrefersReducedMotion()
  const staticMode = reduced

  const ref = useRef<HTMLDivElement>(null)
  const [isActive, setIsActive] = useState(false)
  const dragging = useRef(false)
  const inView = useRef(true)

  // Touch: only animate while near the viewport
  useEffect(() => {
    const el = ref.current
    if (!el || !coarse) return
    const io = new IntersectionObserver(([e]) => (inView.current = e.isIntersecting), { rootMargin: '-10% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [coarse])

  // Raw pointer position 0..1 (0.5,0.5 = center)
  const rawX = useMotionValue(0.5)
  const rawY = useMotionValue(0.5)
  const px = useSpring(rawX, coarse ? softSpring : spring)
  const py = useSpring(rawY, coarse ? softSpring : spring)
  const activeRaw = useMotionValue(0)
  const active = useSpring(activeRaw, { stiffness: 140, damping: 20 })

  const rotateX = useTransform(py, [0, 1], [tilt, -tilt])
  const rotateY = useTransform(px, [0, 1], [-tilt, tilt])
  // Integer-ish scale avoids fractional text rasterization on touch; desktop gets a gentle lift
  const scale = useTransform(active, [0, 1], [1, coarse ? 1 : 1.015])

  // Touch: slow, small autonomous tilt (about ±1.5°) when not dragging, paused off-screen
  const t = useRef(Math.random() * 100)
  useAnimationFrame((_, delta) => {
    if (!coarse || staticMode || dragging.current || !inView.current || tilt === 0) return
    t.current += delta / 1000
    const s = t.current
    rawX.set(0.5 + Math.sin(s * 0.4) * 0.15)
    rawY.set(0.5 + Math.cos(s * 0.3) * 0.12)
  })

  const setFromEvent = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      rawX.set(Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1))
      rawY.set(Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1))
    },
    [rawX, rawY],
  )

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (staticMode) return
    if (coarse && !dragging.current) return
    setFromEvent(e)
  }
  const onPointerEnter = (e: PointerEvent<HTMLDivElement>) => {
    if (staticMode || coarse) return
    setFromEvent(e)
    activeRaw.set(1)
    setIsActive(true)
  }
  const onPointerLeave = () => {
    if (coarse) return
    rawX.set(0.5)
    rawY.set(0.5)
    activeRaw.set(0)
    setIsActive(false)
  }
  // Touch: drag to tilt, spring back on release
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!coarse || staticMode) return
    dragging.current = true
    setFromEvent(e)
    activeRaw.set(1)
    setIsActive(true)
  }
  const endDrag = () => {
    if (!coarse) return
    dragging.current = false
    activeRaw.set(0)
    setIsActive(false)
  }
  // Keyboard: subtle lift when focus is inside
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.matches(':focus-within')) return
    activeRaw.set(1)
    setIsActive(true)
  }
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    activeRaw.set(0)
    setIsActive(false)
  }

  useEffect(() => {
    if (staticMode) {
      rawX.set(0.38)
      rawY.set(0.3)
    }
  }, [staticMode, rawX, rawY])

  const style: CSSProperties = { perspective: 900 }

  return (
    <Tag className={cn('group/card3d relative', className)} style={style}>
      <Card3DContext.Provider value={{ px, py, active, isActive, staticMode, coarse }}>
        <motion.div
          ref={ref}
          className="relative h-full w-full preserve-3d"
          style={{
            rotateX: staticMode ? 0 : rotateX,
            rotateY: staticMode ? 0 : rotateY,
            scale: staticMode ? 1 : scale,
            touchAction: coarse ? 'pan-y' : undefined,
          }}
          onPointerMove={onPointerMove}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onPointerDown={onPointerDown}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onFocus={onFocus}
          onBlur={onBlur}
        >
          {children}
        </motion.div>
      </Card3DContext.Provider>
    </Tag>
  )
}

/* ------------------------------------------------------------------ */
/* Card3DBody: the translucent glass slab + lights                      */
/* ------------------------------------------------------------------ */
export type Card3DBodyProps = {
  className?: string
  /**
   * 'auto' (default): real backdrop blur on fine pointers, tint-only on touch.
   * 'tint' never blurs (dense groups); 'blur' always blurs.
   */
  variant?: 'auto' | 'tint' | 'blur'
  /** 'card': see-through top, dense behind a bottom text block. 'even': uniform tint for small cards. */
  surface?: 'card' | 'even'
  children: ReactNode
}

export function Card3DBody({ className, variant = 'auto', surface = 'card', children }: Card3DBodyProps) {
  const { px, py, active, staticMode, coarse } = useCard3D()
  const blur = variant === 'blur' || (variant === 'auto' && !coarse)

  const xPct = useTransform(px, (v) => `${(v * 100).toFixed(2)}%`)
  const yPct = useTransform(py, (v) => `${(v * 100).toFixed(2)}%`)
  const specOpacity = useTransform(active, [0, 1], [staticMode ? 0.45 : 0.35, 1])
  const edgeOpacity = useTransform(active, [0, 1], [0.45, 1])
  const sheenX = useTransform(px, [0, 1], [-28, 28])

  // Moving specular: a tight hot spot plus a wide soft periwinkle bloom, screened over the glass
  const specular = useMotionTemplate`
    radial-gradient(150px circle at ${xPct} ${yPct}, rgb(236 238 255 / 0.34), rgb(236 238 255 / 0) 70%),
    radial-gradient(460px circle at ${xPct} ${yPct}, rgb(142 150 255 / 0.3), rgb(142 150 255 / 0) 65%)
  `
  // Soft diagonal sheen that slides with the pointer
  const sheenA = useTransform(sheenX, (v) => 28 + v)
  const sheenB = useTransform(sheenX, (v) => 45 + v)
  const sheenC = useTransform(sheenX, (v) => 62 + v)
  const sheen = useMotionTemplate`linear-gradient(112deg, rgb(255 255 255 / 0) ${sheenA}%, rgb(220 222 255 / 0.11) ${sheenB}%, rgb(255 255 255 / 0) ${sheenC}%)`
  // Edge light: brighter on the side nearest the pointer
  const edge = useMotionTemplate`radial-gradient(320px circle at ${xPct} ${yPct}, rgb(236 238 255 / 1), rgb(220 222 255 / 0.16) 55%, rgb(220 222 255 / 0.06) 100%)`

  const shadow = useTransform(active, [0, 1], ['var(--shadow-glass)', 'var(--shadow-glass-lift)'])

  return (
    <motion.div
      className={cn('glass h-full w-full rounded-glass-lg preserve-3d', surface === 'even' ? 'glass-card-even' : 'glass-card', blur && 'glass-card-blur', className)}
      style={{ boxShadow: shadow }}
    >
      {/* Specular + sheen */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit]"
        style={{ backgroundImage: specular, opacity: specOpacity, mixBlendMode: 'screen' }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit]"
        style={{ backgroundImage: sheen, opacity: specOpacity, mixBlendMode: 'plus-lighter' }}
      />
      {/* Edge light (1px ring, masked) */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[2] rounded-[inherit]"
        style={{
          padding: 1,
          backgroundImage: edge,
          opacity: edgeOpacity,
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
        }}
      />
      <div className="glass-content h-full preserve-3d">{children}</div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Card3DItem: a layer that pops toward the viewer on hover             */
/* ------------------------------------------------------------------ */
export type Card3DItemProps = {
  as?: ElementType
  className?: string
  /** Depth in px when the card is active (default 40). */
  translateZ?: number
  children?: ReactNode
}

export function Card3DItem({ as, className, translateZ = 40, children }: Card3DItemProps) {
  const { active, staticMode, coarse } = useCard3D()
  const Tag = (as ?? 'div') as ElementType
  const MotionTag = useMemo(() => motion.create(Tag), [Tag])
  // Touch devices keep layers flat: translateZ re-rasterizes text and makes it soft
  const flat = staticMode || coarse
  const z = useTransform(active, [0, 1], [0, flat ? 0 : translateZ])
  const transform = useMotionTemplate`translateZ(${z}px)`
  return (
    <MotionTag className={cn('preserve-3d', className)} style={{ transform: flat ? 'none' : transform }}>
      {children}
    </MotionTag>
  )
}
