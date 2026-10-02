import { useEffect, useRef, useState } from 'react'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Sets `visible` once the element is about 10% into the screen, then stops
// watching. The huge top margin counts anything already above the screen as
// seen, so jumping past content (anchor links, the End key) can't leave it
// hidden. Threshold 0 so elements taller than the screen still trigger.
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
