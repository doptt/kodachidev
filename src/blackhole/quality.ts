/**
 * Quality tiers and the governor that steps down through them when the frame
 * rate can't hold.
 */
export type TierName = 'ultra' | 'high' | 'medium' | 'low'

export type Quality = {
  name: TierName
  /** Internal render size as a fraction of the canvas. */
  scale: number
  /** How far above the canvas size the internal render may go when there is room in the budget. */
  supersample: number
  /** Cap on internal render pixels when supersampling. */
  maxInternal: number
  /** Cap on devicePixelRatio for the canvas itself. */
  maxDpr: number
  /** Cap on canvas pixels, so a 4K retina screen doesn't ask for 30 MP. */
  maxPixels: number
  /** Ray-march step budget. */
  steps: number
  /** Detail level (3..5): strand octaves; 5 adds the veil. */
  detail: number
  /** Bloom mip levels. */
  bloom: number
  /** Samples in the radial smear. */
  smearTaps: number
}

export const TIER_ORDER: readonly TierName[] = ['ultra', 'high', 'medium', 'low']

export const TIERS: Record<TierName, Quality> = {
  ultra: { name: 'ultra', scale: 1, supersample: 1.5, maxInternal: 5.4e6, maxDpr: 2, maxPixels: 5.2e6, steps: 300, detail: 5, bloom: 7, smearTaps: 14 },
  high: { name: 'high', scale: 0.8, supersample: 1, maxInternal: 4.2e6, maxDpr: 2, maxPixels: 4.2e6, steps: 220, detail: 5, bloom: 6, smearTaps: 12 },
  medium: { name: 'medium', scale: 0.7, supersample: 1, maxInternal: 3e6, maxDpr: 1.5, maxPixels: 3e6, steps: 150, detail: 4, bloom: 5, smearTaps: 8 },
  low: { name: 'low', scale: 0.58, supersample: 1, maxInternal: 2e6, maxDpr: 1.5, maxPixels: 2e6, steps: 110, detail: 4, bloom: 4, smearTaps: 6 },
}

export function isTier(name: string | null | undefined): name is TierName {
  return !!name && name in TIERS
}

/**
 * First guess from the GPU's name and the kind of device. Returns null when
 * the scene shouldn't run at all (software rendering), so the caller can show
 * the still image instead.
 */
export function pickTier(gpu: string, opts: { coarsePointer: boolean; memoryGb?: number; cores?: number }): TierName | null {
  const g = gpu.toLowerCase()
  if (/swiftshader|llvmpipe|softpipe|software|basic render/.test(g)) return null
  if (opts.coarsePointer) {
    // Phones and tablets. Recent Apple chips and flagship Android GPUs get one step more.
    if (/apple (a1[5-9]|a[2-9]\d|m\d)|adreno \(tm\) (7[3-9]\d|8\d\d)|immortalis/.test(g)) return 'medium'
    if ((opts.memoryGb ?? 4) <= 3 || (opts.cores ?? 8) <= 4) return null
    return 'low'
  }
  if (/rtx|radeon rx (5[6-9]|[6-9])\d{2,3}|rx (6|7|8|9)\d{3}|arc\(tm\) a[57]\d\d|apple m\d (pro|max|ultra)|geforce gtx 1[06][6-9]0|gtx 10[78]0|titan/.test(g)) return 'ultra'
  if (/apple m\d|apple gpu|geforce|radeon rx|arc|quadro|radeon pro/.test(g)) return 'high'
  if (/iris|uhd|radeon|adreno|mali|intel/.test(g)) return 'medium'
  // Unknown desktop GPU: start in the middle and let the governor sort it out
  return 'high'
}

/**
 * Watches frame times and asks for a lower tier when the average falls under
 * the floor for a sustained stretch. It only ever steps down: stepping back up
 * invites oscillation, and a slightly softer image is less noticeable than a
 * stutter.
 *
 * It is looking for a GPU that cannot keep up, not for hitches. Starting the
 * scene costs a few long frames whatever the hardware (shaders compile on
 * first use), so it sits out a grace period whenever rendering starts or
 * resumes, and no single long frame counts for more than a slightly slow one.
 */
/** Frames ignored after rendering starts or resumes, while shaders compile and the first frames settle. */
const START_GRACE_MS = 1500

export class Governor {
  private ema = 16.7
  private slowMs = 0
  private settleMs = START_GRACE_MS

  private tier: TierName
  private opts: { floorFps?: number; sustainMs?: number; settleMs?: number }

  constructor(tier: TierName, opts: { floorFps?: number; sustainMs?: number; settleMs?: number } = {}) {
    this.tier = tier
    this.opts = opts
  }

  get current() {
    return this.tier
  }

  /** Call when rendering starts or resumes: the next stretch of frames is not judged. */
  rest(ms = START_GRACE_MS) {
    this.settleMs = Math.max(this.settleMs, ms)
    this.slowMs = 0
    this.ema = 16.7
  }

  /** Feed one frame's duration. Returns the new tier when it changes, otherwise null. */
  sample(frameMs: number): TierName | null {
    // Ignore the gaps left by tab switches and long tasks unrelated to rendering
    if (frameMs > 250) return null
    // A hitch is one bad frame, not evidence of a slow GPU: cap what it can contribute
    const dtMs = Math.min(frameMs, 40)
    const floor = 1000 / (this.opts.floorFps ?? 50)
    this.ema += (dtMs - this.ema) * 0.08
    // Give a freshly applied tier a moment before judging it
    if (this.settleMs > 0) {
      this.settleMs -= dtMs
      return null
    }
    this.slowMs = this.ema > floor ? this.slowMs + dtMs : Math.max(0, this.slowMs - dtMs * 2)
    if (this.slowMs < (this.opts.sustainMs ?? 900)) return null
    const i = TIER_ORDER.indexOf(this.tier)
    if (i >= TIER_ORDER.length - 1) return null
    this.tier = TIER_ORDER[i + 1]
    this.slowMs = 0
    this.settleMs = this.opts.settleMs ?? 700
    this.ema = 16.7
    return this.tier
  }

  get fps() {
    return 1000 / this.ema
  }
}
