import { isTier, pickTier, type TierName } from '@/blackhole/quality'
import type { SceneFactory, StageContext, StageFrame, StageScene } from './types'

const POINTER_EASE = 0.35 // seconds
const MAX_DPR = 2
const MAX_PIXELS = 5.2e6

export type Standalone = {
  /** The scene, once its factory has resolved. */
  scene: () => StageScene | null
  /** Stops the loop and disposes the scene. */
  stop: () => void
}

/**
 * Runs one scene on a canvas of its own, with the same contract the site's
 * stage gives it (see types.ts). For the dev harness pages and for tests: the
 * real page uses the shared stage instead.
 *
 * Writes `data-stage-state` (pending | ready | failed), `data-stage-frames`,
 * `data-stage-fps`, `data-stage-tier` and `data-stage-gpu` on the canvas, and
 * whatever the scene's `stats()` returns as `data-stat-*`, so a screenshot
 * script can wait for the picture to be up.
 */
export function runStandalone(canvas: HTMLCanvasElement, factory: SceneFactory, opts: { tier?: TierName; still?: boolean; onFail?: () => void } = {}): Standalone {
  let scene: StageScene | null = null
  let stopped = false
  let raf = 0
  let ready = false
  let last = 0
  let time = 0
  let frames = 0
  let ema = 16.7
  const target: [number, number] = [0, 0]
  const pointer: [number, number] = [0, 0]

  const fail = () => {
    canvas.dataset.stageState = 'failed'
    opts.onFail?.()
  }

  // A depth buffer for three.js scenes; no alpha, so every scene's output is opaque
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: true, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' })
  if (!gl) {
    fail()
    return { scene: () => null, stop: () => {} }
  }
  gl.getExtension('EXT_color_buffer_float')
  gl.getExtension('EXT_color_buffer_half_float')
  const info = gl.getExtension('WEBGL_debug_renderer_info')
  const gpu = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '')
  const forced = new URLSearchParams(window.location.search).get('bhtier')
  const nav = navigator as Navigator & { deviceMemory?: number }
  const tier =
    opts.tier ??
    (isTier(forced) ? forced : pickTier(gpu, { coarsePointer: window.matchMedia('(pointer: coarse)').matches, memoryGb: nav.deviceMemory, cores: navigator.hardwareConcurrency })) ??
    'low'
  canvas.dataset.stageTier = tier
  canvas.dataset.stageGpu = gpu
  canvas.dataset.stageState = 'pending'

  let threeRenderer: Promise<import('three').WebGLRenderer> | null = null
  const ctx: StageContext = {
    gl,
    canvas,
    gpu,
    tier,
    parallel: gl.getExtension('KHR_parallel_shader_compile'),
    three: () =>
      (threeRenderer ??= import('three').then((THREE) => {
        const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: false, alpha: false, powerPreference: 'high-performance' })
        // The stage owns the size of the drawing buffer; three.js must not restyle the canvas
        renderer.setPixelRatio(1)
        renderer.setSize(canvas.width, canvas.height, false)
        return renderer
      })),
  }

  const size = () => {
    const rect = canvas.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR, Math.sqrt(MAX_PIXELS / (rect.width * rect.height)))
    const w = Math.max(2, Math.round(rect.width * dpr))
    const h = Math.max(2, Math.round(rect.height * dpr))
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    void threeRenderer?.then((r) => r.setSize(w, h, false))
  }

  const frame = (now: number) => {
    raf = 0
    if (stopped || !scene) return
    if (!ready) {
      const state = scene.prepare()
      if (state === 'failed') return fail()
      if (state === 'pending') {
        raf = requestAnimationFrame(frame)
        return
      }
      ready = true
      last = 0
      canvas.dataset.stageState = 'ready'
    }
    const dtMs = last ? now - last : 16.7
    last = now
    const dt = Math.min(dtMs, 100) / 1000
    time += dt
    const k = 1 - Math.exp(-dt / POINTER_EASE)
    pointer[0] += (target[0] - pointer[0]) * k
    pointer[1] += (target[1] - pointer[1]) * k
    const rect = canvas.getBoundingClientRect()
    const f: StageFrame = {
      time,
      dt,
      pointer: opts.still ? [0, 0] : pointer,
      width: canvas.width,
      height: canvas.height,
      cssWidth: rect.width,
      cssHeight: rect.height,
      still: !!opts.still,
    }
    scene.render(f)
    frames++
    if (dtMs < 250) ema += (Math.min(dtMs, 50) - ema) * 0.08
    if (frames % 8 === 0) {
      canvas.dataset.stageFrames = String(frames)
      canvas.dataset.stageFps = (1000 / ema).toFixed(0)
      const stats = scene.stats?.()
      if (stats) for (const [key, value] of Object.entries(stats)) canvas.dataset[`stat${key[0].toUpperCase()}${key.slice(1)}`] = String(value)
    }
    raf = requestAnimationFrame(frame)
  }

  const onPointer = (e: PointerEvent) => {
    target[0] = (e.clientX / (window.innerWidth || 1)) * 2 - 1
    target[1] = -((e.clientY / (window.innerHeight || 1)) * 2 - 1)
  }
  const onVisibility = () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    } else if (!raf && !stopped) {
      last = 0
      raf = requestAnimationFrame(frame)
    }
  }
  const ro = new ResizeObserver(size)
  ro.observe(canvas)
  size()
  window.addEventListener('pointermove', onPointer, { passive: true })
  document.addEventListener('visibilitychange', onVisibility)

  void Promise.resolve(factory(ctx)).then(
    (made) => {
      if (stopped) return made.dispose()
      scene = made
      raf = requestAnimationFrame(frame)
    },
    () => fail(),
  )

  return {
    scene: () => scene,
    stop: () => {
      stopped = true
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', onPointer)
      document.removeEventListener('visibilitychange', onVisibility)
      scene?.dispose()
      scene = null
    },
  }
}
