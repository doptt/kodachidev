/**
 * Two-bone inverse kinematics, as plain arithmetic on [x, y, z] triples: where
 * the middle joint (an elbow, a knee) goes when the two ends of a limb are
 * given. Pure, so it can be tested without a renderer.
 */
export type Vec3 = [number, number, number]

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const normalize = (a: Vec3): Vec3 => {
  const l = length(a)
  return l > 1e-9 ? scale(a, 1 / l) : [0, 1, 0]
}

export type TwoBone = {
  /** Where the middle joint goes. */
  mid: Vec3
  /** Where the end actually lands: the target, or the nearest point the limb can reach. */
  end: Vec3
  /** False when the target was too far or too near and had to be pulled in. */
  reached: boolean
}

/**
 * Solves a limb of two bones (`upper` from the root to the middle joint,
 * `lower` from there to the end) so the end lands on `target`. The middle
 * joint is put on the side of the root-to-target line that `pole` points to.
 * A target out of reach is pulled back along the line to where the limb is
 * almost straight (never quite: a locked joint pops as it unlocks).
 */
export function solveTwoBone(root: Vec3, target: Vec3, upper: number, lower: number, pole: Vec3): TwoBone {
  const toTarget = sub(target, root)
  const wanted = length(toTarget)
  const longest = (upper + lower) * 0.999
  const shortest = Math.abs(upper - lower) * 1.001 + 1e-6
  const distance = Math.min(Math.max(wanted, shortest), longest)
  const axis = normalize(toTarget)
  // The middle joint lies on a circle round the axis: `along` from the root, `out` from the axis
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance)
  const out = Math.sqrt(Math.max(upper * upper - along * along, 0))
  // The pole's part at right angles to the axis picks the point on the circle
  let side = sub(pole, scale(axis, dot(pole, axis)))
  if (length(side) < 1e-6) side = cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])
  side = normalize(side)
  return {
    mid: add(root, add(scale(axis, along), scale(side, out))),
    end: add(root, scale(axis, distance)),
    reached: Math.abs(distance - wanted) < 1e-6,
  }
}

/**
 * The same limb, but choosing the swivel of the middle joint about the
 * root-to-target line so that the joint sits at a given height: an elbow that
 * rests on the arm of a chair. Of the (up to two) swivels that give that
 * height, it takes the one nearer `pole`; when the height cannot be had, the
 * swivel that comes closest.
 */
export function solveTwoBoneAtHeight(root: Vec3, target: Vec3, upper: number, lower: number, pole: Vec3, height: number): TwoBone {
  const base = solveTwoBone(root, target, upper, lower, pole)
  const axis = normalize(sub(base.end, root))
  const centre = add(root, scale(axis, dot(sub(base.mid, root), axis)))
  const arm = sub(base.mid, centre)
  const radius = length(arm)
  if (radius < 1e-6) return base
  const u = normalize(arm)
  const v = cross(axis, u)
  // mid(a) = centre + radius (u cos a + v sin a); its height is centre.y + radius (u.y cos a + v.y sin a)
  const amplitude = Math.hypot(u[1], v[1])
  if (amplitude < 1e-6) return base
  const phase = Math.atan2(v[1], u[1])
  const reach = Math.min(Math.max((height - centre[1]) / (radius * amplitude), -1), 1)
  const spread = Math.acos(reach)
  // The two candidates; a = 0 is the pole's own swivel, so the smaller |a| is the nearer
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
  const a1 = wrap(phase + spread)
  const a2 = wrap(phase - spread)
  const a = Math.abs(a1) <= Math.abs(a2) ? a1 : a2
  return {
    mid: add(centre, scale(add(scale(u, Math.cos(a)), scale(v, Math.sin(a))), radius)),
    end: base.end,
    reached: base.reached,
  }
}
