import * as THREE from 'three'
import type { PropMaterials } from '../materials'
import { fuse, placed, solid, tint } from './build'

/**
 * The cooler that stands beside the chair in the reference picture, and the
 * two bottles of water next to it. The cooler is a moulded box, a little
 * wider at the top than at the foot, in blue-grey with a white lid. The
 * bottles are thin clear plastic, ribbed below the label, with green caps.
 *
 * Space: origin on the ground under the middle of the cooler, +Y up, its
 * long side along X. The bottles stand where `BOTTLES` puts them.
 */
export const COOLER = { width: 0.3, depth: 0.2, body: 0.15, lid: 0.042 }
export const BOTTLE = { height: 0.17, radius: 0.027 }
/** Where the two bottles stand, relative to the cooler: [x, z]. */
export const BOTTLES: [number, number][] = [
  [-0.215, -0.05],
  [0.1, 0.165],
]

const C = { body: 0x4c6076, lid: 0xe8e9e4, trim: 0xd9dad5, cap: 0x2f9a57, label: 0xf2f4f6, band: 0x2f7fc4, foot: 0x4f6274 }

/** A box with rounded upright corners and softened top and bottom edges, standing on y = 0. */
function mould(width: number, depth: number, height: number, corner: number, bevel: number, steps: number) {
  const w = width / 2 - bevel
  const d = depth / 2 - bevel
  const shape = new THREE.Shape()
  shape.moveTo(-w + corner, -d)
  shape.lineTo(w - corner, -d)
  shape.absarc(w - corner, -d + corner, corner, -Math.PI / 2, 0, false)
  shape.lineTo(w, d - corner)
  shape.absarc(w - corner, d - corner, corner, 0, Math.PI / 2, false)
  shape.lineTo(-w + corner, d)
  shape.absarc(-w + corner, d - corner, corner, Math.PI / 2, Math.PI, false)
  shape.lineTo(-w, -d + corner)
  shape.absarc(-w + corner, -d + corner, corner, Math.PI, Math.PI * 1.5, false)
  const g = new THREE.ExtrudeGeometry(shape, { depth: height - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: steps, curveSegments: steps + 2 })
  // Drawn as a plan and pulled up along z; stand it up
  g.rotateX(-Math.PI / 2)
  g.translate(0, bevel, 0)
  return g
}

export function buildCooler(materials: PropMaterials, detail: 'high' | 'low') {
  const steps = 2
  const solidParts: THREE.BufferGeometry[] = []

  // Body: tapered toward the foot
  const body = mould(COOLER.width, COOLER.depth, COOLER.body, 0.022, 0.006, steps)
  const at = body.getAttribute('position')
  for (let i = 0; i < at.count; i++) {
    const narrow = 0.9 + 0.1 * (at.getY(i) / COOLER.body)
    at.setXYZ(i, at.getX(i) * narrow, at.getY(i), at.getZ(i) * narrow)
  }
  body.computeVertexNormals()
  solidParts.push(tint(body, C.body))
  // A band where the lid seats, then the lid itself, a touch proud of the body all round
  solidParts.push(tint(placed(mould(COOLER.width + 0.004, COOLER.depth + 0.004, 0.012, 0.022, 0.003, steps), 0, COOLER.body - 0.004, 0), C.trim))
  solidParts.push(tint(placed(mould(COOLER.width + 0.012, COOLER.depth + 0.012, COOLER.lid, 0.026, 0.008, steps), 0, COOLER.body + 0.006, 0), C.lid))
  // The recessed grips moulded into the ends, as darker panels
  for (const side of [1, -1]) {
    solidParts.push(tint(placed(new THREE.BoxGeometry(0.004, 0.03, COOLER.depth * 0.5), side * (COOLER.width / 2 - 0.004), COOLER.body * 0.74, 0), C.foot))
  }

  // Bottles: one lathe for the clear shell, one for the water in it; caps and labels go with the solid parts
  const { height: H, radius: R } = BOTTLE
  const shellProfile: [number, number][] = [
    [0.001, 0.004],
    [R * 0.7, 0.001],
    [R, 0.008],
  ]
  // Ribs round the lower half
  for (let i = 0; i < 5; i++) {
    const y = 0.016 + i * 0.012
    shellProfile.push([R, y], [R - 0.0022, y + 0.006])
  }
  shellProfile.push([R, 0.078], [R, H * 0.7], [R * 0.82, H * 0.8], [R * 0.45, H * 0.9], [R * 0.4, H * 0.94])
  const around = detail === 'high' ? 20 : 12
  const clear: THREE.BufferGeometry[] = []
  const water: THREE.BufferGeometry[] = []
  BOTTLES.forEach(([x, z], index) => {
    const shell = new THREE.LatheGeometry(
      shellProfile.map(([r, y]) => new THREE.Vector2(r, y)),
      around,
    )
    clear.push(placed(shell, x, 0, z))
    // One is nearly full, the other half drunk
    const level = index === 0 ? H * 0.42 : H * 0.72
    const filled = shellProfile.filter(([, y]) => y < level).map(([r, y]) => new THREE.Vector2(Math.max(r - 0.0012, 0.001), y + 0.0008))
    filled.push(new THREE.Vector2(filled[filled.length - 1].x, level), new THREE.Vector2(0.001, level))
    water.push(placed(new THREE.LatheGeometry(filled, around), x, 0, z))
    solidParts.push(tint(placed(new THREE.CylinderGeometry(R * 0.44, R * 0.44, 0.014, around), x, H * 0.94 + 0.006, z), C.cap))
    // The label: a white sleeve with a blue band
    solidParts.push(tint(placed(new THREE.CylinderGeometry(R + 0.0004, R + 0.0004, 0.036, around, 1, true), x, 0.102, z), C.label))
    solidParts.push(tint(placed(new THREE.CylinderGeometry(R + 0.0007, R + 0.0007, 0.011, around, 1, true), x, 0.1, z), C.band))
  })

  const solidGeometry = fuse(solidParts)
  const waterGeometry = fuse(water)
  const clearGeometry = fuse(clear)
  const group = new THREE.Group()
  group.name = 'cooler'
  group.add(solid(solidGeometry, materials.moulded, 'cooler-body'))
  const waterMesh = solid(waterGeometry, materials.water, 'bottle-water', false)
  const shellMesh = solid(clearGeometry, materials.bottle, 'bottle-shell', false)
  // The water is inside the plastic: draw it first
  waterMesh.renderOrder = 3
  shellMesh.renderOrder = 4
  group.add(waterMesh, shellMesh)
  return {
    group,
    dispose() {
      solidGeometry.dispose()
      waterGeometry.dispose()
      clearGeometry.dispose()
    },
  }
}
