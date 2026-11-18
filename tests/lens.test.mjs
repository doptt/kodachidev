// Run with `npm test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CRITICAL_B, PHI_MAX, TABLE_SIZE, deflection, deflectionTable, imageAngle, lookup, shadowAngle, skyAngle } from '../src/lens/geodesic.ts'
import {
  GLIDE_RATE,
  HOLD,
  INTRO,
  LIT_FROM,
  MAX_SOURCES,
  OUTRO,
  PER_PROJECT,
  R_END,
  R_HOVER,
  THETA_STEP,
  caption,
  composition,
  glide,
  lensTimeline,
  settledAt,
  sources,
  span,
} from '../src/lens/timeline.ts'
import { GLOW_GONE, RIM_FLARE, RIM_SETTLED, horizonGlow } from '../src/lens/timeline.ts'
import { BEYOND_FROM, BEYOND_TO, LIFT_BY, SINK_FROM, SINK_TO, cameraPitch, closing } from '../src/lens/timeline.ts'

const COUNT = 4
const deg = (d) => (d * Math.PI) / 180
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

// ------------------------------------------------------------ the lens ----

test('far from the hole, light travels in straight lines', () => {
  // In flat space a ray leaving at psi ends up PI - psi round from the zenith
  for (const psi of [deg(60), deg(90), deg(120), deg(170)]) {
    assert.ok(near(deflection(1e7, psi), Math.PI - psi, 1e-4))
  }
  assert.equal(deflection(3, Math.PI), 0)
})

test('weak lensing: a distant ray is bent by 2 / b', () => {
  // Observer far away, ray passing the hole at impact parameter b >> 1
  const r0 = 4000
  for (const b of [40, 80, 160]) {
    const psi = Math.asin((b * Math.sqrt(1 - 1 / r0)) / r0)
    const bent = deflection(r0, psi) - (Math.PI - psi)
    assert.ok(Math.abs(bent - 2 / b) < 0.06 * (2 / b), `b=${b}: ${bent} vs ${2 / b}`)
  }
})

test('the shadow: half the sky at the photon sphere, more inside it, less outside', () => {
  assert.ok(near(shadowAngle(1.5), Math.PI / 2))
  assert.ok(shadowAngle(1.2) > Math.PI / 2)
  assert.ok(shadowAngle(3) < Math.PI / 2)
  // From far away its radius is the critical impact parameter over the distance
  assert.ok(near(shadowAngle(1000), CRITICAL_B / 1000, 1e-5))
  // It closes over the whole sky as the observer reaches the horizon
  assert.ok(shadowAngle(1.0005) > deg(175))
})

test('rays inside the shadow never come back; rays outside it always do', () => {
  for (const r0 of [1.2, 1.5, 1.78, 3, 8]) {
    const edge = shadowAngle(r0)
    assert.equal(deflection(r0, edge - 0.01), PHI_MAX)
    assert.equal(deflection(r0, edge * 0.5), PHI_MAX)
    const out = deflection(r0, edge + 0.01)
    assert.ok(out > 0 && out < PHI_MAX, `r0=${r0}: ${out}`)
  }
})

test('deflection grows without limit toward the edge of the shadow, by a fixed amount per decade', () => {
  const r0 = R_HOVER
  const edge = shadowAngle(r0)
  let last = 0
  const steps = []
  for (const off of [1e-1, 1e-2, 1e-3, 1e-4, 1e-5]) {
    const phi = deflection(r0, edge + off)
    assert.ok(phi > last)
    steps.push(phi - last)
    last = phi
  }
  // Logarithmic divergence: each tenfold step closer adds about ln(10) of angle
  for (const s of steps.slice(2)) assert.ok(Math.abs(s - Math.LN10) < 0.15, String(s))
})

test('the table matches the integration between its entries, and is monotonic', () => {
  const r0 = R_HOVER
  const table = deflectionTable(r0)
  assert.equal(table.length, TABLE_SIZE)
  for (let i = 1; i < TABLE_SIZE; i++) assert.ok(table[i] <= table[i - 1])
  const edge = shadowAngle(r0)
  for (const off of [3e-5, 4e-4, 0.007, 0.05, 0.3, 1.1]) {
    const exact = deflection(r0, edge + off)
    assert.ok(Math.abs(lookup(table, r0, edge + off) - exact) < 2e-3, `off=${off}`)
  }
  assert.equal(lookup(table, r0, edge - 0.1), PHI_MAX)
})

test('images: each part of the sky is seen once directly and again, closer to the shadow, for every extra turn', () => {
  const r0 = R_HOVER
  const table = deflectionTable(r0)
  const edge = shadowAngle(r0)
  const direct = imageAngle(table, r0, deg(80))
  const second = imageAngle(table, r0, deg(80) + 2 * Math.PI)
  assert.ok(direct > second && second > edge)
  // The second image is squeezed hard against the edge
  assert.ok(second - edge < 0.01 * (direct - edge))
  // What is directly behind the hole is seen as a ring just above the edge
  const ring = imageAngle(table, r0, Math.PI)
  assert.ok(ring > edge && ring < direct)
})

test('the eased lens: true at the edge, nearly flat above its reach, and never folds the sky back on itself', () => {
  const r0 = R_HOVER
  const table = deflectionTable(r0)
  const edge = shadowAngle(r0)
  const reach = deg(8)
  // Well above the reach: close to flat space
  const high = edge + deg(40)
  assert.ok(Math.abs(skyAngle(table, r0, high, reach) - (Math.PI - high)) < deg(8))
  // At the edge: the real, runaway deflection
  assert.ok(skyAngle(table, r0, edge + 1e-5, reach) > 2 * Math.PI)
  let last = Infinity
  for (let psi = edge + 1e-4; psi < Math.PI; psi += 0.002) {
    const theta = skyAngle(table, r0, psi, reach)
    assert.ok(theta < last)
    last = theta
  }
})

// -------------------------------------------------------- the timeline ----

test('pacing: black at both ends, every project gets a hold, then the fall', () => {
  const start = lensTimeline(0, COUNT)
  assert.equal(start.fade, 0)
  assert.equal(start.stars, 0)
  assert.ok(start.phase < -0.9)
  const end = lensTimeline(1, COUNT)
  assert.equal(end.fade, 0)
  assert.equal(end.stars, 0)
  // The drop is let go part way down: the camera ends near the horizon, not on it
  assert.ok(end.radius > R_END && end.radius < 1.2)
  // The stars of the page that follows are up by the end, and nowhere to be seen before the fall
  assert.equal(start.beyond, 0)
  assert.equal(end.beyond, 1)

  for (let k = 0; k < COUNT; k++) {
    const at = settledAt(k, COUNT)
    const f = lensTimeline(at + 0.001, COUNT)
    assert.ok(near(f.phase, k), `project ${k}: ${f.phase}`)
    assert.equal(f.fade, 1)
    assert.equal(f.fall, 0)
    assert.ok(near(f.radius, R_HOVER, 1e-9))
    // Still there a good way into its stretch
    const held = lensTimeline(at + (0.4 * PER_PROJECT) / span(COUNT), COUNT)
    assert.ok(near(held.phase, k))
  }
})

test('pacing: phase and fall only ever advance; past the intro the phase moves on a whole project at a time', () => {
  let last = lensTimeline(0, COUNT)
  let steps = 0
  for (let i = 1; i <= 4000; i++) {
    const p = i / 4000
    const f = lensTimeline(p, COUNT)
    assert.ok(f.phase >= last.phase)
    assert.ok(f.fall >= last.fall)
    assert.ok(f.radius <= last.radius)
    const moved = f.phase - last.phase
    if (p * span(COUNT) > INTRO) {
      // Settled on one project or the next, never part way: the move itself is glided, in time
      assert.ok(near(moved, 0) || near(moved, 1), `p=${p}: ${moved}`)
      if (moved > 0.5) steps++
    } else assert.ok(moved < 0.006)
    assert.ok(Math.abs(f.fade - last.fade) < 0.02)
    assert.ok(Math.abs(f.pitch - last.pitch) < 0.02)
    last = f
  }
  assert.equal(steps, COUNT - 1)
  assert.ok(near(last.phase, COUNT - 1))
})

test('pacing: the sky sets off for the next project once the hold is over', () => {
  for (let k = 0; k < COUNT - 1; k++) {
    const at = (INTRO + (k + HOLD) * PER_PROJECT) / span(COUNT)
    assert.ok(near(lensTimeline(at - 0.002, COUNT).phase, k))
    assert.ok(near(lensTimeline(at + 0.002, COUNT).phase, k + 1))
  }
})

// ------------------------------------------------------- the last fall ----

/** The frame when the fall has got as far as `fall` (0..1). */
const atFall = (fall) => lensTimeline((span(COUNT) - OUTRO + fall * OUTRO) / span(COUNT), COUNT)
const SHAPES = [0.46, 0.75, 1.6, 2.4]
/**
 * Where the light of the horizon is at the middle of the screen, in NDC (-1 the
 * bottom edge, 1 the top), as the renderer frames it. `under` is how far inside
 * the edge of the shadow to look, radians: the faint streaks reach 0.3 down.
 */
function horizonOnScreen(frame, aspect, under = 0) {
  const c = composition(aspect, shadowAngle(R_HOVER))
  return Math.tan(shadowAngle(frame.radius) - under - Math.PI / 2 - cameraPitch(frame.pitch, c.pitch)) / c.tanHalfFov
}

test('the fall: up to the changeover the camera drops and tips back as it always did', () => {
  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
  }
  for (let i = 0; i <= 46; i++) {
    const fall = i / 100
    assert.ok(fall <= SINK_FROM)
    const f = atFall(fall)
    assert.ok(near(f.fall, fall, 1e-9))
    // The radius falls along the old course toward R_END, and the camera tips back toward the zenith
    const depth = smooth(0, 1, fall) ** 1.6
    assert.ok(near(f.radius, 1 + (R_HOVER - 1) * ((R_END - 1) / (R_HOVER - 1)) ** depth, 1e-9), `fall ${fall}`)
    assert.ok(near(f.pitch, deg(90) * smooth(0.16, 0.86, fall), 1e-9), `fall ${fall}`)
    assert.ok(near(f.squeeze, smooth(0.3, 0.9, fall), 1e-9))
    // The stars turn as they did; the picture goes up ahead of them
    assert.ok(near(f.roll, smooth(0.08, 0.7, fall), 1e-9))
    assert.ok(f.lift >= f.roll)
    assert.equal(f.fade, 1)
    assert.equal(f.stars, 1)
    assert.equal(f.beyond, 0)
    assert.equal(closing(fall), fall)
  }
  // The framing at rest is the composition's: the test's own camera agrees with the layout
  for (const aspect of SHAPES) assert.ok(near(horizonOnScreen(atFall(0), aspect), composition(aspect, shadowAngle(R_HOVER)).horizon, 1e-9))
  // The last picture has been carried up and out before the changeover: by then it is nearly overhead
  assert.ok(LIFT_BY > SINK_FROM)
  assert.ok(atFall(SINK_FROM).lift > 0.85)
})

test('the changeover: nothing jumps, in place, in speed or in brightness', () => {
  const h = 1e-3
  for (const key of ['radius', 'pitch', 'fade', 'stars', 'lift', 'roll', 'squeeze', 'beyond']) {
    const v = (fall) => atFall(fall)[key]
    // The fastest it changes anywhere in the fall, to judge a change of speed against
    let fastest = 0
    for (let i = 0; i < 1000; i++) fastest = Math.max(fastest, Math.abs(v((i + 1) / 1000) - v(i / 1000)) * 1000)
    const before = (v(SINK_FROM) - v(SINK_FROM - h)) / h
    const after = (v(SINK_FROM + h) - v(SINK_FROM)) / h
    assert.ok(Math.abs(after - before) <= 0.02 * fastest, `${key}: ${before} then ${after}, of ${fastest}`)
    // Nor anywhere after it: from one thousandth of the fall to the next the speed never changes by much
    let last = v(SINK_FROM) - v(SINK_FROM - h)
    for (let i = 1; i <= 540; i++) {
      const step = v(SINK_FROM + i * h) - v(SINK_FROM + (i - 1) * h)
      assert.ok(Math.abs(step - last) <= 0.08 * fastest * h, `${key} at ${SINK_FROM + i * h}`)
      last = step
    }
  }
  // The sky's own course carries on through the changeover at the pace of the fall, then coasts to a stop
  assert.ok(near((closing(SINK_FROM + h) - closing(SINK_FROM)) / h, 1, 1e-3))
  assert.ok(closing(1) < SINK_FROM + 0.1)
  for (let i = 1; i <= 540; i++) assert.ok(closing(SINK_FROM + i * h) > closing(SINK_FROM + (i - 1) * h) - 1e-15)
})

test('the sinking: the horizon goes up and out through the top and stays out; the sky never closes into a ring', () => {
  for (const aspect of SHAPES) {
    const c = composition(aspect, shadowAngle(R_HOVER))
    const top = Math.atan(c.tanHalfFov)
    // At the changeover the horizon is across the middle of the screen, as in the owner's screenshot
    let last = horizonOnScreen(atFall(SINK_FROM), aspect)
    assert.ok(Math.abs(last) < 0.2, `aspect ${aspect}: ${last}`)
    for (let i = 1; i <= 540; i++) {
      const f = atFall(SINK_FROM + i / 1000)
      const y = horizonOnScreen(f, aspect)
      // Only ever upward
      assert.ok(y >= last - 1e-9, `aspect ${aspect}, fall ${f.fall}`)
      last = y
      // The camera never looks up at the zenith again: the point the sky would close on stays off the top
      assert.ok(Math.PI / 2 - cameraPitch(f.pitch, c.pitch) > top + deg(10), `aspect ${aspect}, fall ${f.fall}`)
      // And the sky is still wide open, a horizon and not a ball, for as long as any of it can be seen
      assert.ok(Math.PI - shadowAngle(f.radius) > deg(40))
    }
    // The bright core is out through the top with a good part of the fall to spare, and the last
    // of the streaks under it before the scene's own light is turned down to nothing
    assert.ok(horizonOnScreen(atFall(0.72), aspect, 0.008) > 1, `aspect ${aspect}`)
    assert.ok(horizonOnScreen(atFall(0.8), aspect, 0.3) > 1, `aspect ${aspect}`)
    assert.ok(atFall(0.8).stars === 1)
  }
  // It ends looking down into the hole, further than it ever looked while the projects were up
  assert.ok(atFall(SINK_TO).pitch < deg(-10))
  assert.ok(near(atFall(1).pitch, atFall(SINK_TO).pitch, 1e-6))
})

test('the stars of the next page: they come up as the horizon leaves, and are all there before the black is', () => {
  assert.equal(atFall(BEYOND_FROM).beyond, 0)
  assert.equal(atFall(BEYOND_TO).beyond, 1)
  assert.ok(BEYOND_FROM > SINK_FROM && BEYOND_TO < 1)
  let last = 0
  for (let i = 0; i <= 1000; i++) {
    const f = atFall(i / 1000)
    assert.ok(f.beyond >= last && f.beyond - last < 0.01)
    last = f.beyond
    // Once the scene has gone to plain black they are fully up: there is no stretch of empty screen
    if (f.fade === 0 && f.stars === 0) assert.equal(f.beyond, 1)
    for (const aspect of SHAPES) {
      // They are on their way by the time the horizon's core has left the screen...
      if (horizonOnScreen(f, aspect, 0.008) > 1.05) assert.ok(f.beyond > 0, `aspect ${aspect}, fall ${f.fall}`)
      // ...and have not got far while it is still well inside it
      if (f.fall > SINK_FROM && horizonOnScreen(f, aspect, 0.008) < 0.5) assert.ok(f.beyond < 0.05, `aspect ${aspect}, fall ${f.fall}`)
    }
  }
  // Scrolling back is the same thing the other way: a frame depends on where the page is and nothing else
  assert.deepEqual(atFall(0.7), atFall(0.7))
})

test('glide: a step becomes a move that starts gently, never overshoots and arrives in about a second', () => {
  const dt = 1 / 60
  let sky = { value: 0, velocity: 0 }
  let fastest = 0
  let lastSpeed = 0
  let sharpest = 0
  const at = {}
  for (let i = 1; i <= 180; i++) {
    const before = sky.value
    sky = glide(sky, 1, dt)
    assert.ok(sky.value >= before && sky.value <= 1, `frame ${i}: ${sky.value}`)
    const speed = (sky.value - before) / dt
    fastest = Math.max(fastest, speed)
    sharpest = Math.max(sharpest, Math.abs(speed - lastSpeed))
    lastSpeed = speed
    at[i] = sky.value
  }
  // Off the mark slowly: a tenth of a second in it has barely moved
  assert.ok(at[6] < 0.12, String(at[6]))
  // Most of the way in two thirds of a second, there within a second and a half
  assert.ok(at[40] > 0.85, String(at[40]))
  assert.ok(at[90] > 0.995, String(at[90]))
  // No frame's speed differs much from the one before: nothing to see as a jolt
  assert.ok(sharpest < 0.25 * fastest, `${sharpest} of ${fastest}`)
})

test('glide: the same move whatever the frame rate, and a change of mind is taken up smoothly', () => {
  const run = (dt, seconds) => {
    let sky = { value: 0, velocity: 0 }
    for (let t = 0; t < seconds - 1e-9; t += dt) sky = glide(sky, 1, dt)
    return sky
  }
  assert.ok(near(run(1 / 30, 0.5).value, run(1 / 144, 0.5).value, 1e-3))
  // Half way there, the target goes back: it slows, turns and returns, with no jump in value or speed
  let sky = run(1 / 60, 0.3)
  const turned = glide(sky, 0, 1 / 60)
  assert.ok(Math.abs(turned.value - sky.value) < 0.05)
  assert.ok(Math.abs(turned.velocity - sky.velocity) < 0.25 * GLIDE_RATE)
  for (let i = 0; i < 240; i++) sky = glide(sky, 0, 1 / 60)
  assert.ok(near(sky.value, 0, 1e-4))
})

// ---------------------------------------------------- the horizon's glow ----

test('glow: all there while a project is settled, gone in the middle of a move, the same from either side', () => {
  for (let k = 0; k < COUNT; k++) {
    assert.equal(horizonGlow(k), 1)
    if (k < COUNT - 1) assert.equal(horizonGlow(k + 0.5), 0)
    // Level where it meets a settled project: the first little way of a move takes almost nothing off it
    assert.ok(horizonGlow(k + 0.02) > 0.99)
    if (k > 0) assert.ok(horizonGlow(k - 0.02) > 0.99)
  }
  // Gone before the middle and not back until after it, so the dark is a moment and not an instant
  assert.equal(horizonGlow(1 + GLOW_GONE), 0)
  assert.equal(horizonGlow(2 - GLOW_GONE), 0)
  assert.ok(GLOW_GONE > 0.3 && GLOW_GONE < 0.5)
  for (let d = 0; d <= 0.5; d += 0.01) {
    // Leaving one project is arriving at the next run backwards, so scrolling back is the same thing in reverse
    assert.ok(near(horizonGlow(1 + d), horizonGlow(2 - d), 1e-9))
    assert.ok(near(horizonGlow(1 + d), horizonGlow(1 - d), 1e-9))
    // Further from settled is never brighter
    if (d > 0) assert.ok(horizonGlow(1 + d) <= horizonGlow(1 + d - 0.01))
  }
  // Up to the first project it is all there: that stretch is the opening flare's
  for (const phase of [-1, -0.6, -0.2, -1e-6, 0]) assert.equal(horizonGlow(phase), 1)
})

test('glow: no jump and no corner anywhere, across settled projects, the middle of a move and the first project', () => {
  const h = 1e-3
  for (let phase = -1; phase <= COUNT - 1; phase += h) {
    const here = horizonGlow(phase)
    assert.ok(here >= 0 && here <= 1)
    // Never far from one phase to the next...
    assert.ok(Math.abs(horizonGlow(phase + h) - here) < 4 * h, `phase ${phase}`)
    // ...and never a change of slope: a corner would show as a second difference a hundred times this
    assert.ok(Math.abs(horizonGlow(phase + h) - 2 * here + horizonGlow(phase - h)) < 40 * h * h, `phase ${phase}`)
  }
})

test('glow: played through a move it dims, is dark as the sky passes half way and is back when the next project is', () => {
  const dt = 1 / 60
  let sky = { value: 0, velocity: 0 }
  let last = horizonGlow(sky.value)
  let lastStep = 0
  let fastest = 0
  let sharpest = 0
  let darkest = 1
  const at = {}
  for (let i = 1; i <= 120; i++) {
    sky = glide(sky, 1, dt)
    const now = horizonGlow(sky.value)
    const step = now - last
    fastest = Math.max(fastest, Math.abs(step))
    sharpest = Math.max(sharpest, Math.abs(step - lastStep))
    darkest = Math.min(darkest, now)
    lastStep = step
    last = now
    at[i] = now
  }
  // It does not go at once: a twentieth of a second into the move it is barely touched
  assert.ok(at[3] > 0.97, String(at[3]))
  // Dark by the middle, coming back as the picture unrolls, and all there once it has settled
  assert.equal(darkest, 0)
  assert.ok(at[18] < 0.02, String(at[18]))
  assert.ok(at[30] > 0.3 && at[30] < 0.7, String(at[30]))
  assert.ok(at[60] > 0.97, String(at[60]))
  assert.ok(at[120] > 0.9999)
  // It comes back more slowly than it went, which is the swell
  assert.ok(at[12] < at[36])
  // Never much in one frame, and no frame's change far from the one before: nothing to see as a pop
  assert.ok(fastest < 0.14, String(fastest))
  assert.ok(sharpest < 0.5 * fastest, `${sharpest} of ${fastest}`)

  // Turned back half way, in the dark, it comes up again on the project it left, without a jump
  sky = { value: 0, velocity: 0 }
  for (let i = 0; i < 18; i++) sky = glide(sky, 1, dt)
  let back = horizonGlow(sky.value)
  for (let i = 0; i < 240; i++) {
    sky = glide(sky, 0, dt)
    const now = horizonGlow(sky.value)
    assert.ok(Math.abs(now - back) < 0.14)
    back = now
  }
  assert.ok(back > 0.9999)
})

test('rim: the opening flare settles into the glow of the first project and holds there, with no dip between', () => {
  // The band's strength on screen, as the shader makes it of the frame
  const band = (f) => (0.75 + 2.2 * f.rim * horizonGlow(f.phase)) * Math.max(f.fade, 0.6 * f.stars)
  const settled = 0.75 + 2.2 * RIM_SETTLED
  const fallsFrom = (INTRO + COUNT * PER_PROJECT) / span(COUNT)
  let last = lensTimeline(0, COUNT)
  let peak = 0
  let lit = false
  for (let i = 1; i <= 4000; i++) {
    const p = (i / 4000) * fallsFrom
    const f = lensTimeline(p, COUNT)
    // No jump anywhere
    assert.ok(Math.abs(f.rim - last.rim) < 0.03, `p=${p}`)
    // Once the flare has reached its height it only ever eases down, and never below the settled glow
    if (peak === RIM_FLARE) assert.ok(f.rim <= last.rim + 1e-12 && f.rim >= RIM_SETTLED - 1e-12, `p=${p}: ${f.rim}`)
    peak = Math.max(peak, f.rim)
    // On screen, once the horizon is as bright as it is for a settled project it is never dimmer than that again
    if (band(f) >= settled) lit = true
    if (lit) assert.ok(band(f) >= settled - 1e-9, `p=${p}: ${band(f)}`)
    last = f
  }
  assert.equal(peak, RIM_FLARE)
  assert.ok(lit)
  // Settled by the time the first project is, and the same for every project, through its whole hold
  for (let k = 0; k < COUNT; k++) {
    for (const within of [0, 0.3, HOLD - 0.01, 0.99]) {
      const f = lensTimeline((INTRO + (k + within) * PER_PROJECT) / span(COUNT) + 1e-9, COUNT)
      assert.ok(near(f.rim, RIM_SETTLED, 1e-9), `project ${k} at ${within}: ${f.rim}`)
    }
  }
  assert.ok(near(lensTimeline(settledAt(0, COUNT) - 0.02, COUNT).rim, RIM_SETTLED, 1e-9))
  // The fall takes it from there: never below the glow it starts with
  for (let i = 0; i <= 100; i++) assert.ok(lensTimeline(fallsFrom + ((1 - fallsFrom) * i) / 100, COUNT).rim >= RIM_SETTLED - 1e-12)
  // Strong enough to read as the flare, and short of it
  assert.ok(RIM_SETTLED > 0.3 && RIM_SETTLED < RIM_FLARE)
})

test('the stretch is made of its parts', () => {
  assert.ok(near(span(COUNT), INTRO + COUNT * PER_PROJECT + OUTRO))
  assert.ok(near(settledAt(0, COUNT), INTRO / span(COUNT)))
})

test('sources: the settled one is where it is read; the next is dark behind the hole and lit as it comes round', () => {
  const read = deg(75)
  const lit = sources(1, COUNT, read)
  assert.ok(lit.length <= MAX_SOURCES)
  assert.equal(lit[0].index, 1)
  assert.ok(near(lit[0].theta, read))
  assert.equal(lit[0].gain, 1)
  // Settled, nothing ahead of it is alight: no ring along the horizon while a project is being read
  assert.ok(lit.every((s) => s.index <= 1))
  // On its way round, the next one is lit, a little at first and fully well before it arrives
  const early = sources(2 - LIT_FROM + 0.05, COUNT, read).find((s) => s.index === 2)
  assert.ok(early && early.gain > 0 && early.gain < 0.3)
  assert.ok(near(early.theta, read + THETA_STEP * (LIT_FROM - 0.05)))
  const coming = sources(1.6, COUNT, read).find((s) => s.index === 2)
  assert.ok(coming && near(coming.gain, 1) && near(coming.theta, read + THETA_STEP * 0.4))
  // One that is a full turn or more away is dark, so it cannot come round as a ghost
  for (let phase = -1; phase <= COUNT - 1; phase += 0.05) {
    for (const s of sources(phase, 9, read)) assert.ok(s.theta - read < 2 * Math.PI - read - 0.3 && s.theta > -Math.PI / 2)
  }
  // Lifted to the zenith for the last fall
  assert.ok(near(sources(3, COUNT, read, 1)[0].theta, 0))
})

test('caption: one project at a time, only while its picture is settled', () => {
  assert.equal(caption(lensTimeline(0, COUNT), COUNT).shown, false)
  for (let k = 0; k < COUNT; k++) {
    const c = caption(lensTimeline(settledAt(k, COUNT) + 0.01, COUNT), COUNT)
    assert.deepEqual(c, { index: k, shown: true })
  }
  // While the sky is on its way between two projects nothing is up
  const moving = { ...lensTimeline(settledAt(1, COUNT) - 0.01, COUNT), phase: 0.5 }
  assert.equal(caption(moving, COUNT).shown, false)
  assert.deepEqual(caption({ ...moving, phase: 0.9 }, COUNT), { index: 1, shown: true })
  // Nor during the fall
  assert.equal(caption(lensTimeline(0.95, COUNT), COUNT).shown, false)
})

test('framing: the picture stands in the sky between the horizon and the top of the screen', () => {
  const edge = shadowAngle(R_HOVER)
  for (const aspect of [0.46, 0.75, 1.33, 1.6, 2.4]) {
    const c = composition(aspect, edge)
    // Horizon in the lower half of the screen, on every shape of screen
    assert.ok(c.horizon < 0 && c.horizon > -0.5)
    // On screen the picture's middle is above the horizon, and its top is inside the frame
    const mid = Math.tan(c.centre - c.pitch) / c.tanHalfFov
    assert.ok(mid > c.horizon + 0.2 && mid < 0.7, `aspect ${aspect}: ${mid}`)
    const top = mid + c.half[1] / c.tanHalfFov
    assert.ok(top < 0.95, `aspect ${aspect}: top ${top}`)
    // Sixteen by ten, and never wider than the screen
    assert.ok(near(c.half[0] / c.half[1], 1.6))
    assert.ok(c.half[0] / (c.tanHalfFov * aspect) < 0.97, `aspect ${aspect}`)
  }
})

// ------------------------------------------------------- the ring of cards ----

import { viewAngle } from '../src/lens/geodesic.ts'
import {
  FLING_MAX,
  MAX_CARDS,
  RING_KEEP,
  RING_RATE,
  RING_STIFFEST,
  RUBBER,
  SIDES_GONE,
  SIDE_SCALE,
  SIDE_SHADE,
  approach,
  azimuthAt,
  cardLook,
  cards,
  createRings,
  flick,
  landing,
  pictureBox,
  ringAt,
  ringLayout,
  rubber,
  sideCards,
  unrubber,
} from '../src/lens/ring.ts'

const RING_SHAPES = [0.46, 0.75, 1.33, 1.6, 2.4]
const framed = (aspect) => {
  const comp = composition(aspect, shadowAngle(R_HOVER))
  const table = deflectionTable(R_HOVER)
  const read = skyAngle(table, R_HOVER, Math.PI / 2 + comp.centre, comp.reach)
  return { comp, read, layout: ringLayout(comp, aspect), box: pictureBox(comp, aspect, read, (t) => viewAngle(table, R_HOVER, t, comp.reach)) }
}

test('ring layout: cards never overlap, and the next one shows at the side of every screen', () => {
  for (const aspect of RING_SHAPES) {
    const { comp, layout } = framed(aspect)
    const wide = Math.atan(comp.half[0])
    const side = Math.atan(comp.half[0] * SIDE_SCALE)
    const edge = Math.atan(comp.tanHalfFov * aspect)
    // A gap between the middle card and the next, and between two side cards
    assert.ok(layout.step > wide + side, `aspect ${aspect}`)
    assert.ok(layout.step > 2 * side)
    // The next card's near edge is inside the screen
    assert.ok(layout.step - side < edge, `aspect ${aspect}: ${layout.step - side} against ${edge}`)
    // The fade begins outside the middle card and is not finished at the edge of the screen
    assert.ok(layout.fade[0] > Math.tan(wide) / (comp.tanHalfFov * aspect) && layout.fade[0] < 1 && layout.fade[1] > 1)
    // A card that can be seen at all is within reach
    assert.ok(layout.reach > edge + side)
  }
})

test('card look: the middle card is whole; cards dim, shrink and fade with their place, without a jump', () => {
  assert.deepEqual(cardLook(0), { shade: 1, show: 1, scale: 1, edge: 0 })
  const one = cardLook(1)
  assert.ok(near(one.shade, SIDE_SHADE) && near(one.scale, SIDE_SCALE) && one.edge === 1 && one.show === 1)
  assert.equal(cardLook(3).show, 0)
  let last = cardLook(0)
  for (let a = 0.01; a <= 3.2; a += 0.01) {
    const look = cardLook(a)
    assert.deepEqual(cardLook(-a), look)
    for (const key of ['shade', 'show', 'scale']) {
      assert.ok(look[key] <= last[key] + 1e-12, `${key} at ${a}`)
      assert.ok(Math.abs(look[key] - last[key]) < 0.02, `${key} at ${a}`)
    }
    assert.ok(look.edge >= last.edge - 1e-12)
    last = look
  }
})

test('side cards: there while a project is settled, gone as the sky moves on, in the intro and in the fall', () => {
  for (let k = 0; k < COUNT; k++) assert.equal(sideCards(k, 0), 1)
  assert.equal(sideCards(1 + SIDES_GONE, 0), 0)
  assert.equal(sideCards(2 - SIDES_GONE, 0), 0)
  assert.equal(sideCards(1.5, 0), 0)
  assert.equal(sideCards(-0.5, 0), 0)
  assert.equal(sideCards(2, 0.05), 0)
  assert.ok(sideCards(2, 0.01) < 1)
  // Gone well before the horizon's glow is, and before the next project is lit
  assert.ok(SIDES_GONE < GLOW_GONE && SIDES_GONE < 1 - LIT_FROM)
  // Played through a move: gone within a fifth of a second, back only as the next one arrives
  let sky = { value: 0, velocity: 0 }
  const at = {}
  for (let i = 1; i <= 120; i++) {
    sky = glide(sky, 1, 1 / 60)
    at[i] = sideCards(sky.value, 0)
    if (i > 1) assert.ok(Math.abs(at[i] - at[i - 1]) < 0.3)
  }
  assert.equal(at[12], 0)
  assert.equal(at[30], 0)
  assert.ok(at[100] > 0.9)
})

test('cards: a settled project shows its middle card as before and its neighbours beside it; a moving one only its middle card', () => {
  const { layout, read } = framed(1.6)
  const count = () => 4
  // On the first picture: it is exactly the old single picture, and the second view is beside it
  let lit = sources(1, COUNT, read)
  let out = cards(lit, 1, 0, () => 0, count, layout)
  assert.ok(out.length <= MAX_CARDS)
  assert.deepEqual(out[0], { project: 1, view: 0, theta: lit[0].theta, turn: 0, gain: 1, shade: 1, scale: 1, edge: 0 })
  const beside = out.find((c) => c.project === 1 && c.view === 1)
  assert.ok(beside && near(beside.turn, layout.step) && beside.gain === 1 && near(beside.shade, SIDE_SHADE))
  // Without further views nothing changes at all
  assert.deepEqual(cards(lit, 1, 0, () => 0, () => 1, layout).filter((c) => c.project === 1), [out[0]])
  // Turned to its third view: that is in the middle, whole, with a neighbour either side
  out = cards(lit, 1, 0, (i) => (i === 1 ? 2 : 0), count, layout)
  assert.equal(out[0].view, 2)
  assert.ok(out[0].gain === 1 && out[0].shade === 1 && out[0].turn === 0)
  assert.deepEqual(out.filter((c) => c.project === 1).map((c) => c.view).sort(), [1, 2, 3])
  // Half way between two cards they are a pair, alike
  out = cards(lit, 1, 0, (i) => (i === 1 ? 0.5 : 0), count, layout).filter((c) => c.project === 1)
  assert.ok(near(out[0].turn, -out[1].turn) && near(out[0].shade, out[1].shade) && near(out[0].scale, out[1].scale))
  // On the move, the card that was in the middle is all there is of the project leaving, and the one arriving shows its first
  lit = sources(1.5, COUNT, read)
  out = cards(lit, 1.5, 0, (i) => (i === 1 ? 2 : 0), count, layout)
  assert.deepEqual(out.map((c) => [c.project, c.view]).sort(), [[1, 2], [2, 0]])
  for (const c of out) assert.ok(c.turn === 0 && c.shade === 1 && c.scale === 1 && c.edge === 0)
  // In the fall there are no side cards either
  out = cards(sources(3, COUNT, read, 0.3), 3, 0.2, () => 1, count, layout)
  assert.deepEqual(out.filter((c) => c.project === 3).map((c) => c.view), [1])
  // Never more than the shader has slots for, whatever the ring is doing
  for (let at = -0.4; at <= 3.4; at += 0.1) assert.ok(cards(sources(2, 9, read), 2, 0, () => at, count, layout).length <= MAX_CARDS)
  assert.ok(RING_KEEP > LIT_FROM && RING_KEEP < 0.9)
})

test('the screen: the picture box matches the framing, and a drag is angle for angle', () => {
  for (const aspect of RING_SHAPES) {
    const { comp, box } = framed(aspect)
    // Inside the frame, above the horizon, about as large as the layout asks for (the lens squeezes it a little)
    assert.ok(box.top < 0.95 && box.bottom > comp.horizon && box.top > box.bottom, `aspect ${aspect}`)
    assert.ok(box.side > 0.2 && box.side < 0.97, `aspect ${aspect}: ${box.side}`)
    // Straight ahead is straight ahead; right is right; the same either side
    assert.equal(azimuthAt(0, 0.3, comp, aspect), 0)
    assert.ok(azimuthAt(0.5, 0.2, comp, aspect) > 0)
    assert.ok(near(azimuthAt(-0.5, 0.2, comp, aspect), -azimuthAt(0.5, 0.2, comp, aspect)))
    // The picture's edge is where its width puts it
    const y = (box.top + box.bottom) / 2
    assert.ok(Math.abs(azimuthAt(box.side, y, comp, aspect) - Math.atan(comp.half[0])) < 0.02, `aspect ${aspect}`)
  }
  // On the wide screen the owner's stills were taken on: the picture is where it was measured
  const { box } = framed(1.6)
  assert.ok(Math.abs(((1 - box.top) / 2) * 900 - 165) < 6 && Math.abs(((1 - box.bottom) / 2) * 900 - 480) < 6)
  // The inverse of the lens is the inverse
  const table = deflectionTable(R_HOVER)
  for (const theta of [0.4, 1.2, 1.5, 1.8]) assert.ok(near(skyAngle(table, R_HOVER, viewAngle(table, R_HOVER, theta, 0.1), 0.1), theta, 1e-6))
})

test('rubber: free between the ends, resisting past them, never further than its limit, and undone exactly', () => {
  for (const raw of [0, 0.3, 1.7, 3]) assert.equal(rubber(raw, 4), raw)
  let last = 3
  for (let raw = 3.01; raw < 9; raw += 0.01) {
    const v = rubber(raw, 4)
    assert.ok(v > last && v < 3 + RUBBER && v - 3 < raw - 3)
    last = v
  }
  // No catch as the end is crossed: it leaves at the pointer's pace
  assert.ok(near((rubber(3.001, 4) - 3) / 0.001, 1, 0.01))
  assert.ok(near(rubber(-0.5, 4), -(rubber(3.5, 4) - 3)))
  for (const raw of [-0.8, -0.1, 0.5, 3.2, 4]) assert.ok(near(unrubber(rubber(raw, 4), 4), raw, 1e-9))
})

test('release: a slow drag goes to the nearest card, a fling goes on, and nothing leaves the ends', () => {
  assert.equal(landing(0.3, 0, 4), 0)
  assert.equal(landing(0.6, 0, 4), 1)
  assert.equal(landing(0.2, 2, 4), 1)
  assert.equal(landing(0.2, -2, 4), 0)
  assert.equal(landing(1.8, -2.5, 4), 1)
  assert.equal(landing(2.9, 9, 4), 3)
  assert.equal(landing(-0.2, -9, 4), 0)
  // The speed of a release: read from the last tenth of a second, none if the pointer had stopped
  const trail = [0, 16, 32, 48, 64, 80, 96, 112, 128].map((t) => ({ t, value: t * 0.002 }))
  assert.ok(near(flick(trail, 130), 2, 1e-9))
  assert.equal(flick(trail, 260), 0)
  assert.equal(flick([{ t: 0, value: 0 }], 5), 0)
  assert.equal(flick([{ t: 0, value: 0 }, { t: 16, value: 1 }], 20), FLING_MAX)
})

test('settling: whatever the speed it was let go at, the ring reaches its card without passing it, wobbling or stalling', () => {
  for (const value of [-0.3, 0.05, 0.3, 0.5, 0.9, 1.4, 3.2]) {
    for (const velocity of [-9, -3, -0.5, 0, 0.5, 3, 9]) {
      const target = landing(value, velocity, 4)
      const spring = approach(value, velocity, target)
      assert.ok(spring.rate >= RING_RATE && spring.rate <= RING_RATE * RING_STIFFEST + 1e-9)
      const ring = { value, target, at: 0, held: false, ...spring }
      const side = Math.sign(target - value)
      // Heading for the card: speed is kept unless the stiffest spring could not land it
      if (velocity * side > 0 && spring.rate < RING_RATE * RING_STIFFEST) assert.equal(spring.velocity, velocity)
      let last = ringAt(ring, 0)
      let turned = false
      for (let ms = 4; ms <= 3000; ms += 4) {
        const now = ringAt(ring, ms)
        // Once it is moving toward the card it never turns back, and it never crosses the card
        const toward = (now.value - last.value) * side
        if (toward > 1e-9) turned = true
        if (turned) assert.ok(toward >= -1e-9, `from ${value} at ${velocity}, ${ms} ms`)
        if (velocity * side >= 0) assert.ok((target - now.value) * side >= -1e-9, `from ${value} at ${velocity}, ${ms} ms: ${now.value}`)
        // No stall: until it has all but arrived it is always moving
        if (turned && Math.abs(target - now.value) > 0.02) assert.ok(toward > 1e-6)
        last = now
      }
      assert.equal(last.value, target)
    }
  }
})

test('rings: held, the ring is where the pointer put it; let go, it settles; the controls and the wheel turn it too', () => {
  const rings = createRings([4, 3, 1])
  assert.equal(rings.read(0, 0), 0)
  assert.equal(rings.away(0), false)
  // A drag of 0.7 of a card, then held still, then let go: on to the next card
  rings.press(0, 1000)
  assert.ok(rings.holding())
  for (let i = 1; i <= 20; i++) rings.drag(0, 0.035 * i, 1000 + 16 * i)
  assert.ok(near(rings.read(0, 1400), 0.7))
  assert.equal(rings.card(0), 1)
  rings.release(0, 1600)
  assert.equal(rings.holding(), false)
  assert.ok(near(rings.read(0, 1600), 0.7))
  assert.equal(rings.read(0, 4000), 1)
  assert.ok(rings.away(0) && rings.resting(0, 4000))
  // A fling from there: the speed carries on through the release, with no jump
  rings.press(0, 5000)
  for (let i = 1; i <= 6; i++) rings.drag(0, 0.04 * i, 5000 + 16 * i)
  rings.release(0, 5100)
  const justAfter = rings.read(0, 5116)
  assert.ok(justAfter > 1.24 && justAfter < 1.24 + 0.08, String(justAfter))
  assert.equal(rings.card(0), 2)
  assert.equal(rings.read(0, 8000), 2)
  // Caught in the middle of settling, it stops under the pointer
  rings.goTo(0, 0, 9000)
  const mid = rings.read(0, 9150)
  assert.ok(mid > 0.2 && mid < 1.8)
  rings.press(0, 9150)
  assert.equal(rings.read(0, 9400), mid)
  rings.releaseAll(9400)
  assert.equal(rings.read(0, 12000), Math.round(mid))
  // Dragged far past the last card it resists, and springs back to it
  rings.goTo(0, 3, 13000)
  rings.press(0, 15000)
  rings.drag(0, 2, 15100)
  const pulled = rings.read(0, 15100)
  assert.ok(pulled > 3 && pulled < 3 + RUBBER)
  assert.equal(rings.card(0), 3)
  rings.release(0, 15400)
  assert.equal(rings.read(0, 18000), 3)
  // The controls: steps stop at the ends
  rings.step(0, 1, 19000)
  assert.equal(rings.card(0), 3)
  rings.step(0, -1, 19000)
  assert.equal(rings.card(0), 2)
  rings.goTo(0, -5, 19500)
  assert.equal(rings.read(0, 23000), 0)
  // The wheel: the ring follows it, and settles on the nearest card when it stops
  for (let i = 0; i < 6; i++) rings.push(1, 0.11, 30000 + 30 * i)
  assert.equal(rings.resting(1, 30400), false)
  assert.ok(rings.read(1, 30400) > 0.5)
  rings.settle(1, 30400)
  assert.equal(rings.read(1, 33000), 1)
  for (let i = 0; i < 40; i++) rings.push(1, 0.2, 34000 + 16 * i)
  assert.ok(rings.read(1, 35000) < 2 + RUBBER)
  rings.settle(1, 35000)
  assert.equal(rings.read(1, 38000), 2)
  // Put back, and a project with one view has nothing to turn
  rings.reset(1)
  assert.equal(rings.read(1, 38000), 0)
  assert.equal(rings.away(1), false)
  rings.press(2, 40000)
  rings.drag(2, 0.9, 40100)
  rings.release(2, 40200)
  assert.equal(rings.read(2, 43000), 0)
})

// ------------------------------------------------------- paging under a finger ----

test('a swipe is one project, however far it throws the page', async () => {
  const { homeAt, swipeBase, swipeTarget, SWIPE_STEP, INTRO, PER_PROJECT } = await import('../src/lens/timeline.ts')
  const count = 4
  const total = span(count)
  const shown = (x) => lensTimeline(x / total, count).phase
  // Resting on a project is that project
  for (let k = 0; k < count; k++) {
    assert.equal(shown(homeAt(k)), k)
    assert.equal(swipeBase(homeAt(k), count), k)
  }
  // From the first: a nudge leaves it; a swipe goes one on; a throw of three screens still goes one on
  const from = homeAt(0)
  assert.equal(swipeTarget(0, from, from + SWIPE_STEP * 0.9, count), homeAt(0))
  assert.equal(swipeTarget(0, from, from + SWIPE_STEP * 1.1, count), homeAt(1))
  assert.equal(swipeTarget(0, from, from + 3, count), homeAt(1))
  // And back the same way
  assert.equal(swipeTarget(2, homeAt(2), homeAt(2) - 2.4, count), homeAt(1))
  // A second swipe before the first has died away starts from where the first was headed
  assert.equal(swipeTarget(1, from + 1.7, from + 1.7 + 0.5, count), homeAt(2))
  // Coming in from above, a throw stops on the first project
  assert.equal(swipeBase(0.1, count), -1)
  assert.equal(swipeTarget(-1, 0, 0.5, count), 0.5)
  assert.equal(swipeTarget(-1, 0, 3.6, count), homeAt(0))
  // On from the last is the fall, which follows the finger
  const end = INTRO + count * PER_PROJECT
  assert.equal(swipeTarget(3, homeAt(3), end + 0.3, count), end + 0.3)
  // Back up out of the fall stops on the last project
  assert.equal(swipeBase(end + 0.2, count), count)
  assert.equal(swipeTarget(count, end + 0.4, homeAt(1), count), homeAt(3))
  // Thrown right out of the stage, either way, the scene follows the page out
  assert.equal(swipeTarget(0, from, total - 0.1, count), total - 0.1)
  assert.equal(swipeTarget(2, homeAt(2), 0.05, count), 0.05)
})
