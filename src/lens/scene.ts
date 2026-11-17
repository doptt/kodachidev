import { TIERS } from '@/blackhole/quality'
import type { SceneFactory } from '@/stage/types'
import { LensRenderer, type ShotSizes } from './renderer'
import { glide, lensTimeline, type Glide, type LensFrame } from './timeline'

/** How long to wait for the screenshots and the star map before showing the sky without whichever are missing, seconds. */
const SHOTS_PATIENCE = 8
/** How quickly the camera's sway takes up with the pointer again once a ring of cards has been let go, per second. */
const SWAY_BACK = 4

/**
 * How large the pictures are kept on the GPU. Every layer is stored with its
 * mipmaps, a third as much again.
 *
 * A mouse and a desk: the projects' first pictures at their full 1600 by 1000
 * (8.5 MB a layer), their further views at 1280 by 800 (5.5 MB a layer), which
 * is still more pixels than a card in the middle covers on all but the largest
 * screens. Four projects with eleven further views between them come to 94 MB,
 * against 34 MB before there were further views.
 *
 * A phone or a tablet: 1024 by 640 (3.5 MB) and 768 by 480 (2 MB), 36 MB in
 * all against 14 MB, for cards that are at most a phone's width across.
 */
const SIZES: Record<'fine' | 'coarse', ShotSizes> = {
  fine: { shot: { w: 1600, h: 1000 }, more: { w: 1280, h: 800 } },
  coarse: { shot: { w: 1024, h: 640 }, more: { w: 768, h: 480 } },
}

/**
 * The lensed sky as a scene on the stage. Purely a picture: scroll is owned by
 * the section, which hands in `progress`; the words that go with each picture
 * are ordinary page content laid over the canvas by the section, and so is
 * whatever turns the rings of cards.
 */
export function createLensScene(opts: {
  /** Current pinned scroll progress, 0..1. Read every frame. */
  progress: () => number
  /** One screenshot per project, in order. */
  images: readonly string[]
  /** Each project's further views, in the same order: the cards beside its first picture. */
  more?: readonly (readonly string[])[]
  /**
   * The phase as it is to be drawn: the section's driver glides it from one project to the next in
   * its own time. Without it the scene draws where the timeline is headed, which steps.
   */
  phase?: () => number | undefined
  /** Where project `index`'s ring of cards is, in cards (see ring.ts). Read every frame. Without it every project shows its first picture. */
  ring?: (index: number) => number
  /** True while a pointer has hold of a ring: the camera then stops swaying with the pointer, so that it does not pull against the drag. */
  held?: () => boolean
  /** Adjusts the frame before it is drawn. For the dev page only. */
  tweak?: (frame: LensFrame) => LensFrame
}): SceneFactory {
  return (ctx) => {
    // Phones get smaller screenshots: full-size layers are a lot of memory there
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const renderer = new LensRenderer(ctx.gl, ctx.parallel, opts.images, opts.more, SIZES[coarse ? 'coarse' : 'fine'])
    renderer.setQuality(TIERS[ctx.tier])
    const started = renderer.init()
    const began = performance.now()
    let programs: 'pending' | 'ready' | 'failed' = started ? 'pending' : 'failed'

    // The camera sways with the pointer. While a ring is held the sway stays where it was when the
    // hold began; let go, it takes up with the pointer again, gently (`grip` runs from 1 back to 0).
    let grip: Glide = { value: 0, velocity: 0 }
    let gripped = false
    const at: [number, number] = [0, 0]
    const sway: [number, number] = [0, 0]
    const ring = opts.images.map(() => 0)

    return {
      prepare() {
        if (programs === 'pending') programs = renderer.prepare()
        if (programs !== 'ready') return programs
        // The star map goes to the GPU a face a frame while the scene is still waiting in the wings
        renderer.uploadSky(0)
        // The sky comes up with its pictures and its stars in it, unless something is taking too long.
        // The further views are not waited for: their cards come up as they arrive.
        return (renderer.shotsReady && renderer.skyReady) || performance.now() - began > SHOTS_PATIENCE * 1000 ? 'ready' : 'pending'
      },
      render(frame) {
        const base = lensTimeline(opts.progress(), opts.images.length)
        base.phase = opts.phase?.() ?? base.phase

        const held = opts.held?.() ?? false
        if (held && !gripped) {
          at[0] = sway[0]
          at[1] = sway[1]
        }
        gripped = held
        grip = held ? { value: 1, velocity: 0 } : glide(grip, 0, frame.dt, SWAY_BACK)
        if (grip.value < 1e-4) grip = { value: 0, velocity: 0 }
        sway[0] = frame.pointer[0] + (at[0] - frame.pointer[0]) * grip.value
        sway[1] = frame.pointer[1] + (at[1] - frame.pointer[1]) * grip.value

        if (opts.ring) for (let i = 0; i < ring.length; i++) ring[i] = opts.ring(i)
        renderer.render({ time: frame.time, frame: opts.tweak ? opts.tweak(base) : base, pointer: sway, ring, alive: !frame.still }, frame.width, frame.height)
      },
      warm(frame) {
        // A frame with everything lit, kept off the canvas, so each pass has done whatever it does on first use
        const lit = { ...lensTimeline(0.5, opts.images.length), fade: 1, stars: 1 }
        renderer.render({ time: frame.time, frame: lit, pointer: [0, 0], alive: false }, frame.width, frame.height, false)
      },
      setTier: (tier) => renderer.setQuality(TIERS[tier]),
      stats: () => ({ shots: renderer.shotsReady ? 'ready' : 'loading', sky: renderer.skyReady ? 'ready' : 'loading', views: renderer.viewsIn }),
      dispose: () => renderer.dispose(),
    }
  }
}
