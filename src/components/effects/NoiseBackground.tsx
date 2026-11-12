import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { motion, useAnimationFrame, useMotionTemplate, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react'
import { cn } from '@/lib/cn'

/*
 * Noise Background, from Aceternity UI (ui.aceternity.com/components/noise-background):
 * three soft blobs of colour that wander around behind the content under a
 * film of grain, with a blurred strip of the same colours along the top edge.
 * Wrap a button in it and the blobs show as a moving, grainy border.
 *
 * Ported as published, with three changes for this site:
 *   - the grain is the site's own inline SVG noise (--glass-grain) instead of
 *     an image fetched from Aceternity's servers;
 *   - the container is dark by default rather than following a light/dark theme;
 *   - the wandering stops while `animating` is false, without measuring the
 *     element on every frame;
 *   - the layers round their own corners instead of being clipped by the
 *     container, which is cheaper to show for the first time.
 */

function GradientLayer({
  springX,
  springY,
  gradientColor,
  opacity,
  multiplier,
}: {
  springX: MotionValue<number>
  springY: MotionValue<number>
  gradientColor: string
  opacity: number
  multiplier: number
}) {
  const x = useTransform(springX, (val) => val * multiplier)
  const y = useTransform(springY, (val) => val * multiplier)
  const background = useMotionTemplate`radial-gradient(circle at ${x}px ${y}px, ${gradientColor} 0%, transparent 50%)`
  // Rounded like the container, so the container itself does not have to clip (see below)
  return <motion.div className="absolute inset-0 rounded-[inherit]" style={{ opacity, background }} />
}

export type NoiseBackgroundProps = {
  children?: ReactNode
  /** Classes for the content wrapper. */
  className?: string
  /** Classes for the container: padding here is the width of the "border". */
  containerClassName?: string
  /** Colours of the three wandering blobs. */
  gradientColors?: string[]
  /** Opacity of the grain, 0..1. */
  noiseIntensity?: number
  /** Speed multiplier for the wandering. */
  speed?: number
  backdropBlur?: boolean
  /** Whether the blobs move. */
  animating?: boolean
}

export function NoiseBackground({
  children,
  className,
  containerClassName,
  gradientColors = ['rgb(255, 100, 150)', 'rgb(100, 150, 255)', 'rgb(255, 200, 100)'],
  noiseIntensity = 0.2,
  speed = 0.1,
  backdropBlur = false,
  animating = true,
}: NoiseBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  // Spring the position so changes of direction are soft
  const springX = useSpring(x, { stiffness: 100, damping: 30 })
  const springY = useSpring(y, { stiffness: 100, damping: 30 })
  const topGradientX = useTransform(springX, (val) => val * 0.1 - 50)

  const size = useRef({ w: 0, h: 0 })
  const velocity = useRef({ x: 0, y: 0 })
  const lastTurn = useRef(0)

  const randomVelocity = () => {
    const angle = Math.random() * Math.PI * 2
    const magnitude = speed * (0.5 + Math.random() * 0.5)
    return { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude }
  }

  // Track the container's size, and start from its centre
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      size.current = { w: el.clientWidth, h: el.clientHeight }
    }
    measure()
    x.set(size.current.w / 2)
    y.set(size.current.h / 2)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [x, y])

  useEffect(() => {
    velocity.current = randomVelocity()
    // A new speed means a new velocity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed])

  useAnimationFrame((time) => {
    if (!animating) return
    const { w, h } = size.current
    if (!w || !h) return

    // A new heading every 1.5 to 3 seconds
    if (time - lastTurn.current > 1500 + Math.random() * 1500) {
      velocity.current = randomVelocity()
      lastTurn.current = time
    }

    const deltaTime = 16
    let nextX = x.get() + velocity.current.x * deltaTime
    let nextY = y.get() + velocity.current.y * deltaTime

    // At an edge, head off in a fresh random direction
    const padding = Math.min(20, w / 4, h / 4)
    if (nextX < padding || nextX > w - padding || nextY < padding || nextY > h - padding) {
      velocity.current = randomVelocity()
      lastTurn.current = time
      nextX = Math.max(padding, Math.min(w - padding, nextX))
      nextY = Math.max(padding, Math.min(h - padding, nextY))
    }
    x.set(nextX)
    y.set(nextY)
  })

  return (
    <div
      ref={containerRef}
      className={cn(
        // No overflow clip on the container: a rounded clip around layers that repaint every frame
        // makes the browser stall for a moment the first time it is shown. Each layer rounds itself.
        'group relative rounded-2xl bg-[#1b1814] p-2',
        'shadow-[0px_1px_0px_0px_rgb(0_0_0/0.9)_inset,0px_1px_0px_0px_rgb(255_237_193/0.14)]',
        backdropBlur && "after:absolute after:inset-0 after:h-full after:w-full after:backdrop-blur-lg after:content-['']",
        containerClassName,
      )}
      style={{ '--noise-opacity': noiseIntensity } as CSSProperties}
    >
      {/* Moving gradient layers */}
      <GradientLayer springX={springX} springY={springY} gradientColor={gradientColors[0]} opacity={0.4} multiplier={1} />
      <GradientLayer springX={springX} springY={springY} gradientColor={gradientColors[1]} opacity={0.3} multiplier={0.7} />
      <GradientLayer springX={springX} springY={springY} gradientColor={gradientColors[2] || gradientColors[0]} opacity={0.25} multiplier={1.2} />

      {/* Top gradient strip: the one layer that slides past the edges, so it gets a clip of its own */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <motion.div
          className="absolute inset-x-0 top-0 h-1 opacity-80 blur-sm"
          style={{ background: `linear-gradient(to right, ${gradientColors.join(', ')})`, x: animating ? topGradientX : 0 }}
        />
      </div>

      {/* Static noise pattern */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-(--noise-opacity)"
        style={{ backgroundImage: 'var(--glass-grain)', backgroundSize: '160px 160px', mixBlendMode: 'overlay' }}
      />

      {/* Content */}
      <div className={cn('relative z-10', className)}>{children}</div>
    </div>
  )
}
