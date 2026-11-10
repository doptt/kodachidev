import { useSyncExternalStore } from 'react'

function subscribe(query: string) {
  return (onChange: () => void) => {
    const mql = window.matchMedia(query)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }
}

/** SSR-safe media query hook. Returns `fallback` before hydration. */
export function useMediaQuery(query: string, fallback = false) {
  return useSyncExternalStore(
    subscribe(query),
    () => window.matchMedia(query).matches,
    () => fallback,
  )
}

/** True on touch-first devices (no fine pointer). */
export function useCoarsePointer() {
  return useMediaQuery('(pointer: coarse)')
}

/** True when the user asked for less motion. */
export function usePrefersReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
