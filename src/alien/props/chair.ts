import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { PropMaterials } from '../materials'
import { strapColumn, type StrapStyle } from '../textures'
import { bentTube, sweep, v3 } from './tube'

/**
 * The folding lawn chair of the reference picture, built the way the real one
 * is: four bent aluminium tubes (the front legs and the bar that joins them
 * along the ground, the rear legs and theirs, the U of the seat and the U of
 * the back), flat white arms riveted across the tops of the legs, and woven
 * webbing in tan and white (the tan is the site's own, see textures.ts): long straps running from the top of the back
 * to the front of the seat, short ones across, each passing over and under
 * the others and wrapped round the tube at its ends with a screw through it.
 *
 * It is sized by `ChairSpec`, which the actor works out from the alien's own
 * proportions so he sits in it with his feet on the ground.
 *
 * Space: origin on the ground under the middle of the chair, +Y up, the
 * sitter faces +Z, +X is his left.
 */
export type ChairSpec = {
  /** Between the centres of the seat's side rails. */
  seatWidth: number
  /** From the fold between back and seat to the front rail, along the seat. */
  seatDepth: number
  /** Height of the webbing over the front rail. */
  seatHeight: number
  /** How much higher the front of the seat is than the fold, in radians. */
  seatTilt: number
  /** From the fold to the top rail, along the back. */
  backLength: number
  /** Lean of the back from upright, in radians. */
  recline: number
  /** Height of the top of the arms. */
  armHeight: number
  /** Radius of the frame's tube. */
  tube: number
  /** Width of one strap of webbing. */
  strap: number
}

export const DEFAULT_CHAIR: ChairSpec = {
  seatWidth: 0.38,
  seatDepth: 0.33,
  seatHeight: 0.27,
  seatTilt: 0.14,
  backLength: 0.46,
  recline: 0.4,
  armHeight: 0.43,
  tube: 0.0105,
  strap: 0.05,
}

/** How the chair's own surface is described to whoever sits in it. */
export type ChairSeat = {
  spec: ChairSpec
  /**
   * A point on the webbing: `u` is the distance from the top rail down the
   * back, round the fold and along the seat (see `fold` and `length`), `x` is
   * sideways. Returns the point and writes the surface normal into `normal`.
   */
  surface(u: number, x: number, out: THREE.Vector3, normal?: THREE.Vector3): THREE.Vector3
  /** Distance along the webbing from the top rail to the middle of the fold. */
  fold: number
  /** Distance along the webbing from the top rail to the front rail. */
  length: number
  /** The top face of each arm: the height, the sideways centre, and the front and rear ends. */
  arm: { y: number; x: number; front: number; rear: number; width: number }
  /** The two bars the chair stands on, which run across it: how far each reaches sideways, and where the front one and the rear one lie. */
  feet: { x: number; front: number; rear: number }
}

const GAP = 0.003 // between tubes that lie side by side
const STRAP_LIFT = 0.0008 // half the strap's thickness: its middle sits this far off the tube
const WEAVE = 0.0012 // how far a strap rises or dips where it crosses another
/** The gap between neighbouring straps, as a share of a strap's width. */
const STRAP_GAP_SHARE = 0.22

const LONG_STRAPS: StrapStyle[] = ['tan', 'white']
const CROSS_STRAPS: StrapStyle[] = ['white', 'tan']
/** How far the front legs rake forward and the rear legs back, radians from upright. */
const FRONT_RAKE = 0.56
const REAR_RAKE = 0.1

export function buildChair(spec: ChairSpec, materials: PropMaterials, detail: 'high' | 'low') {
  const r = spec.tube
  const radial = detail === 'high' ? 12 : 8

  // ------------------------------------------------- the side profile ----
  // Everything is laid out in the side view first (y up, z forward).
  const seatDir = v3(0, Math.sin(spec.seatTilt), Math.cos(spec.seatTilt))
  const seatNormal = v3(0, Math.cos(spec.seatTilt), -Math.sin(spec.seatTilt))
  const backDir = v3(0, Math.cos(spec.recline), -Math.sin(spec.recline))
  const backNormal = v3(0, Math.sin(spec.recline), Math.cos(spec.recline))

  // F: the webbing over the front rail. J: the corner where seat and back would meet. T: over the top rail.
  // The seat is set a little forward of the origin, which leaves the origin under the middle of the whole chair.
  const F = v3(0, spec.seatHeight, spec.seatDepth * Math.cos(spec.seatTilt) * 0.5 + 0.03)
  const J = F.clone().addScaledVector(seatDir, -spec.seatDepth)
  const T = J.clone().addScaledVector(backDir, spec.backLength)
  const frontRail = F.clone().addScaledVector(seatNormal, -r)
  const topRail = T.clone().addScaledVector(backNormal, -r)

  // The webbing's path from T to F: down the back, round a soft fold, along the seat
  const foldRadius = 0.07
  const cornerAngle = Math.acos(THREE.MathUtils.clamp(-backDir.dot(seatDir), -1, 1)) // turn between "down the back" and "along the seat"
  const reach = foldRadius * Math.tan(cornerAngle / 2)
  const backRun = spec.backLength - reach
  const arcLength = foldRadius * cornerAngle
  const seatRun = spec.seatDepth - reach
  const length = backRun + arcLength + seatRun
  const arcStart = J.clone().addScaledVector(backDir, reach)
  const arcCentre = arcStart.clone().addScaledVector(backNormal, foldRadius)
  const arcAxis = v3(1, 0, 0)

  /** The unloaded webbing at distance u from the top rail: a point in the side view, with its normal. */
  const profile = (u: number, point: THREE.Vector3, normal: THREE.Vector3) => {
    if (u <= backRun) {
      point.copy(T).addScaledVector(backDir, -u)
      normal.copy(backNormal)
    } else if (u < backRun + arcLength) {
      // Turning about +X by a negative angle swings "toward the sitter" from the back's normal up to the seat's
      const a = -(u - backRun) / foldRadius
      normal.copy(backNormal).applyAxisAngle(arcAxis, a)
      point.copy(arcCentre).addScaledVector(normal, -foldRadius)
    } else {
      point.copy(F).addScaledVector(seatDir, -(length - u))
      normal.copy(seatNormal)
    }
  }

  // Sideways positions of the three nested tubes
  const seatX = spec.seatWidth / 2
  const backX = seatX + 2 * r + GAP
  const sledX = backX + 2 * r + GAP

  /** How far the webbing gives under him, at (u, x): none at the rails, most under his seat and the small of his back. */
  const sag = (u: number, x: number) => {
    const along = THREE.MathUtils.clamp(u / length, 0, 1)
    const halfWidth = u < backRun + arcLength / 2 ? backX : seatX
    const b = THREE.MathUtils.clamp(x / halfWidth, -1, 1)
    const across = Math.pow(1 - b * b, 0.8)
    const general = Math.pow(Math.sin(Math.PI * along), 0.7)
    const underHim = Math.exp(-Math.pow((u - (backRun + arcLength + seatRun * 0.3)) / (spec.seatDepth * 0.42), 2))
    return (0.012 * general + 0.012 * underHim) * across
  }

  const tmpNormal = new THREE.Vector3()
  const surface = (u: number, x: number, out: THREE.Vector3, normal?: THREE.Vector3) => {
    const n = normal ?? tmpNormal
    profile(THREE.MathUtils.clamp(u, 0, length), out, n)
    out.addScaledVector(n, -sag(u, x))
    out.x = x
    return out
  }

  // --------------------------------------------------------- the frame ----
  const metal: THREE.BufferGeometry[] = []
  const plastic: THREE.BufferGeometry[] = []
  const bend = 0.045

  // Seat: a U open to the rear, its side rails running back past the fold to the pivot
  const seatRear = J.clone().addScaledVector(seatNormal, -r).addScaledVector(seatDir, -0.03)
  metal.push(
    bentTube(
      [v3(seatX, seatRear.y, seatRear.z), v3(seatX, frontRail.y, frontRail.z), v3(-seatX, frontRail.y, frontRail.z), v3(-seatX, seatRear.y, seatRear.z)],
      r,
      bend,
      radial,
    ),
  )
  // Back: a U open downward, its uprights ending just below the pivot
  const backFoot = J.clone().addScaledVector(backNormal, -r).addScaledVector(backDir, -0.035)
  metal.push(
    bentTube(
      [v3(backX, backFoot.y, backFoot.z), v3(backX, topRail.y, topRail.z), v3(-backX, topRail.y, topRail.z), v3(-backX, backFoot.y, backFoot.z)],
      r,
      bend,
      radial,
    ),
  )

  // Legs: two U tubes, each a pair of legs joined by a bar that lies across on the ground. The arms lie over their tops.
  const armThickness = 0.016
  const armWidth = 0.052
  const legTopY = spec.armHeight - armThickness - r
  // The rear legs come up to the back's uprights; the front legs cross the seat's rails just behind its front rail
  const uprightAt = (y: number) => backFoot.z + ((y - backFoot.y) / backDir.y) * backDir.z
  const rearTopZ = uprightAt(legTopY)
  const frontTopZ = F.z - 0.035 - (legTopY - frontRail.y) * Math.tan(FRONT_RAKE)
  const footY = r - 0.002
  const zFront = frontTopZ + (legTopY - footY) * Math.tan(FRONT_RAKE)
  const zRear = rearTopZ - (legTopY - footY) * Math.tan(REAR_RAKE)
  for (const [topZ, footZ] of [
    [frontTopZ, zFront],
    [rearTopZ, zRear],
  ]) {
    metal.push(bentTube([v3(sledX, legTopY, topZ), v3(sledX, footY, footZ), v3(-sledX, footY, footZ), v3(-sledX, legTopY, topZ)], r, 0.05, radial, true))
  }

  /** A domed rivet or screw head at `at`, facing `facing`. */
  const head = (at: THREE.Vector3, facing: THREE.Vector3, size: number) => {
    const g = new THREE.SphereGeometry(size, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2)
    g.scale(1, 0.45, 1)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), facing.clone().normalize()))
    g.translate(at.x, at.y, at.z)
    return g
  }
  /** A short cylinder between two points: a spacer bush, or the plug in the end of a tube. */
  const plug = (from: THREE.Vector3, to: THREE.Vector3, radius: number) => sweep([from, to], radius, radial, true)

  // Where the front leg crosses the seat rail in the side view: a rivet through both, with a bush between
  const legDir = v3(0, footY - legTopY, zFront - frontTopZ).normalize()
  const railPoint = v3(0, frontRail.y, frontRail.z)
  // Solve legTop + a * legDir = railPoint - b * seatDir in the (y, z) plane
  const det = legDir.y * -seatDir.z - legDir.z * -seatDir.y
  const dy = railPoint.y - legTopY
  const dz = railPoint.z - frontTopZ
  const a = (dy * -seatDir.z - dz * -seatDir.y) / det
  const crossing = v3(0, legTopY + a * legDir.y, frontTopZ + a * legDir.z)
  // The pivot at the fold, where the seat rail and the back's upright lie side by side
  const pivot = J.clone().addScaledVector(seatNormal.clone().add(backNormal), -r / (1 + seatNormal.dot(backNormal)))

  for (const side of [1, -1]) {
    const out = v3(side, 0, 0)
    const up = v3(0, 1, 0)
    // Front leg to seat rail
    plastic.push(plug(v3(side * (seatX + r * 0.7), crossing.y, crossing.z), v3(side * (sledX - r * 0.7), crossing.y, crossing.z), 0.0062))
    metal.push(head(v3(side * (sledX + r - 0.0005), crossing.y, crossing.z), out, 0.0052))
    metal.push(head(v3(side * (seatX - r + 0.0005), crossing.y, crossing.z), out.clone().negate(), 0.0052))
    // The pivot
    metal.push(head(v3(side * (backX + r - 0.0005), pivot.y, pivot.z), out, 0.0052))
    metal.push(head(v3(side * (seatX - r + 0.0005), pivot.y, pivot.z), out.clone().negate(), 0.0052))
    // Rear leg to the back's upright
    metal.push(head(v3(side * (sledX + r - 0.0005), legTopY - 0.012, uprightAt(legTopY - 0.012)), out, 0.0052))
    // The arm's two rivets, on its top face over the legs
    const armX = side * (sledX - 0.006)
    metal.push(head(v3(armX, spec.armHeight - 0.0006, frontTopZ + 0.004), up, 0.0058))
    metal.push(head(v3(armX, spec.armHeight - 0.0006, rearTopZ + 0.004), up, 0.0058))
    // Plugs in the open ends of the seat rail and the back's upright
    plastic.push(plug(v3(side * seatX, seatRear.y, seatRear.z).addScaledVector(seatDir, 0.002), v3(side * seatX, seatRear.y, seatRear.z).addScaledVector(seatDir, -0.006), r + 0.0012))
    plastic.push(plug(v3(side * backX, backFoot.y, backFoot.z).addScaledVector(backDir, 0.002), v3(side * backX, backFoot.y, backFoot.z).addScaledVector(backDir, -0.006), r + 0.0012))
  }

  // The arms: flat white bars, square-ended, their edges softened
  const armFront = frontTopZ + 0.03
  const armRear = rearTopZ - 0.035
  const armLength = armFront - armRear
  const half = armWidth / 2
  const corner = 0.006
  const shape = new THREE.Shape()
  shape.moveTo(-half + corner, 0)
  shape.lineTo(half - corner, 0)
  shape.absarc(half - corner, corner, corner, -Math.PI / 2, 0, false)
  shape.lineTo(half, armLength - corner)
  shape.absarc(half - corner, armLength - corner, corner, 0, Math.PI / 2, false)
  shape.lineTo(-half + corner, armLength)
  shape.absarc(-half + corner, armLength - corner, corner, Math.PI / 2, Math.PI, false)
  shape.lineTo(-half, corner)
  shape.absarc(-half + corner, corner, corner, Math.PI, Math.PI * 1.5, false)
  const bevel = 0.0032
  for (const side of [1, -1]) {
    const arm = new THREE.ExtrudeGeometry(shape, {
      depth: armThickness - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: detail === 'high' ? 3 : 2,
      curveSegments: detail === 'high' ? 10 : 6,
    })
    // The shape was drawn nose-first along +y on the floor of the extrusion; lay it down with the nose forward
    arm.rotateX(-Math.PI / 2)
    arm.translate(side * (sledX - 0.006), spec.armHeight - armThickness + bevel, armFront)
    plastic.push(arm)
  }

  // ------------------------------------------------------- the webbing ----
  const straps: THREE.BufferGeometry[] = []
  const w = spec.strap
  const gap = w * STRAP_GAP_SHARE
  const pitch = w + gap

  // Long straps: as many as fit between the seat's rails
  const usable = spec.seatWidth - 2 * r - 0.012
  const longCount = Math.max(1, Math.floor((usable + gap) / pitch))
  const longX = Array.from({ length: longCount }, (_, j) => (j - (longCount - 1) / 2) * pitch)

  // Cross straps: on the back from below the top rail's bend to above the fold, on the seat from the fold to the front rail's bend
  const crossU: number[] = []
  const place = (from: number, to: number) => {
    const count = Math.max(1, Math.floor((to - from + gap) / pitch))
    const slack = to - from - (count * pitch - gap)
    for (let i = 0; i < count; i++) crossU.push(from + slack / 2 + w / 2 + i * pitch)
  }
  place(bend + 0.004, backRun - 0.012)
  const firstSeat = crossU.length
  place(backRun + arcLength + 0.012, length - bend - 0.004)

  /** 1 over the flat of a strap, falling to 0 just past its edges. */
  const plateau = (d: number) => 1 - THREE.MathUtils.smoothstep(Math.abs(d) / (w / 2), 0.85, 1.35)
  /** +1 where cross strap i passes over long strap j, -1 where it passes under. */
  const over = (i: number, j: number) => ((i + j) % 2 === 0 ? 1 : -1)

  const point = new THREE.Vector3()
  const normal = new THREE.Vector3()

  /**
   * Adds one strap: a list of centre points, each with the direction of the
   * strap's width. It is built with a face on each side, a strap's thickness
   * apart, rather than as a single sheet, so that it is lit and shadowed
   * correctly from behind as well as from in front (a shadow map pushes a
   * one-sided sheet into its own shadow when the light is behind it). Its
   * edges, under two millimetres thick, are left open.
   */
  const ribbon = (centres: THREE.Vector3[], widthDir: THREE.Vector3[], style: StrapStyle, lift: (index: number, edge: number) => THREE.Vector3 | null) => {
    const [u0, u1] = strapColumn(style)
    const count = centres.length
    // The strap's middle surface first, to get its normals
    const middle = new Float32Array(count * 6)
    const middleIndex: number[] = []
    for (let i = 0; i < count; i++) {
      for (const edge of [-1, 1]) {
        const p = lift(i, edge) ?? centres[i].clone().addScaledVector(widthDir[i], (edge * w) / 2)
        p.toArray(middle, (i * 2 + (edge < 0 ? 0 : 1)) * 3)
      }
      if (i > 0) {
        const k = i * 2
        middleIndex.push(k - 2, k, k - 1, k - 1, k, k + 1)
      }
    }
    const sheet = new THREE.BufferGeometry()
    sheet.setAttribute('position', new THREE.BufferAttribute(middle, 3))
    sheet.setIndex(middleIndex)
    sheet.computeVertexNormals()
    const sheetNormal = sheet.getAttribute('normal')

    const positions: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    const p = new THREE.Vector3()
    const n = new THREE.Vector3()
    let along = 0
    // Per sample, four vertices: two on the upper face, two on the lower
    for (let i = 0; i < count; i++) {
      if (i > 0) along += centres[i].distanceTo(centres[i - 1])
      const v = along / w
      for (const face of [1, -1]) {
        for (const e of [0, 1]) {
          p.fromArray(middle, (i * 2 + e) * 3)
          n.fromBufferAttribute(sheetNormal, i * 2 + e)
          positions.push(p.x + n.x * STRAP_LIFT * face, p.y + n.y * STRAP_LIFT * face, p.z + n.z * STRAP_LIFT * face)
          normals.push(n.x * face, n.y * face, n.z * face)
          uvs.push(e === 0 ? u0 : u1, v)
        }
      }
      if (i > 0) {
        const a = (i - 1) * 4
        const b = i * 4
        // Upper face, then the lower wound the other way
        indices.push(a, b, a + 1, a + 1, b, b + 1)
        indices.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2)
      }
    }
    sheet.dispose()
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    g.setIndex(indices)
    straps.push(g)
  }

  /** The turns a strap takes round a tube at one of its ends, starting from the side the sitter is on. */
  const wrap = (centre: THREE.Vector3, toward: THREE.Vector3, beyond: THREE.Vector3, turns: number, steps: number) => {
    const out: THREE.Vector3[] = []
    for (let s = 1; s <= steps; s++) {
      const a = (turns * s) / steps
      out.push(centre.clone().addScaledVector(toward, (r + STRAP_LIFT) * Math.cos(a)).addScaledVector(beyond, (r + STRAP_LIFT) * Math.sin(a)))
    }
    return out
  }

  const step = detail === 'high' ? 0.009 : 0.014
  const xAxis = v3(1, 0, 0)

  // Long straps, top rail to front rail
  longX.forEach((x, j) => {
    const centres: THREE.Vector3[] = []
    const us: number[] = []
    for (const p of wrap(v3(x, topRail.y, topRail.z), backNormal, backDir, 3.7, 8).reverse()) {
      centres.push(p)
      us.push(-1)
    }
    const count = Math.ceil(length / step)
    for (let s = 0; s <= count; s++) {
      const u = (length * s) / count
      profile(u, point, normal)
      // Under where cross strap i goes over, over where it goes under
      let weave = 0
      crossU.forEach((cu, i) => (weave -= over(i, j) * WEAVE * plateau(u - cu)))
      centres.push(v3(x, point.y, point.z).addScaledVector(normal, STRAP_LIFT + weave - sag(u, x)))
      us.push(u)
    }
    for (const p of wrap(v3(x, frontRail.y, frontRail.z), seatNormal, seatDir, 3.7, 8)) {
      centres.push(p)
      us.push(-1)
    }
    ribbon(
      centres,
      centres.map(() => xAxis),
      LONG_STRAPS[j % LONG_STRAPS.length],
      (index, edge) => {
        // On the webbing itself each edge follows the surface at its own x, so the strap cups with the sag
        const u = us[index]
        if (u < 0) return null
        const ex = x + (edge * w) / 2
        profile(u, point, normal)
        let weave = 0
        crossU.forEach((cu, i) => (weave -= over(i, j) * WEAVE * plateau(u - cu)))
        return v3(ex, point.y, point.z).addScaledVector(normal, STRAP_LIFT + weave - sag(u, ex))
      },
    )
  })

  // Cross straps, rail to rail
  const screws: { at: THREE.Vector3; facing: THREE.Vector3 }[] = []
  crossU.forEach((cu, i) => {
    const halfWidth = i < firstSeat ? backX : seatX
    profile(cu, point, normal)
    const origin = point.clone()
    const n = normal.clone()
    // The direction of the strap's width, chosen so its upper face is the one toward the sitter
    const across = i < firstSeat ? backDir.clone() : seatDir.clone().negate()
    const centres: THREE.Vector3[] = []
    const xs: number[] = []
    const railCentre = (side: number) => origin.clone().addScaledVector(n, -r).setX(side * halfWidth)
    for (const p of wrap(railCentre(-1), n, v3(-1, 0, 0), 3.5, 8).reverse()) {
      centres.push(p)
      xs.push(NaN)
    }
    const count = Math.ceil((halfWidth * 2) / step)
    for (let s = 0; s <= count; s++) {
      const x = -halfWidth + (2 * halfWidth * s) / count
      xs.push(x)
      centres.push(v3(x, 0, 0))
    }
    for (const p of wrap(railCentre(1), n, v3(1, 0, 0), 3.5, 8)) {
      centres.push(p)
      xs.push(NaN)
    }
    const at = (x: number, du: number) => {
      const u = cu + du
      profile(u, point, normal)
      let weave = 0
      longX.forEach((lx, j) => (weave += over(i, j) * WEAVE * plateau(x - lx)))
      return v3(x, point.y, point.z).addScaledVector(normal, STRAP_LIFT + weave - sag(u, x))
    }
    centres.forEach((c, k) => {
      if (!Number.isNaN(xs[k])) c.copy(at(xs[k], 0))
    })
    ribbon(
      centres,
      centres.map(() => across),
      CROSS_STRAPS[i % CROSS_STRAPS.length],
      (index, edge) => (Number.isNaN(xs[index]) ? null : at(xs[index], (-edge * w) / 2)),
    )
    // A screw through each end, on the outside of the rail
    for (const side of [1, -1]) {
      const facing = v3(side, 0, 0).addScaledVector(n, -0.55).normalize()
      screws.push({ at: railCentre(side).addScaledVector(facing, r + STRAP_LIFT * 2), facing })
    }
  })
  // And through each end of the long straps: behind the top rail, in front of the front rail
  for (const x of longX) {
    const behind = backDir.clone().addScaledVector(backNormal, -0.7).normalize()
    screws.push({ at: v3(x, topRail.y, topRail.z).addScaledVector(behind, r + STRAP_LIFT * 2), facing: behind })
    const ahead = seatDir.clone().addScaledVector(seatNormal, -0.7).normalize()
    screws.push({ at: v3(x, frontRail.y, frontRail.z).addScaledVector(ahead, r + STRAP_LIFT * 2), facing: ahead })
  }
  for (const s of screws) metal.push(head(s.at, s.facing, 0.004))

  // ---------------------------------------------------------- assembly ----
  const group = new THREE.Group()
  group.name = 'chair'
  const geometries: THREE.BufferGeometry[] = []
  const add = (parts: THREE.BufferGeometry[], material: THREE.Material, name: string) => {
    const indexed = parts.map((g) => {
      // Extrusions come without an index; everything merged must match
      const out = g.index ? g : mergeVertices(g)
      if (out !== g) g.dispose()
      return out
    })
    const merged = mergeGeometries(indexed, false)
    for (const g of indexed) g.dispose()
    geometries.push(merged)
    const mesh = new THREE.Mesh(merged, material)
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }
  add(metal, materials.aluminium, 'chair-frame')
  add(plastic, materials.plastic, 'chair-arms')
  add(straps, materials.webbing, 'chair-webbing')

  const seat: ChairSeat = {
    spec,
    surface,
    fold: backRun + arcLength / 2,
    length,
    arm: { y: spec.armHeight, x: sledX - 0.006, front: armFront, rear: armRear, width: armWidth },
    feet: { x: sledX, front: zFront, rear: zRear },
  }
  return {
    group,
    seat,
    dispose() {
      for (const g of geometries) g.dispose()
    },
  }
}
