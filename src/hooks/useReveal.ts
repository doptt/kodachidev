import { useEffect, useRef, useState } from 'react'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/*
 * Flips `visible` to true once the element's top edge is about 10% above the
 * bottom of the screen, then stops watching.
 *
 * The root margin does two jobs:
 *   - The -10% bottom means things reveal a little after they peek in, not
 *     the instant a single pixel shows.
 *   - The huge top margin counts anything *above* the screen as seen. That
 *     covers jumps (End key, anchor links, fast flicks) that skip right past
 *     an element; without it, that content would stay invisible until you
 *     scrolled back up to it.
 *
 * threshold 0 (rather than e.g. 0.1) matters for tall elements: a block
 * taller than the screen can never be 10% visible on a short phone.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(rootMargin = '100000px 0px -10% 0px') {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(prefersReducedMotion)

  useEffect(() => {
    const el = ref.current
    if (!el || visible) return

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0, rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin, visible])

  return { ref, visible }
}
