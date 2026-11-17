import { deflectionTable, shadowAngle, skyAngle, viewAngle } from './geodesic'
import { SIDE_SCALE, azimuthAt, pictureBox, ringLayout, type PictureBox, type RingLayout, type Rings } from './ring'
import { R_HOVER, composition, type Composition } from './timeline'

/** A press that moves less than this, in pixels, is a click and not a drag. */
const SLOP = 5
/** How long after the last turn of a wheel or a trackpad the ring is taken to have been let go, milliseconds. */
const WHEEL_REST = 140

export type Framing = {
  comp: Composition
  layout: RingLayout
  /** Where the settled picture is on screen. */
  box: PictureBox
}

let hover: Float32Array | null = null
let framed: { aspect: number; framing: Framing } | null = null

/**
 * How the scene frames a screen `aspect` wide for its height, as the page
 * needs it: where the settled picture is on screen and how its ring of cards
 * is laid out. The same sums as the renderer's, for the camera at rest. The
 * last answer is kept: it is asked for on every move of the pointer.
 */
export function framing(aspect: number): Framing {
  if (framed?.aspect === aspect) return framed.framing
  hover ??= deflectionTable(R_HOVER)
  const table = hover
  const comp = composition(aspect, shadowAngle(R_HOVER))
  const thetaRead = skyAngle(table, R_HOVER, Math.PI / 2 + comp.centre, comp.reach)
  const made = {
    comp,
    layout: ringLayout(comp, aspect),
    box: pictureBox(comp, aspect, thetaRead, (theta) => viewAngle(table, R_HOVER, theta, comp.reach)),
  }
  framed = { aspect, framing: made }
  return made
}

/** The time of the frame being drawn, on the clock events are stamped with: the same for everything drawn in one frame. */
export function frameTime(): number {
  const t = typeof document !== 'undefined' ? document.timeline?.currentTime : null
  return typeof t === 'number' ? t : performance.now()
}

/** The time of an event on that clock. */
function stamp(e: Event): number {
  const now = performance.now()
  // Some browsers have stamped events on another clock; one that is far from now is not to be trusted
  return Math.abs(e.timeStamp - now) < 2000 ? e.timeStamp : now
}

export type SwipeOptions = {
  rings: Rings
  /** The project whose ring can be turned just now, or -1 when none can. */
  project: () => number
  /** The rectangle of the page the scene fills, in client pixels. */
  bounds: () => { left: number; top: number; width: number; height: number }
  /** Told after anything that may have changed which card is in the middle of a ring. */
  onCard?: (project: number, card: number) => void
}

/**
 * Lets a pointer turn the ring of cards from `el`, an element laid over the
 * sky at the height of the pictures.
 *
 * Pressing and dragging turns the ring with the pointer, angle for angle on
 * the sky; letting go keeps its speed and settles it on a card. A click on a
 * card beside the middle one brings it to the middle. A wheel or trackpad
 * turned sideways turns the ring too; turned up or down it is left alone, and
 * scrolls the page. The element should have `touch-action: pan-y`, so that a
 * finger moving up or down scrolls the page as well and only a sideways swipe
 * arrives here.
 *
 * While the pointer is over a card the element carries `data-cursor="hover"`.
 * Returns a function that takes the listeners off again.
 */
export function attachSwipe(el: HTMLElement, opts: SwipeOptions): () => void {
  const { rings } = opts
  let active: { id: number; project: number; x: number; y: number; from: number; step: number; moved: boolean } | null = null
  let wheelTimer = 0
  let wheeled = -1

  const tell = (project: number) => opts.onCard?.(project, rings.card(project))

  /** Where a pointer is on the sky: how far round from straight ahead, and how the scene is framed there. */
  const look = (e: { clientX: number; clientY: number }) => {
    const b = opts.bounds()
    const aspect = b.width / Math.max(1, b.height)
    const f = framing(aspect)
    const x = ((e.clientX - b.left) / Math.max(1, b.width)) * 2 - 1
    const y = -(((e.clientY - b.top) / Math.max(1, b.height)) * 2 - 1)
    return { f, y, width: b.width, aspect, round: azimuthAt(x, y, f.comp, aspect) }
  }

  /** The card under a pointer, or -1: the pointer is `round` from straight ahead and `y` up the screen. */
  const cardUnder = (project: number, at: ReturnType<typeof look>, now: number) => {
    const { box, layout, comp } = at.f
    // A card stands a little taller toward the sides of the screen; a little slack covers it
    const slack = 0.12 * (box.top - box.bottom)
    if (at.y > box.top + slack || at.y < box.bottom - slack) return -1
    const where = rings.read(project, now) + at.round / layout.step
    const card = Math.round(where)
    if (card < 0 || card >= rings.count(project)) return -1
    const half = Math.atan(comp.half[0] * (card === rings.card(project) ? 1 : SIDE_SCALE))
    return Math.abs(where - card) * layout.step <= half ? card : -1
  }

  const end = (e: PointerEvent, cancelled: boolean) => {
    if (!active || e.pointerId !== active.id) return
    const { project, moved } = active
    const now = stamp(e)
    active = null
    el.removeAttribute('data-dragging')
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    rings.release(project, now)
    // A click on a card beside the middle one brings it to the middle
    if (!moved && !cancelled && opts.project() === project) {
      const card = cardUnder(project, look(e), now)
      if (card >= 0 && card !== rings.card(project)) rings.goTo(project, card, now)
    }
    tell(project)
  }

  const onDown = (e: PointerEvent) => {
    if (active || (e.pointerType === 'mouse' && e.button !== 0)) return
    const project = opts.project()
    if (project < 0 || rings.count(project) < 2) return
    const at = look(e)
    active = { id: e.pointerId, project, x: e.clientX, y: e.clientY, from: at.round, step: at.f.layout.step, moved: false }
    // The ring is caught where it is, even in the middle of settling
    rings.press(project, stamp(e))
    if (e.pointerType === 'mouse') {
      // The drag goes on if the pointer leaves the band, and does not start selecting the page's text
      el.setPointerCapture(e.pointerId)
      e.preventDefault()
    }
  }

  const onMove = (e: PointerEvent) => {
    if (!active) {
      // Nothing held: say whether the pointer is over a card, for the cursor
      const project = e.pointerType === 'mouse' ? opts.project() : -1
      const over = project >= 0 && rings.count(project) > 1 && cardUnder(project, look(e), stamp(e)) >= 0
      if (over) el.setAttribute('data-cursor', 'hover')
      else el.removeAttribute('data-cursor')
      return
    }
    if (e.pointerId !== active.id) return
    if (!active.moved) {
      if (Math.hypot(e.clientX - active.x, e.clientY - active.y) < SLOP) return
      active.moved = true
      el.setAttribute('data-dragging', '')
    }
    // The sky under the pointer stays under the pointer: the ring turns by the angle the pointer has crossed
    rings.drag(active.project, -(look(e).round - active.from) / active.step, stamp(e))
    tell(active.project)
  }

  const onUp = (e: PointerEvent) => end(e, false)
  const onCancel = (e: PointerEvent) => end(e, true)
  const onLeave = () => el.removeAttribute('data-cursor')

  const onWheel = (e: WheelEvent) => {
    // Only a wheel turned sideways is the ring's. Anything else is the page's, untouched.
    if (e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.2 || e.deltaX === 0) return
    const project = opts.project()
    if (project < 0 || rings.count(project) < 2 || active) return
    e.preventDefault()
    e.stopPropagation()
    const at = look(e)
    // How far across the screen the next card is from the middle one, in pixels: the ring turns as the page would scroll
    const span = (Math.tan(Math.min(at.f.layout.step, 1.2)) / (at.f.comp.tanHalfFov * at.aspect)) * (at.width / 2)
    const pixels = e.deltaX * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? at.width : 1)
    rings.push(project, pixels / Math.max(120, span), stamp(e))
    tell(project)
    wheeled = project
    window.clearTimeout(wheelTimer)
    wheelTimer = window.setTimeout(() => {
      rings.settle(project, performance.now())
      wheeled = -1
      tell(project)
    }, WHEEL_REST)
  }

  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onCancel)
  el.addEventListener('pointerleave', onLeave)
  el.addEventListener('wheel', onWheel, { passive: false })

  return () => {
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onCancel)
    el.removeEventListener('pointerleave', onLeave)
    el.removeEventListener('wheel', onWheel)
    window.clearTimeout(wheelTimer)
    if (wheeled >= 0) rings.settle(wheeled, performance.now())
    rings.releaseAll(performance.now())
    el.removeAttribute('data-cursor')
    el.removeAttribute('data-dragging')
  }
}
