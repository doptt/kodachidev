import { useSyncExternalStore } from 'react'

// Touch screens with a short side under 600px. Tablets and any desktop
// window, however narrow, get the full hero.
const QUERY = '(pointer: coarse) and (max-width: 599px), (pointer: coarse) and (max-height: 599px)'

const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export function useIsPhone() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches)
}
