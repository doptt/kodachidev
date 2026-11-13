import type { SceneFactory } from '@/stage/types'
import { BackgroundController } from './controller'
import { BackgroundRenderer } from './renderer'

/** Seamlessly tileable 2x3 quilt of video frames; the hero still is its top-left cell. */
const FIELD = '/bg/field.webp'
/** Baked glow of the field's bright specks; optional extra for the shader. */
const BLOOM = '/bg/bloom.webp'

/**
 * The purple field behind the first sections of the page, as a scene on the
 * stage. `veil` (0..1) is how far the page has gone dark for the black hole:
 * the field fades to black with it.
 */
export function createFieldScene(opts: {
  /** Enable the gentle mouse parallax (false on touch devices). */
  mouse: boolean
  /** Force one look regardless of the sections on the page (for tests). */
  forcedScene?: string | null
  veil: () => number
}): SceneFactory {
  return (ctx) => {
    const renderer = new BackgroundRenderer(ctx.gl, ctx.parallel)
    const controller = new BackgroundController({ mouse: opts.mouse, forcedScene: opts.forcedScene })
    const started = renderer.init()
    if (started) {
      void renderer.loadImage(FIELD)
      void renderer.loadBloom(BLOOM)
      controller.start()
    }
    let lastTime = -1

    return {
      prepare: () => (started ? renderer.prepare() : 'failed'),
      render(frame) {
        // After a pause (another scene was showing, or the tab was hidden) start from where the page is now, so nothing lurches
        if (lastTime < 0 || frame.time - lastTime > 0.25) controller.settle()
        lastTime = frame.time
        renderer.render(controller.update(frame.dt), frame.width, frame.height, Math.min(1, Math.max(0, opts.veil())))
      },
      dispose() {
        controller.stop()
        renderer.dispose()
      },
    }
  }
}
