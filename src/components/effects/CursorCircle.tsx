import { useEffect, useRef } from 'react'
import { useCoarsePointer, usePrefersReducedMotion } from '@/hooks/useMediaQuery'

const SIZE = 34 // px
const FOLLOW = 0.35 // how quickly the circle catches up (0–1 per frame at 60fps)
const INTERACTIVE = 'a, button, [role="button"], input, textarea, select, label, summary'

/**
 * A translucent circle that trails the mouse. It lags behind the pointer and
 * stretches along the direction of travel, then settles back into a circle.
 * Grows over links and buttons and squeezes while pressed. Replaces the
 * native cursor (hidden via .hide-native-cursor on <html>). Not rendered on
 * touch devices; follows without lag or stretch under reduced motion.
 */
export function CursorCircle() {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const coarse = useCoarsePointer()
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (coarse) return
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return

    const mouse = { x: -100, y: -100 }
    const pos = { x: -100, y: -100 }
    let seen = false
    let raf = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(64, now - last) / 16.67
      last = now
      const k = reduced ? 1 : 1 - Math.pow(1 - FOLLOW, dt)
      pos.x += (mouse.x - pos.x) * k
      pos.y += (mouse.y - pos.y) * k

      // Stretch along the gap between the circle and the pointer
      const dx = mouse.x - pos.x
      const dy = mouse.y - pos.y
      const lag = Math.hypot(dx, dy)
      const stretch = reduced ? 0 : Math.min(lag / 40, 0.5)
      const angle = Math.atan2(dy, dx)
      outer.style.transform =
        `translate3d(${pos.x - SIZE / 2}px, ${pos.y - SIZE / 2}px, 0) ` +
        `rotate(${angle}rad) scale(${1 + stretch}, ${1 - stretch * 0.45})`

      raf = requestAnimationFrame(tick)
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      mouse.x = e.clientX
      mouse.y = e.clientY
      if (!seen) {
        // Start at the pointer instead of flying in from the corner
        seen = true
        pos.x = mouse.x
        pos.y = mouse.y
      }
      outer.style.opacity = '1'
      const target = e.target as Element | null
      inner.dataset.hover = target?.closest(INTERACTIVE) ? 'true' : 'false'
    }
    const onLeave = () => {
      outer.style.opacity = '0'
    }
    const onDown = () => (inner.dataset.pressed = 'true')
    const onUp = () => (inner.dataset.pressed = 'false')

    // The circle replaces the native cursor while it's mounted
    const root = document.documentElement
    root.classList.add('hide-native-cursor')

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      root.classList.remove('hide-native-cursor')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [coarse, reduced])

  if (coarse) return null

  return (
    <div
      ref={outerRef}
      data-bh-vars="dim"
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[100] opacity-0 transition-opacity duration-300 will-change-transform"
      style={{ width: SIZE, height: SIZE }}
    >
      <div ref={innerRef} className="cursor-circle size-full rounded-full" data-hover="false" data-pressed="false" />
    </div>
  )
}
