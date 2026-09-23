import { useEffect, useMemo, useRef } from 'react'

// Deterministic pseudo-random spread — avoids Math.random re-shuffling on
// every re-render while still reading as organic (same trick the hero
// used for its original star field).
function seeded(i: number, mult: number, mod: number) {
  return (i * mult) % mod
}

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace('#', '')
  const bigint = parseInt(clean, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// A restrained palette so the sky reads as slightly varied starlight
// (warm/cool temperature) rather than uniform flat white dots, while
// staying subtle enough not to look tinted or cartoonish.
const STAR_COLORS = ['#F5F2FF', '#F5F2FF', '#F5F2FF', '#DCE8FF', '#C6A9FF', '#FFEFD6']

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

function makeStars(depth: Depth, count: number, offset: number): Star[] {
  const sizeRange = depth === 'far' ? [1, 2.2] : depth === 'mid' ? [1.8, 3.4] : [2.8, 5.2]
  const opacityCeiling = depth === 'far' ? 0.55 : depth === 'mid' ? 0.75 : 0.95
  const spikeChance = depth === 'near' ? 8 : depth === 'mid' ? 14 : 0

  return [...Array(count)].map((_, idx) => {
    const i = idx + offset
    const size = sizeRange[0] + (seeded(i, 9.7, 100) / 100) * (sizeRange[1] - sizeRange[0])
    const spike = spikeChance > 0 && seeded(i, 19, 100) < spikeChance
    return {
      key: `${depth}-${i}`,
      left: seeded(i, 47.3, 100),
      top: seeded(i, 71.7, 100),
      size,
      color: STAR_COLORS[Math.floor(seeded(i, 5.1, STAR_COLORS.length))],
      glowAlpha: 0.35 + seeded(i, 13, 40) / 100,
      baseOpacity: 0.12 + seeded(i, 13, 45) / 100,
      peakOpacity: Math.min(opacityCeiling, 0.65 + seeded(i, 17, 35) / 100),
      spike,
      twinkleDuration: 2.2 + seeded(i, 7, 46) / 10,
      twinkleDelay: -seeded(i, 3.7, 16),
      driftDuration: 20 + seeded(i, 11, 26),
      driftDelay: -seeded(i, 5.3, 30),
    }
  })
}

// Each parallax layer is 200% of the viewport tall and holds two identical
// copies of its stars (top half + bottom half). The layer scrolls, and when
// it has moved one full screen it wraps back — copy A lands exactly where
// copy B was, so the motion is seamless and never runs out.
function StarNode({ s, copy }: { s: Star; copy: 0 | 1 }) {
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
            width: `${s.size}px`,
            height: `${s.size}px`,
            marginLeft: `${-s.size / 2}px`,
            marginTop: `${-s.size / 2}px`,
            // Radial-gradient core (rather than a flat fill) so the star
            // itself already has a soft glowing edge, then a two-tier
            // box-shadow bleeds light into the surrounding dark space —
            // together they read as a light source, not a pasted-on dot.
            background: `radial-gradient(circle, ${s.color} 0%, ${s.color} 30%, transparent 72%)`,
            boxShadow: `0 0 ${s.size * 1.8}px ${hexToRgba(s.color, s.glowAlpha)}, 0 0 ${s.size * 4.5}px ${hexToRgba(s.color, s.glowAlpha * 0.35)}`,
            animationDuration: `${s.twinkleDuration}s`,
            animationDelay: `${s.twinkleDelay}s`,
            '--star-base': s.baseOpacity,
            '--star-peak': s.peakOpacity,
            '--star-scale-peak': s.spike ? 1.4 : 1.18,
            '--spike-color': hexToRgba(s.color, 0.55),
            '--spike-len': `${s.size * 3.4}px`,
          } as React.CSSProperties
        }
      />
    </div>
  )
}

type CometSpec = {
  id: string
  top: string
  left: string
  dx: number // vw
  dy: number // vh
  angle: number // deg, matched to dx:dy at a common ~16:9 desktop viewport
  mirror: boolean
  duration: number
  delay: number
  scale: number
}

function Comet({ c }: { c: CometSpec }) {
  const tailGrad = `comet-tail-${c.id}`
  const headGrad = `comet-head-${c.id}`
  const glow = `comet-glow-${c.id}`

  return (
    <div
      className="absolute animate-comet"
      style={
        {
          top: c.top,
          left: c.left,
          width: `${200 * c.scale}px`,
          height: `${24 * c.scale}px`,
          opacity: 0,
          '--comet-dx': `${c.dx}vw`,
          '--comet-dy': `${c.dy}vh`,
          '--comet-angle': `${c.angle}deg`,
          '--comet-mirror': c.mirror ? -1 : 1,
          animationDuration: `${c.duration}s`,
          animationDelay: `${c.delay}s`,
        } as React.CSSProperties
      }
    >
      <svg viewBox="0 0 200 24" width="100%" height="100%" style={{ overflow: 'visible', display: 'block' }}>
        <defs>
          <linearGradient id={tailGrad} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7547FF" stopOpacity="0" />
            <stop offset="55%" stopColor="#C6A9FF" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#F5F2FF" stopOpacity="0.95" />
          </linearGradient>
          <radialGradient id={headGrad} cx="50%" cy="50%" r="50%">
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
        {/* Tapered tail: thin/transparent at the trailing edge, thicker and
            brighter toward the head */}
        <path
          d="M0,12 C55,11.4 118,11.1 162,11.7 C170,11.85 170,12.15 162,12.3 C118,12.9 55,12.6 0,12 Z"
          fill={`url(#${tailGrad})`}
          filter={`url(#${glow})`}
        />
        {/* Soft bloom around the head */}
        <circle cx="184" cy="12" r="3.4" fill={`url(#${headGrad})`} filter={`url(#${glow})`} />
        {/* Crisp bright core — unblurred, gives the head a sharp sparkle
            point against the soft glow around it */}
        <circle cx="184" cy="12" r="1.1" fill="#FFFFFF" />
      </svg>
    </div>
  )
}

function StarLayer({ stars, layerRef }: { stars: Star[]; layerRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={layerRef}
      className="absolute inset-x-0 top-0"
      style={{
        height: '200%',
        transform: 'translate3d(0, calc(var(--parallax-offset, 0px) - 50%), 0)',
        willChange: 'transform',
      }}
    >
      {([0, 1] as const).flatMap((copy) => stars.map((s) => <StarNode key={`${s.key}-${copy}`} s={s} copy={copy} />))}
    </div>
  )
}

export default function Starfield() {
  const rootRef = useRef<HTMLDivElement>(null)
  const farRef = useRef<HTMLDivElement>(null)
  const midRef = useRef<HTMLDivElement>(null)
  const nearRef = useRef<HTMLDivElement>(null)

  const farStars = useMemo(() => makeStars('far', 46, 0), [])
  const midStars = useMemo(() => makeStars('mid', 26, 200), [])
  const nearStars = useMemo(() => makeStars('near', 10, 400), [])

  const comets = useMemo<CometSpec[]>(
    () => [
      { id: 'a', top: '10%', left: '12%', dx: 60, dy: 30, angle: 17, mirror: false, duration: 13, delay: -1, scale: 1 },
      { id: 'b', top: '20%', left: '82%', dx: -55, dy: 34, angle: 19, mirror: true, duration: 17, delay: -8, scale: 0.85 },
      { id: 'c', top: '58%', left: '6%', dx: 65, dy: 22, angle: 12, mirror: false, duration: 21, delay: -14, scale: 1.1 },
    ],
    []
  )

  // Scroll-linked parallax across the three depth layers — driven straight
  // through refs (no React state), so the star nodes never re-render on
  // scroll. The offset wraps every screen-height (see StarNode) instead of
  // being clamped, which is what used to freeze the sky halfway down.
  useEffect(() => {
    const layers: Array<{ ref: React.RefObject<HTMLDivElement | null>; factor: number }> = [
      { ref: farRef, factor: 0.015 },
      { ref: midRef, factor: 0.035 },
      { ref: nearRef, factor: 0.065 },
    ]

    let ticking = false
    const update = () => {
      // Clamp iOS rubber-band overscroll so the layer never exposes a gap.
      const y = Math.max(0, window.scrollY)
      const h = rootRef.current?.clientHeight || window.innerHeight
      for (const layer of layers) {
        const el = layer.ref.current
        if (!el) continue
        const offset = (y * layer.factor) % h
        el.style.setProperty('--parallax-offset', `${offset}px`)
      }
      ticking = false
    }
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(update)
        ticking = true
      }
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <div ref={rootRef} className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden style={{ zIndex: 0 }}>
      <StarLayer stars={farStars} layerRef={farRef} />
      <StarLayer stars={midStars} layerRef={midRef} />
      {/* Comets fly their own screen-relative paths, so they sit outside the
          wrapping parallax layers */}
      <div className="absolute inset-0">
        {comets.map((c) => (
          <Comet key={c.id} c={c} />
        ))}
      </div>
      <StarLayer stars={nearStars} layerRef={nearRef} />
    </div>
  )
}
