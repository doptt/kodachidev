/**
 * A finger as a pointer. On a phone the things that follow the mouse on a
 * desktop (the camera's lean in each scene, the pyramid's tilt, the drift of
 * the purple field) follow the finger instead: wherever it is on the screen
 * while it is down, scrolling included, and back to rest when it lifts.
 *
 * Pointer events cannot do this on their own: the browser cancels a touch's
 * pointer the moment the touch becomes a scroll, which on a page that is
 * mostly scrolled is almost at once. Touch events carry on through it. They
 * are listened to passively, so they never hold a scroll up, and they never
 * fire for a mouse, so nothing changes where there is one.
 */
export function followTouch(
  /** The finger's place in the window, in CSS pixels. Called at most once per touch event. */
  move: (clientX: number, clientY: number) => void,
  /** The last finger has lifted. */
  rest: () => void,
): () => void {
  const onTouch = (e: TouchEvent) => {
    const t = e.touches[0]
    if (t) move(t.clientX, t.clientY)
  }
  const onEnd = (e: TouchEvent) => {
    if (e.touches.length === 0) rest()
  }
  const passive = { passive: true } as const
  window.addEventListener('touchstart', onTouch, passive)
  window.addEventListener('touchmove', onTouch, passive)
  window.addEventListener('touchend', onEnd, passive)
  window.addEventListener('touchcancel', onEnd, passive)
  return () => {
    window.removeEventListener('touchstart', onTouch)
    window.removeEventListener('touchmove', onTouch)
    window.removeEventListener('touchend', onEnd)
    window.removeEventListener('touchcancel', onEnd)
  }
}
