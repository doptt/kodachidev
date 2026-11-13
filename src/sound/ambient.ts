import { blackHole } from '@/blackhole/state'
import { stage } from '@/stage/stage'

/**
 * Ambient sound, made in the browser: nothing is downloaded. Off until the
 * visitor turns it on (see SoundToggle), and it never starts by itself.
 *
 * One low drone runs under the whole page and is re-voiced by where the
 * visitor is: quiet and warm over the first sections; sinking in pitch and
 * closing in as they fall into the black hole, with a rush of air building
 * over it; open and glassy in the lensed sky; a soft, high hum on the moon.
 * Every change is a slow glide, so scrolling never makes it jump.
 */

type Voice = {
  /** Pitch of the drone as a multiple of its root. */
  pitch: number
  /** Low-pass cutoff on the drone, Hz. */
  cutoff: number
  /** Level of the drone, the rush of air and the high shimmer, 0..1. */
  drone: number
  air: number
  shimmer: number
}

const ROOT = 55 // A1
const MASTER = 0.16
/** How fast the voice glides to a new setting, seconds (time constant). */
const GLIDE = 0.9

const mix = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

/** Where the page is, as the sound for it. */
function voiceNow(): Voice {
  const scene = stage.active
  if (scene === 'moon') return { pitch: 2, cutoff: 520, drone: 0.5, air: 0.12, shimmer: 0.3 }
  if (scene === 'lens') return { pitch: 1.5, cutoff: 900, drone: 0.7, air: 0.05, shimmer: 0.5 }
  // The black hole: the fall is 0 while it idles and 1 at the black
  const near = blackHole.arrive
  if (near > 0.01 && blackHole.theme > 0.5) {
    const fall = clamp01((blackHole.progress - 0.13) / 0.8)
    return {
      pitch: mix(1, 0.5, fall * fall),
      cutoff: mix(320, 1400, Math.sin(Math.PI * clamp01(fall * 1.15))) * mix(1, 0.25, clamp01((fall - 0.85) / 0.15)),
      drone: mix(0.75, 1, fall) * near,
      air: 0.9 * fall * fall,
      shimmer: 0.15 * (1 - fall),
    }
  }
  // The dark between scenes, and the lit page above it
  return blackHole.theme > 0.5 ? { pitch: 1, cutoff: 260, drone: 0.5, air: 0.03, shimmer: 0.1 } : { pitch: 1, cutoff: 420, drone: 0.4, air: 0, shimmer: 0.18 }
}

type Rig = {
  ctx: AudioContext
  master: GainNode
  oscs: OscillatorNode[]
  filter: BiquadFilterNode
  drone: GainNode
  air: GainNode
  airFilter: BiquadFilterNode
  shimmer: GainNode
  shimmerOscs: OscillatorNode[]
  timer: number
}

let rig: Rig | null = null
let on = false
const listeners = new Set<() => void>()

function build(): Rig | null {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  const ctx = new Ctx()
  const master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)

  // The drone: a root, a fifth and an octave, each a hair out of tune so they beat slowly
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 0.7
  const drone = ctx.createGain()
  drone.gain.value = 0
  filter.connect(drone).connect(master)
  const oscs = [
    { ratio: 1, type: 'sine' as const, level: 0.9 },
    { ratio: 1.498, type: 'sine' as const, level: 0.42 },
    { ratio: 2.004, type: 'triangle' as const, level: 0.2 },
    { ratio: 0.5, type: 'sine' as const, level: 0.6 },
  ].map(({ ratio, type, level }) => {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = ROOT * ratio
    const gain = ctx.createGain()
    gain.gain.value = level
    osc.connect(gain).connect(filter)
    osc.start()
    return osc
  })

  // The rush of air: two seconds of noise, looped, through a band-pass
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let lastSample = 0
  for (let i = 0; i < data.length; i++) {
    // Brown-ish noise: each sample leans on the one before, which takes the hiss off
    lastSample = (lastSample + 0.03 * (Math.random() * 2 - 1)) / 1.03
    data[i] = lastSample * 3.2
  }
  const noise = ctx.createBufferSource()
  noise.buffer = buffer
  noise.loop = true
  const airFilter = ctx.createBiquadFilter()
  airFilter.type = 'bandpass'
  airFilter.frequency.value = 500
  airFilter.Q.value = 0.6
  const air = ctx.createGain()
  air.gain.value = 0
  noise.connect(airFilter).connect(air).connect(master)
  noise.start()

  // The shimmer: two high, quiet partials
  const shimmer = ctx.createGain()
  shimmer.gain.value = 0
  shimmer.connect(master)
  const shimmerOscs = [8, 12.02].map((ratio) => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = ROOT * ratio
    const gain = ctx.createGain()
    gain.gain.value = 0.05
    osc.connect(gain).connect(shimmer)
    osc.start()
    return osc
  })

  return { ctx, master, oscs, filter, drone, air, airFilter, shimmer, shimmerOscs, timer: 0 }
}

const RATIOS = [1, 1.498, 2.004, 0.5]
const SHIMMER_RATIOS = [8, 12.02]

/** Moves the voice toward where the page is now. Called a few times a second while the sound is on. */
function follow() {
  if (!rig) return
  const { ctx } = rig
  const v = voiceNow()
  const t = ctx.currentTime
  rig.oscs.forEach((osc, i) => osc.frequency.setTargetAtTime(ROOT * RATIOS[i] * v.pitch, t, GLIDE))
  rig.shimmerOscs.forEach((osc, i) => osc.frequency.setTargetAtTime(ROOT * SHIMMER_RATIOS[i] * v.pitch, t, GLIDE))
  rig.filter.frequency.setTargetAtTime(Math.max(40, v.cutoff), t, GLIDE)
  rig.drone.gain.setTargetAtTime(v.drone, t, GLIDE)
  rig.air.gain.setTargetAtTime(v.air * 0.5, t, GLIDE)
  rig.airFilter.frequency.setTargetAtTime(mix(380, 1500, v.air), t, GLIDE)
  rig.shimmer.gain.setTargetAtTime(v.shimmer, t, GLIDE)
}

const onVisibility = () => {
  if (!rig) return
  // Silent in a background tab
  if (document.hidden) void rig.ctx.suspend()
  else if (on) void rig.ctx.resume()
}

export const ambient = {
  get on() {
    return on
  },

  /** Turns the sound on or off. Must be called from a click or a key press the first time (browsers require it). */
  set(next: boolean) {
    if (next === on) return
    if (next && !rig) {
      rig = build()
      if (!rig) return
      document.addEventListener('visibilitychange', onVisibility)
    }
    if (!rig) return
    on = next
    const { ctx, master } = rig
    if (on) {
      void ctx.resume()
      follow()
      master.gain.setTargetAtTime(MASTER, ctx.currentTime, 0.6)
      rig.timer = window.setInterval(follow, 120)
    } else {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.25)
      window.clearInterval(rig.timer)
      // Stop the clock once the fade has finished, so nothing runs while it is off
      const held = rig
      window.setTimeout(() => {
        if (!on) void held.ctx.suspend()
      }, 1200)
    }
    for (const fn of listeners) fn()
  },

  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
}
