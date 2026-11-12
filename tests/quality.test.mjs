// Run with `npm test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { Governor } from '../src/blackhole/quality.ts'

/** Feeds `ms` worth of frames of the given length; returns every tier change it caused. */
function run(governor, frameMs, ms) {
  const changes = []
  for (let t = 0; t < ms; t += frameMs) {
    const next = governor.sample(frameMs)
    if (next) changes.push(next)
  }
  return changes
}

test('a steady 60fps never steps down', () => {
  const g = new Governor('ultra')
  assert.deepEqual(run(g, 16.7, 20000), [])
  assert.equal(g.current, 'ultra')
})

test('sustained slow frames step down one tier at a time', () => {
  const g = new Governor('ultra')
  const changes = run(g, 30, 12000)
  assert.equal(changes[0], 'high')
  assert.ok(changes.length >= 2, 'keeps stepping while it stays slow')
  assert.deepEqual(changes, ['high', 'medium', 'low'].slice(0, changes.length))
})

test('start-up hitches are not mistaken for a slow GPU', () => {
  const g = new Governor('ultra')
  // Shaders compiling: a handful of very long frames right at the start, then smooth
  for (const hitch of [180, 220, 140, 90]) assert.equal(g.sample(hitch), null)
  assert.deepEqual(run(g, 16.7, 10000), [])
  assert.equal(g.current, 'ultra')
})

test('hitches after resuming are forgiven too', () => {
  const g = new Governor('ultra')
  run(g, 16.7, 5000)
  g.rest()
  for (const hitch of [200, 200, 200, 200, 200]) assert.equal(g.sample(hitch), null)
  assert.deepEqual(run(g, 16.7, 5000), [])
})

test('an isolated long frame in the middle of smooth playback does not step down', () => {
  const g = new Governor('ultra')
  run(g, 16.7, 4000)
  for (let i = 0; i < 6; i++) {
    assert.equal(g.sample(200), null)
    assert.deepEqual(run(g, 16.7, 1500), [])
  }
  assert.equal(g.current, 'ultra')
})

test('it never steps below the lowest tier', () => {
  const g = new Governor('low')
  assert.deepEqual(run(g, 40, 10000), [])
  assert.equal(g.current, 'low')
})
