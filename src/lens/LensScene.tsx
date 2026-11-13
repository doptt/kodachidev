import { useEffect, useRef } from 'react'
import { runStandalone } from '@/stage/standalone'
import { createLensScene } from './scene'
import type { LensFrame, Tune } from './timeline'

export type LensSceneProps = {
  /** Current pinned scroll progress, 0..1. Read every frame, so pass a stable function. */
  progress: () => number
  /** One screenshot per project, in order. */
  images: readonly string[]
  /** Adjusts the frame before it is drawn. */
  tweak?: (frame: LensFrame) => LensFrame
  /** Another resting height or framing to try. Changing it restarts the scene. */
  tune?: { radius?: number } & Tune
  /** Called when WebGL is not up to it. */
  onFail?: () => void
  className?: string
}

/**
 * The lensed sky on a canvas of its own, for the dev harness page. On the site
 * itself the same scene (scene.ts) is drawn by the shared stage instead.
 */
export default function LensScene({ progress, images, tweak, tune, onFail, className }: LensSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cb = useRef({ progress, tweak, onFail })
  cb.current = { progress, tweak, onFail }
  // Joined so that a new array with the same contents does not restart the scene
  const key = images.join('\n')
  const tuning = JSON.stringify(tune ?? {})

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const tuned = JSON.parse(tuning)
    const run = runStandalone(
      canvas,
      createLensScene({
        progress: () => cb.current.progress(),
        images: key.split('\n'),
        tweak: (f) => (cb.current.tweak ? cb.current.tweak(f) : f),
        tune: () => tuned,
      }),
      { onFail: () => cb.current.onFail?.() },
    )
    return run.stop
  }, [key, tuning])

  return <canvas ref={canvasRef} aria-hidden="true" className={className} style={{ display: 'block', width: '100%', height: '100%' }} />
}
