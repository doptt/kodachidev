import { useEffect, type RefObject } from 'react'

const POINTS = 18 // points the tail follows, head first
const MAX_STAMPS = 72 // most circles used to draw the tail's outline in one frame
const HEAD = 0.17 // radius of the head circle, as a share of the font size
const FOLLOW = 0.42 // how quickly the head catches the pointer (0–1 per frame at 60fps)
const CHAIN = 0.5 // how quickly each circle catches the one ahead of it
const GROW = 0.14 // how quickly the trail swells in and out as the pointer enters and leaves

/**
 * Cuts a tapering tail that follows the pointer out of `el`, by writing a CSS
 * mask. Everything outside the tail is masked away, so the element only shows
 * where the tail is.
 *
 * The head chases the pointer and every point after it chases the one in
 * front, so a quick stroke leaves a tail that draws back into the head once
 * the pointer stops. The tail is drawn by stamping circles close together
 * along a smooth curve through those points, narrowing towards the end, so
 * it reads as one soft shape rather than a string of beads. The trail swells in when
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
        const layers = stamps(pts, head * grow).map(
          ({ x, y, r }) =>
            `radial-gradient(circle ${r.toFixed(1)}px at ${x.toFixed(1)}px ${y.toFixed(1)}px, #000 calc(100% - 1.5px), transparent)`,
        )
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

type Pt = { x: number; y: number }

/** Point on a Catmull-Rom curve through p1..p2 (p0 and p3 steer it), at t in 0–1 */
function catmull(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const t2 = t * t
  const t3 = t2 * t
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) }
}

/**
 * Circles that together draw the tail: a smooth curve through the trail's
 * points, `head` wide at the front and narrowing to nothing at the end, with
 * circles packed tightly enough along it that their edges blend into one
 * outline.
 */
function stamps(pts: Pt[], head: number) {
  // Smooth the trail into a dense polyline
  const line: Pt[] = [pts[0]]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    for (let s = 1; s <= 4; s++) line.push(catmull(p0, pts[i], pts[i + 1], p3, s / 4))
  }
  const lengths = [0]
  for (let i = 1; i < line.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y))
  }
  const total = lengths[lengths.length - 1]
  const width = (d: number) => head * Math.pow(1 - d / (total + head * 0.5), 0.8)

  const out = [{ x: line[0].x, y: line[0].y, r: head }]
  if (total < 0.5) return out
  // Step a fraction of the local width, so the outline stays smooth as it narrows
  const spacing = Math.max(1, (total / MAX_STAMPS) * 0.6)
  let d = 0
  let seg = 1
  while (out.length < MAX_STAMPS) {
    d += Math.max(spacing, width(d) * 0.22)
    if (d >= total) break
    while (lengths[seg] < d) seg++
    const a = line[seg - 1]
    const b = line[seg]
    const t = (d - lengths[seg - 1]) / (lengths[seg] - lengths[seg - 1] || 1)
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, r: width(d) })
  }
  return out
}
