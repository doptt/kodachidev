import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { blackHole } from '@/blackhole/state'
import { stage } from '@/stage/stage'
import { useSceneStatus, useStageDrawn } from '@/stage/react'
import { createFieldScene } from './scene'

export type BackgroundProps = {
  /** Force one scene regardless of the sections on the page (handy for tests/dev). */
  scene?: string
  /** Skip the animated field and show the still image (also forced by `?nogl` in the URL). */
  still?: boolean
  /** Extra class on the root element. */
  className?: string
}

const STILL_WIDE = '/bg/still.webp'
const STILL_NARROW = '/bg/still-1280.webp'
const FADE_MS = 600

function pickStill(width: number) {
  return width < 1280 ? STILL_NARROW : STILL_WIDE
}

function query(name: string): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(name)
}

function useMediaQuery(q: string): boolean {
  const [match, setMatch] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(q).matches : false))
  useEffect(() => {
    const mq = window.matchMedia(q)
    const onChange = () => setMatch(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [q])
  return match
}

/**
 * The fixed layer behind the whole page, and the home of the stage: the one
 * canvas every 3D scene on the site draws into (see src/stage). From the back:
 * a still image, which paints at once (it is preloaded in index.html); a veil
 * that fades it to black as the page goes dark for the black hole; and the
 * stage's canvas, which is visible whenever a scene is being drawn.
 *
 * This component's own scene is the purple field behind the first sections.
 * It shows while the page is lit, and falls back to the still when WebGL2 is
 * unavailable or the user prefers reduced motion.
 */
export default function Background({ scene, still, className }: BackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stillSrc, setStillSrc] = useState(() => pickStill(typeof window !== 'undefined' ? window.innerWidth : 1920))
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const coarsePointer = useMediaQuery('(hover: none), (pointer: coarse)')
  const forcedScene = scene ?? query('scene')
  const useStill = !!still || reducedMotion || query('nogl') !== null

  // Keep the still source in step with the viewport.
  useEffect(() => {
    const onResize = () => setStillSrc(pickStill(window.innerWidth))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // The stage lives on this canvas for as long as the page does
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    return stage.mount(canvas, { reducedMotion })
  }, [reducedMotion])

  // The field: on screen while the page is lit, withdrawn once it has gone fully dark
  useEffect(() => {
    if (useStill) return
    stage.define('field', createFieldScene({ mouse: !coarsePointer, forcedScene, veil: () => Math.max(blackHole.theme, blackHole.dim) }), { priority: 0, keep: 60000 })
    let hide: (() => void) | null = null
    const sync = () => {
      const dark = Math.max(blackHole.theme, blackHole.dim) >= 0.999
      if (!dark && !hide) hide = stage.show('field')
      else if (dark && hide) {
        hide()
        hide = null
      }
    }
    sync()
    const off = blackHole.subscribe(sync)
    return () => {
      off()
      hide?.()
    }
  }, [useStill, coarsePointer, forcedScene])

  // The canvas is opaque. Once it has a picture it stays up, going black between scenes like the page
  // behind it; where the field is not running (reduced motion) it shows only while another scene draws,
  // so that the still image is not hidden behind a black canvas.
  const drawing = useSyncExternalStore(
    stage.subscribe,
    () => stage.active !== null,
    () => false,
  )
  const drawn = useStageDrawn()
  const visible = useStill ? drawing : drawn
  const field = useSceneStatus('field')
  const mode = useStill || field === 'failed' ? 'still' : field === 'ready' ? 'live' : 'loading'

  return (
    <div className={className} style={rootStyle} aria-hidden="true" data-bg-mode={mode} data-bh-vars="theme dim">
      <img src={stillSrc} alt="" decoding="async" fetchPriority="high" style={imgStyle} draggable={false} />
      <div style={stillShadeStyle} />
      {/* Fades the still to black as the black hole sequence arrives (see .bh-veil). The field does the same for itself. */}
      <div className="bh-veil" style={veilStyle} />
      <canvas ref={canvasRef} data-stage style={{ ...canvasStyle, opacity: visible ? 1 : 0 }} />
    </div>
  )
}

/**
 * A soft radial darkening sections can drop behind text for readability.
 * Positioned absolutely inside a `position: relative` parent.
 */
export function BgScrim({ strength = 0.55, className, style }: { strength?: number; className?: string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        position: 'absolute',
        inset: '-20%',
        pointerEvents: 'none',
        background: `radial-gradient(ellipse 60% 55% at 50% 50%, rgba(5,6,26,${strength}) 0%, rgba(5,6,26,${strength * 0.6}) 45%, rgba(5,6,26,0) 75%)`,
        ...style,
      }}
    />
  )
}

const rootStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: -10,
  pointerEvents: 'none',
  overflow: 'hidden',
  background: '#05061a',
  contain: 'strict',
}

const imgStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  userSelect: 'none',
}

// Mirrors the shader's darkness + vignette so the still fallback matches the live look.
const stillShadeStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background:
    'radial-gradient(ellipse 85% 80% at 50% 50%, rgba(5,6,26,0.10) 0%, rgba(5,6,26,0.28) 60%, rgba(5,6,26,0.55) 100%)',
}

const veilStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: '#000',
}

const canvasStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'block',
  transition: `opacity ${FADE_MS}ms ease-out`,
  willChange: 'opacity',
}
