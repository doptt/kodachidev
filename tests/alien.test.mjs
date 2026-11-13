// Run with `npm test`. The alien actor's pure maths: limbs, springs, where he may look, when he does what.
import test from 'node:test'
import assert from 'node:assert/strict'
import { solveTwoBone, solveTwoBoneAtHeight } from '../src/alien/maths/ik.ts'
import { lagUnderAcceleration, stepSpring } from '../src/alien/maths/spring.ts'
import { LOOK_LIMITS, lookAngles, softLimit } from '../src/alien/maths/look.ts'
import { BLINK_DURATION, TIMING, blinkCurve, makeSchedule, seededRandom } from '../src/alien/maths/schedule.ts'
import { principalAxes } from '../src/alien/maths/fit.ts'

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

// ---------------------------------------------------------------- limbs ----

test('a limb reaches a target within its length, and its bones keep their lengths', () => {
  const root = [0.07, 0.5, -0.1]
  for (const target of [[0.17, 0.33, 0.08], [0.1, 0.62, 0.12], [0.2, 0.4, -0.05]]) {
    const solved = solveTwoBone(root, target, 0.153, 0.154, [0.5, -1, -0.4])
    assert.ok(solved.reached)
    assert.ok(near(dist(root, solved.mid), 0.153, 1e-9))
    assert.ok(near(dist(solved.mid, solved.end), 0.154, 1e-9))
    assert.ok(dist(solved.end, target) < 1e-9)
  }
})

test('a target out of reach is pulled in to an almost straight limb, never a locked one', () => {
  const solved = solveTwoBone([0, 0, 0], [0, 0, 5], 0.2, 0.25, [0, 1, 0])
  assert.equal(solved.reached, false)
  assert.ok(near(dist([0, 0, 0], solved.end), 0.45 * 0.999, 1e-9))
  assert.ok(near(dist([0, 0, 0], solved.mid), 0.2, 1e-9))
  // The joint is still bent a little, toward the pole
  assert.ok(solved.mid[1] > 0)
})

test('the middle joint goes to the side the pole points to', () => {
  const up = solveTwoBone([0, 0, 0], [0, 0, 0.3], 0.2, 0.2, [0, 1, 0])
  const down = solveTwoBone([0, 0, 0], [0, 0, 0.3], 0.2, 0.2, [0, -1, 0])
  assert.ok(up.mid[1] > 0.1 && down.mid[1] < -0.1)
  // A pole along the limb itself gives no side: it still returns a joint at the right distances
  const along = solveTwoBone([0, 0, 0], [0, 0, 0.3], 0.2, 0.2, [0, 0, 1])
  assert.ok(near(dist([0, 0, 0], along.mid), 0.2, 1e-9))
})

test('an elbow can be put at the height of the arm of a chair', () => {
  const shoulder = [0.08, 0.52, -0.12]
  const wrist = [0.17, 0.36, 0.1]
  const solved = solveTwoBoneAtHeight(shoulder, wrist, 0.153, 0.154, [0.5, -1, -0.4], 0.41)
  assert.ok(near(solved.mid[1], 0.41, 1e-9))
  assert.ok(near(dist(shoulder, solved.mid), 0.153, 1e-9))
  assert.ok(near(dist(solved.mid, wrist), 0.154, 1e-9))
  // Of the two swivels at that height it takes the one nearer the pole: outward for a left arm
  assert.ok(solved.mid[0] > shoulder[0])
})

test('an elbow height that cannot be had gives the nearest that can', () => {
  const shoulder = [0, 0.5, 0]
  const wrist = [0, 0.3, 0.2]
  const lowest = solveTwoBoneAtHeight(shoulder, wrist, 0.2, 0.2, [0, -1, 0], -10)
  const plain = solveTwoBone(shoulder, wrist, 0.2, 0.2, [0, -1, -1])
  assert.ok(lowest.mid[1] <= plain.mid[1] + 1e-9)
  assert.ok(near(dist(shoulder, lowest.mid), 0.2, 1e-9))
})

// -------------------------------------------------------------- springs ----

test('a spring settles on its rest position and never blows up', () => {
  const s = { x: 1, v: 0 }
  let peak = 0
  for (let i = 0; i < 600; i++) {
    stepSpring(s, 0, 1 / 60, 2.4, 0.11)
    peak = Math.max(peak, Math.abs(s.x))
  }
  assert.ok(peak <= 1)
  assert.ok(Math.abs(s.x) < 1e-3 && Math.abs(s.v) < 1e-2)
})

test('an underdamped spring overshoots; a critically damped one does not', () => {
  const springy = { x: 1, v: 0 }
  const dead = { x: 1, v: 0 }
  let low = 1
  let lowDead = 1
  for (let i = 0; i < 240; i++) {
    low = Math.min(low, stepSpring(springy, 0, 1 / 120, 2.4, 0.11).x)
    lowDead = Math.min(lowDead, stepSpring(dead, 0, 1 / 120, 2.4, 1).x)
  }
  assert.ok(low < -0.5)
  assert.ok(lowDead > -1e-9)
})

test('the same motion at any frame rate, and after one long frame', () => {
  const run = (dt, steps) => {
    const s = { x: 0.3, v: -1 }
    for (let i = 0; i < steps; i++) stepSpring(s, 0.1, dt, 5.2, 0.16)
    return s
  }
  const fine = run(1 / 240, 240)
  const coarse = run(1 / 30, 30)
  const one = run(1, 1)
  assert.ok(near(fine.x, coarse.x, 1e-9) && near(fine.v, coarse.v, 1e-8))
  assert.ok(near(fine.x, one.x, 1e-9) && near(fine.v, one.v, 1e-8))
})

test('an accelerating mount makes the mass hang back', () => {
  // Accelerating toward +x: the mass rests behind, by a / omega^2
  const lag = lagUnderAcceleration(2, 2.4)
  assert.ok(lag < 0)
  assert.ok(near(lag, -2 / (2 * Math.PI * 2.4) ** 2, 1e-12))
  assert.equal(lagUnderAcceleration(0, 2.4), -0)
})

// ---------------------------------------------------------------- looks ----

test('he looks where the point is while it is in front of him', () => {
  const out = { yaw: 0, pitch: 0 }
  lookAngles(0, 0, 3, 0, out)
  assert.ok(near(out.yaw, 0) && near(out.pitch, 0))
  // A little to his left and a little up: nearly the true angles
  lookAngles(0.5, 0.3, 3, 0, out)
  assert.ok(out.yaw > 0 && Math.abs(out.yaw - Math.atan2(0.5, 3)) < 0.01)
  assert.ok(out.pitch > 0 && Math.abs(out.pitch - Math.atan2(0.3, Math.hypot(0.5, 3))) < 0.01)
})

test('no point can turn his head past what a neck allows', () => {
  const out = { yaw: 0, pitch: 0 }
  for (const [x, y, z] of [[9, 0, 0.1], [-9, 0, 0.1], [0, 9, 0.1], [0, -9, 0.1], [3, 3, -3], [-0.1, 0.2, -5], [0, 5, 0]]) {
    lookAngles(x, y, z, 0, out)
    assert.ok(Math.abs(out.yaw) <= LOOK_LIMITS.yaw)
    assert.ok(out.pitch <= LOOK_LIMITS.up && out.pitch >= -LOOK_LIMITS.down)
  }
  assert.ok(softLimit(100, 1.05) <= 1.05 && softLimit(-100, 1.05) >= -1.05)
  assert.ok(near(softLimit(0.01, 1.05), 0.01, 1e-5))
})

test('a point passing behind him does not snap his head from one shoulder to the other', () => {
  const out = { yaw: 0, pitch: 0 }
  // Just behind, on his left: he looks over his left shoulder
  lookAngles(0.3, 0, -3, 0, out)
  assert.ok(out.yaw > 0.9)
  const before = out.yaw
  // It drifts across to just behind on his right: he stays on the left
  lookAngles(-0.3, 0, -3, before, out)
  assert.ok(out.yaw > 0.9)
  // Once it is well round on the right he turns
  lookAngles(-3, 0, -2, out.yaw, out)
  assert.ok(out.yaw < -0.8)
})

// ------------------------------------------------------------- schedule ----

test('the same seed gives the same evening', () => {
  const run = (seed) => {
    const schedule = makeSchedule(seed, 3.5, [4.8, 2.8])
    const out = { sip: false, blink: false, beat: -1 }
    const log = []
    for (let i = 0; i < 60 * 120; i++) {
      schedule.step(1 / 60, out)
      if (out.sip) log.push(`sip ${schedule.time().toFixed(3)}`)
      if (out.beat >= 0) log.push(`beat${out.beat} ${schedule.time().toFixed(3)}`)
      if (out.blink) log.push(`blink ${schedule.time().toFixed(3)}`)
    }
    return log.join(',')
  }
  assert.equal(run(7), run(7))
  assert.notEqual(run(7), run(8))
  const a = seededRandom(1)
  const b = seededRandom(1)
  for (let i = 0; i < 10; i++) assert.equal(a(), b())
})

test('a sip every 6 to 10 seconds, the first one sooner, and nothing overlapping', () => {
  for (const seed of [1, 2, 3, 20261112]) {
    for (const dt of [1 / 60, 1 / 144, 1 / 24]) {
      const sipDuration = 3.5
      const beats = [4.8, 2.8]
      const schedule = makeSchedule(seed, sipDuration, beats)
      const out = { sip: false, blink: false, beat: -1 }
      const sips = []
      const busy = []
      let beatCount = 0
      for (let t = 0; t < 600; t += dt) {
        schedule.step(dt, out)
        const now = schedule.time()
        if (out.sip) {
          sips.push(now)
          busy.push([now, now + sipDuration])
        }
        if (out.beat >= 0) {
          beatCount++
          busy.push([now, now + beats[out.beat]])
        }
        assert.ok(!(out.sip && out.beat >= 0))
      }
      assert.ok(sips[0] >= TIMING.firstSip[0] && sips[0] <= TIMING.firstSip[1] + dt)
      for (let i = 1; i < sips.length; i++) {
        const gap = sips[i] - sips[i - 1]
        assert.ok(gap >= TIMING.sip[0] - 1e-9 && gap <= TIMING.sip[1] + dt + 1e-9, `gap ${gap}`)
      }
      for (let i = 1; i < busy.length; i++) assert.ok(busy[i][0] >= busy[i - 1][1] - 1e-9, 'one thing at a time')
      // Ten minutes holds a fair few of each
      assert.ok(sips.length >= 55 && sips.length <= 101)
      assert.ok(beatCount >= 10)
    }
  }
})

test('blinks come every few seconds, sometimes in pairs', () => {
  const schedule = makeSchedule(5, 3.5, [4.8, 2.8])
  const out = { sip: false, blink: false, beat: -1 }
  const blinks = []
  for (let i = 0; i < 60 * 600; i++) {
    schedule.step(1 / 60, out)
    if (out.blink) blinks.push(schedule.time())
  }
  let pairs = 0
  for (let i = 1; i < blinks.length; i++) {
    const gap = blinks[i] - blinks[i - 1]
    if (gap < 0.5) pairs++
    assert.ok(gap <= TIMING.blink[1] + 0.05)
    assert.ok(gap >= TIMING.doubleBlinkGap - 0.02)
  }
  assert.ok(pairs > 3 && pairs < blinks.length / 3)
})

test('a blink shuts fast, holds, opens slower, and is over when it says', () => {
  assert.equal(blinkCurve(0), 0)
  assert.equal(blinkCurve(-1), 0)
  assert.equal(blinkCurve(BLINK_DURATION), 0)
  assert.equal(blinkCurve(0.08), 1)
  let last = 0
  for (let t = 0; t <= 0.07; t += 0.005) {
    assert.ok(blinkCurve(t) >= last)
    last = blinkCurve(t)
  }
  for (let t = 0; t <= BLINK_DURATION; t += 0.002) assert.ok(blinkCurve(t) >= 0 && blinkCurve(t) <= 1)
})

// ------------------------------------------------------------------ fit ----

test('the axes of a flat oval patch: longest, widest, and the way it faces', () => {
  // An oval 6 by 3 lying in a tilted plane, with a little thickness
  const points = []
  const tilt = 0.5
  const random = seededRandom(3)
  for (let i = 0; i < 800; i++) {
    const a = random() * Math.PI * 2
    const r = Math.sqrt(random())
    const x = 6 * r * Math.cos(a)
    const y = 3 * r * Math.sin(a)
    const z = (random() - 0.5) * 0.2
    points.push(10 + x, 5 + y * Math.cos(tilt) - z * Math.sin(tilt), -2 + y * Math.sin(tilt) + z * Math.cos(tilt))
  }
  const fit = principalAxes(points)
  assert.ok(Math.abs(fit.centre[0] - 10) < 0.3 && Math.abs(fit.centre[1] - 5) < 0.3 && Math.abs(fit.centre[2] + 2) < 0.3)
  assert.ok(Math.abs(Math.abs(fit.axes[0][0]) - 1) < 0.01)
  const normal = fit.axes[2]
  assert.ok(Math.abs(Math.abs(normal[1] * -Math.sin(tilt) + normal[2] * Math.cos(tilt)) - 1) < 0.01)
  assert.ok(fit.spread[0] > fit.spread[1] && fit.spread[1] > fit.spread[2])
  // The three are at right angles
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  assert.ok(Math.abs(dot(fit.axes[0], fit.axes[1])) < 1e-9 && Math.abs(dot(fit.axes[1], fit.axes[2])) < 1e-9)
})
