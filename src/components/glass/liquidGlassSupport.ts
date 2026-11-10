/**
 * Chromium is the only engine that renders `backdrop-filter: url(#svg-filter)`
 * with feDisplacementMap correctly. Safari and Firefox both *claim* support
 * (CSS.supports returns true) but render nothing or drop the backdrop, so the
 * CSS probe alone is not enough — we also require a Chromium UA brand.
 */
let cached: boolean | null = null

type UAData = { brands?: Array<{ brand: string }> }

export function supportsLiquidGlass(): boolean {
  if (cached !== null) return cached
  if (typeof window === 'undefined') return false
  // Escape hatch for testing the blur-only fallback in Chromium: ?noliquid
  if (window.location.search.includes('noliquid')) return (cached = false)

  const uaData = (navigator as Navigator & { userAgentData?: UAData }).userAgentData
  // Only Chromium ships navigator.userAgentData; Firefox and Safari do not.
  const isChromium = !!uaData?.brands?.some((b) => /Chromium/i.test(b.brand))

  const cssOk =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    (CSS.supports('backdrop-filter', 'url(#liquid-probe)') ||
      CSS.supports('-webkit-backdrop-filter', 'url(#liquid-probe)'))

  const reducedData = window.matchMedia?.('(prefers-reduced-data: reduce)').matches ?? false

  cached = isChromium && cssOk && !reducedData
  return cached
}
