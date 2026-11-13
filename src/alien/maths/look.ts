/**
 * Where he may turn his head to. A point to look at becomes a yaw and a pitch
 * from straight ahead; those are held inside what a neck can do, softly, so he
 * eases up to the limit rather than hitting it, and a target behind him gets a
 * look over the nearer shoulder, not a twitch from one side to the other.
 */
export type LookLimits = {
  /** Furthest turn to either side, radians. */
  yaw: number
  /** Furthest tilt up, radians. */
  up: number
  /** Furthest tilt down, radians (given as a positive number). */
  down: number
}

export const LOOK_LIMITS: LookLimits = { yaw: 1.05, up: 0.6, down: 0.38 }

/** Eases `value` toward `limit` without ever passing it: linear near zero, flattening out at the limit. */
export function softLimit(value: number, limit: number) {
  if (limit <= 0) return 0
  return limit * Math.tanh(value / limit)
}

export type LookAngles = { yaw: number; pitch: number }

/**
 * Yaw and pitch toward a point, given as its offset from the head in his own
 * frame (x to his left, y up, z ahead). Yaw is positive toward his left,
 * pitch positive upward. `previousYaw` is the yaw he was last asked for: when
 * the point passes directly behind him the raw yaw jumps from one side to the
 * other, and he stays on the side he was already looking until the point has
 * come well round (`HYSTERESIS` radians past dead astern). Writes into `out`
 * and returns it.
 */
export function lookAngles(dx: number, dy: number, dz: number, previousYaw: number, out: LookAngles, limits: LookLimits = LOOK_LIMITS): LookAngles {
  const flat = Math.hypot(dx, dz)
  // Straight above or below: no yaw to speak of
  let yaw = flat < 1e-6 ? 0 : Math.atan2(dx, dz)
  if (Math.PI - Math.abs(yaw) < HYSTERESIS && previousYaw !== 0 && Math.sign(previousYaw) !== Math.sign(yaw)) yaw = Math.sign(previousYaw) * Math.abs(yaw)
  const pitch = Math.atan2(dy, Math.max(flat, 1e-6))
  // Behind him, pitch counts for less: he is looking over his shoulder, not up at the sky
  const behind = Math.max(0, Math.abs(yaw) - Math.PI / 2) / (Math.PI / 2)
  out.yaw = softLimit(yaw, limits.yaw)
  out.pitch = (pitch >= 0 ? softLimit(pitch, limits.up) : -softLimit(-pitch, limits.down)) * (1 - 0.5 * behind)
  return out
}

const HYSTERESIS = 0.35
