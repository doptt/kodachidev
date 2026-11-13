import { Governor, TIERS, isTier, pickTier, type TierName } from '@/blackhole/quality'
import type { SceneFactory, StageContext, StageFrame, StageScene } from './types'

/**
 * The site's stage: the one canvas, the one WebGL2 context, and the loop that
 * draws whichever scene is showing (see types.ts for what a scene is).
 *
 *   stage.define('moon', createMoonScene(...), { priority: 3 })
 *   stage.preload('moon')            // import, download and compile ahead of time
 *   const hide = stage.show('moon')  // ask for it to be the scene on screen
 *   hide()                           // withdraw the request
 *
 * Sections ask for their scene while they are on screen and withdraw when they
 * are not. When more than one is asked for at once (two sections overlap at a
 * hand-over), the one with the highest priority that is ready is drawn. When
 * none is, the canvas is left black and the loop stops.
 *
 * A scene that nothing has asked for in a while is disposed, so that the black
 * hole's render targets are not still held while the visitor is on the moon;
 * it is made again the next time it is preloaded or shown.
 */

export type SceneStatus = 'idle' | 'loading' | 'pending' | 'ready' | 'failed'

type Entry = {
  id: string
  factory: SceneFactory
  priority: number
  /** How long after its last use the scene is kept before being disposed, ms. */
  keep: number
  scene: StageScene | null
  status: SceneStatus
  requests: number
  wanted: boolean
  lastUsed: number
  /** Bumped whenever the scene is thrown away, so a factory that resolves late knows it is stale. */
  epoch: number
  /** True from the moment the scene is ready until it has been drawn or warmed once. */
  cold: boolean
  waiters: ((result: 'ready' | 'failed') => void)[]
}

const POINTER_EASE = 0.35 // seconds
const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()

let canvas: HTMLCanvasElement | null = null
let gl: WebGL2RenderingContext | null = null
let ctx: StageContext | null = null
let three: Promise<import('three').WebGLRenderer> | null = null
let governor: Governor | null = null
let supported: boolean | null = null
let lost = false
let still = false
let raf = 0
let last = 0
let time = 0
let frames = 0
let dirtySize = true
let activeId: string | null = null
let drawn = false
let version = 0
const target: [number, number] = [0, 0]
const pointer: [number, number] = [0, 0]

function emit() {
  version++
  for (const fn of listeners) fn()
}

function setStatus(entry: Entry, status: SceneStatus) {
  if (entry.status === status) return
  entry.status = status
  if (status === 'ready') entry.cold = true
  if (status === 'ready' || status === 'failed') {
    for (const done of entry.waiters.splice(0)) done(status)
  }
  emit()
}

/** Makes the entry's scene if there is a context to make it on and it has not been made. */
function start(entry: Entry) {
  if (!ctx || lost || entry.status !== 'idle') return
  const epoch = entry.epoch
  setStatus(entry, 'loading')
  Promise.resolve()
    .then(() => entry.factory(ctx!))
    .then(
      (scene) => {
        if (entry.epoch !== epoch || !ctx) return scene.dispose()
        entry.scene = scene
        entry.lastUsed = performance.now()
        setStatus(entry, 'pending')
        wake()
      },
      (err) => {
        if (import.meta.env.DEV) console.error(`[stage] ${entry.id} failed to start`, err)
        if (entry.epoch === epoch) setStatus(entry, 'failed')
      },
    )
}

function drop(entry: Entry, dispose: boolean) {
  entry.epoch++
  if (entry.scene && dispose) entry.scene.dispose()
  entry.scene = null
  if (entry.status !== 'failed') setStatus(entry, 'idle')
}

function size() {
  if (!canvas || !ctx) return
  const rect = canvas.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return
  const q = TIERS[ctx.tier]
  const dpr = Math.min(window.devicePixelRatio || 1, q.maxDpr, Math.sqrt(q.maxPixels / (rect.width * rect.height)))
  const w = Math.max(2, Math.round(rect.width * dpr))
  const h = Math.max(2, Math.round(rect.height * dpr))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  void three?.then((r) => r.setSize(w, h, false))
}

function pick(): Entry | null {
  let best: Entry | null = null
  for (const e of entries.values()) {
    if (e.requests > 0 && e.status === 'ready' && e.scene && (!best || e.priority > best.priority)) best = e
  }
  return best
}

function frame(now: number) {
  raf = 0
  if (!canvas || !gl || !ctx || lost) return
  if (dirtySize) {
    dirtySize = false
    size()
  }

  // Scenes that are compiling or loading are asked how they are getting on, shown or not
  let busy = false
  for (const e of entries.values()) {
    if (e.status === 'pending' && e.scene) {
      const state = e.scene.prepare()
      if (state === 'ready') setStatus(e, 'ready')
      else if (state === 'failed') {
        drop(e, true)
        setStatus(e, 'failed')
      } else busy = true
    } else if (e.status === 'loading') busy = true
    // Thrown away once nothing has wanted it for a while
    if (e.scene && e.requests === 0 && !e.wanted && now - e.lastUsed > e.keep && e.status === 'ready') drop(e, true)
  }

  const dtMs = last ? now - last : 16.7
  last = now
  const dt = Math.min(dtMs, 100) / 1000
  time += dt
  const k = 1 - Math.exp(-dt / POINTER_EASE)
  pointer[0] += (target[0] - pointer[0]) * k
  pointer[1] += (target[1] - pointer[1]) * k

  const active = pick()
  const wanting = [...entries.values()].some((e) => e.requests > 0)
  const rect = canvas.getBoundingClientRect()
  const f: StageFrame = {
    time,
    dt,
    pointer: still ? [0, 0] : pointer,
    width: canvas.width,
    height: canvas.height,
    cssWidth: rect.width,
    cssHeight: rect.height,
    still,
  }
  // A scene that has just become ready behind the scenes pays for its first frame now, one scene a frame
  for (const e of entries.values()) {
    if (!e.cold || e === active || !e.scene) continue
    e.cold = false
    e.scene.warm?.(f)
    break
  }
  if (active) {
    active.cold = false
    active.lastUsed = now
    active.scene!.render(f)
    frames++
    if (activeId !== active.id) {
      activeId = active.id
      canvas.dataset.stageActive = active.id
      governor?.rest()
      emit()
    }
    if (!drawn) {
      drawn = true
      emit()
    }
    // A scene that cannot hold its frame rate is asked to step down a tier
    if (!still && governor) {
      const next = governor.sample(dtMs)
      if (next) {
        ctx.tier = next
        canvas.dataset.stageTier = next
        for (const e of entries.values()) e.scene?.setTier?.(next)
        dirtySize = true
      }
    }
    if (frames % 8 === 0) {
      canvas.dataset.stageFrames = String(frames)
      canvas.dataset.stageFps = governor ? governor.fps.toFixed(0) : ''
      const stats = active.scene!.stats?.()
      if (stats) for (const [key, value] of Object.entries(stats)) canvas.dataset[`stat${key[0].toUpperCase()}${key.slice(1)}`] = String(value)
    }
  } else if (activeId !== null || !drawn) {
    // Nothing to show (or nothing ready yet): black
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.disable(gl.SCISSOR_TEST)
    gl.colorMask(true, true, true, true)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (activeId !== null) {
      activeId = null
      delete canvas.dataset.stageActive
      emit()
    }
  }

  // Keep going while there is something to draw, something on its way, or something waiting to be thrown away
  const holding = [...entries.values()].some((e) => e.scene && e.requests === 0 && !e.wanted)
  if (active || busy || wanting) raf = requestAnimationFrame(frame)
  else if (holding) raf = window.setTimeout(() => requestAnimationFrame(frame), 2000) as unknown as number
  else last = 0
}

function wake() {
  if (raf || !canvas || lost || document.hidden) return
  last = 0
  governor?.rest()
  raf = requestAnimationFrame(frame)
}

function sleep() {
  if (raf) {
    cancelAnimationFrame(raf)
    window.clearTimeout(raf)
  }
  raf = 0
}

const onPointer = (e: PointerEvent) => {
  target[0] = (e.clientX / (window.innerWidth || 1)) * 2 - 1
  target[1] = -((e.clientY / (window.innerHeight || 1)) * 2 - 1)
}
const onPointerGone = (e: PointerEvent) => {
  // A lifted finger lets the camera drift back; a mouse just leaving a child element does not
  if (e.type === 'pointerleave' || e.pointerType !== 'mouse') target[0] = target[1] = 0
}
const onVisibility = () => (document.hidden ? sleep() : wake())
const onResize = () => {
  dirtySize = true
  wake()
}
const onLost = (e: Event) => {
  e.preventDefault()
  lost = true
  sleep()
  // The GPU objects went with the context: forget the scenes without touching GL
  for (const entry of entries.values()) drop(entry, false)
  emit()
}
const onRestored = () => {
  lost = false
  dirtySize = true
  for (const entry of entries.values()) if (entry.requests > 0 || entry.wanted) start(entry)
  wake()
  emit()
}

export const stage = {
  /**
   * Gives the stage its canvas. Returns a function that takes it away again.
   * `reducedMotion` makes every scene draw a settled picture.
   */
  mount(el: HTMLCanvasElement, opts: { reducedMotion?: boolean } = {}) {
    canvas = el
    still = !!opts.reducedMotion
    lost = false
    drawn = false
    activeId = null
    const forceOff = new URLSearchParams(window.location.search).has('nogl')
    // A depth buffer for the scenes drawn with three.js; no alpha, so every scene's picture is opaque
    gl = forceOff ? null : el.getContext('webgl2', { alpha: false, antialias: false, depth: true, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' })
    const float = gl && (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))
    let tier: TierName | null = null
    let gpu = ''
    if (gl && float) {
      const info = gl.getExtension('WEBGL_debug_renderer_info')
      gpu = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '')
      const forced = new URLSearchParams(window.location.search).get('bhtier')
      const nav = navigator as Navigator & { deviceMemory?: number }
      tier = isTier(forced) ? forced : pickTier(gpu, { coarsePointer: window.matchMedia('(pointer: coarse)').matches, memoryGb: nav.deviceMemory, cores: navigator.hardwareConcurrency })
      // A forced tier is for measuring: it is not stepped down
      governor = tier && !isTier(forced) ? new Governor(tier) : null
    }
    supported = !!(gl && float && tier)
    if (!supported || !gl || !tier) {
      gl = null
      ctx = null
      for (const entry of entries.values()) setStatus(entry, 'failed')
      emit()
      return () => {
        canvas = null
        supported = null
      }
    }

    const context = gl
    ctx = {
      gl: context,
      canvas: el,
      gpu,
      tier,
      parallel: context.getExtension('KHR_parallel_shader_compile'),
      three: () =>
        (three ??= import('three').then((THREE) => {
          const renderer = new THREE.WebGLRenderer({ canvas: el, context, antialias: false, alpha: false, powerPreference: 'high-performance' })
          // The stage owns the size of the drawing buffer; three.js must not restyle the canvas
          renderer.setPixelRatio(1)
          renderer.setSize(el.width, el.height, false)
          return renderer
        })),
    }
    el.dataset.stageTier = tier
    el.dataset.stageGpu = gpu

    const ro = new ResizeObserver(onResize)
    ro.observe(el)
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('pointerup', onPointerGone, { passive: true })
    window.addEventListener('pointercancel', onPointerGone, { passive: true })
    document.documentElement.addEventListener('pointerleave', onPointerGone)
    document.addEventListener('visibilitychange', onVisibility)
    el.addEventListener('webglcontextlost', onLost)
    el.addEventListener('webglcontextrestored', onRestored)

    dirtySize = true
    // Anything asked for before the canvas existed starts now
    for (const entry of entries.values()) {
      if (entry.status === 'failed') entry.status = 'idle'
      if (entry.requests > 0 || entry.wanted) start(entry)
    }
    emit()
    wake()

    return () => {
      sleep()
      ro.disconnect()
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerup', onPointerGone)
      window.removeEventListener('pointercancel', onPointerGone)
      document.documentElement.removeEventListener('pointerleave', onPointerGone)
      document.removeEventListener('visibilitychange', onVisibility)
      el.removeEventListener('webglcontextlost', onLost)
      el.removeEventListener('webglcontextrestored', onRestored)
      for (const entry of entries.values()) drop(entry, !lost)
      void three?.then((r) => r.dispose())
      three = null
      canvas = null
      gl = null
      ctx = null
      governor = null
      supported = null
      emit()
    }
  },

  /** Registers a scene under a name. Its factory runs the first time the scene is preloaded or shown. */
  define(id: string, factory: SceneFactory, opts: { priority?: number; keep?: number } = {}) {
    const existing = entries.get(id)
    if (existing) {
      // Re-defined (a hot reload, or a section that mounted again): keep the requests, take the new factory
      existing.factory = factory
      existing.priority = opts.priority ?? existing.priority
      existing.keep = opts.keep ?? existing.keep
      return
    }
    entries.set(id, {
      id,
      factory,
      priority: opts.priority ?? 0,
      keep: opts.keep ?? 20000,
      scene: null,
      status: supported === false ? 'failed' : 'idle',
      requests: 0,
      wanted: false,
      lastUsed: 0,
      epoch: 0,
      cold: false,
      waiters: [],
    })
  },

  /**
   * Starts loading and compiling a scene without showing it, and keeps it
   * until `release` is called. Resolves when it is ready to draw (or cannot).
   */
  preload(id: string): Promise<'ready' | 'failed'> {
    const entry = entries.get(id)
    if (!entry || supported === false) return Promise.resolve('failed')
    entry.wanted = true
    if (entry.status === 'ready' || entry.status === 'failed') return Promise.resolve(entry.status)
    start(entry)
    wake()
    return new Promise((resolve) => entry.waiters.push(resolve))
  },

  /** Lets go of a scene kept by `preload`: it is disposed once nothing has shown it for a while. */
  release(id: string) {
    const entry = entries.get(id)
    if (entry) entry.wanted = false
  },

  /** Asks for a scene to be the one on screen. Returns a function that withdraws the request. */
  show(id: string) {
    const entry = entries.get(id)
    if (!entry) return () => {}
    entry.requests++
    start(entry)
    wake()
    let done = false
    return () => {
      if (done) return
      done = true
      entry.requests = Math.max(0, entry.requests - 1)
      entry.lastUsed = performance.now()
      wake()
    }
  },

  status(id: string): SceneStatus {
    return entries.get(id)?.status ?? (supported === false ? 'failed' : 'idle')
  },

  /** The scene being drawn right now, or null when the canvas is black. */
  get active() {
    return activeId
  },

  /** False once it is known that this browser cannot run the stage at all; null before the canvas is mounted. */
  get supported() {
    return supported
  },

  /** True once the canvas has had a frame drawn to it. */
  get drawn() {
    return drawn
  },

  /** Changes whenever any status, the active scene or `drawn` changes: for useSyncExternalStore. */
  get version() {
    return version
  },

  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
}
