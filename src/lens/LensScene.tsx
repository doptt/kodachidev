import { useEffect, useRef } from 'react'
import { runStandalone } from '@/stage/standalone'
import { createLensScene } from './scene'
import type { LensFrame } from './timeline'

export type LensSceneProps = {
  /** Current pinned scroll progress, 0..1. Read every frame, so pass a stable function. */
  progress: () => number
  /** One screenshot per project, in order. */
  images: readonly string[]
  /** Each project's further views, in the same order. */
  more?: readonly (readonly string[])[]
  /** Where project `index`'s ring of cards is, in cards. Read every frame, so pass a stable function. */
  ring?: (index: number) => number
  /** True while a pointer has hold of a ring. */
  held?: () => boolean
  /** Adjusts the frame before it is drawn. */
  tweak?: (frame: LensFrame) => LensFrame
  /** Called when WebGL is not up to it. */
  onFail?: () => void
  className?: string
}

/**
 * The lensed sky on a canvas of its own, for the dev harness page. On the site
 * itself the same scene (scene.ts) is drawn by the shared stage instead.
 */
export default function LensScene({ progress, images, more, ring, held, tweak, onFail, className }: LensSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cb = useRef({ progress, ring, held, tweak, onFail })
  cb.current = { progress, ring, held, tweak, onFail }
  // Joined so that a new array with the same contents does not restart the scene
  const key = images.join('\n')
  const moreKey = (more ?? []).map((list) => list.join('\t')).join('\n')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const run = runStandalone(
      canvas,
      createLensScene({
        progress: () => cb.current.progress(),
        images: key.split('\n'),
        more: moreKey.split('\n').map((list) => list.split('\t').filter(Boolean)),
        ring: (i) => cb.current.ring?.(i) ?? 0,
        held: () => cb.current.held?.() ?? false,
        tweak: (f) => (cb.current.tweak ? cb.current.tweak(f) : f),
      }),
      { onFail: () => cb.current.onFail?.() },
    )
    return run.stop
  }, [key, moreKey])

  return <canvas ref={canvasRef} aria-hidden="true" className={className} style={{ display: 'block', width: '100%', height: '100%' }} />
}
