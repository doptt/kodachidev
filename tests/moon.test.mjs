// Run with `npm test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { arc, azimuth, latLonToUv, latLonToVec3, standFrame, toStand, vec3ToLatLon, visibility } from '../src/moon/geo.ts'
import { INERTIA, MAX_SPIN, RUBBER, SWAY, SWAY_DELAY, TILT_MAX, TILT_MIN, YAW_MAX, createOrbit, drag, face, grab, release, step, unface } from '../src/moon/orbit.ts'
import {
  ALIEN_SHARE,
  FEET_AT,
  HOLD,
  LIMB_CORNER,
  LIMB_TOP,
  OUTLINE,
  SETTLED_AT,
  SPAN,
  TRAVEL,
  cameraAxes,
  cameraPose,
  framing,
  limbHeight,
  moonTimeline,
  project,
  radiusFor,
  screenDirection,
} from '../src/moon/timeline.ts'
import { ALIEN_HEIGHT, CAMERA_AZIMUTH, EARTH, PIN, SITE, SUN } from '../src/moon/config.ts'
import { CONTACT_PINS } from '../src/content/contact.ts'

const deg = (d) => (d * Math.PI) / 180
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const WIDE = [1.5, 1.6, 16 / 9, 1933 / 949, 2.37]
const TALL = [0.46, 0.56, 0.75]
const ASPECTS = [...TALL, 1, 1.33, ...WIDE]
const world = (aspect) => {
  // His head is most of the way up him, a little behind the middle of the chair
  const radius = radiusFor(aspect, ALIEN_HEIGHT)
  return { radius, head: [0, radius + ALIEN_HEIGHT * 0.82, -0.08] }
}
const pose = (aspect, pull = 1, yaw = 0, tilt = 0) => {
  const { radius, head } = world(aspect)
  return cameraPose(pull, aspect, radius, ALIEN_HEIGHT, head, CAMERA_AZIMUTH, yaw, tilt)
}

/** The moon's edge as a camera sees it: screen fractions from the top left, sampled across the screen. */
function limb(aspect, at) {
  const { radius } = world(aspect)
  const { right, up, forward } = cameraAxes(at)
  assert.ok(near(right[1], 0), 'the camera is level')
  const distance = Math.hypot(...at.position)
  const alpha = Math.asin(radius / distance)
  // How far below the line of sight the moon's centre is
  const toCentre = at.position.map((v) => -v / distance)
  const beta = Math.atan2(-dot(toCentre, up), dot(toCentre, forward))
  const t = Math.tan(deg(at.fov / 2))
  const out = []
  for (let i = -12; i <= 252; i++) {
    const fx = i / 240
    const y = limbHeight((fx * 2 - 1) * aspect * t, alpha, beta)
    if (y !== null) out.push([fx, 0.5 - y / t / 2])
  }
  return out
}

/** The greatest and the root-mean-square distance, in pixels, from the owner's outline points to a limb. */
function misfit(curve, width, height) {
  let worst = 0
  let sum = 0
  for (const [px, py] of OUTLINE) {
    let best = Infinity
    for (let i = 1; i < curve.length; i++) {
      const x1 = curve[i - 1][0] * width
      const y1 = curve[i - 1][1] * height
      const dx = curve[i][0] * width - x1
      const dy = curve[i][1] * height - y1
      const u = Math.min(1, Math.max(0, ((px * width - x1) * dx + (py * height - y1) * dy) / (dx * dx + dy * dy)))
      best = Math.min(best, Math.hypot(px * width - x1 - u * dx, py * height - y1 - u * dy))
    }
    worst = Math.max(worst, best)
    sum += best * best
  }
  return { worst, rms: Math.sqrt(sum / OUTLINE.length) }
}

// ------------------------------------------------- places on the moon ----

test('latitude and longitude map to the frame of the maps', () => {
  assert.deepEqual(latLonToVec3(0, 0).map((v) => +v.toFixed(9)), [0, 0, 1])
  assert.ok(near(latLonToVec3(90, 0)[1], 1))
  assert.ok(near(latLonToVec3(0, 90)[0], 1), 'east is +X')
  for (const [lat, lon] of [[0.674, 23.473], [-43.31, -11.36], [51.6, -9.4], [-17.5, 179], [70, -140]]) {
    const back = vec3ToLatLon(latLonToVec3(lat, lon))
    assert.ok(near(back.lat, lat, 1e-9) && near(back.lon, lon, 1e-9), `${lat}, ${lon} survives the round trip`)
  }
  assert.deepEqual(latLonToUv(90, -180), [0, 0])
  assert.deepEqual(latLonToUv(0, 0), [0.5, 0.5])
  assert.deepEqual(latLonToUv(-90, 180), [1, 1])
})

test('the stand frame puts the chair on top and the alien facing +Z', () => {
  for (const heading of [0, 90, SITE.heading]) {
    const frame = standFrame(SITE.lat, SITE.lon, heading)
    const up = toStand(frame, latLonToVec3(SITE.lat, SITE.lon))
    assert.ok(near(up[0], 0) && near(up[1], 1) && near(up[2], 0), 'the site is straight up')
    for (const row of frame) assert.ok(near(Math.hypot(...row), 1))
    assert.ok(near(dot(frame[0], frame[1]), 0) && near(dot(frame[1], frame[2]), 0) && near(dot(frame[0], frame[2]), 0))
    assert.ok(near(dot(cross(frame[0], frame[1]), frame[2]), 1), 'right-handed')
  }
  // Facing north, a place a little further north is straight ahead; a place to the east is on his right (-X)
  const north = standFrame(10, 20, 0)
  assert.ok(near(azimuth(toStand(north, latLonToVec3(15, 20))), 0, 1e-9))
  assert.ok(toStand(north, latLonToVec3(10, 25))[0] < 0)
  assert.ok(near(arc(latLonToVec3(0, 0), latLonToVec3(0, 90)), Math.PI / 2))
})

test('a pin is seen on the near side and hidden behind the moon', () => {
  const R = 5
  const camera = [0, 0, 12]
  const head = (angle, height = PIN.height) => [Math.sin(angle) * (R + height), 0, Math.cos(angle) * (R + height)]
  assert.equal(visibility(camera, head(0), R, 0.22), 1, 'facing the camera')
  assert.equal(visibility(camera, head(deg(50)), R, 0.22), 1, 'well round but in view')
  assert.equal(visibility(camera, head(deg(180)), R, 0.22), 0, 'directly behind')
  assert.equal(visibility(camera, head(deg(110)), R, 0.22), 0, 'past the limb')
  // Going round the limb it fades, and never comes back until it is round the other side
  let last = 1
  let fading = 0
  for (let a = 0; a <= 180; a += 0.25) {
    const v = visibility(camera, head(deg(a)), R, 0.22)
    assert.ok(v <= last + 1e-12, `no brighter at ${a} degrees than just before`)
    if (v > 0 && v < 1) fading++
    last = v
  }
  assert.ok(fading >= 6, 'it takes several degrees to go, not one')
  // The test is by the line of sight, not by which hemisphere: the tip of a tall pin just past the limb still shows
  assert.ok(visibility(camera, head(deg(80), 3), R, 0.22) > 0)
  assert.equal(visibility(camera, head(deg(80), 0.05), R, 0.22), 0)
})

// ------------------------------------------------- looking round by hand ----

test('a drag moves the view directly and a throw carries on, dying away', () => {
  const o = createOrbit()
  grab(o)
  // A steady drag of a third of a radian a second for a third of a second
  for (let i = 0; i < 20; i++) {
    drag(o, 0.3 / 60, 0)
    step(o, 1 / 60, { auto: false, tau: 0.2 })
  }
  assert.ok(near(o.yaw, 6 / 60, 1e-9), 'the view is exactly where the hand put it')
  assert.ok(Math.abs(o.vYaw - 0.3) < 0.02, 'and knows how fast the hand was going')
  release(o)
  const start = o.yaw
  const v0 = o.vYaw
  let prev = Math.abs(o.vYaw)
  for (let i = 0; i < 600; i++) {
    step(o, 1 / 60, { auto: false, tau: 0.2 })
    assert.ok(Math.abs(o.vYaw) <= prev + 1e-12, 'never speeds up on its own')
    prev = Math.abs(o.vYaw)
  }
  assert.ok(Math.abs(o.vYaw) < 1e-3, 'it comes to rest')
  // Exponential decay: the coast is the speed times the time constant (the limit is not reached here)
  assert.ok(o.yaw < YAW_MAX && Math.abs(o.yaw - start - v0 * INERTIA) < 0.01, `coasted ${(o.yaw - start).toFixed(3)}`)
})

test('the coast is the same whatever the frame rate', () => {
  const coast = (fps) => {
    const o = createOrbit()
    o.vYaw = 0.4
    for (let i = 0; i < fps * 8; i++) step(o, 1 / fps, { auto: false, tau: 0.2 })
    return o.yaw
  }
  assert.ok(Math.abs(coast(30) - coast(144)) < 0.01)
})

test('a hand that stops before letting go does not throw, and a throw is capped', () => {
  const o = createOrbit()
  grab(o)
  for (let i = 0; i < 10; i++) {
    drag(o, 0.02, 0)
    step(o, 1 / 60, { auto: false, tau: 0.2 })
  }
  for (let i = 0; i < 30; i++) step(o, 1 / 60, { auto: false, tau: 0.2 })
  release(o)
  assert.ok(Math.abs(o.vYaw) < 0.02)

  const wild = createOrbit()
  grab(wild)
  for (let i = 0; i < 6; i++) {
    drag(wild, 2, 0)
    step(wild, 1 / 60, { auto: false, tau: 0.2 })
  }
  release(wild)
  assert.ok(Math.abs(wild.vYaw) <= MAX_SPIN)
})

test('the swing and the tilt give past their limits, grudgingly, and ease back', () => {
  const o = createOrbit()
  grab(o)
  drag(o, YAW_MAX, TILT_MAX)
  assert.ok(near(o.yaw, YAW_MAX) && near(o.tilt, TILT_MAX), 'free up to the limit')
  drag(o, 0.2, 0.2)
  assert.ok(near(o.yaw, YAW_MAX + 0.2 * RUBBER) && near(o.tilt, TILT_MAX + 0.2 * RUBBER), 'a fraction of the drag beyond it')
  drag(o, -0.01, -0.01)
  assert.ok(near(o.yaw, YAW_MAX + 0.2 * RUBBER - 0.01), 'coming back is free')
  release(o)
  for (let i = 0; i < 180; i++) step(o, 1 / 60, { auto: false, tau: 0.2 })
  assert.ok(near(o.yaw, YAW_MAX, 1e-3) && near(o.tilt, TILT_MAX, 1e-3), 'back at the limits')

  // A hard throw toward a limit does not carry the view far through it, and it ends at the limit
  for (const sign of [1, -1]) {
    const p = createOrbit()
    p.vYaw = sign * MAX_SPIN
    p.vTilt = -sign * 2
    let furthest = 0
    for (let i = 0; i < 400; i++) {
      step(p, 1 / 60, { auto: false, tau: 0.2 })
      furthest = Math.max(furthest, Math.abs(p.yaw))
    }
    assert.ok(furthest < YAW_MAX + 0.35, `overshot to ${furthest.toFixed(2)}`)
    assert.ok(near(p.yaw, sign * YAW_MAX, 1e-3))
    assert.ok(near(p.tilt, sign > 0 ? TILT_MIN : TILT_MAX, 1e-3))
  }
})

test('left alone the view sways gently about where it was left, and stays inside its limits', () => {
  const o = createOrbit()
  for (let i = 0; i < 60 * (SWAY_DELAY - 0.2); i++) step(o, 1 / 60, { auto: true, tau: 0.2 })
  assert.equal(o.yaw, 0, 'still, at first')
  let lo = 0
  let hi = 0
  let fastest = 0
  let prev = o.yaw
  for (let i = 0; i < 60 * 120; i++) {
    step(o, 1 / 60, { auto: true, tau: 0.2 })
    lo = Math.min(lo, o.yaw)
    hi = Math.max(hi, o.yaw)
    fastest = Math.max(fastest, Math.abs(o.yaw - prev) * 60)
    prev = o.yaw
  }
  assert.ok(hi > SWAY * 0.8 && lo < -SWAY * 0.8, 'it goes both ways')
  assert.ok(hi <= SWAY + 1e-6 && lo >= -SWAY - 1e-6, 'no further than the sway')
  assert.ok(fastest < 0.02, `slowly: ${fastest.toFixed(4)} rad/s at most`)

  // Not when the sway is not allowed (a label is open)
  const held = createOrbit()
  for (let i = 0; i < 60 * 10; i++) step(held, 1 / 60, { auto: false, tau: 0.2 })
  assert.equal(held.yaw, 0)

  // Left at a limit, it sways without going past it
  const edge = createOrbit()
  edge.yaw = YAW_MAX
  for (let i = 0; i < 60 * 120; i++) {
    step(edge, 1 / 60, { auto: true, tau: 0.2 })
    assert.ok(edge.yaw <= YAW_MAX + 1e-6)
  }
})

test('facing a pin swings as far as the limits allow and holds', () => {
  const o = createOrbit()
  face(o, 0.3)
  for (let i = 0; i < 240; i++) step(o, 1 / 60, { auto: true, tau: 0.22 })
  assert.ok(near(o.yaw, 0.3, 1e-3), 'it arrives')
  for (let i = 0; i < 600; i++) step(o, 1 / 60, { auto: true, tau: 0.22 })
  assert.ok(near(o.yaw, 0.3, 1e-3), 'and does not sway while it is held')
  unface(o)
  let moved = 0
  for (let i = 0; i < 60 * 20; i++) {
    step(o, 1 / 60, { auto: true, tau: 0.22 })
    moved = Math.max(moved, Math.abs(o.yaw - 0.3))
  }
  assert.ok(moved > SWAY * 0.5, 'let go, it sways again')

  // A pin further round than the view can swing is faced as nearly as it can be
  face(o, -2)
  assert.equal(o.goal, -YAW_MAX)
  // With no time constant it is simply there
  step(o, 1 / 60, { auto: false, tau: 0 })
  assert.equal(o.yaw, -YAW_MAX)
  // Taking hold cancels a facing
  grab(o)
  assert.equal(o.goal, null)
})

// --------------------------------------------------------- the pacing ----

test('the scene comes up out of black and settles before the hold', () => {
  assert.ok(near(SPAN, TRAVEL + HOLD) && near(SETTLED_AT, TRAVEL / SPAN))
  assert.ok(HOLD >= 0.8, 'room to stop and look before the page ends')
  const start = moonTimeline(0)
  assert.deepEqual([start.fade, start.stars, start.pull, start.reveal, start.interactive], [0, 0, 0, 0, false])
  const settled = moonTimeline(SETTLED_AT)
  assert.deepEqual([settled.pull, settled.settle, settled.interactive], [1, 1, true])
  assert.deepEqual(moonTimeline(1), settled, 'nothing changes through the hold')
  assert.deepEqual(moonTimeline(-1), start)

  let last = start
  for (let p = 0; p <= 1.0001; p += 0.002) {
    const f = moonTimeline(p)
    for (const key of ['travel', 'pull', 'fade', 'stars', 'reveal', 'settle']) {
      assert.ok(f[key] >= last[key] - 1e-12 && f[key] >= 0 && f[key] <= 1, `${key} only rises, at ${p.toFixed(3)}`)
    }
    assert.ok(f.stars >= f.fade - 1e-12, 'the stars are never behind the scene')
    if (f.interactive) assert.ok(f.pull > 0.999, 'the pins are live only once the camera has all but stopped')
    last = f
  }
  // The opening frame is up before the camera leaves it
  const leaving = moonTimeline(SETTLED_AT * 0.12)
  assert.ok(leaving.pull < 1e-9 && leaving.fade > 0.99)
})

// ------------------------------------------------- the settled picture ----

test("the moon's edge lies along the owner's outline", () => {
  // On a 16:9 desktop, and on the screen the outline was drawn over
  for (const [width, height, allow] of [[1920, 1080, 24], [1933, 949, 28]]) {
    const aspect = width / height
    const fit = misfit(limb(aspect, pose(aspect)), width, height)
    assert.ok(fit.worst < allow, `${width}x${height}: the furthest point is ${fit.worst.toFixed(1)}px from the limb`)
    assert.ok(fit.rms < allow * 0.75, `${width}x${height}: ${fit.rms.toFixed(1)}px rms`)
  }
})

test('no ball fits the outline better than the one chosen', () => {
  // A ball's edge is a conic: it cannot be as flat on top and as steep at the ends as the drawn line.
  // Every other cone and tilt of the camera, at this lens, misses some point by at least as much, give or take a pixel.
  const [width, height] = [1920, 1080]
  const aspect = width / height
  const chosen = misfit(limb(aspect, pose(aspect)), width, height).worst
  const t = Math.tan(deg(framing(aspect, 1, 0.25).fov / 2))
  let best = Infinity
  for (let alpha = 20; alpha <= 50; alpha += 0.25) {
    for (let beta = alpha - 6; beta <= alpha + 3; beta += 0.125) {
      const curve = []
      for (let i = -12; i <= 252; i++) {
        const y = limbHeight(((i / 240) * 2 - 1) * aspect * t, deg(alpha), deg(beta))
        if (y !== null) curve.push([i / 240, 0.5 - y / t / 2])
      }
      if (curve.length > 20) best = Math.min(best, misfit(curve, width, height).worst)
    }
  }
  assert.ok(chosen < best + 1.5, `chosen ${chosen.toFixed(1)}px, best of the search ${best.toFixed(1)}px`)
})

test('on every wide screen the dome tops out just above the middle and leaves through the bottom corners', () => {
  for (const aspect of WIDE) {
    const curve = limb(aspect, pose(aspect))
    const at = (fx) => curve.reduce((a, b) => (Math.abs(b[0] - fx) < Math.abs(a[0] - fx) ? b : a))[1]
    assert.ok(near(at(0.5), LIMB_TOP, 2e-3), `${aspect.toFixed(2)}: top at ${at(0.5).toFixed(3)}`)
    assert.ok(near(at(0), LIMB_CORNER, 4e-3) && near(at(1), LIMB_CORNER, 4e-3), `${aspect.toFixed(2)}: leaves the sides at ${at(0).toFixed(3)}`)
    // Flat across the middle: a quarter of the way in from either side it has fallen only a tenth of the screen
    assert.ok(at(0.25) - at(0.5) < 0.12 && at(0.25) - at(0.5) > 0.06)
  }
})

test('on a tall screen the dome tops out just above the middle and leaves through the sides below that', () => {
  for (const aspect of TALL) {
    const curve = limb(aspect, pose(aspect))
    const at = (fx) => curve.reduce((a, b) => (Math.abs(b[0] - fx) < Math.abs(a[0] - fx) ? b : a))[1]
    assert.ok(at(0.5) > 0.42 && at(0.5) < 0.5, `${aspect}: top at ${at(0.5).toFixed(3)}`)
    assert.ok(at(0) > at(0.5) + 0.05 && at(0) < 0.9, `${aspect}: leaves the sides at ${at(0).toFixed(3)}`)
  }
})

test('the alien is the subject: on top of the dome, on the centre line, large, facing the right of the screen', () => {
  for (const aspect of ASPECTS) {
    const { radius } = world(aspect)
    const at = pose(aspect)
    const feet = project(at, aspect, [0, radius, 0])
    const tips = project(at, aspect, [0, radius + ALIEN_HEIGHT, 0])
    const share = (tips.y - feet.y) / 2
    assert.ok(near(feet.x, 0, 1e-9), 'on the centre line')
    if (aspect >= 1.45) {
      assert.ok(share > 0.25 && share < 0.34, `${aspect.toFixed(2)}: he is ${(share * 100).toFixed(0)}% of the screen high`)
      assert.ok(near((1 - feet.y) / 2, FEET_AT, 2e-3), 'the chair stands just under the top of the dome')
    } else {
      assert.ok(share > 0.19 && share < 0.34, `${aspect.toFixed(2)}: he is ${(share * 100).toFixed(0)}% of the screen high`)
    }
    assert.ok((1 - tips.y) / 2 > 0.12, 'his antennae are clear of the navigation')
    // The limb's top is the horizon behind him: his feet are below it, his head well above
    const top = limb(aspect, at).reduce((a, b) => (Math.abs(b[0] - 0.5) < Math.abs(a[0] - 0.5) ? b : a))[1]
    assert.ok((1 - feet.y) / 2 > top && (1 - tips.y) / 2 < top - 0.15)
    // He faces +Z. A point in front of him is to the right of him on screen, and nearer the camera: a three-quarter view.
    const ahead = project(at, aspect, [0, radius + 0.5, 1])
    const chest = project(at, aspect, [0, radius + 0.5, 0])
    assert.ok(ahead.x > chest.x && ahead.depth < chest.depth)
  }
  assert.ok(ALIEN_SHARE.wide >= 0.25 && ALIEN_SHARE.wide <= 1 / 3)
})

test('the moon is never seen whole', () => {
  for (const aspect of ASPECTS) {
    const { radius } = world(aspect)
    for (let s = 0; s <= 1.0001; s += 0.05) {
      const at = pose(aspect, s)
      // The bottom of the screen is ground, so the far side of the moon is out of the picture: at the middle always,
      // and from corner to corner once the camera has settled
      for (const x of s > 0.999 ? [-1, 0, 1] : [0]) {
        const ray = screenDirection(at, aspect, x, -1)
        const along = -dot(at.position, ray)
        const miss = dot(at.position, at.position) - along * along
        assert.ok(along > 0 && miss < radius * radius, `aspect ${aspect.toFixed(2)}, pull ${s.toFixed(2)}, x ${x}`)
      }
      // And the middle of the top of the screen is sky
      const up = screenDirection(at, aspect, 0, 1)
      const along = -dot(at.position, up)
      assert.ok(along < 0 || dot(at.position, at.position) - along * along > radius * radius)
    }
  }
})

test('the camera opens close on the alien and pulls back and up without losing him', () => {
  for (const aspect of ASPECTS) {
    const { radius, head } = world(aspect)
    const open = pose(aspect, 0)
    const away = Math.hypot(...sub(open.position, head))
    const settled = Math.hypot(...sub(pose(aspect).position, head))
    assert.ok(away > 1.8 && away < settled * 0.8, `${aspect.toFixed(2)}: opens ${away.toFixed(2)} m from his head, settles ${settled.toFixed(2)} m away`)
    let lastDistance = 0
    let lastHeight = 0
    for (let s = 0; s <= 1.0001; s += 0.02) {
      const at = pose(aspect, s)
      const seen = project(at, aspect, head)
      assert.ok(seen.depth > 0 && Math.abs(seen.x) < 0.35 && seen.y > -0.1 && seen.y < 0.8, `${aspect.toFixed(2)} at ${s.toFixed(2)}: his head is at ${seen.x.toFixed(2)}, ${seen.y.toFixed(2)}`)
      assert.ok(Math.hypot(...at.position) > radius + 0.5, 'clear of the ground the whole way')
      const distance = Math.hypot(...sub(at.position, head))
      assert.ok(distance > lastDistance && at.position[1] > lastHeight - 0.03, 'always back, and up')
      lastDistance = distance
      lastHeight = at.position[1]
    }
  }
})

test("the visitor's swing leaves the moon's edge where it is, and the tilt hardly lifts it", () => {
  for (const aspect of [16 / 9, 0.46]) {
    const still = pose(aspect)
    const top = (at) => limb(aspect, at).reduce((a, b) => (Math.abs(b[0] - 0.5) < Math.abs(a[0] - 0.5) ? b : a))[1]
    for (const yaw of [-YAW_MAX, YAW_MAX]) {
      const swung = pose(aspect, 1, yaw)
      // Round the moon's own axis: the same height, the same distance, looking at the same point
      assert.ok(near(swung.position[1], still.position[1], 1e-9) && near(Math.hypot(...swung.position), Math.hypot(...still.position), 1e-9))
      assert.deepEqual(swung.target, still.target)
      assert.ok(near(top(swung), top(still), 1e-9))
      // And he is still on the centre line, seen a few tens of degrees further round
      const { radius } = world(aspect)
      assert.ok(near(project(swung, aspect, [0, radius, 0]).x, 0, 1e-9))
    }
    assert.ok(YAW_MAX > deg(15) && YAW_MAX < deg(40), 'a few tens of degrees')
    for (const tilt of [TILT_MIN, TILT_MAX]) {
      assert.ok(Math.abs(top(pose(aspect, 1, 0, tilt)) - top(still)) < 0.03, `tilt ${tilt}: the limb moves ${(Math.abs(top(pose(aspect, 1, 0, tilt)) - top(still)) * 100).toFixed(1)}% of the screen`)
    }
  }
})

test('a direction asked for by its place on screen lands there', () => {
  for (const aspect of ASPECTS) {
    const at = pose(aspect)
    for (const [x, y] of [EARTH.wide, EARTH.tall, [0, 0], [0.9, -0.9]]) {
      const d = screenDirection(at, aspect, x, y)
      assert.ok(near(Math.hypot(...d), 1))
      const seen = project(at, aspect, [at.position[0] + d[0] * 1e6, at.position[1] + d[1] * 1e6, at.position[2] + d[2] * 1e6])
      assert.ok(near(seen.x, x, 1e-6) && near(seen.y, y, 1e-6))
    }
  }
})

test('the Earth hangs in the sky, clear of his head', () => {
  for (const [aspect, [x, y]] of [[16 / 9, EARTH.wide], [0.46, EARTH.tall]]) {
    const { radius } = world(aspect)
    const at = pose(aspect)
    const head = project(at, aspect, [0, radius + ALIEN_HEIGHT * 0.85, 0])
    assert.ok(Math.hypot((x - head.x) * aspect, y - head.y) > 0.4, 'well away from him')
    // Above the limb where it is
    const curve = limb(aspect, at)
    const edge = curve.reduce((a, b) => (Math.abs(b[0] - (x * 0.5 + 0.5)) < Math.abs(a[0] - (x * 0.5 + 0.5)) ? b : a))[1]
    assert.ok((1 - y) / 2 < edge - 0.12)
    assert.ok(EARTH.radius < 0.07, 'modest')
  }
})

test('the sun is low and to the right of the camera, a little behind it', () => {
  assert.ok(near(Math.hypot(...SUN), 1))
  const elevation = Math.asin(SUN[1])
  assert.ok(elevation > deg(15) && elevation < deg(30), 'low enough for long shadows, high enough to light him')
  const at = pose(16 / 9)
  const { right, forward } = cameraAxes(at)
  assert.ok(dot(SUN, right) > 0.6, 'from the right: shadows run to the left of the screen')
  assert.ok(dot(SUN, forward) < 0, 'and from the camera side, so the ground in view is lit')
  // He faces +Z and has the sun on his face
  assert.ok(SUN[2] > 0.7)
})

// ---------------------------------------------------------- the pins ----

test('the pins are a well-formed list', () => {
  assert.ok(CONTACT_PINS.length >= 3 && CONTACT_PINS.length <= 8, 'the ground draws rings for eight at most')
  assert.equal(new Set(CONTACT_PINS.map((pin) => pin.id)).size, CONTACT_PINS.length, 'ids are unique')
  for (const pin of CONTACT_PINS) {
    assert.ok(pin.label && pin.value)
    assert.ok(pin.href || pin.copy, `${pin.id} does something`)
    if (pin.href) assert.ok(pin.action, `${pin.id}: a link says what it does`)
    if (pin.copy) assert.ok(pin.copyLabel, `${pin.id}: a copy button says what it copies`)
  }
  const email = CONTACT_PINS.find((pin) => pin.id === 'email')
  assert.equal(email.href, 'mailto:contact@kodachi.dev')
  assert.equal(email.copy, 'contact@kodachi.dev')
  assert.equal(CONTACT_PINS.find((pin) => pin.id === 'github').href, 'https://github.com/noahwdev')
  assert.equal(CONTACT_PINS.find((pin) => pin.id === 'discord').copy, '@kodache')
})

test('every pin stands on ground that is in view, clear of the alien, of the footer and of the other pins', () => {
  for (const [aspects, key] of [[WIDE, 'wide'], [[0.46, 0.56], 'tall']]) {
    for (const aspect of aspects) {
      const { radius } = world(aspect)
      const at = pose(aspect)
      const feet = project(at, aspect, [0, radius, 0])
      const heads = CONTACT_PINS.map((pin) => {
        const [fx, fy] = pin.spot[key]
        assert.ok(fx > 0.06 && fx < 0.94 && fy < 0.9, `${pin.id}: in from the edges, above the footer`)
        // The line of sight through the spot meets the moon
        const ray = screenDirection(at, aspect, fx * 2 - 1, 1 - fy * 2)
        const along = -dot(at.position, ray)
        const inside = along * along - dot(at.position, at.position) + radius * radius
        assert.ok(inside > 0, `${pin.id} at aspect ${aspect.toFixed(2)}: its spot is on the moon, not in the sky`)
        const foot = at.position.map((v, i) => v + ray[i] * (along - Math.sqrt(inside)))
        const head = foot.map((v) => v * (1 + PIN.height / radius))
        assert.equal(visibility(at.position, head, radius - 0.02, 0.22), 1, `${pin.id} is in plain view`)
        const seen = project(at, aspect, head)
        assert.ok(Math.abs(seen.x) < 0.95 && seen.y > -0.9)
        // Below his feet or well to one side: a label over the pin does not cover him
        assert.ok(Math.abs(seen.x - feet.x) * aspect > 0.25 || seen.y < feet.y - 0.25, `${pin.id} is clear of the alien`)
        return seen
      })
      for (let i = 0; i < heads.length; i++) {
        for (let j = i + 1; j < heads.length; j++) {
          const apart = Math.hypot((heads[i].x - heads[j].x) * aspect, heads[i].y - heads[j].y)
          assert.ok(apart > 0.2, `${CONTACT_PINS[i].id} and ${CONTACT_PINS[j].id} are ${apart.toFixed(2)} apart at aspect ${aspect.toFixed(2)}`)
        }
      }
    }
  }
})
