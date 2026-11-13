/**
 * When he does what. A sip every 6 to 10 seconds, a blink every few seconds
 * (now and then two in a row), and between sips, less often, an ambient beat:
 * a look up at the Earth, a shift in the chair. Nothing overlaps: a beat only
 * starts if it will be over before the next sip is due, so the sips keep
 * their rhythm.
 *
 * Pure and seeded: the same seed gives the same evening, which is what lets a
 * screenshot script ask for "second 12" and get the same picture every time.
 */
export const TIMING = {
  /** Seconds from the start of one sip to the start of the next. */
  sip: [6, 10],
  /** The first sip comes sooner, so a visitor who has just arrived sees one. */
  firstSip: [2.4, 4.2],
  /** Seconds between blinks. */
  blink: [2.2, 6.5],
  /** How often a blink is followed by a second one, and how soon. */
  doubleBlink: 0.16,
  doubleBlinkGap: 0.3,
  /** Seconds between ambient beats. */
  beat: [15, 26],
  /** Breathing room between the end of a beat and the next sip. */
  clear: 0.5,
} as const

export type ScheduleEvents = {
  sip: boolean
  blink: boolean
  /** Index of the ambient beat to start, or -1. */
  beat: number
}

export type Schedule = {
  /** Advances the clock by `dt` and writes what starts in that step into `out`. */
  step(dt: number, out: ScheduleEvents): ScheduleEvents
  /** Seconds since the schedule began. */
  time(): number
}

/** A seeded random number generator (mulberry32): the same seed gives the same sequence. */
export function seededRandom(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * `sipDuration` and `beatDurations` are how long each thing takes, in seconds,
 * so the schedule knows when he is free again.
 */
export function makeSchedule(seed: number, sipDuration: number, beatDurations: readonly number[]): Schedule {
  const random = seededRandom(seed)
  const between = ([lo, hi]: readonly [number, number]) => lo + (hi - lo) * random()
  let time = 0
  let busyUntil = 0
  let nextSip = between(TIMING.firstSip)
  let nextBlink = between(TIMING.blink) * 0.5
  let secondBlink = Infinity
  let nextBeat = between(TIMING.beat) * 0.6
  let beatIndex = 0

  return {
    time: () => time,
    step(dt, out) {
      time += dt
      out.sip = false
      out.blink = false
      out.beat = -1

      if (time >= nextSip && time >= busyUntil) {
        out.sip = true
        busyUntil = time + sipDuration
        nextSip = time + between(TIMING.sip)
      } else if (beatDurations.length > 0 && time >= nextBeat && time >= busyUntil) {
        const duration = beatDurations[beatIndex % beatDurations.length]
        if (time + duration + TIMING.clear <= nextSip) {
          out.beat = beatIndex % beatDurations.length
          beatIndex++
          busyUntil = time + duration
          nextBeat = time + between(TIMING.beat)
        }
      }

      if (time >= secondBlink) {
        out.blink = true
        secondBlink = Infinity
      } else if (time >= nextBlink) {
        out.blink = true
        nextBlink = time + between(TIMING.blink)
        if (random() < TIMING.doubleBlink) secondBlink = time + TIMING.doubleBlinkGap
      }
      return out
    },
  }
}

/**
 * How closed the eyes are, 0..1, `t` seconds into a blink: shut fast, a held
 * instant, open a little slower. 0 outside the blink.
 */
const BLINK = { close: 0.07, hold: 0.035, open: 0.13 }
export const BLINK_DURATION = BLINK.close + BLINK.hold + BLINK.open

export function blinkCurve(t: number) {
  if (t <= 0 || t >= BLINK_DURATION) return 0
  const smooth = (x: number) => x * x * (3 - 2 * x)
  if (t < BLINK.close) return smooth(t / BLINK.close)
  if (t < BLINK.close + BLINK.hold) return 1
  return 1 - smooth((t - BLINK.close - BLINK.hold) / BLINK.open)
}
