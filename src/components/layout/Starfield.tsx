import { useEffect, useMemo, useRef, type CSSProperties, type RefObject } from 'react'

/*
 * Fixed background sky: three parallax layers of twinkling stars plus a few
 * comets. Everything animates with CSS; the only JS is a scroll listener
 * that nudges each layer by a different amount.
 */

type Depth = 'far' | 'mid' | 'near'

type Star = {
  key: string
  left: number
  top: number
  size: number
  color: string
  glowAlpha: number
  baseOpacity: number
  peakOpacity: number
  spike: boolean
  twinkleDuration: number
  twinkleDelay: number
  driftDuration: number
  driftDelay: number
}

type Comet = {
  id: string
  top: string
  left: string
  dx: number // vw travelled
  dy: number // vh travelled
  angle: number // deg, matched to dx:dy on a ~16:9 screen
  mirror: boolean
  duration: number
  delay: number
  scale: number
}

// Mostly white, with a few cool/warm tints so the sky doesn't look flat
const STAR_COLORS = ['#F5F2FF', '#F5F2FF', '#F5F2FF', '#DCE8FF', '#C6A9FF', '#FFEFD6']

const LAYERS: Record<Depth, { count: number; seed: number; size: [number, number]; maxOpacity: number; spikeChance: number; parallax: number }> = {
  far: { count: 46, seed: 0, size: [1, 2.2], maxOpacity: 0.55, spikeChance: 0, parallax: 0.015 },
  mid: { count: 26, seed: 200, size: [1.8, 3.4], maxOpacity: 0.75, spikeChance: 14, parallax: 0.035 },
  near: { count: 10, seed: 400, size: [2.8, 5.2], maxOpacity: 0.95, spikeChance: 8, parallax: 0.065 },
}

const COMETS: Comet[] = [
  { id: 'a', top: '10%', left: '12%', dx: 60, dy: 30, angle: 17, mirror: false, duration: 13, delay: -1, scale: 1 },
  { id: 'b', top: '20%', left: '82%', dx: -55, dy: 34, angle: 19, mirror: true, duration: 17, delay: -8, scale: 0.85 },
  { id: 'c', top: '58%', left: '6%', dx: 65, dy: 22, angle: 12, mirror: false, duration: 21, delay: -14, scale: 1.1 },
]

// Cheap deterministic "random" so stars land in the same spots every render
const seeded = (i: number, mult: number, mod: number) => (i * mult) % mod

function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

function makeStars(depth: Depth): Star[] {
  const { count, seed, size, maxOpacity, spikeChance } = LAYERS[depth]

  return Array.from({ length: count }, (_, idx) => {
    const i = idx + seed
    return {
      key: `${depth}-${i}`,
      left: seeded(i, 47.3, 100),
      top: seeded(i, 71.7, 100),
      size: size[0] + (seeded(i, 9.7, 100) / 100) * (size[1] - size[0]),
      color: STAR_COLORS[Math.floor(seeded(i, 5.1, STAR_COLORS.length))],
      glowAlpha: 0.35 + seeded(i, 13, 40) / 100,
      baseOpacity: 0.12 + seeded(i, 13, 45) / 100,
      peakOpacity: Math.min(maxOpacity, 0.65 + seeded(i, 17, 35) / 100),
      spike: seeded(i, 19, 100) < spikeChance,
      twinkleDuration: 2.2 + seeded(i, 7, 46) / 10,
      twinkleDelay: -seeded(i, 3.7, 16),
      driftDuration: 20 + seeded(i, 11, 26),
      driftDelay: -seeded(i, 5.3, 30),
    }
  })
}

// `copy` is 0 or 1: each layer renders its stars twice, stacked, so it can
// wrap around while scrolling without ever showing a gap.
function StarNode({ star: s, copy }: { star: Star; copy: 0 | 1 }) {
  return (
    <div
      className="absolute animate-star-drift"
      style={{
        left: `${s.left}%`,
        top: `${copy * 50 + s.top / 2}%`,
        animationDuration: `${s.driftDuration}s`,
        animationDelay: `${s.driftDelay}s`,
      }}
    >
      <div
        className={`star-core animate-star-twinkle${s.spike ? ' star-spike' : ''}`}
        style={
          {
            width: s.size,
            height: s.size,
            marginLeft: -s.size / 2,
            marginTop: -s.size / 2,
            // Soft radial core plus a two-step glow reads as a light source
            // rather than a flat dot
            background: `radial-gradient(circle, ${s.color} 0%, ${s.color} 30%, transparent 72%)`,
            boxShadow: `0 0 ${s.size * 1.8}px ${withAlpha(s.color, s.glowAlpha)}, 0 0 ${s.size * 4.5}px ${withAlpha(s.color, s.glowAlpha * 0.35)}`,
            animationDuration: `${s.twinkleDuration}s`,
            animationDelay: `${s.twinkleDelay}s`,
            '--star-base': s.baseOpacity,
            '--star-peak': s.peakOpacity,
            '--star-scale-peak': s.spike ? 1.4 : 1.18,
            '--spike-color': withAlpha(s.color, 0.55),
            '--spike-len': `${s.size * 3.4}px`,
          } as CSSProperties
        }
      />
    </div>
  )
}

function CometStreak({ comet: c }: { comet: Comet }) {
  const tail = `comet-tail-${c.id}`
  const head = `comet-head-${c.id}`
  const glow = `comet-glow-${c.id}`

  return (
    <div
      className="absolute animate-comet"
      style={
        {
          top: c.top,
          left: c.left,
          width: 200 * c.scale,
          height: 24 * c.scale,
          opacity: 0,
          '--comet-dx': `${c.dx}vw`,
          '--comet-dy': `${c.dy}vh`,
          '--comet-angle': `${c.angle}deg`,
          '--comet-mirror': c.mirror ? -1 : 1,
          animationDuration: `${c.duration}s`,
          animationDelay: `${c.delay}s`,
        } as CSSProperties
      }
    >
      <svg viewBox="0 0 200 24" width="100%" height="100%" className="block overflow-visible">
        <defs>
          <linearGradient id={tail} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7547FF" stopOpacity="0" />
            <stop offset="55%" stopColor="#C6A9FF" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#F5F2FF" stopOpacity="0.95" />
          </linearGradient>
          <radialGradient id={head} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
            <stop offset="45%" stopColor="#DCE8FF" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#7547FF" stopOpacity="0" />
          </radialGradient>
          <filter id={glow} x="-120%" y="-300%" width="340%" height="700%">
            <feGaussianBlur stdDeviation="2.1" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Tapered tail, faint at the back and brighter toward the head */}
        <path
          d="M0,12 C55,11.4 118,11.1 162,11.7 C170,11.85 170,12.15 162,12.3 C118,12.9 55,12.6 0,12 Z"
          fill={`url(#${tail})`}
          filter={`url(#${glow})`}
        />
        <circle cx="184" cy="12" r="3.4" fill={`url(#${head})`} filter={`url(#${glow})`} />
        <circle cx="184" cy="12" r="1.1" fill="#FFFFFF" />
      </svg>
    </div>
  )
}

function StarLayer({ stars, layerRef }: { stars: Star[]; layerRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={layerRef}
      className="absolute inset-x-0 top-0 h-[200%] will-change-transform"
      style={{ transform: 'translate3d(0, calc(var(--parallax-offset, 0px) - 50%), 0)' }}
    >
      {([0, 1] as const).flatMap((copy) =>
        stars.map((star) => <StarNode key={`${star.key}-${copy}`} star={star} copy={copy} />),
      )}
    </div>
  )
}

export default function Starfield() {
  const rootRef = useRef<HTMLDivElement>(null)
  const farRef = useRef<HTMLDivElement>(null)
  const midRef = useRef<HTMLDivElement>(null)
  const nearRef = useRef<HTMLDivElement>(null)

  const stars = useMemo(() => ({ far: makeStars('far'), mid: makeStars('mid'), near: makeStars('near') }), [])

  // Parallax. Writes a CSS variable through refs instead of React state, so
  // the ~160 star nodes never re-render while scrolling. The offset wraps
  // every screen height, which is why the stars keep moving all the way down.
  useEffect(() => {
    const layers = [
      { ref: farRef, factor: LAYERS.far.parallax },
      { ref: midRef, factor: LAYERS.mid.parallax },
      { ref: nearRef, factor: LAYERS.near.parallax },
    ]

    let frame = 0
    const update = () => {
      frame = 0
      const y = Math.max(0, window.scrollY) // ignore iOS overscroll bounce
      const height = rootRef.current?.clientHeight || window.innerHeight
      for (const { ref, factor } of layers) {
        ref.current?.style.setProperty('--parallax-offset', `${(y * factor) % height}px`)
      }
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [])

  return (
    <div ref={rootRef} className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <StarLayer stars={stars.far} layerRef={farRef} />
      <StarLayer stars={stars.mid} layerRef={midRef} />
      {/* Comets follow their own screen-space paths, so they skip the parallax */}
      <div className="absolute inset-0">
        {COMETS.map((comet) => (
          <CometStreak key={comet.id} comet={comet} />
        ))}
      </div>
      <StarLayer stars={stars.near} layerRef={nearRef} />
    </div>
  )
}
