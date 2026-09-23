import { useRef, useEffect, useState } from 'react'

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * Observes a single element and flips `visible` once it scrolls into view.
 *
 * threshold 0 + a negative bottom rootMargin means "reveal as soon as the
 * element's top edge is ~10% above the bottom of the viewport". That works
 * for elements of any height — a percentage threshold can never be reached
 * by an element taller than the screen, which is what used to leave things
 * stuck invisible.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(rootMargin = '0px 0px -10% 0px') {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(prefersReducedMotion)

  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { threshold: 0, rootMargin }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [rootMargin, visible])

  return { ref, visible }
}
