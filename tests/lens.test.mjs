// Run with `npm test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CRITICAL_B, PHI_MAX, TABLE_SIZE, deflection, deflectionTable, imageAngle, lookup, shadowAngle, skyAngle } from '../src/lens/geodesic.ts'
import {
  INTRO,
  MAX_SOURCES,
  OUTRO,
  PER_PROJECT,
  R_END,
  R_HOVER,
  THETA_STEP,
  caption,
  composition,
  lensTimeline,
  settledAt,
  sources,
  span,
} from '../src/lens/timeline.ts'

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
  assert.ok(near(end.radius, R_END, 1e-9))

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

test('pacing: phase and fall only ever advance, and nothing jumps', () => {
  let last = lensTimeline(0, COUNT)
  for (let i = 1; i <= 4000; i++) {
    const f = lensTimeline(i / 4000, COUNT)
    assert.ok(f.phase >= last.phase)
    assert.ok(f.fall >= last.fall)
    assert.ok(f.radius <= last.radius)
    assert.ok(Math.abs(f.phase - last.phase) < 0.006)
    assert.ok(Math.abs(f.fade - last.fade) < 0.02)
    assert.ok(Math.abs(f.pitch - last.pitch) < 0.02)
    last = f
  }
  assert.ok(near(last.phase, COUNT - 1))
})

test('the stretch is made of its parts', () => {
  assert.ok(near(span(COUNT), INTRO + COUNT * PER_PROJECT + OUTRO))
  assert.ok(near(settledAt(0, COUNT), INTRO / span(COUNT)))
})

test('sources: the settled one is where it is read, the next is round behind the hole', () => {
  const read = deg(75)
  const lit = sources(1, COUNT, read)
  assert.ok(lit.length <= MAX_SOURCES)
  assert.equal(lit[0].index, 1)
  assert.ok(near(lit[0].theta, read))
  assert.equal(lit[0].gain, 1)
  const next = lit.find((s) => s.index === 2)
  assert.ok(next && near(next.theta, read + THETA_STEP))
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
  // Halfway between two projects nothing is up
  const between = (settledAt(0, COUNT) + settledAt(1, COUNT)) / 2 + (0.25 * PER_PROJECT) / span(COUNT)
  assert.equal(caption(lensTimeline(between, COUNT), COUNT).shown, false)
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
