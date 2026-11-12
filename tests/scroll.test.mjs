// Run with `npm test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { scrollPosition, derive, nextEntered, timeline, ENTER_AT, EXIT_AT, LEAD, ARRIVE_FROM, IDLE_END, DIST_FAR } from '../src/blackhole/timeline.ts'

const VH = 900
const HEIGHT = VH * 6
const RUN_IN = VH * 1.5
const near = (a, b) => Math.abs(a - b) < 1e-9
/** A scroll position with everything at rest except what a test sets. */
const at = (pos) => ({ fade: 1, enter: 0, pin: 0, exit: 0, ...pos })

test('scroll position of the pinned stage: before, entering, pinned, leaving', () => {
  const far = VH * 10
  // Further away than the lead distance: nothing has started
  const before = scrollPosition(VH * (LEAD + 0.5), HEIGHT, VH, far, RUN_IN)
  assert.equal(before.enter, 0)
  assert.equal(before.pin, 0)
  assert.equal(before.exit, 0)
  // Top edge halfway up the viewport
  assert.ok(near(scrollPosition(VH / 2, HEIGHT, VH, far, RUN_IN).enter, (LEAD - 0.5) / LEAD))
  // Just pinned
  const pinned = scrollPosition(0, HEIGHT, VH, far, RUN_IN)
  assert.equal(pinned.enter, 1)
  assert.equal(pinned.pin, 0)
  // Halfway through the pinned stretch
  const mid = scrollPosition(-(HEIGHT - VH) / 2, HEIGHT, VH, far, RUN_IN)
  assert.ok(near(mid.pin, 0.5))
  assert.equal(mid.exit, 0)
  // Unpinned, bottom edge halfway up the viewport
  const leaving = scrollPosition(-(HEIGHT - VH / 2), HEIGHT, VH, far, RUN_IN)
  assert.equal(leaving.pin, 1)
  assert.ok(near(leaving.exit, 0.5))
  // Gone
  assert.equal(scrollPosition(-HEIGHT - 10, HEIGHT, VH, far, RUN_IN).exit, 1)
})

test('fade: runs over the run-in, wherever the stage is', () => {
  const stageTop = VH * 8 // other content sits between the run-in and the stage
  const fade = (runInTop) => scrollPosition(stageTop, HEIGHT, VH, runInTop, RUN_IN).fade
  // The run-in is still below the fold, or only just peeking in: nothing yet
  assert.equal(fade(VH * 1.2), 0)
  assert.equal(fade(VH * 0.5), 0)
  // Under way once its top edge is above the middle of the screen
  const part = fade(VH * 0.1)
  assert.ok(part > 0 && part < 1)
  // Finished just before its bottom edge comes into view, and from then on
  assert.equal(fade(-RUN_IN + VH * 0.95), 1)
  assert.equal(fade(-RUN_IN - VH * 3), 1)
  // It only ever increases on the way down
  let last = -1
  for (let top = VH * 1.2; top > -RUN_IN - VH; top -= 20) {
    const f = fade(top)
    assert.ok(f >= last)
    last = f
  }
})

test('theme: follows the fade, and holds at full for everything after the run-in', () => {
  assert.equal(derive(at({ fade: 0 }), true).theme, 0)
  const half = derive(at({ fade: 0.5 }), true).theme
  assert.ok(half > 0.2 && half < 0.8)
  assert.equal(derive(at({ fade: 1 }), true).theme, 1)
  assert.equal(derive(at({ fade: 1, enter: 1, pin: 0.5 }), true).theme, 1)
})

test('arrive: the scene is invisible until the stage is on screen, and fully up just after it pins', () => {
  assert.equal(derive(at({ enter: 1 - 1 / LEAD }), true).arrive, 0)
  assert.equal(derive(at({ enter: 1 - ARRIVE_FROM / LEAD }), true).arrive, 0)
  const half = derive(at({ enter: 1 - 0.5 / LEAD }), true).arrive
  assert.ok(half > 0 && half < 0.82)
  assert.ok(derive(at({ enter: 1 }), true).arrive < 1)
  assert.equal(derive(at({ enter: 1, pin: 0.05 }), true).arrive, 1)
  // It stays up for the rest of the sequence, including after the bridge releases the theme
  assert.equal(derive(at({ enter: 1, pin: 1, exit: 1 }), true).arrive, 1)
})

test('arrive eases the camera forward, and the cue waits for it', () => {
  assert.ok(timeline(0, 0).dist > DIST_FAR * 1.1)
  assert.ok(near(timeline(0, 1).dist, DIST_FAR))
  assert.equal(timeline(0, 0.5).cue, 0)
  assert.equal(timeline(0, 1).cue, 1)
})

test('intro: the caption is up only while the scene idles', () => {
  // Not while the scene is still coming up
  assert.equal(derive(at({ enter: 1 - 0.5 / LEAD }), true).intro, 0)
  // Fully there once it has settled, through the first part of the idle hold
  assert.equal(derive(at({ enter: 1, pin: 0.05 }), true).intro, 1)
  // Fading as the fall begins, and gone soon after
  const leaving = derive(at({ enter: 1, pin: IDLE_END }), true).intro
  assert.ok(leaving > 0 && leaving < 1)
  assert.equal(derive(at({ enter: 1, pin: IDLE_END * 1.5 }), true).intro, 0)
  assert.equal(derive(at({ enter: 1, pin: 0.6 }), true).intro, 0)
})

test('dim: nothing at idle, complete before the screen is black', () => {
  assert.equal(derive(at({ enter: 1, pin: 0 }), true).dim, 0)
  assert.equal(derive(at({ enter: 1, pin: 0.3 }), true).dim, 0)
  assert.equal(derive(at({ enter: 1, pin: 0.92 }), true).dim, 1)
  assert.equal(derive(at({ enter: 1, pin: 1 }), true).dim, 1)
})

test('theme, arrive and dim rise monotonically, so scrolling back retraces the same values', () => {
  let lastTheme = -1
  for (let i = 0; i <= 200; i++) {
    const t = derive(at({ fade: i / 200 }), true).theme
    assert.ok(t >= lastTheme)
    lastTheme = t
  }
  let lastArrive = -1
  for (let i = 0; i <= 200; i++) {
    const a = derive(at({ enter: i / 200 }), true).arrive
    assert.ok(a >= lastArrive)
    lastArrive = a
  }
  let lastDim = -1
  for (let i = 0; i <= 200; i++) {
    const d = derive(at({ enter: 1, pin: i / 200 }), true)
    assert.ok(d.dim >= lastDim)
    assert.ok(d.arrive >= lastArrive)
    lastDim = d.dim
    lastArrive = d.arrive
  }
})

test('handoff: with the bridge off, the theme and the dim are held past the end', () => {
  const held = derive(at({ enter: 1, pin: 1, exit: 1 }), false)
  assert.equal(held.theme, 1)
  assert.equal(held.dim, 1)
  const released = derive(at({ enter: 1, pin: 1, exit: 1 }), true)
  assert.equal(released.theme, 0)
  assert.equal(released.dim, 0)
})

test('entered has hysteresis: on at ENTER_AT, off only below EXIT_AT', () => {
  assert.equal(nextEntered(false, ENTER_AT - 0.001), false)
  assert.equal(nextEntered(false, ENTER_AT), true)
  // Hovering between the two thresholds keeps whichever state it was in
  const between = (ENTER_AT + EXIT_AT) / 2
  assert.equal(nextEntered(true, between), true)
  assert.equal(nextEntered(false, between), false)
  assert.equal(nextEntered(true, EXIT_AT - 0.001), false)
})
