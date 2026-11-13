/**
 * A damped spring, stepped exactly: the antennae, and anything else that
 * should lag behind what it is fixed to and wobble back. The step is the
 * closed-form solution of the spring's equation over the time step rather
 * than a numerical one, so it is stable and gives the same motion at any
 * frame rate, and after a long frame.
 */
export type Spring = {
  /** Displacement. */
  x: number
  /** Velocity. */
  v: number
}

/**
 * Advances `spring` by `dt` seconds toward `rest`.
 * `frequency` is the undamped wobble in hertz; `damping` is the ratio to
 * critical damping (0 rings forever, 1 returns without overshoot). Only
 * underdamped and critically damped springs are handled, which is all a wobble needs.
 */
export function stepSpring(spring: Spring, rest: number, dt: number, frequency: number, damping: number): Spring {
  const omega = 2 * Math.PI * frequency
  const zeta = Math.min(Math.max(damping, 0), 1)
  const x0 = spring.x - rest
  const v0 = spring.v
  if (zeta >= 1 - 1e-6) {
    // Critically damped: x = (A + B t) e^(-omega t)
    const b = v0 + omega * x0
    const decay = Math.exp(-omega * dt)
    spring.x = rest + (x0 + b * dt) * decay
    spring.v = (b - omega * (x0 + b * dt)) * decay
    return spring
  }
  // Underdamped: x = e^(-zeta omega t) (A cos(wd t) + B sin(wd t))
  const wd = omega * Math.sqrt(1 - zeta * zeta)
  const decay = Math.exp(-zeta * omega * dt)
  const b = (v0 + zeta * omega * x0) / wd
  const cos = Math.cos(wd * dt)
  const sin = Math.sin(wd * dt)
  spring.x = rest + decay * (x0 * cos + b * sin)
  spring.v = decay * ((b * wd - zeta * omega * x0) * cos - (x0 * wd + zeta * omega * b) * sin)
  return spring
}

/**
 * Where a spring-mounted mass rests while its mount accelerates at `a`: it
 * hangs back by a / omega^2, like a passenger pressed into the seat. Feeding
 * this to `stepSpring` as the rest position is what makes an antenna whip
 * when the head moves.
 */
export function lagUnderAcceleration(a: number, frequency: number) {
  const omega = 2 * Math.PI * frequency
  return -a / (omega * omega)
}
