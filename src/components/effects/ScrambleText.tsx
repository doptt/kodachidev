import { useEffect, useRef } from 'react'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/cn'

/** Letters a word is made of while it has not resolved yet. */
const GLYPHS = 'abcdefghijklmnopqrstuvwxyz'
/** Characters resolved per second. */
const SPEED = 30
/** How long a word sits fully scrambled before it starts to resolve, seconds. */
const HOLD = 0.14
/** How often the unresolved letters change, seconds. */
const FLICKER = 0.06
/** How long a word stays bright after it resolves, seconds. */
const HOT = 0.55
/** Seconds between one word of the opening wave starting and the next. */
const WAVE_STEP = 0.034
/** Words within this many pixels of the pointer scramble again. */
const REACH = 64

type Word = {
  text: string
  el: HTMLElement
  done: HTMLElement
  todo: HTMLElement
  /** Characters resolved so far; negative while the word is holding fully scrambled. */
  n: number
  /** Seconds before this word scrambles. */
  wait: number
  /** Seconds since its unresolved letters last changed. */
  flick: number
  /** Seconds left of staying bright; below zero means not in that phase. */
  hot: number
  active: boolean
}

function noise(length: number) {
  let out = ''
  for (let i = 0; i < length; i++) out += GLYPHS[(Math.random() * GLYPHS.length) | 0]
  return out
}

/**
 * A paragraph that decodes itself. The first time it scrolls into view it
 * fades up while a wave runs through it in reading order: each word in turn
 * breaks into scrambled letters, resolves from left to right and flashes
 * bright as it lands. After that the odd word keeps re-scrambling, and so do
 * the words near the pointer.
 *
 * Only a dozen or so words are ever in motion at once; the rest are plain
 * text and cost nothing. It needs a monospace font, so letters can change
 * without the lines moving. The real text is always in the page for assistive
 * technology; the animated copy is hidden from it. With reduced motion it is
 * just the text.
 */
export function ScrambleText({ text, as: Tag = 'p', className }: { text: string; as?: 'p' | 'span' | 'div'; className?: string }) {
  const box = useRef<HTMLElement>(null)
  const visual = useRef<HTMLSpanElement>(null)
  const reduced = usePrefersReducedMotion()
  const tokens = text.split(/\s+/).filter(Boolean)

  useEffect(() => {
    const container = box.current
    const root = visual.current
    if (!container || !root || reduced) return

    const words: Word[] = Array.from(root.querySelectorAll<HTMLElement>('.scramble-word')).map((el, i) => ({
      text: tokens[i],
      el,
      done: el.firstElementChild as HTMLElement,
      todo: el.lastElementChild as HTMLElement,
      n: 0,
      wait: 0,
      flick: 0,
      hot: -1,
      active: false,
    }))

    let raf = 0
    let last = 0
    let revealed = false
    let inView = false
    let ambient = 0

    const paint = (w: Word) => {
      const n = Math.max(0, Math.min(w.text.length, Math.floor(w.n)))
      w.done.textContent = w.text.slice(0, n)
      w.todo.textContent = noise(w.text.length - n)
    }
    /** Queues a word to scramble after `wait` seconds. Until then it stays as it is. */
    const scramble = (w: Word, wait: number) => {
      w.n = -HOLD * SPEED
      w.wait = wait
      w.flick = 0
      w.hot = -1
      w.active = true
      w.el.classList.remove('is-hot')
    }

    const frame = (now: number) => {
      raf = 0
      const dt = Math.min(last ? (now - last) / 1000 : 1 / 60, 0.05)
      last = now
      let busy = false
      for (const w of words) {
        if (!w.active) continue
        busy = true
        if (w.hot >= 0) {
          // Resolved: glow for a moment, then settle
          w.hot -= dt
          if (w.hot < 0) {
            w.el.classList.remove('is-hot')
            w.active = false
          }
          continue
        }
        if (w.wait > 0) {
          w.wait -= dt
          if (w.wait > 0) continue
          paint(w)
        }
        const before = Math.floor(w.n)
        w.n += SPEED * dt
        w.flick += dt
        if (w.n >= w.text.length) {
          w.done.textContent = w.text
          w.todo.textContent = ''
          w.el.classList.add('is-hot')
          w.hot = HOT
        } else if (Math.floor(w.n) !== before || w.flick >= FLICKER) {
          w.flick = 0
          paint(w)
        }
      }
      if (busy) raf = requestAnimationFrame(frame)
      else last = 0
    }
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(frame)
    }

    // Afterwards, now and then, a word or two scrambles again
    const shimmer = () => {
      ambient = 0
      if (!inView) return
      const idle = words.filter((w) => !w.active)
      for (let i = 0; i < 2 && idle.length; i++) {
        const [w] = idle.splice((Math.random() * idle.length) | 0, 1)
        scramble(w, Math.random() * 0.4)
      }
      wake()
      ambient = window.setTimeout(shimmer, 900 + Math.random() * 1100)
    }

    const io = new IntersectionObserver(
      (entries) => {
        inView = entries.some((e) => e.isIntersecting)
        if (!inView) return
        if (!revealed) {
          revealed = true
          container.classList.add('is-shown')
          // The opening wave: reading order, each word a touch early or late
          words.forEach((w, i) => scramble(w, i * WAVE_STEP + Math.random() * 0.12))
          wake()
          ambient = window.setTimeout(shimmer, words.length * WAVE_STEP * 1000 + 1200)
        } else if (!ambient) {
          ambient = window.setTimeout(shimmer, 600)
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    io.observe(root)

    let pending: PointerEvent | null = null
    const onMove = (e: PointerEvent) => {
      if (!revealed || e.pointerType === 'touch') return
      if (pending) {
        pending = e
        return
      }
      pending = e
      requestAnimationFrame(() => {
        const p = pending
        pending = null
        if (!p) return
        for (const w of words) {
          if (w.active) continue
          const r = w.el.getBoundingClientRect()
          const dx = Math.max(r.left - p.clientX, 0, p.clientX - r.right)
          const dy = Math.max(r.top - p.clientY, 0, p.clientY - r.bottom)
          if (dx * dx + dy * dy < REACH * REACH) scramble(w, Math.random() * 0.1)
        }
        wake()
      })
    }
    root.addEventListener('pointermove', onMove, { passive: true })

    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.clearTimeout(ambient)
      io.disconnect()
      root.removeEventListener('pointermove', onMove)
      // Leave the real text behind
      for (const w of words) {
        w.done.textContent = w.text
        w.todo.textContent = ''
        w.el.classList.remove('is-hot')
      }
    }
    // The words are derived from `text`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, reduced])

  return (
    <Tag ref={box as never} className={cn('scramble', reduced && 'is-shown', className)}>
      <span className="sr-only">{text}</span>
      <span ref={visual} aria-hidden="true">
        {tokens.map((word, i) => (
          <span key={i}>
            <span className="scramble-word">
              <span className="scramble-done">{word}</span>
              <span className="scramble-todo" />
            </span>{' '}
          </span>
        ))}
      </span>
    </Tag>
  )
}
