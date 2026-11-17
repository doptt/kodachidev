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

test('a phone with a real GPU always gets a tier: the scenes run on it', async () => {
  const { pickTier } = await import('../src/blackhole/quality.ts')
  const phone = (gpu, more = {}) => pickTier(gpu, { coarsePointer: true, ...more })
  // iPhones say only "Apple GPU", and report four cores or fewer
  assert.equal(phone('Apple GPU', { cores: 4 }), 'low')
  assert.equal(phone('ANGLE (Qualcomm, Adreno (TM) 740, OpenGL ES 3.2)'), 'medium')
  assert.equal(phone('Mali-G57 MC2', { memoryGb: 4, cores: 8 }), 'low')
  // The weakest start on the tier made for them rather than on a still picture
  assert.equal(phone('Mali-G52', { memoryGb: 2, cores: 8 }), 'lite')
  assert.equal(phone('PowerVR Rogue GE8320', { memoryGb: 4, cores: 4 }), 'lite')
  // Software rendering still gets nothing, on any device
  assert.equal(phone('Google SwiftShader'), null)
})

test('a desktop is given what it was given before', async () => {
  const { pickTier } = await import('../src/blackhole/quality.ts')
  const desk = (gpu) => pickTier(gpu, { coarsePointer: false })
  assert.equal(desk('ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU Direct3D11)'), 'ultra')
  assert.equal(desk('Apple M2'), 'high')
  assert.equal(desk('Intel(R) UHD Graphics 620'), 'medium')
  assert.equal(desk('llvmpipe'), null)
})

test('on a phone the governor steps one tier further, to lite, and stops there', async () => {
  const { PHONE_ORDER } = await import('../src/blackhole/quality.ts')
  const g = new Governor('medium', { order: PHONE_ORDER })
  assert.deepEqual(run(g, 30, 20000), ['low', 'lite'])
  assert.equal(g.current, 'lite')
  // A desktop never reaches it
  const d = new Governor('medium')
  assert.deepEqual(run(d, 30, 20000), ['low'])
})
