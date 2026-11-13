/**
 * The fixed facts of the moon scene: where the alien sits, where the camera
 * settles, where the light comes from, how big things are. No imports, so the
 * tests can read them too.
 *
 * Directions are unit vectors in the stand frame (see geo.ts): the moon's
 * centre is the origin, the alien's spot is +Y and he faces +Z.
 */
import type { Vec3 } from './geo'

const rad = (deg: number) => (deg * Math.PI) / 180

/**
 * Where on the Moon the chair is: Tranquility Base, where Apollo 11 came
 * down. `heading` is the compass bearing he faces.
 */
export const SITE = { lat: 0.674, lon: 23.473, heading: 250 }

/** From his chair's feet to the tips of his antennae, metres: what "how big is he on screen" is measured by. */
export const ALIEN_HEIGHT = 0.92

/**
 * Which side the settled camera looks from: its azimuth round the chair, from
 * his front (+Z) toward his left (+X). Negative is his right: he is seen in
 * three-quarter view, facing the right of the screen.
 */
export const CAMERA_AZIMUTH = rad(-52)

/**
 * The sun: low over the chair (`elevation`), and round from the settled
 * camera's right toward the camera by `swing`. From the right for long hard
 * shadows running to the left of the screen; swung toward the camera so that
 * the ground in view is mostly lit, and so that he, facing right, has it on
 * his face. assets-src/scripts/moon.py bakes the ground's own shadows for
 * these two numbers: change them there too.
 */
const SUN_ELEVATION = rad(22)
const SUN_SWING = rad(38)
const sunAzimuth = CAMERA_AZIMUTH + Math.PI / 2 - SUN_SWING
export const SUN: Vec3 = [Math.cos(SUN_ELEVATION) * Math.sin(sunAzimuth), Math.sin(SUN_ELEVATION), Math.cos(SUN_ELEVATION) * Math.cos(sunAzimuth)]
/** Colour and intensity, in three.js's units for a DirectionalLight. The actor's materials were tuned under these. */
export const SUN_LIGHT = { color: 0xfff6e8, intensity: 5 }

/**
 * Earthshine: a faint cool light from the camera's left, on the side the sun
 * does not reach. The Earth itself hangs in front of the alien, to the right
 * of the picture; bringing its light round to the dark side is a liberty,
 * taken so that the dark side is a place and not a hole.
 */
const fillAzimuth = CAMERA_AZIMUTH - rad(62)
export const FILL: Vec3 = [Math.cos(rad(24)) * Math.sin(fillAzimuth), Math.sin(rad(24)), Math.cos(rad(24)) * Math.cos(fillAzimuth)]
export const FILL_LIGHT = { color: 0x9db9ff, intensity: 0.22 }

/**
 * The Earth: its radius on the sky in radians, and where it hangs in the
 * settled picture, as a point of the screen (-1..1, y up), on a wide screen
 * and on a tall one. Modest, and well clear of his head.
 */
export const EARTH = { radius: 0.045, wide: [0.62, 0.56], tall: [0.5, 0.8] }

/** How far round from the chair the baked close-up ground reaches, radians of arc. Matches SITE_REACH in moon.py. */
export const SITE_REACH = rad(64)

/** A pin: the height of its head above the ground and the radius of the head, in metres. */
export const PIN = { height: 0.32, head: 0.026, stem: 0.0045 }

/** Creamy Candle Flame (#FFEDC1), in linear light: the colour of everything that glows. */
export const CHAMPAGNE: Vec3 = [1, 0.846, 0.533]

/**
 * How the galaxy is turned behind the scene: where its centre (the bright
 * middle of the Milky Way) is in the settled picture, as a point of the
 * screen, and the tilt of the band there, in radians from level.
 */
export const GALAXY = { at: [-0.5, 0.42], tilt: rad(32) }
