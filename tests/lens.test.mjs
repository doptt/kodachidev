// Run with `npm test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CRITICAL_B, PHI_MAX, TABLE_SIZE, deflection, deflectionTable, imageAngle, lookup, shadowAngle } from '../src/lens/geodesic.ts'
import {
  INTRO,
  MAX_SOURCES,
  OUTRO,
  PER_PROJECT,
  R_END,
  R_HOVER,
  R_OPEN,
  RING_CLEAR,
  SIDE_BY_SIDE,
  pictureBox,
  caption,
  lensTimeline,
  settledAt,
  sources,
  span,
} from '../src/lens/timeline.ts'
import { DRIFT_TILT, skyMatrix } from '../src/lens/sky.ts'
import { INVERSE_SIZE, cameraBasis, inverseLookup, inverseTable, lensed, pictureCoord, rest, screenRay } from '../src/lens/picture.ts'

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

// -------------------------------------------------------- the timeline ----

test('pacing: black at both ends, every project gets a hold, then the fall', () => {
  const start = lensTimeline(0, COUNT)
  assert.equal(start.fade, 0)
  assert.equal(start.stars, 0)
  assert.ok(start.phase < -0.9)
  // It opens low, on the old flat horizon, and climbs to where it rests
  assert.ok(near(start.radius, R_OPEN, 1e-9))
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
    // The camera climbs to where it rests, holds, and falls: it never does either twice
    if (i / 4000 <= settledAt(0, COUNT)) assert.ok(f.radius >= last.radius)
    else assert.ok(f.radius <= last.radius)
    assert.ok(Math.abs(f.radius - last.radius) < 0.02)
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

test('sources: one readable picture at rest, the next behind the hole, none comes round twice', () => {
  const r = rest(1.6)
  for (const count of [1, COUNT, 9]) {
    for (let k = 0; k < count; k++) {
      const lit = sources(k, count, r.thetaRead, r.step)
      assert.ok(lit.length <= MAX_SOURCES)
      assert.equal(lit[0].index, k)
      assert.ok(near(lit[0].theta, r.thetaRead))
      assert.equal(lit[0].gain, 1)
      assert.equal(lit[0].light, 1)
      // Those still waiting behind the hole are dimmer, so the ring does not outshine what is being read
      for (const s of lit.slice(1)) assert.ok(s.light < 0.6 && s.light > 0.2, String(s.light))
      // Nothing that has already been read is still alight
      assert.ok(lit.every((s) => s.index >= k))
    }
    for (let phase = -1; phase <= count - 1; phase += 0.05) {
      for (const s of sources(phase, count, r.thetaRead, r.step)) assert.ok(s.theta < r.thetaRead + 2 * Math.PI - 0.3)
    }
  }
  const next = sources(1, COUNT, r.thetaRead, r.step).find((s) => s.index === 2)
  // At, or a little past, the point behind the hole
  assert.ok(next && next.theta >= Math.PI - deg(8) && next.theta <= Math.PI + deg(20), String(next?.theta))
  assert.ok(near(sources(3, COUNT, r.thetaRead, r.step, 1)[0].theta, 0))
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

// -------------------------------------------------- the painted picture ----

test('the inverse table undoes the lens outside the ring', () => {
  for (const r0 of [1.78, 2.5, 4]) {
    const table = deflectionTable(r0)
    const inverse = inverseTable(table, r0)
    assert.equal(inverse.length, INVERSE_SIZE)
    const ring = imageAngle(table, r0, Math.PI)
    assert.ok(near(inverse[INVERSE_SIZE - 1], ring, 1e-4))
    assert.ok(near(inverse[0], Math.PI, 1e-4))
    for (let psi = ring + 0.01; psi < Math.PI - 0.01; psi += 0.013) {
      assert.ok(Math.abs(inverseLookup(inverse, lookup(table, r0, psi)) - psi) < 2e-3, `r0=${r0} psi=${psi}`)
    }
  }
})

test('a settled picture is flat: through the lens and back lands where it started', () => {
  const r0 = 2.5
  const table = deflectionTable(r0)
  const inverse = inverseTable(table, r0)
  const ring = imageAngle(table, r0, Math.PI)
  // A camera pitched so that everything from 0.05 up on its screen is outside the ring
  const basis = cameraBasis(0, ring + deg(4) - Math.PI / 2 - Math.atan(0.05))
  const centreY = 0.3
  for (let x = -0.4; x <= 0.4; x += 0.1) {
    for (let y = 0.06; y <= 0.55; y += 0.07) {
      const sky = lensed(table, r0, screenRay(basis, x, y))
      const p = pictureCoord(sky, 0, inverse, basis, centreY)
      assert.ok(Math.abs(p[0] - x) < 1.5e-3 && Math.abs(p[1] - (y - centreY)) < 1.5e-3, `${x},${y}: ${p}`)
    }
  }
})

test('a picture that is not settled is bent', () => {
  const r0 = 2.5
  const table = deflectionTable(r0)
  const inverse = inverseTable(table, r0)
  const basis = cameraBasis(0, imageAngle(table, r0, Math.PI) + deg(4) - Math.PI / 2 - Math.atan(0.05))
  const sky = lensed(table, r0, screenRay(basis, 0.3, 0.3))
  const p = pictureCoord(sky, deg(20), inverse, basis, 0.3)
  assert.ok(p === null || Math.hypot(p[0] - 0.3, p[1]) > 0.05)
})

test('directions with no azimuth give a number or nothing, never NaN', () => {
  const table = deflectionTable(2.5)
  const inverse = inverseTable(table, 2.5)
  const basis = cameraBasis(0, -0.2)
  for (const sky of [[0, 1, 0], [0, -1, 0], [1, 0, 0], [0, 0, -1]]) {
    for (const turn of [0, 0.7, -0.7, Math.PI]) {
      const p = pictureCoord(sky, turn, inverse, basis, 0.3)
      assert.ok(p === null || (Number.isFinite(p[0]) && Number.isFinite(p[1])))
    }
  }
  assert.equal(lensed(table, 2.5, [0, -1, 0]), null)
})

// ----------------------------------------------------------- the framing ----

test('framing: the settled picture is on screen, outside the ring, above the limb', () => {
  for (const aspect of [0.4, 0.46, 0.75, 1.33, 1.6, 2.4, 3.6]) {
    const r = rest(aspect)
    const f = r.framing
    const ring = imageAngle(r.table, r.radius, Math.PI)
    // The limb is in the lower part of the screen: lowest on wide screens, where the words are beside
    // the picture, and highest on tall phones, where they need the shadow under it
    assert.ok(f.horizon < -0.15 && f.horizon > -0.8, `aspect ${aspect}: limb ${f.horizon}`)
    assert.ok(f.ring > f.horizon && f.ring < (f.centreY - f.half[1]) / f.tanHalfFov)
    assert.ok((f.centreY + f.half[1]) / f.tanHalfFov < 0.95)
    assert.ok(near(f.half[0] / f.half[1], 1.6))
    // The scene stands right of centre on wide screens, leaving the left for the words; never on phones
    assert.ok(f.shift >= 0 && f.shift <= 0.3)
    // ...and it is one or the other: a scene a little off centre with the words under it would look like a mistake
    if (aspect < SIDE_BY_SIDE) assert.equal(f.shift, 0)
    else assert.ok(f.shift > 0.15, `aspect ${aspect}: shift ${f.shift}`)
    assert.ok(f.shift + f.half[0] / (f.tanHalfFov * aspect) < 0.97, `aspect ${aspect}: the picture runs off the right`)
    for (const [x, y] of [[-1, -1], [0, -1], [1, -1], [-1, 1], [1, 1]]) {
      const d = screenRay(r.basis, x * f.half[0], f.centreY + y * f.half[1])
      assert.ok(Math.acos(-d[1]) > ring + deg(1), `aspect ${aspect}: corner ${x},${y}`)
    }
  }
})

test('framing: the picture is flat at rest on every shape of screen, and neighbours do not share sky', () => {
  for (const aspect of [0.46, 1.6, 2.4]) {
    const r = rest(aspect)
    const f = r.framing
    for (let u = -0.95; u <= 0.95; u += 0.19) {
      for (let v = -0.95; v <= 0.95; v += 0.19) {
        const sky = lensed(r.table, r.radius, screenRay(r.basis, u * f.half[0], f.centreY + v * f.half[1]))
        const own = pictureCoord(sky, 0, r.inverse, r.basis, f.centreY)
        assert.ok(Math.abs(own[0] - u * f.half[0]) < 2e-3 && Math.abs(own[1] - v * f.half[1]) < 2e-3)
        for (const turn of [r.step, -r.step]) {
          const other = pictureCoord(sky, turn, r.inverse, r.basis, f.centreY)
          assert.ok(other === null || Math.abs(other[0]) > f.half[0] || Math.abs(other[1]) > f.half[1], `aspect ${aspect}: ${u},${v} is also in a neighbour`)
        }
      }
    }
  }
})

// --------------------------------------------------------------- the sky ----

test('the sky matrix: with no lean it is what it always was', () => {
  // What renderer.ts worked out before sky.ts existed, for a turn of 0.3, a drift of 0.2 and the galaxy 6 degrees up
  const expected = [-0.197580999, 0.0207666, 0.980066578, 0.387902712, 0.919828532, 0.058710802, 0.900273978, -0.391770623, 0.189796061]
  const old = skyMatrix(0.3, 0.2, deg(6), 0)
  expected.forEach((v, i) => assert.ok(near(old.matrix[i], v, 1e-6), `entry ${i}: ${old.matrix[i]}`))
  ;[0.104528463, 0.994521895, 0].forEach((v, i) => assert.ok(near(old.axis[i], v, 1e-6)))
})

test('the sky matrix: the stars drift about an axis that leans off the hole, and stays put on the map', () => {
  const still = skyMatrix(0.3, 0, deg(-50))
  const moved = skyMatrix(0.3, 1.1, deg(-50))
  const apply = (m, v) => [0, 1, 2].map((r) => m[r] * v[0] + m[3 + r] * v[1] + m[6 + r] * v[2])
  const back = (m, v) => [0, 1, 2].map((c) => m[c * 3] * v[0] + m[c * 3 + 1] * v[1] + m[c * 3 + 2] * v[2])
  // Orthonormal, so the transpose takes a map direction back into the scene
  for (let c = 0; c < 3; c++) assert.ok(near(moved.matrix[c * 3] ** 2 + moved.matrix[c * 3 + 1] ** 2 + moved.matrix[c * 3 + 2] ** 2, 1, 1e-6))
  // The drift moves the sky...
  assert.ok(Math.hypot(...apply(moved.matrix, [0, 0, 1]).map((v, i) => v - apply(still.matrix, [0, 0, 1])[i])) > 0.5)
  // ...but not the direction it turns about
  const axisInScene = back(still.matrix, still.axis)
  apply(moved.matrix, axisInScene).forEach((v, i) => assert.ok(near(v, still.axis[i], 1e-6)))
  // Before any scrolling the scene's vertical is the hole's own axis. The stars turn about a
  // different one, or they would slide along the ring and never cross it.
  const first = skyMatrix(0, 0, deg(-50))
  const up = apply(first.matrix, [0, 1, 0])
  const lean = Math.acos(up[0] * first.axis[0] + up[1] * first.axis[1] + up[2] * first.axis[2])
  assert.ok(near(lean, DRIFT_TILT, 1e-6) && lean > deg(20))
})

test('the words know where the picture is: beside it on wide screens, with room to be read', () => {
  for (const aspect of [0.46, 1.0, SIDE_BY_SIDE, 1.33, 1.6, 2.4, 3.6]) {
    const f = rest(aspect).framing
    const box = pictureBox(aspect)
    const across = f.half[0] / (f.tanHalfFov * aspect)
    assert.ok(near(box.left, f.shift - across) && near(box.right, f.shift + across), `aspect ${aspect}`)
    assert.ok(near(box.top, (f.centreY + f.half[1]) / f.tanHalfFov) && near(box.bottom, (f.centreY - f.half[1]) / f.tanHalfFov))
    // Beside the picture there is at least a third of the screen for them
    if (aspect >= SIDE_BY_SIDE) assert.ok((1 + box.left) / 2 > 0.33, `aspect ${aspect}: ${(1 + box.left) / 2}`)
  }
})

// ------------------------------------------- the page asks for what it needs ----

const cornersOutsideRing = (r) => {
  const f = r.framing
  const ring = imageAngle(r.table, r.radius, Math.PI)
  for (const [x, y] of [[-1, -1], [0, -1], [1, -1], [-1, 1], [1, 1]]) {
    const d = screenRay(r.basis, x * f.half[0], f.centreY + y * f.half[1])
    assert.ok(Math.acos(-d[1]) > ring + deg(1))
  }
}

test('the ring stands clear of the shadow by the angle the page lays itself out with', () => {
  const table = deflectionTable(R_HOVER)
  assert.ok(near(RING_CLEAR, imageAngle(table, R_HOVER, Math.PI) - shadowAngle(R_HOVER), 2e-3))
})

test('framing: a short phone gets the shadow its words need, by a smaller picture set higher', () => {
  // 375 by 667: the words are about 264px tall and need 0.44 of the height under the limb
  const aspect = 375 / 667
  const plain = rest(aspect).framing
  assert.ok((1 + plain.horizon) / 2 < 0.4)
  const asked = rest(aspect, R_HOVER, { shadow: 0.44, ceiling: 0.76 })
  const f = asked.framing
  assert.ok((1 + f.horizon) / 2 >= 0.44 - 1e-6, `shadow ${(1 + f.horizon) / 2}`)
  assert.ok((f.centreY + f.half[1]) / f.tanHalfFov <= 0.76 + 1e-9)
  assert.ok(f.half[1] < plain.half[1] && f.half[1] / f.tanHalfFov > 0.12)
  assert.ok(near(f.half[0] / f.half[1], 1.6))
  cornersOutsideRing(asked)
})

test('framing: a screen with room to spare is left as it was', () => {
  const aspect = 390 / 844
  const plain = rest(aspect).framing
  const asked = rest(aspect, R_HOVER, { shadow: 0.2, ceiling: 0.8 }).framing
  assert.deepEqual(asked, plain)
})

test('framing: a short wide screen keeps the picture under the navigation and a limb in view', () => {
  // A phone on its side, 844 by 390, with the navigation 58px deep
  const aspect = 844 / 390
  const tune = { ceiling: 1 - (2 * 72) / 390, shadow: 0.08 }
  const asked = rest(aspect, R_HOVER, tune)
  const f = asked.framing
  assert.ok((f.centreY + f.half[1]) / f.tanHalfFov <= tune.ceiling + 1e-9)
  assert.ok((1 + f.horizon) / 2 >= 0.08 - 1e-6)
  cornersOutsideRing(asked)
  // And the page, which only knows the shape and what it asked for, finds the picture where the scene put it
  const box = pictureBox(aspect, tune)
  const across = f.half[0] / (f.tanHalfFov * aspect)
  assert.ok(near(box.left, f.shift - across, 1e-3) && near(box.top, (f.centreY + f.half[1]) / f.tanHalfFov, 1e-3) && near(box.bottom, (f.centreY - f.half[1]) / f.tanHalfFov, 1e-3))
})

test('framing: the picture is never made too small to see, and the page is told what shadow it got', () => {
  // 360 by 640, asked for half the screen: more than there is
  const aspect = 360 / 640
  const tune = { shadow: 0.5, ceiling: 0.769 }
  const f = rest(aspect, R_HOVER, tune).framing
  assert.ok(f.half[1] / f.tanHalfFov >= 0.2 - 1e-9, `picture ${f.half[1] / f.tanHalfFov}`)
  const got = (1 + f.horizon) / 2
  assert.ok(got < 0.5)
  // The page can tell, without the lens, that it did not get what it asked for
  assert.ok(near(pictureBox(aspect, tune).shadow, got, 2e-3))
  assert.ok(near(pictureBox(390 / 844).shadow, (1 + rest(390 / 844).framing.horizon) / 2, 2e-3))
})
