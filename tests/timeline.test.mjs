// Run with `npm test` (Node strips the TypeScript types on import).
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  timeline,
  travel,
  composition,
  IDLE_END,
  FALL_END,
  BLACK_AT,
  DIST_FAR,
  DIST_NEAR,
} from '../src/blackhole/timeline.ts'

const steps = (n) => Array.from({ length: n + 1 }, (_, i) => i / n)

test('idle: the camera is parked and nothing is dimmed', () => {
  for (const p of [0, IDLE_END / 2, IDLE_END]) {
    const f = timeline(p)
    assert.equal(f.fall, 0)
    assert.ok(Math.abs(f.dist - DIST_FAR) < 1e-9)
    assert.equal(f.blackout, 0)
    assert.equal(f.shake, 0)
    assert.equal(f.smear, 0)
  }
  assert.equal(timeline(0).cue, 1)
})

test('the cue is gone as soon as the user has scrolled a little', () => {
  assert.equal(timeline(0.04).cue, 0)
})

test('distance only ever shrinks, and ends at the horizon', () => {
  let last = Infinity
  for (const p of steps(400)) {
    const d = timeline(p).dist
    assert.ok(d <= last + 1e-12, `distance grew at p=${p}`)
    last = d
  }
  assert.ok(Math.abs(timeline(FALL_END).dist - DIST_NEAR) < 1e-9)
})

test('slow start, accelerating: each quarter of the fall covers more ground than the last', () => {
  const q = [0, 0.25, 0.5, 0.75, 1].map(travel)
  const spans = [q[1] - q[0], q[2] - q[1], q[3] - q[2], q[4] - q[3]]
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i] > spans[i - 1])
  assert.ok(spans[0] < 0.12, 'first quarter should barely move')
})

test('no abrupt jumps: every channel is continuous in scroll', () => {
  const keys = Object.keys(timeline(0))
  const n = 4000
  let prev = timeline(0)
  for (let i = 1; i <= n; i++) {
    const cur = timeline(i / n)
    for (const k of keys) {
      // Compare relative to the channel's own scale; log space for distance
      const a = k === 'dist' ? Math.log(prev[k]) : prev[k]
      const b = k === 'dist' ? Math.log(cur[k]) : cur[k]
      assert.ok(Math.abs(b - a) < 0.02, `${k} jumped by ${Math.abs(b - a)} at p=${i / n}`)
    }
    prev = cur
  }
})

test('the frame is exactly black from BLACK_AT to the end, and not before the fall is nearly over', () => {
  for (const p of [BLACK_AT, 0.96, 1]) assert.equal(timeline(p).blackout, 1)
  assert.equal(timeline(0.75).blackout, 0)
})

test('reversible: the same scroll position always gives the same frame', () => {
  for (const p of [0, 0.1, 0.33, 0.5, 0.8, 0.95, 1]) assert.deepEqual(timeline(p), timeline(p))
})

test('framing: hole right of centre and above the middle, tighter on wide screens', () => {
  const portrait = composition(9 / 16)
  const wide = composition(16 / 9)
  for (const c of [portrait, wide]) {
    assert.ok(c.hole[0] > 0 && c.hole[1] > 0)
    assert.ok(c.tanHalfFov > 0.1 && c.tanHalfFov < 1)
  }
  assert.ok(wide.tanHalfFov < portrait.tanHalfFov)
})
