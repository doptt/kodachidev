import { useEffect, type RefObject } from 'react'

const POINTS = 18 // circles in the trail, head first
const HEAD = 0.17 // radius of the head circle, as a share of the font size
const FOLLOW = 0.42 // how quickly the head catches the pointer (0–1 per frame at 60fps)
const CHAIN = 0.5 // how quickly each circle catches the one ahead of it
const GROW = 0.14 // how quickly the trail swells in and out as the pointer enters and leaves

/**
 * Cuts a trail of circles that follows the pointer out of `el`, by writing a
 * CSS mask made of one radial gradient per circle. Everything outside the
 * circles is masked away, so the element only shows where the trail is.
 *
 * The head chases the pointer and every circle after it chases the one in
 * front, smaller each time, so a quick stroke leaves a tapering tail that
 * draws back into the head once the pointer stops. The trail swells in when
 * the pointer comes over the element and shrinks away when it leaves.
 *
 * Runs only while the element is on screen and the pointer is a mouse or pen.
 * Under reduced motion it is a single circle that sits on the pointer.
 */
export function useInkTrail(ref: RefObject<HTMLElement | null>, { enabled, reduced }: { enabled: boolean; reduced: boolean }) {
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    const count = reduced ? 1 : POINTS
    const pts = Array.from({ length: count }, () => ({ x: 0, y: 0 }))
    const pointer = { x: -1e4, y: -1e4, seen: false }
    let grow = 0
    let raf = 0
    let last = 0
    let visible = false
    let wasEmpty = true

    const hide = () => {
      el.style.maskImage = 'linear-gradient(transparent, transparent)'
      el.style.webkitMaskImage = el.style.maskImage
    }
    hide()

    const tick = (now: number) => {
      const dt = last ? Math.min(64, now - last) / 16.67 : 1
      last = now
      const rect = el.getBoundingClientRect()
      const size = parseFloat(getComputedStyle(el).fontSize) || 100
      const head = size * HEAD

      // Over the words, give or take the head's own size
      const over =
        pointer.seen &&
        pointer.x > rect.left - head &&
        pointer.x < rect.right + head &&
        pointer.y > rect.top - head &&
        pointer.y < rect.bottom + head

      const ease = (k: number) => (reduced ? 1 : 1 - Math.pow(1 - k, dt))
      grow += ((over ? 1 : 0) - grow) * ease(GROW)

      // Work in the element's own coordinates, so the trail scrolls with the words
      const tx = pointer.x - rect.left
      const ty = pointer.y - rect.top
      pts[0].x += (tx - pts[0].x) * ease(FOLLOW)
      pts[0].y += (ty - pts[0].y) * ease(FOLLOW)
      for (let i = 1; i < count; i++) {
        pts[i].x += (pts[i - 1].x - pts[i].x) * ease(CHAIN)
        pts[i].y += (pts[i - 1].y - pts[i].y) * ease(CHAIN)
      }

      if (grow < 0.005) {
        if (!wasEmpty) hide()
        wasEmpty = true
        // Nothing to draw and nothing coming: sleep until the pointer moves again
        if (!over) {
          raf = 0
          return
        }
      } else {
        wasEmpty = false
        const layers = pts.map((p, i) => {
          const r = head * grow * Math.pow(1 - i / (count + 1), 0.7)
          return `radial-gradient(circle ${r.toFixed(1)}px at ${p.x.toFixed(1)}px ${p.y.toFixed(1)}px, #000 calc(100% - 1.5px), transparent)`
        })
        el.style.maskImage = layers.join(',')
        el.style.webkitMaskImage = el.style.maskImage
      }
      raf = requestAnimationFrame(tick)
    }

    const start = () => {
      if (raf) return
      last = 0
      raf = requestAnimationFrame(tick)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      if (!pointer.seen) {
        // Start the whole trail on the pointer instead of sweeping in from a corner
        const rect = el.getBoundingClientRect()
        for (const p of pts) {
          p.x = e.clientX - rect.left
          p.y = e.clientY - rect.top
        }
      }
      pointer.x = e.clientX
      pointer.y = e.clientY
      pointer.seen = true
      if (visible) start()
    }
    const onLeave = () => {
      pointer.x = pointer.y = -1e4
    }

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible && pointer.seen) start()
      else if (!visible) {
        stop()
        grow = 0
        hide()
        wasEmpty = true
      }
    })
    io.observe(el)

    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      stop()
      io.disconnect()
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      el.style.maskImage = ''
      el.style.webkitMaskImage = ''
    }
  }, [ref, enabled, reduced])
}
