import { cloneScene, easeScene, mixScenes, sceneFrom, SCENES, DEFAULT_SCENE, type BgScene } from './scenes'
import type { FrameUniforms } from './renderer'

/**
 * Turns page state (scroll, pointer, which sections are on screen, time) into
 * the per-frame uniforms for the shader. Owns no GL; the component drives it.
 */
export class BackgroundController {
  /** Eased scene actually being rendered. */
  readonly scene: BgScene = cloneScene(SCENES[DEFAULT_SCENE])
  private target: BgScene = cloneScene(SCENES[DEFAULT_SCENE])

  private sections: HTMLElement[] = []
  private sectionsStamp = 0
  private sectionsObserver: MutationObserver | null = null

  private scrollY = 0
  private lastScrollY = 0
  private ripple = 0
  private flow = 0
  private time = 0

  private mouseTarget = { x: 0, y: 0 } // -0.5..0.5 of viewport
  private mouse = { x: 0, y: 0 }

  private onPointerMove = (e: PointerEvent) => {
    const w = window.innerWidth || 1
    const h = window.innerHeight || 1
    this.mouseTarget.x = e.clientX / w - 0.5
    this.mouseTarget.y = e.clientY / h - 0.5
  }
  private onPointerLeave = () => {
    this.mouseTarget.x = 0
    this.mouseTarget.y = 0
  }

  constructor(
    private opts: {
      /** Enable the gentle mouse parallax (false on touch devices). */
      mouse: boolean
      /** Force a single scene (for testing). */
      forcedScene?: string | null
      /** Max parallax shift in CSS pixels. */
      parallaxPx?: number
    },
  ) {}

  start() {
    this.scrollY = this.lastScrollY = window.scrollY
    this.refreshSections()
    this.sectionsObserver = new MutationObserver(() => (this.sectionsStamp = 0))
    this.sectionsObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-bg-scene'] })
    if (this.opts.mouse) {
      window.addEventListener('pointermove', this.onPointerMove, { passive: true })
      document.documentElement.addEventListener('pointerleave', this.onPointerLeave)
    }
  }

  stop() {
    this.sectionsObserver?.disconnect()
    this.sectionsObserver = null
    window.removeEventListener('pointermove', this.onPointerMove)
    document.documentElement.removeEventListener('pointerleave', this.onPointerLeave)
  }

  /** Jump the eased state to its target (after a pause so nothing lurches). */
  settle() {
    this.lastScrollY = this.scrollY = window.scrollY
    this.ripple = 0
    this.computeTarget()
    Object.assign(this.scene, this.target)
  }

  private refreshSections() {
    this.sections = Array.from(document.querySelectorAll<HTMLElement>('[data-bg-scene]'))
    this.sectionsStamp = performance.now()
  }

  private computeTarget() {
    if (this.opts.forcedScene) {
      this.target = cloneScene(sceneFrom(this.opts.forcedScene))
      return
    }
    const vh = window.innerHeight || 1
    const parts: { scene: BgScene; weight: number }[] = []
    for (const el of this.sections) {
      const r = el.getBoundingClientRect()
      const top = Math.max(0, r.top)
      const bottom = Math.min(vh, r.bottom)
      const covered = bottom - top
      if (covered <= 0) continue
      // Coverage of the viewport, with a soft bias toward whatever sits at the centre.
      const center = (r.top + r.bottom) * 0.5
      const centerBias = 1 - Math.min(1, Math.abs(center - vh * 0.5) / (vh * 1.5))
      const weight = (covered / vh) * (0.6 + 0.4 * centerBias)
      parts.push({ scene: sceneFrom(el.dataset.bgScene), weight })
    }
    this.target = mixScenes(parts, this.scene)
  }

  /**
   * Advance by `dt` seconds and produce uniforms.
   * `dt` is clamped so a long hidden-tab gap never produces a jump.
   */
  update(dtRaw: number): FrameUniforms {
    const dt = Math.min(Math.max(dtRaw, 0), 0.1)
    this.time += dt

    if (performance.now() - this.sectionsStamp > 1000) this.refreshSections()
    this.computeTarget()
    // Scene easing with ~0.45s time constant.
    easeScene(this.scene, this.target, 1 - Math.exp(-dt / 0.45))

    // Scroll + velocity ripple (fast attack, slow decay; never snappy).
    this.scrollY = window.scrollY
    const vh = window.innerHeight || 1
    const vel = dt > 0 ? Math.abs(this.scrollY - this.lastScrollY) / dt : 0
    this.lastScrollY = this.scrollY
    const rippleTarget = Math.min(1, vel / (vh * 3.2))
    const k = rippleTarget > this.ripple ? 1 - Math.exp(-dt / 0.12) : 1 - Math.exp(-dt / 0.9)
    this.ripple += (rippleTarget - this.ripple) * k
    this.flow += dt * this.scene.flowSpeed * (1 + this.ripple * 2.5)

    // Mouse parallax: critically damped-ish exponential smoothing (~0.25s).
    const mk = 1 - Math.exp(-dt / 0.25)
    this.mouse.x += (this.mouseTarget.x - this.mouse.x) * mk
    this.mouse.y += (this.mouseTarget.y - this.mouse.y) * mk
    const px = this.opts.parallaxPx ?? 10
    // In fractions of the viewport height. Image shifts opposite the cursor (window feel).
    const parallaxX = (-this.mouse.x * 2 * px) / vh
    const parallaxY = (this.mouse.y * 2 * px) / vh

    // Camera path through the endless field, driven by scroll.
    const s = this.scrollY / vh // scroll in viewport heights
    const camX = (Math.cos(s * 0.7) - 1) * 0.16 + s * 0.055
    const camY = -s * 0.3
    const camRot = Math.sin(s * 0.5) * 0.085
    const zoom = this.scene.zoom * (1 + 0.025 * Math.sin(s * 1.1 + 0.4)) * (1 - this.ripple * 0.012)

    return {
      time: this.time,
      flow: this.flow,
      camX,
      camY,
      camRot,
      zoom,
      parallaxX,
      parallaxY,
      waveAmp: this.scene.waveAmp,
      warpScale: this.scene.warpScale,
      lightAngle: this.scene.highlightAngle,
      lightStr: this.scene.highlight,
      stars: this.scene.stars,
      darkness: this.scene.darkness,
      contrast: this.scene.contrast,
      hue: this.scene.hueShift,
      ripple: this.ripple,
    }
  }
}
