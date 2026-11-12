import { useEffect, useRef } from 'react'
import { BlackHoleRenderer } from './renderer'
import { timeline, type Frame } from './timeline'
import { Governor, TIERS, isTier, pickTier, type TierName } from './quality'

export type BlackHoleSceneProps = {
  /** Current pinned scroll progress, 0..1. Read every frame, so pass a stable function. */
  progress: () => number
  /** How far the scene has faded up while scrolling in, 0..1. It eases forward as it appears. */
  arrive?: () => number
  /** Reduced motion: draw one settled frame of the idle scene and stop. */
  still?: boolean
  /** Force a quality tier instead of detecting one (also `?bhtier=` in the URL). */
  tier?: TierName
  /** Adjusts the frame before it is drawn. For the dev page only. */
  tweak?: (frame: Frame) => Frame
  /** Called once the first frame is on screen. */
  onLive?: () => void
  /** Called when WebGL isn't up to it; the caller shows the still image instead. */
  onFail?: () => void
  className?: string
}

/** Frames to accumulate for the reduced-motion still before the loop stops. */
const STILL_FRAMES = 28
/** A pleasant moment in the disk's rotation for the still. */
const STILL_TIME = 41.5
const POINTER_EASE = 0.35 // seconds

/**
 * The black hole canvas. Purely decorative: it draws, listens to the pointer
 * for a few degrees of parallax, and nothing else. Scroll is owned by the
 * caller, which hands in `progress`.
 */
export default function BlackHoleScene({ progress, arrive, still = false, tier, tweak, onLive, onFail, className }: BlackHoleSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Latest callbacks without re-running the effect
  const cb = useRef({ progress, arrive, tweak, onLive, onFail })
  cb.current = { progress, arrive, tweak, onLive, onFail }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new BlackHoleRenderer(canvas)
    if (!renderer.init()) {
      renderer.dispose()
      cb.current.onFail?.()
      return
    }

    const forced = tier ?? new URLSearchParams(window.location.search).get('bhtier')
    const nav = navigator as Navigator & { deviceMemory?: number }
    const start = isTier(forced)
      ? forced
      : pickTier(renderer.gpu, {
          coarsePointer: window.matchMedia('(pointer: coarse)').matches,
          memoryGb: nav.deviceMemory,
          cores: navigator.hardwareConcurrency,
        })
    if (!start) {
      renderer.dispose()
      cb.current.onFail?.()
      return
    }

    const governor = new Governor(start)
    renderer.setQuality(TIERS[start])
    canvas.dataset.bhTier = start
    canvas.dataset.bhGpu = renderer.gpu

    let raf = 0
    let lastNow = 0
    let time = still ? STILL_TIME : 0
    let visible = true
    let lost = false
    let disposed = false
    let live = false
    let stillFrames = 0
    const pointerTarget: [number, number] = [0, 0]
    const pointer: [number, number] = [0, 0]

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1)
      stillFrames = 0
      wake()
    }

    let prepared = false
    const frame = (now: number) => {
      raf = 0
      if (disposed || lost) return
      // The shaders compile in the background: nothing to draw until they are in
      if (!prepared) {
        const state = renderer.prepare()
        if (state === 'failed') {
          cb.current.onFail?.()
          return
        }
        if (state === 'pending') {
          raf = requestAnimationFrame(frame)
          return
        }
        prepared = true
        lastNow = 0
        governor.rest()
      }
      const dtMs = lastNow ? now - lastNow : 16.7
      lastNow = now
      const dt = Math.min(dtMs, 100) / 1000

      if (!still) {
        time += dt
        const k = 1 - Math.exp(-dt / POINTER_EASE)
        pointer[0] += (pointerTarget[0] - pointer[0]) * k
        pointer[1] += (pointerTarget[1] - pointer[1]) * k
      }

      const p = still ? 0 : cb.current.progress()
      const base = timeline(p, still ? 1 : (cb.current.arrive?.() ?? 1))
      const f = cb.current.tweak ? cb.current.tweak(base) : base
      renderer.render({ time, frame: f, pointer, alive: !still })

      if (!live && renderer.ready) {
        live = true
        cb.current.onLive?.()
      }
      if (renderer.accumulated % 8 === 0) canvas.dataset.bhFrames = String(renderer.accumulated)

      // Only judge the frame rate while there is something on screen to render
      if (!still && !forced && f.blackout < 1) {
        const next = governor.sample(dtMs)
        if (next) {
          renderer.setQuality(TIERS[next])
          canvas.dataset.bhTier = next
          resize()
        }
      }
      canvas.dataset.bhFps = governor.fps.toFixed(0)

      if (still && ++stillFrames >= STILL_FRAMES) {
        canvas.dataset.bhFrames = String(renderer.accumulated)
        return // settled: nothing moves, so stop drawing
      }
      raf = requestAnimationFrame(frame)
    }

    const wake = () => {
      if (raf || disposed || lost || !visible || document.hidden) return
      lastNow = 0
      governor.rest()
      raf = requestAnimationFrame(frame)
    }
    const sleep = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }

    const onPointer = (e: PointerEvent) => {
      pointerTarget[0] = (e.clientX / (window.innerWidth || 1)) * 2 - 1
      pointerTarget[1] = -((e.clientY / (window.innerHeight || 1)) * 2 - 1)
    }
    const onPointerGone = (e: PointerEvent) => {
      // A lifted finger lets the camera drift back; a mouse just leaving a child element doesn't
      if (e.type === 'pointerleave' || e.pointerType !== 'mouse') pointerTarget[0] = pointerTarget[1] = 0
    }
    const onVisibility = () => (document.hidden ? sleep() : wake())
    const onLost = (e: Event) => {
      e.preventDefault()
      lost = true
      sleep()
      cb.current.onFail?.()
    }
    const onRestored = () => {
      lost = false
      if (renderer.restore()) {
        prepared = false
        resize()
        wake()
      }
    }

    // Finish setting up in the background, whether or not the canvas is on
    // screen yet: wait for the shaders, then draw one frame that uses every pass
    // (the streaks of the fall included), so that each has done whatever it does
    // on first use. Nothing is then left to do when the canvas scrolls into view.
    let warming = 0
    const warm = () => {
      warming = 0
      if (disposed || lost || prepared) return
      const state = renderer.prepare()
      if (state === 'failed') {
        cb.current.onFail?.()
        return
      }
      if (state === 'pending') {
        warming = requestAnimationFrame(warm)
        return
      }
      prepared = true
      renderer.render({ time, frame: { ...timeline(0.8), blackout: 0 }, pointer, alive: false })
      renderer.resetHistory()
      governor.rest()
    }

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting)
        if (visible) wake()
        else sleep()
      },
      { rootMargin: '10% 0px' },
    )
    io.observe(canvas)
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()
    warming = requestAnimationFrame(warm)

    if (!still) {
      window.addEventListener('pointermove', onPointer, { passive: true })
      window.addEventListener('pointerup', onPointerGone, { passive: true })
      window.addEventListener('pointercancel', onPointerGone, { passive: true })
      document.documentElement.addEventListener('pointerleave', onPointerGone)
    }
    document.addEventListener('visibilitychange', onVisibility)
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)

    return () => {
      disposed = true
      sleep()
      if (warming) cancelAnimationFrame(warming)
      io.disconnect()
      ro.disconnect()
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerup', onPointerGone)
      window.removeEventListener('pointercancel', onPointerGone)
      document.documentElement.removeEventListener('pointerleave', onPointerGone)
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      renderer.dispose()
    }
  }, [still, tier])

  return <canvas ref={canvasRef} aria-hidden="true" className={className} style={{ display: 'block', width: '100%', height: '100%' }} />
}
