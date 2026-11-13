import { TIERS } from '@/blackhole/quality'
import type { SceneFactory } from '@/stage/types'
import { LensRenderer } from './renderer'
import { lensTimeline, type LensFrame } from './timeline'

/** How long to wait for the screenshots and the star map before showing the sky without whichever are missing, seconds. */
const SHOTS_PATIENCE = 8

/**
 * The lensed sky as a scene on the stage. Purely a picture: scroll is owned by
 * the section, which hands in `progress`; the words that go with each picture
 * are ordinary page content laid over the canvas by the section.
 */
export function createLensScene(opts: {
  /** Current pinned scroll progress, 0..1. Read every frame. */
  progress: () => number
  /** One screenshot per project, in order. */
  images: readonly string[]
  /** Adjusts the frame before it is drawn. For the dev page only. */
  tweak?: (frame: LensFrame) => LensFrame
}): SceneFactory {
  return (ctx) => {
    // Phones get smaller screenshots: four full-size layers are a lot of memory there
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const renderer = new LensRenderer(ctx.gl, ctx.parallel, opts.images, coarse ? { w: 1024, h: 640 } : { w: 1600, h: 1000 })
    renderer.setQuality(TIERS[ctx.tier])
    const started = renderer.init()
    const began = performance.now()
    let programs: 'pending' | 'ready' | 'failed' = started ? 'pending' : 'failed'

    return {
      prepare() {
        if (programs === 'pending') programs = renderer.prepare()
        if (programs !== 'ready') return programs
        // The star map goes to the GPU a face a frame while the scene is still waiting in the wings
        renderer.uploadSky(0)
        // The sky comes up with its pictures and its stars in it, unless something is taking too long
        return (renderer.shotsReady && renderer.skyReady) || performance.now() - began > SHOTS_PATIENCE * 1000 ? 'ready' : 'pending'
      },
      render(frame) {
        const base = lensTimeline(opts.progress(), opts.images.length)
        renderer.render({ time: frame.time, frame: opts.tweak ? opts.tweak(base) : base, pointer: frame.pointer, alive: !frame.still }, frame.width, frame.height)
      },
      warm(frame) {
        // A frame with everything lit, kept off the canvas, so each pass has done whatever it does on first use
        const lit = { ...lensTimeline(0.5, opts.images.length), fade: 1, stars: 1 }
        renderer.render({ time: frame.time, frame: lit, pointer: [0, 0], alive: false }, frame.width, frame.height, false)
      },
      setTier: (tier) => renderer.setQuality(TIERS[tier]),
      stats: () => ({ shots: renderer.shotsReady ? 'ready' : 'loading', sky: renderer.skyReady ? 'ready' : 'loading' }),
      dispose: () => renderer.dispose(),
    }
  }
}
