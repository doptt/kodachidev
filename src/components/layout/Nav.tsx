import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { cn } from '@/lib/cn'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { SoundToggle } from '@/sound/SoundToggle'

/** Horizontal reach of the curve that sweeps each side of the bar up into the top edge. */
const EAR = { desktop: 88, phone: 36 }

const links = [
  { label: 'Work', href: '#work' },
  { label: 'What I build', href: '#build' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
]

function Monogram({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        // Colours live in .nav-monogram so they can follow the scroll-driven accent
        'nav-monogram grid size-8 shrink-0 place-items-center rounded-full font-display text-[0.8rem] font-medium tracking-tight',
        className,
      )}
    >
      NW
    </span>
  )
}

/**
 * Black notch silhouette that hangs from the top edge: concave shoulders flare
 * into the screen edge, rounded corners at the bottom, and a glowing rim along
 * the lower edge. Sized to the nav with a ResizeObserver so it follows the
 * condense transition frame by frame.
 */
function NotchShape({ target }: { target: RefObject<HTMLElement | null> }) {
  const [size, setSize] = useState({ w: 0, h: 0, e: EAR.desktop })
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')

  useLayoutEffect(() => {
    const el = target.current
    if (!el) return
    const wide = window.matchMedia('(min-width: 768px)')
    const measure = () =>
      setSize({ w: el.offsetWidth, h: el.offsetHeight, e: wide.matches ? EAR.desktop : EAR.phone })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    wide.addEventListener('change', measure)
    return () => {
      ro.disconnect()
      wide.removeEventListener('change', measure)
    }
  }, [target])

  const { w, h, e } = size
  if (!w || !h) return null

  const total = w + e * 2
  const mid = e / 2
  // Rim: every edge except the top one, which sits flush with the screen.
  // Each side is one long S-curve: it leaves the top edge flat, then sweeps
  // down to meet the bottom edge flat.
  const rim = [
    `M 0 0`,
    `C ${mid} 0 ${mid} ${h} ${e} ${h}`,
    `L ${e + w} ${h}`,
    `C ${e + w + mid} ${h} ${e + w + mid} 0 ${total} 0`,
  ].join(' ')

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute top-0 overflow-visible"
      style={{ left: -e, width: total, height: h }}
      viewBox={`0 0 ${total} ${h}`}
    >
      <defs>
        <linearGradient id={`${uid}-rim`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={total} y2="0">
          {/* Colours come from CSS so the rim can follow the scroll-driven accent */}
          <stop offset="0" style={{ stopColor: 'var(--nav-glow)' }} stopOpacity="0" />
          <stop offset="0.12" style={{ stopColor: 'var(--nav-glow)' }} stopOpacity="0.35" />
          <stop offset="0.5" style={{ stopColor: 'var(--nav-rim)' }} stopOpacity="0.95" />
          <stop offset="0.88" style={{ stopColor: 'var(--nav-glow)' }} stopOpacity="0.35" />
          <stop offset="1" style={{ stopColor: 'var(--nav-glow)' }} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" />
          <stop offset="1" stopColor="#07070d" />
        </linearGradient>
        <filter id={`${uid}-glow`} filterUnits="userSpaceOnUse" x={-40} y={-40} width={total + 80} height={h + 80}>
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      {/* Soft outer halo */}
      <path d={rim} fill="none" stroke={`url(#${uid}-rim)`} strokeWidth="16" opacity="0.9" filter={`url(#${uid}-glow)`} />
      {/* Blacked-out body */}
      <path d={`${rim} Z`} fill={`url(#${uid}-body)`} fillOpacity="0.94" />
      {/* Crisp rim line */}
      <path d={rim} fill="none" stroke={`url(#${uid}-rim)`} strokeWidth="1.25" />
    </svg>
  )
}

export function Nav() {
  const [condensed, setCondensed] = useState(false)
  const [open, setOpen] = useState(false)
  const reduced = usePrefersReducedMotion()
  const { scrollY } = useScroll()
  const menuId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const firstLinkRef = useRef<HTMLAnchorElement>(null)
  const navRef = useRef<HTMLElement>(null)

  useMotionValueEvent(scrollY, 'change', (y) => setCondensed(y > 32))

  // Escape closes; focus moves into the menu and back to the trigger
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = window.setTimeout(() => firstLinkRef.current?.focus(), 30)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      window.clearTimeout(t)
      buttonRef.current?.focus()
    }
  }, [open])

  // Close on resize up to desktop
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)')
    const onChange = () => mql.matches && setOpen(false)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const ease = [0.32, 0.72, 0, 1] as const

  return (
    <header data-bh-vars="theme dim" className="nav-vars pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center">
      <div className="bh-dims pointer-events-auto relative w-[calc(100%-5rem)] md:w-auto">
        <nav
          ref={navRef}
          aria-label="Main"
          className={cn(
            'relative z-10 flex items-center justify-between gap-2 transition-[padding] duration-(--duration-base) ease-(--ease-glass) md:gap-6',
            condensed ? 'pb-2 pl-2 pr-2 pt-2 md:pl-3' : 'pb-3 pl-2.5 pr-2.5 pt-3.5 md:pl-4',
          )}
        >
          <a
            href="#top"
            className="flex min-h-11 items-center gap-2.5 rounded-pill pr-2 text-ink focus-ring"
          >
            <Monogram />
            <span
              className={cn(
                'font-nav text-[0.95rem] font-light tracking-tight transition-[opacity,max-width,transform] duration-(--duration-base) ease-(--ease-glass)',
                condensed ? 'md:max-w-0 md:-translate-x-1 md:opacity-0 overflow-hidden' : 'max-w-40 opacity-100',
              )}
            >
              kodachi.dev
            </span>
          </a>

          <ul className={cn('hidden items-center md:flex', condensed && 'md:-ml-3')} role="list">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className={cn(
                    'nav-link inline-flex min-h-11 items-center rounded-pill font-nav text-[0.9rem] font-light text-ink-soft transition-[color,padding,text-shadow] duration-(--duration-base) ease-(--ease-glass) hover:text-ink focus-ring',
                    condensed ? 'px-2.5' : 'px-3.5',
                  )}
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-1 md:gap-3">
            <SoundToggle />
            <a
              href="#contact"
              className={cn(
                'nav-cta hidden min-h-10 items-center rounded-pill font-nav font-light text-navy-950 transition-[padding,background-color,transform,box-shadow] duration-(--duration-base) ease-(--ease-glass) active:scale-[0.98] md:inline-flex focus-ring',
                condensed ? 'px-3.5 text-[0.85rem]' : 'px-4 text-[0.9rem]',
              )}
            >
              Get in touch
            </a>

            <button
              ref={buttonRef}
              type="button"
              className="grid size-11 place-items-center rounded-pill text-ink md:hidden focus-ring"
              aria-expanded={open}
              aria-controls={menuId}
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((o) => !o)}
            >
              <span className="relative block h-3.5 w-5" aria-hidden="true">
                <span
                  className={cn(
                    'absolute left-0 top-0 h-px w-full bg-current transition-transform duration-(--duration-base) ease-(--ease-glass)',
                    open && 'translate-y-[6.5px] rotate-45',
                  )}
                />
                <span
                  className={cn(
                    'absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-current transition-opacity duration-(--duration-fast)',
                    open && 'opacity-0',
                  )}
                />
                <span
                  className={cn(
                    'absolute bottom-0 left-0 h-px w-full bg-current transition-transform duration-(--duration-base) ease-(--ease-glass)',
                    open && '-translate-y-[6.5px] -rotate-45',
                  )}
                />
              </span>
            </button>
          </div>
        </nav>
        {/* After the nav so its ref is attached before this measures it; z-index keeps it underneath */}
        <NotchShape target={navRef} />
      </div>

      {/* Full-screen glass menu (phones) */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="menu"
            id={menuId}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="pointer-events-auto fixed inset-0 z-40 flex flex-col px-5 pb-8 pt-24 md:hidden"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={{ duration: 0.3, ease }}
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 -z-10 bg-navy-950/70 backdrop-blur-2xl backdrop-saturate-150"
              onClick={() => setOpen(false)}
            />
            <motion.ul
              role="list"
              className="flex flex-col gap-1"
              initial={reduced ? false : { y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.4, ease, delay: 0.05 }}
            >
              {links.map((l, i) => (
                <li key={l.href}>
                  <a
                    ref={i === 0 ? firstLinkRef : undefined}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-14 items-center rounded-glass-sm px-3 font-nav text-[2rem] font-light tracking-tight text-ink focus-ring"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </motion.ul>
            <div className="mt-auto flex flex-col gap-4">
              <a
                href="#contact"
                onClick={() => setOpen(false)}
                className="nav-cta inline-flex min-h-12 items-center justify-center rounded-pill px-6 font-nav font-light text-navy-950 focus-ring"
              >
                Get in touch
              </a>
              <p className="label-mono text-center">Noah, web developer</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
