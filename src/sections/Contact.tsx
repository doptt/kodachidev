import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { CONTACT, CONTACT_PINS, type ContactPin } from '@/content/contact'
import { StarField } from '@/blackhole/StarField'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { attachMoonDriver, defineMoonScene, moonControls, moonState } from '@/moon'
import { MoonOverlay } from '@/moon/MoonOverlay'
import { startMoonDriver, type MoonDriver } from '@/moon/driver'
import { HOLD, SPAN } from '@/moon/timeline'
import { useSceneStatus, useShowScene } from '@/stage/react'
import { stage } from '@/stage/stage'
import '@/moon/moon.css'

defineMoonScene()

/** True once the stage has a canvas and can draw; false when it cannot; null before it is known. */
function useStageSupported() {
  return useSyncExternalStore(
    stage.subscribe,
    () => stage.supported,
    () => null,
  )
}

/**
 * The pinned stage. The section is a few screens tall and its one child
 * sticks to the viewport for all of them; the moon itself is drawn behind the
 * page by the shared stage, so the child holds only what sits over it. Scroll
 * through the section is the camera's path (moon/timeline.ts): from close on
 * the alien, back and up to the settled view, then a stretch where nothing
 * moves but what the visitor moves.
 *
 * Under reduced motion there is no camera travel: the section is only the
 * settled stretch, and the scene is held on the settled view.
 */
function Stage({ still }: { still: boolean }) {
  const sectionRef = useRef<HTMLElement>(null)
  const driverRef = useRef<MoonDriver | null>(null)
  const [onScreen, setOnScreen] = useState(false)
  const status = useSceneStatus('moon')
  const live = useRef(false)
  live.current = status === 'ready'
  useShowScene('moon', onScreen)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    const io = new IntersectionObserver((entries) => setOnScreen(entries.some((e) => e.isIntersecting)))
    io.observe(section)
    return () => io.disconnect()
  }, [])

  // The footer is up for as long as the moon is the scene: from the moment this section has taken
  // over the upper part of the screen until it is left again (moon.css shows and hides it by this mark)
  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    const root = document.documentElement
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) root.dataset.moonIn = 'true'
        else delete root.dataset.moonIn
      },
      // The section counts as arrived once its top edge is in the upper third of the screen
      { rootMargin: '0px 0px -66% 0px' },
    )
    io.observe(section)
    return () => {
      io.disconnect()
      delete root.dataset.moonIn
    }
  }, [])

  // Scroll → progress. The scene reads it every frame; nothing here re-renders as it changes.
  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    const driver = startMoonDriver(
      section,
      (p) => {
        moonState.progress = still ? 1 : p
      },
      () => live.current,
    )
    driverRef.current = driver
    const detach = attachMoonDriver(driver)
    // Arriving on #contact from another page: the top of the section is the black before the opening shot
    if (window.location.hash === '#contact') requestAnimationFrame(() => driver.flyTo(true))
    return () => {
      detach()
      driver.stop()
      driverRef.current = null
    }
  }, [still])

  // Any link to #contact on the page flies to the moon rather than landing on the top of the section
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      if (!(e.target instanceof Element) || !e.target.closest('a[href="#contact"]')) return
      e.preventDefault()
      moonControls.flyTo()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return (
    <section
      id="contact"
      ref={sectionRef}
      aria-labelledby="contact-title"
      data-moon-stage
      data-bg-scene="blackhole"
      className="relative"
      style={{ height: `${((still ? HOLD : SPAN) + 1) * 100}lvh` }}
    >
      <div data-moon-pin className="sticky top-0 h-lvh overflow-clip">
        <h2 id="contact-title" className="sr-only">
          {CONTACT.title}
        </h2>
        <MoonOverlay state={moonState} pins={CONTACT_PINS} live={status === 'ready'} still={still} onReach={() => driverRef.current?.settle()} />
      </div>
    </section>
  )
}

const meta = 'font-mono text-[0.72rem] tracking-[0.06em] text-bh-glow'
const row = 'group/row flex min-h-14 min-w-0 flex-1 items-center gap-4 py-3 text-left focus-ring'
const hint = 'shrink-0 text-[0.8rem] text-bh-accent transition-colors duration-(--duration-base) group-hover/row:text-bh-highlight'

const arrow = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M5 11 11 5M6 5h5v5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function Words({ pin }: { pin: ContactPin }) {
  return (
    <>
      <span className="w-16 shrink-0 font-mono text-[0.72rem] tracking-[0.06em] text-bh-glow">{pin.label}</span>
      <span className="min-w-0 flex-1 truncate text-[1rem] text-[#eadfc9] transition-colors duration-(--duration-base) group-hover/row:text-bh-highlight">{pin.value}</span>
    </>
  )
}

/**
 * Without the scene (no WebGL, software rendering, ?nogl, or the scene failed
 * to load): the reference picture of the alien on the moon, and the ways to
 * reach me as a plain list in the sky above it. The one place the details are
 * on the page outside a pin.
 */
function Flat() {
  const [copied, setCopied] = useState<string | null>(null)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(null), 2200)
    return () => window.clearTimeout(t)
  }, [copied])

  const copy = async (pin: ContactPin) => {
    if (!pin.copy) return
    try {
      await navigator.clipboard.writeText(pin.copy)
      setCopied(pin.id)
    } catch {
      // Clipboard blocked: the text is on the page to copy by hand
    }
  }

  return (
    <section id="contact" aria-labelledby="contact-title" data-bg-scene="blackhole" className="moon-flat relative overflow-clip bg-black">
      {/* The page's stars, down to where the picture's own sky takes over */}
      <div className="absolute inset-x-0 top-0 h-[max(24rem,calc(100%-34vw))]">
        <StarField seed={0x6d0e} />
      </div>

      <div className="relative z-10 mx-auto max-w-[84rem] px-5 pt-28 sm:px-8 md:pt-36 lg:px-14">
        <div className="max-w-[29rem]">
          <h2 id="contact-title" className={meta}>
            {CONTACT.eyebrow}
          </h2>
          <ul role="list" className="mt-5 border-b border-bh-accent/20">
            {CONTACT_PINS.map((pin) => {
              const external = pin.href?.startsWith('http')
              return (
                <li key={pin.id} className="flex items-center gap-2 border-t border-bh-accent/20 transition-colors duration-(--duration-base) hover:border-bh-accent/60">
                  {pin.href ? (
                    <a href={pin.href} className={row} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
                      <Words pin={pin} />
                      <span className={hint}>
                        {arrow}
                        {external && <span className="sr-only">(opens in a new tab)</span>}
                      </span>
                    </a>
                  ) : (
                    <button type="button" onClick={() => copy(pin)} className={row}>
                      <Words pin={pin} />
                      <span className={hint}>{copied === pin.id ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                  {pin.href && pin.copy && (
                    <button
                      type="button"
                      onClick={() => copy(pin)}
                      className="inline-flex min-h-11 shrink-0 items-center rounded-pill px-3 text-[0.8rem] text-bh-accent transition-colors duration-(--duration-base) hover:text-bh-highlight focus-ring"
                    >
                      {copied === pin.id ? 'Copied' : 'Copy'}
                      <span className="sr-only"> {pin.label.toLowerCase()}</span>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="sr-only" aria-live="polite">
            {copied ? `Copied ${CONTACT_PINS.find((pin) => pin.id === copied)?.copy}` : ''}
          </p>
        </div>
      </div>

      {/* The moon. On wide screens it slides up under the list, whose corner of its sky is empty. */}
      <div className="moon-scene relative mt-10 lg:-mt-[8vw] xl:-mt-[14vw]">
        <picture>
          <source media="(max-width: 640px)" srcSet="/contact/moon-960.webp" />
          <img
            src="/contact/moon.webp"
            alt="A green alien in a space suit, relaxing in a lawn chair on the moon with a can in its hand. The Earth hangs in the black sky behind."
            width={1584}
            height={672}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="block aspect-[4/3] w-full select-none object-cover object-[52%_100%] sm:aspect-[1584/672]"
          />
        </picture>
        {/* The ground falls into shadow toward the bottom edge, where the footer follows */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] bg-linear-to-t from-black to-transparent" />
      </div>
    </section>
  )
}

/**
 * Contact, at the end of the trip: the top of a moon a few metres across
 * fills the bottom half of the screen, with the alien who got there first in
 * his lawn chair on it, the Earth and the Milky Way behind. The ways to reach
 * me are pins stood in the ground round him (content/contact.ts): dragging
 * looks round, and each pin opens a label with a link or a button in it.
 * Underneath, the pins are a real list, so the keyboard and a screen reader
 * get the same three things in order (moon/MoonOverlay.tsx).
 *
 * The moon is drawn by the shared stage (moon/scene.ts). Where the stage
 * cannot run, or with ?nogl, the section is the flat picture and a plain list
 * instead. The footer (layout/Footer.tsx) is laid over the bottom of the last
 * screen, so the page ends on the moon.
 */
export function Contact() {
  const reduced = usePrefersReducedMotion()
  const supported = useStageSupported()
  const status = useSceneStatus('moon')
  const forceFlat = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nogl')
  if (forceFlat || supported !== true || status === 'failed') return <Flat />
  return <Stage still={reduced} />
}
