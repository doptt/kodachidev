import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { ContactPin } from '@/content/contact'
import { drag, grab, release } from './orbit'
import type { MoonState } from './state'

/** How a label came to be open. It decides what closes it. */
type Reason = 'hover' | 'focus' | 'tap' | 'page'

type Parts = { item: HTMLLIElement; hit: HTMLElement; line: HTMLElement; card: HTMLElement }

/** A label stands this far above its pin's head, and this far from the edges of the screen. */
const GAP = 26
const MARGIN = 16
/** Room left clear for the navigation above and the footer below. */
const CLEAR_TOP = 88
const CLEAR_BOTTOM = 112
/** How long a label lingers after the pointer leaves, so that it can be reached across the gap. */
const LINGER = 180

const arrow = (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d="M5 11 11 5M6 5h5v5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/**
 * Everything that sits over the moon's canvas: the pins' labels, the surface
 * that is dragged to look round, and a line of help.
 *
 * The pins are a real list. Each item holds its label card with a link or a
 * button in it, and those are what the keyboard and a screen reader meet, in
 * order, whether or not the card can be seen: a card is invisible until its
 * pin is hovered, tapped or focused, and focusing anything in it brings it up
 * and swings the view toward its pin. The glowing pins themselves are in the
 * canvas; over each is an unseen target for the pointer.
 *
 * Nothing here re-renders as the moon moves: the scene writes where each pin
 * is into `state` every frame, and one listener moves the targets and cards by
 * transform. On a narrow screen the open card is a sheet along the bottom
 * instead of standing over its pin (moon.css).
 */
/**
 * The badge over a pin: the mark of the place the pin leads to. Decoration,
 * like the pin itself; the label and its link are what is read out.
 * (The GitHub and Discord marks are those companies' own, used to point at
 * their services.)
 */
function PinIcon({ name }: { name: NonNullable<ContactPin['icon']> }) {
  if (name === 'email') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5.5" width="18" height="13" rx="2.2" />
        <path d="m3.8 7.2 8.2 6.2 8.2-6.2" />
      </svg>
    )
  }
  if (name === 'github') {
    return (
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  )
}

export function MoonOverlay({
  state,
  pins,
  live,
  still = false,
  onReach,
}: {
  state: MoonState
  pins: readonly ContactPin[]
  /** True once the scene is being drawn. */
  live: boolean
  /** Reduced motion: the view is held on the settled frame, so there is nothing to drag. */
  still?: boolean
  /** A pin has taken keyboard focus: the section brings the settled view on screen. */
  onReach?: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const parts = useRef(new Map<string, Parts>())
  const sizes = useRef(new Map<string, { w: number; h: number }>())
  const reason = useRef<Reason>('hover')
  /** True while this component is the one opening or closing a label, so that the page doing it can be told apart. */
  const own = useRef(false)
  const linger = useRef(0)
  const dragging = useRef<{ id: number; x: number; y: number } | null>(null)
  const [open, setOpen] = useState<string | null>(state.active)
  const [copied, setCopied] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  useEffect(
    () =>
      state.onPin((id) => {
        if (!own.current && id !== null) reason.current = 'page'
        setOpen(id)
      }),
    [state],
  )

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(null), 2200)
    return () => window.clearTimeout(timer)
  }, [copied])

  // Follow the scene: once a frame, move each pin's target, card and leader line to where the pin is
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const sheet = window.matchMedia('(max-width: 40rem)')
    const measure = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.pin
        if (id) sizes.current.set(id, { w: (entry.target as HTMLElement).offsetWidth, h: (entry.target as HTMLElement).offsetHeight })
      }
    })
    for (const { card } of parts.current.values()) measure.observe(card)

    const place = () => {
      const rect = root.getBoundingClientRect()
      const interactive = String(state.interactive)
      if (root.dataset.interactive !== interactive) root.dataset.interactive = interactive
      for (const [id, { item, hit, line, card }] of parts.current) {
        const spot = state.spots[id]
        if (!spot) continue
        const x = spot.x - rect.left
        const y = spot.y - rect.top
        const visible = String(state.interactive && spot.visible > 0.5)
        if (item.dataset.visible !== visible) item.dataset.visible = visible
        hit.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
        if (sheet.matches) {
          if (card.style.transform) card.style.transform = ''
          continue
        }
        // Over the pin, centred on it, and never off the screen; under it if there is no room above
        const size = sizes.current.get(id) ?? { w: 280, h: 140 }
        const left = Math.round(Math.min(rect.width - size.w - MARGIN, Math.max(MARGIN, x - size.w / 2)))
        const above = y - GAP - size.h
        const top = Math.round(above >= CLEAR_TOP ? above : Math.min(rect.height - size.h - CLEAR_BOTTOM, y + GAP))
        card.style.transform = `translate3d(${left}px, ${top}px, 0)`
        // The leader runs from the pin's head to the nearest point of the card's near edge
        const ex = Math.min(left + size.w - 18, Math.max(left + 18, x))
        const ey = above >= CLEAR_TOP ? top + size.h : top
        line.style.width = `${Math.hypot(ex - x, ey - y).toFixed(1)}px`
        line.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${Math.atan2(ey - y, ex - x).toFixed(4)}rad)`
      }
    }
    place()
    const stop = state.subscribe(place)
    return () => {
      stop()
      measure.disconnect()
    }
  }, [state, pins])

  const close = useCallback(
    (only?: Reason) => {
      if (only && reason.current !== only) return
      own.current = true
      state.open(null)
      own.current = false
    },
    [state],
  )

  const show = (id: string, why: Reason, turn = false) => {
    window.clearTimeout(linger.current)
    reason.current = why
    own.current = true
    state.open(id, turn)
    own.current = false
  }

  // Hover: the label follows the pointer on to the card and lingers a moment when it leaves
  const enter = (id: string) => (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse' || dragging.current) return
    window.clearTimeout(linger.current)
    if (state.active !== id || reason.current === 'hover') show(id, 'hover')
  }
  const leave = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse') return
    window.clearTimeout(linger.current)
    linger.current = window.setTimeout(() => close('hover'), LINGER)
  }

  // A tap or a click holds the label open until something else is tapped. A finger also swings the view toward the pin.
  const tap = (id: string) => (e: ReactPointerEvent) => {
    if (state.active === id && reason.current === 'tap') close()
    else show(id, 'tap', e.pointerType !== 'mouse')
    setTouched(true)
  }

  // Keyboard focus on anything in a card opens it and swings the view toward its pin
  const focus = (id: string) => (e: FocusEvent) => {
    if (!e.target.matches(':focus-visible')) return
    onReach?.()
    show(id, 'focus', true)
    setTouched(true)
  }
  const blur = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) close('focus')
  }

  const copy = async (pin: ContactPin) => {
    if (!pin.copy) return
    try {
      await navigator.clipboard.writeText(pin.copy)
      setCopied(pin.id)
    } catch {
      // Clipboard blocked: the text is on the card, and can be selected and copied by hand
    }
  }

  // Dragging anywhere that is not a pin or a card swings the camera round the chair
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('[data-moon-ui]')) return
    if (reason.current === 'tap' || reason.current === 'page') close()
    if (still || !state.interactive || (e.pointerType === 'mouse' && e.button !== 0)) return
    dragging.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    grab(state.orbit)
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.dataset.dragging = 'true'
  }
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const held = dragging.current
    if (!held || held.id !== e.pointerId) return
    // The width of the screen is about a radian of swing, and the scene goes the way the hand does.
    // A finger moving up or down is scrolling the page (touch-action: pan-y), so only its sideways travel counts.
    const box = e.currentTarget.getBoundingClientRect()
    drag(state.orbit, (e.clientX - held.x) / Math.max(320, box.width), e.pointerType === 'touch' ? 0 : ((e.clientY - held.y) / box.height) * 0.25)
    held.x = e.clientX
    held.y = e.clientY
    if (!touched) setTouched(true)
  }
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current?.id !== e.pointerId) return
    dragging.current = null
    release(state.orbit)
    delete e.currentTarget.dataset.dragging
  }

  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && reason.current !== 'focus') close()
  }

  const register = (id: string, key: keyof Parts) => (el: HTMLElement | null) => {
    if (!el) return
    const entry = parts.current.get(id) ?? ({} as Parts)
    ;(entry[key] as HTMLElement) = el
    parts.current.set(id, entry)
  }

  return (
    <div
      ref={rootRef}
      className="moon-overlay"
      data-live={live}
      data-still={still}
      data-touched={touched}
      data-sheet={open !== null && reason.current !== 'focus'}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
    >
      <ul role="list" aria-label="Ways to reach me" className="moon-pins">
        {pins.map((pin, index) => {
          const external = pin.href?.startsWith('http')
          return (
            <li key={pin.id} ref={register(pin.id, 'item')} className="moon-pin" data-open={open === pin.id}>
              <span ref={register(pin.id, 'hit')} className="moon-pin-hit" data-moon-ui aria-hidden="true" onPointerEnter={enter(pin.id)} onPointerLeave={leave} onPointerUp={tap(pin.id)}>
                {/* Inside the pin's own target, so it rides with the pin and pointing at it opens the label too */}
                {pin.icon && (
                  <span className="moon-pin-badge" style={{ animationDelay: `${-1.1 * index}s` }}>
                    <PinIcon name={pin.icon} />
                  </span>
                )}
              </span>
              <span ref={register(pin.id, 'line')} className="moon-pin-line" aria-hidden="true" />
              <div ref={register(pin.id, 'card')} className="moon-card" data-moon-ui data-pin={pin.id} onPointerEnter={enter(pin.id)} onPointerLeave={leave} onFocus={focus(pin.id)} onBlur={blur}>
                {/* Placed by the listener above; the body inside is what fades and slides */}
                <div className="moon-card-body">
                  <p className="moon-card-label">{pin.label}</p>
                  <p className="moon-card-value">{pin.value}</p>
                  <div className="moon-card-actions">
                    {pin.href && (
                      <a href={pin.href} className="moon-card-action" {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
                        {pin.action}
                        <span className="moon-sr">
                          : {pin.value}
                          {external ? ' (opens in a new tab)' : ''}
                        </span>
                        {arrow}
                      </a>
                    )}
                    {pin.copy && (
                      <button type="button" className="moon-card-action" data-done={copied === pin.id} onClick={() => copy(pin)}>
                        {copied === pin.id ? 'Copied' : pin.copyLabel}
                        <span className="moon-sr">: {pin.copy}</span>
                      </button>
                    )}
                  </div>
                  <button type="button" className="moon-card-close" aria-label={`Close ${pin.label}`} onClick={() => close()}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <p className="moon-sr" aria-live="polite">
        {copied ? `Copied ${pins.find((pin) => pin.id === copied)?.copy}` : ''}
      </p>

      <p className="moon-hint">{still ? 'Each pin is a way to reach me.' : 'Drag to look round. Each pin is a way to reach me.'}</p>

      {!live && (
        <p className="moon-loading" role="status">
          Coming in to land
        </p>
      )}
    </div>
  )
}
