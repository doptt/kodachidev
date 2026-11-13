/**
 * Scroll → what the moon scene is doing, and where the camera is. Pure
 * functions, no DOM, no GL and no imports, so the pacing and the framing can
 * be tested on their own.
 *
 * The moon is never seen whole. The section opens close on the alien in his
 * chair, low to the ground; scrolling pulls the camera back and up a little
 * way, and it settles with the moon as a great dome across the bottom half of
 * the screen and him on the top of it, large, in three-quarter view. The edge
 * of that dome was drawn by the owner (OUTLINE below) and the settled camera
 * is solved to lay the moon's limb along it.
 *
 * Lengths are metres in the stand frame (see geo.ts): the moon's centre is the
 * origin, the alien's spot is straight up and he faces +Z. Angles are radians
 * unless a name says degrees.
 */
import type { Vec3 } from './geo'

/** Length of each part of the pinned stretch, in viewport heights of scroll. */
export const TRAVEL = 1.7
export const HOLD = 1.1
/** Scroll length of the whole pinned stretch, in viewport heights. */
export const SPAN = TRAVEL + HOLD
/** Pinned progress (0..1) at which the camera has settled. */
export const SETTLED_AT = TRAVEL / SPAN
/** Share of the travel spent on the opening frame while it comes up out of black. */
const OPENING = 0.12

const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
const mix = (a: number, b: number, t: number) => a + (b - a) * t
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const rad = (deg: number) => (deg * Math.PI) / 180

export type MoonFrame = {
  /** 0 → 1 through the travel, straight from scroll. */
  travel: number
  /** 0 → 1 along the camera's path: holds on the opening frame, then pulls back, slowing into the settled view. */
  pull: number
  /** Overall brightness: the scene comes up out of the black page. */
  fade: number
  /** Brightness of the sky alone: the stars arrive first. */
  stars: number
  /** 0 → 1 as the alien is first revealed (see AlienInput.reveal). */
  reveal: number
  /** 0 → 1 over the last of the travel: how far the view has become the visitor's to move. */
  settle: number
  /** True once the pins and the drag are live. */
  interactive: boolean
}

/** Everything the scene needs at pinned scroll progress `p` (0..1). */
export function moonTimeline(p: number): MoonFrame {
  const travel = clamp01(clamp01(p) / SETTLED_AT)
  const along = clamp01((travel - OPENING) / (1 - OPENING))
  const settle = smoothstep(0.84, 1, travel)
  return {
    travel,
    // Away from the chair at an even pace, with a long soft arrival
    pull: 1 - (1 - along) ** 2,
    fade: smoothstep(0, 0.1, travel),
    stars: smoothstep(0, 0.06, travel),
    reveal: smoothstep(0.02, 0.4, travel),
    settle,
    interactive: settle > 0.985,
  }
}

// ----------------------------------------------------------- the limb ----

/**
 * The owner's outline of the moon in the settled view: points along its edge,
 * as fractions of the screen's width and height from the top left, read off a
 * line drawn over a screenshot. A broad dome: nearly flat across the middle,
 * its top just above the middle of the screen, falling away to the two bottom
 * corners.
 */
export const OUTLINE: readonly (readonly [number, number])[] = [
  [0.0, 0.95],
  [0.12, 0.7],
  [0.25, 0.555],
  [0.37, 0.5],
  [0.5, 0.485],
  [0.63, 0.49],
  [0.75, 0.545],
  [0.87, 0.67],
  [1.0, 0.94],
]

/**
 * A ball seen in perspective has a conic for an edge, and a conic cannot be
 * quite as flat on top and as steep at the ends as the drawn line. These two
 * numbers are where the closest ball's edge passes: the height of its top and
 * of the point where it leaves the side of a 16:9 screen, as fractions of the
 * screen's height from the top. (Closest: the least greatest distance from the
 * nine points, which comes to about 2% of the screen's height. The test
 * measures it.)
 */
export const LIMB_TOP = 0.465
export const LIMB_CORNER = 0.918
/** Vertical field of view of the settled camera on a wide screen, degrees. Longer lenses fit the outline a little better and flatter him less. */
const SETTLED_FOV = 36
/** Where his chair's feet come on a wide screen, as a fraction of its height from the top: just under the dome's top: the skyline passes behind his chair, and the camera is at about the height of his knees. */
export const FEET_AT = 0.497

/**
 * Height of the moon's edge on screen at horizontal position `x`, for a
 * camera that sees the moon as a cone of half-angle `alpha` whose axis points
 * `beta` below the direction the camera looks. x and the result are tangents
 * of angles from the optical axis (so the edge of the screen is at
 * tan(fov / 2) times the aspect); null where the edge is not there to see.
 */
export function limbHeight(x: number, alpha: number, beta: number) {
  // A ray (x, y, -1) is on the edge when it makes the angle alpha with the axis of the cone, (0, -sin beta, -cos beta)
  const sb = Math.sin(beta)
  const cb = Math.cos(beta)
  const ca2 = Math.cos(alpha) ** 2
  const a = sb * sb - ca2
  const b = -2 * sb * cb
  const c = cb * cb - ca2 * (x * x + 1)
  const disc = b * b - 4 * a * c
  if (disc < 0 || Math.abs(a) < 1e-12) return null
  const roots = [(-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a)].filter((y) => -y * sb + cb > 0)
  return roots.length ? Math.max(...roots) : null
}

/** Finds where a rising function crosses zero between lo and hi. */
function solve(f: (x: number) => number, lo: number, hi: number) {
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) < 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export type Framing = {
  /** Vertical field of view of the settled camera, degrees. */
  fov: number
  /** Half-angle of the cone the moon fills, seen from the settled camera. */
  alpha: number
  /** How far below the camera's line of sight the moon's centre lies. */
  beta: number
  /** Distance of the settled camera from the moon's centre. */
  distance: number
  /** Angle of the settled camera from straight above the chair, seen from the moon's centre. */
  polar: number
  /** How far below level the settled camera looks. */
  dip: number
}

/** How large the alien is in the settled picture, chair feet to antenna tips, as a share of the screen's height: on a wide screen and on a tall one. */
export const ALIEN_SHARE = { wide: 0.31, tall: 0.21 }
/** The moon's radius on a tall, narrow screen, metres. Small, or so narrow a slice of it would not read as a ball at all. */
const RADIUS_TALL = 2.4

/** 0 for portrait phones, 1 for wide desktops. */
const wideness = (aspect: number) => smoothstep(0.75, 1.45, aspect)
const settledFov = (aspect: number) => mix(46, SETTLED_FOV, wideness(aspect))

/** The cone that lays the limb on the outline: its top at LIMB_TOP, leaving the sides of the screen at LIMB_CORNER. */
function outlineCone(aspect: number) {
  const t = Math.tan(rad(settledFov(aspect) / 2))
  const top = mix(0.45, LIMB_TOP, wideness(aspect))
  // The top of the limb is the ray that grazes the moon in the upright plane: alpha - beta above the line of sight
  const betaFor = (alpha: number) => alpha - Math.atan((1 - 2 * top) * t)
  const edge = Math.max(aspect, 1.3) * t
  const want = (1 - 2 * LIMB_CORNER) * t
  // The closer the camera, the wider the cone and the higher the limb still is at the edge of the screen
  const alpha = solve((a) => (limbHeight(edge, a, betaFor(a)) ?? -1e9) - want, rad(8), rad(80))
  return { alpha, betaFor }
}

/**
 * How high round the moon the camera sits, for a cone and a radius: found so
 * that the chair's feet come where the picture wants them. Lower, and the
 * chair is on the limb itself; higher, and it slides down the screen.
 */
function polarFor(aspect: number, alpha: number, beta: number, radius: number) {
  const t = Math.tan(rad(settledFov(aspect) / 2))
  const distance = radius / Math.sin(alpha)
  const feet = (1 - 2 * mix(0.478, FEET_AT, wideness(aspect))) * t
  const feetFor = (polar: number) => {
    const dip = Math.PI / 2 - polar - beta
    const toChair = Math.atan2(distance * Math.cos(polar) - radius, distance * Math.sin(polar))
    return Math.tan(dip - toChair)
  }
  return solve((theta) => feetFor(theta) - feet, rad(4), Math.PI / 2 - alpha)
}

/**
 * The moon's radius, in metres, for a screen of the given aspect: `height` is
 * the alien's, chair feet to antenna tips.
 *
 * It is fixed by the picture. On a wide screen the outline says how much of
 * the ball is in view, and the alien must be ALIEN_SHARE of the screen high
 * beside it: the wider the screen, the more of the ball, and the bigger the
 * ball has to be for him to stay the same size. On a tall screen it is simply
 * small. The scene asks once, when it is made.
 */
export function radiusFor(aspect: number, height: number) {
  const { alpha, betaFor } = outlineCone(aspect)
  const t = Math.tan(rad(settledFov(aspect) / 2))
  // On a moon of radius 1: how far the settled camera is from the chair
  const polar = polarFor(aspect, alpha, betaFor(alpha), 1)
  const d = 1 / Math.sin(alpha)
  const reach = Math.sqrt(d * d + 1 - 2 * d * Math.cos(polar))
  const byOutline = height / (ALIEN_SHARE.wide * 2 * t * reach)
  return Math.min(9.5, mix(RADIUS_TALL, byOutline, wideness(aspect)))
}

/**
 * The settled composition for a viewport of the given aspect (width / height)
 * and a moon of the given radius; `height` is the alien's.
 *
 * Wide screens: the limb is laid on the owner's outline. Tall screens show too
 * narrow a slice for the limb to reach the corners, so there the camera is
 * placed by how large the alien should be instead, and the limb leaves through
 * the sides a little below its top. Either way the camera is high enough for
 * the chair's feet to sit just under the top of the dome.
 */
export function framing(aspect: number, radius: number, height: number): Framing {
  const wide = wideness(aspect)
  const fov = settledFov(aspect)
  const cone = outlineCone(aspect)
  // On a tall screen: far enough that he is ALIEN_SHARE.tall of the screen high
  const bySize = Math.atan(radius / (height / (ALIEN_SHARE.tall * 2 * Math.tan(rad(fov / 2)))))
  const alpha = mix(bySize, cone.alpha, wide)
  const beta = cone.betaFor(alpha)
  const polar = polarFor(aspect, alpha, beta, radius)
  return { fov, alpha, beta, distance: radius / Math.sin(alpha), polar, dip: Math.PI / 2 - polar - beta }
}

// --------------------------------------------------------- the camera ----

export type Pose = {
  position: Vec3
  target: Vec3
  /** Vertical field of view, degrees. */
  fov: number
}

/** The opening frame: how close the camera is to the point it looks at (a little below his head), as a share of the settled distance, and how far below that point's level it sits. */
const OPEN_NEAR = 0.6
const OPEN_ELEVATION = rad(-5)
/** The opening frame is a little more head-on than the settled one. */
const OPEN_TURN = rad(16)
const OPEN_DROP = 0.32

/**
 * The camera at `pull` (0..1) along its path. `head` is where the alien's
 * head is; `azimuth` is the side the settled camera looks from (round the
 * chair, from his front toward his left); `yaw` and `tilt` are the visitor's
 * own nudges (see orbit.ts), already scaled by how settled the view is.
 *
 * The camera circles the point it looks at. That point sinks from his chest
 * to the settled camera's own target on the moon's axis as the distance
 * grows by equal ratios, while the camera climbs from below his eye line to
 * the settled height. At the end of the path it is exactly the camera
 * `framing` solved for.
 */
export function cameraPose(pull: number, aspect: number, radius: number, height: number, head: Vec3, azimuth: number, yaw = 0, tilt = 0): Pose {
  const end = framing(aspect, radius, height)
  const wide = wideness(aspect)
  const s = clamp01(pull)
  const turn = s * s * (3 - 2 * s)

  // The settled camera, as a distance, an elevation and an azimuth about the point on the moon's axis that it looks at
  const out = end.distance * Math.sin(end.polar)
  const targetY = end.distance * Math.cos(end.polar) - out * Math.tan(end.dip)
  const far = out / Math.cos(end.dip)

  const near = far * mix(0.72, OPEN_NEAR, wide)
  const distance = Math.exp(mix(Math.log(near), Math.log(far), s))
  const elevation = mix(OPEN_ELEVATION, end.dip, turn) + tilt
  const around = azimuth + mix(OPEN_TURN, 0, turn) - yaw
  const sink = (distance - near) / (far - near)
  const target: Vec3 = [mix(head[0], 0, sink), mix(head[1] - OPEN_DROP, targetY, sink), mix(head[2], 0, sink)]
  const ce = Math.cos(elevation)
  return {
    position: [target[0] + distance * ce * Math.sin(around), target[1] + distance * Math.sin(elevation), target[2] + distance * ce * Math.cos(around)],
    target,
    fov: mix(end.fov + 8, end.fov, s),
  }
}

/** The camera's own axes for a pose: where its right, its up and its line of sight point. */
export function cameraAxes(pose: Pose): { right: Vec3; up: Vec3; forward: Vec3 } {
  const f: Vec3 = [pose.target[0] - pose.position[0], pose.target[1] - pose.position[1], pose.target[2] - pose.position[2]]
  const fl = Math.hypot(f[0], f[1], f[2])
  const forward: Vec3 = [f[0] / fl, f[1] / fl, f[2] / fl]
  // Right is level; up is at right angles to both
  const rl = Math.hypot(forward[2], forward[0])
  const right: Vec3 = [-forward[2] / rl, 0, forward[0] / rl]
  const up: Vec3 = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]]
  return { right, up, forward }
}

/**
 * The direction (stand frame) that a camera sees at a point of the screen: x
 * and y from -1 to 1, y up. For hanging something in the sky where the
 * composition wants it, whatever the shape of the screen.
 */
export function screenDirection(pose: Pose, aspect: number, x: number, y: number): Vec3 {
  const { right, up, forward } = cameraAxes(pose)
  const t = Math.tan(rad(pose.fov / 2))
  const d: Vec3 = [
    forward[0] + right[0] * x * t * aspect + up[0] * y * t,
    forward[1] + right[1] * x * t * aspect + up[1] * y * t,
    forward[2] + right[2] * x * t * aspect + up[2] * y * t,
  ]
  const l = Math.hypot(d[0], d[1], d[2])
  return [d[0] / l, d[1] / l, d[2] / l]
}

/** Where a point lands on screen for a pose (x and y from -1 to 1, y up), and how far in front of the camera it is. */
export function project(pose: Pose, aspect: number, point: Vec3): { x: number; y: number; depth: number } {
  const { right, up, forward } = cameraAxes(pose)
  const d: Vec3 = [point[0] - pose.position[0], point[1] - pose.position[1], point[2] - pose.position[2]]
  const depth = d[0] * forward[0] + d[1] * forward[1] + d[2] * forward[2]
  const t = Math.tan(rad(pose.fov / 2))
  return { x: (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / depth / t / aspect, y: (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / depth / t, depth }
}
