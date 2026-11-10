import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { BackgroundRenderer } from './renderer'
import { BackgroundController } from './controller'

export type BackgroundProps = {
  /** Force one scene regardless of the sections on the page (handy for tests/dev). */
  scene?: string
  /** Skip WebGL and show the still image (also forced by `?nogl` in the URL). */
  still?: boolean
  /** Extra class on the root element. */
  className?: string
}

const STILL_WIDE = '/bg/still.webp'
const STILL_NARROW = '/bg/still-1280.webp'
/** Seamlessly tileable 2x3 quilt of video frames; the hero still is its top-left cell. */
const FIELD = '/bg/field.webp'
/** Baked glow of the field's bright specks; optional extra for the shader. */
const BLOOM = '/bg/bloom.webp'
const FADE_MS = 600
const MAX_DPR = 2 // full retina: quality over power draw
/** Ceiling on canvas pixels (about 2560x1600 at DPR 2) so a 4K retina display does not ask for 33 MP per frame. */
const MAX_PIXELS = 8.4e6
const FRAME_MIN_MS = 1000 / 60 - 1.5 // cap at 60fps (skip frames on 120Hz displays)

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

type Mode = 'loading' | 'live' | 'still'

/**
 * Fixed, full-viewport animated background. The still image paints immediately
 * (it's preloaded in index.html); the WebGL canvas fades in over it once the
 * first frame is drawn. Falls back to the still when WebGL2 is unavailable,
 * the shader fails, the context is lost, or the user prefers reduced motion.
 */
export default function Background({ scene, still, className }: BackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<Mode>('loading')
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

  useEffect(() => {
    const canvas = canvasRef.current
    if (useStill || !canvas) {
      setMode('still')
      return
    }
    setMode('loading')

    const renderer = new BackgroundRenderer(canvas)
    if (!renderer.init()) {
      setMode('still')
      renderer.dispose()
      return
    }

    const controller = new BackgroundController({ mouse: !coarsePointer, forcedScene })
    controller.start()

    let raf = 0
    let lastFrame = 0
    let lastTime = 0
    let disposed = false
    let firstFrameDrawn = false
    let fieldRequested = false
    let lost = false

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const area = Math.max(1, rect.width * rect.height)
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR, Math.sqrt(MAX_PIXELS / area))
      renderer.resize(rect.width * dpr, rect.height * dpr)
      if (!fieldRequested) {
        fieldRequested = true
        void renderer.loadImage(FIELD).then((ok) => {
          if (!ok && !disposed && !firstFrameDrawn) setMode('still')
        })
        void renderer.loadBloom(BLOOM)
      }
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (now - lastFrame < FRAME_MIN_MS) return
      const dt = lastTime ? (now - lastTime) / 1000 : 1 / 60
      lastFrame = now
      lastTime = now
      const u = controller.update(dt)
      if (!renderer.ready) return
      renderer.render(u)
      if (!firstFrameDrawn) {
        firstFrameDrawn = true
        setMode('live')
      }
    }

    const startLoop = () => {
      if (raf || disposed || lost) return
      lastTime = 0
      controller.settle()
      raf = requestAnimationFrame(frame)
    }
    const stopLoop = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }

    const onVisibility = () => (document.hidden ? stopLoop() : startLoop())
    const onLost = (e: Event) => {
      e.preventDefault()
      lost = true
      stopLoop()
      setMode('loading') // hides the canvas; still image shows underneath
    }
    const onRestored = () => {
      lost = false
      if (renderer.restore()) {
        firstFrameDrawn = false
        fieldRequested = false
        resize()
        startLoop()
      } else {
        setMode('still')
      }
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()
    document.addEventListener('visibilitychange', onVisibility)
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    if (!document.hidden) startLoop()

    return () => {
      disposed = true
      stopLoop()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      controller.stop()
      renderer.dispose()
    }
  }, [useStill, coarsePointer, forcedScene])

  return (
    <div className={className} style={rootStyle} aria-hidden="true" data-bg-mode={mode}>
      <img src={stillSrc} alt="" decoding="async" fetchPriority="high" style={imgStyle} draggable={false} />
      <div style={stillShadeStyle} />
      {!useStill && (
        <canvas
          ref={canvasRef}
          style={{ ...canvasStyle, opacity: mode === 'live' ? 1 : 0 }}
        />
      )}
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

const canvasStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'block',
  transition: `opacity ${FADE_MS}ms ease-out`,
  willChange: 'opacity',
}
