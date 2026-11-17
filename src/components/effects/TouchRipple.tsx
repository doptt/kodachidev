import { useEffect, useRef } from 'react'
import { useCoarsePointer, usePrefersReducedMotion } from '@/hooks/useMediaQuery'

/** How many rings can be on screen at once: one per finger of a quick double tap. */
const RINGS = 3
const SIZE = 96 // px, fully open: wider than a fingertip, so it is seen round it
const LIFE = 620 // ms

/**
 * The phone's answer to CursorCircle. There is no cursor to trail on a touch
 * screen, and a circle under a finger would never be seen, so the same
 * translucent ring opens out from under the finger wherever it lands and fades
 * as it goes: the page answers a touch the way it answers the mouse. Like the
 * cursor it takes the page's colour (periwinkle on the lit page, cream in the
 * dark) and never takes a touch itself.
 *
 * Only transform and opacity animate, on three small elements made once.
 * Rendered on touch devices only; nothing at all under reduced motion.
 */
export function TouchRipple() {
  const rootRef = useRef<HTMLDivElement>(null)
  const coarse = useCoarsePointer()
  const reduced = usePrefersReducedMotion()
  const on = coarse && !reduced

  useEffect(() => {
    const root = rootRef.current
    if (!on || !root) return
    const rings = Array.from(root.children) as HTMLElement[]
    let next = 0
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      const ring = rings[next]
      next = (next + 1) % rings.length
      ring.style.left = `${e.clientX - SIZE / 2}px`
      ring.style.top = `${e.clientY - SIZE / 2}px`
      ring.getAnimations().forEach((a) => a.cancel())
      ring.animate(
        [
          { opacity: 0.9, transform: 'scale(0.3)' },
          { opacity: 0.45, transform: 'scale(0.72)', offset: 0.45 },
          { opacity: 0, transform: 'scale(1)' },
        ],
        { duration: LIFE, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      )
    }
    window.addEventListener('pointerdown', onDown, { passive: true })
    return () => window.removeEventListener('pointerdown', onDown)
  }, [on])

  if (!on) return null

  return (
    <div ref={rootRef} data-bh-vars="theme" aria-hidden="true" className="touch-ripples pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {Array.from({ length: RINGS }, (_, i) => (
        <i key={i} className="touch-ripple absolute block rounded-full opacity-0" style={{ width: SIZE, height: SIZE }} />
      ))}
    </div>
  )
}
