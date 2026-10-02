import { useEffect, useState } from 'react'

const LINKS = [
  { label: 'Home', hash: '#home' },
  { label: 'Work', hash: '#work' },
  { label: 'Services', hash: '#services' },
  { label: 'About', hash: '#about' },
  { label: 'Contact', hash: '#contact' },
]

type NavProps = {
  scrolled: boolean
  onHome?: boolean
}

export default function Nav({ scrolled, onHome = true }: NavProps) {
  const [open, setOpen] = useState(false)

  // Hash links only work on the home page, so prefix them everywhere else
  const href = (hash: string) => (onHome ? hash : `/${hash}`)

  // Escape closes the mobile menu
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      {/* Only the links sit in the frosted bar, the logo and Terms button float either side */}
      <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4">
        <nav aria-label="Main" className="mx-auto grid w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-3 lg:gap-4">
          <a href={onHome ? '#home' : '/'} className="col-start-1 row-start-1 flex items-center gap-2 justify-self-start">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand font-display text-xs font-bold tracking-wider shadow-[0_0_20px_rgb(117_71_255/0.35)]">
              NW
            </span>
            <span className="hidden font-display text-sm font-semibold tracking-tight [text-shadow:0_1px_12px_rgb(7_6_13/0.9)] sm:block">
              kodachi.dev
            </span>
          </a>

          <ul
            className={`col-start-2 row-start-1 hidden items-center gap-1 rounded-2xl border border-accent/12 p-1.5 backdrop-blur-xl transition-all duration-300 md:flex ${
              scrolled ? 'bg-deep/90 shadow-[0_8px_32px_rgb(0_0_0/0.4)]' : 'bg-deep/55'
            }`}
          >
            {LINKS.map((link) => (
              <li key={link.label}>
                <a
                  href={href(link.hash)}
                  className="block rounded-xl px-3 py-1.5 text-sm font-medium lg:px-3.5 text-muted transition-colors duration-200 hover:bg-accent/8 hover:text-ink"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="col-start-3 row-start-1 flex items-center gap-3 justify-self-end">
            <a href="/terms" className="btn-primary hidden rounded-xl px-4 py-2 text-sm whitespace-nowrap sm:inline-flex">
              Terms & Conditions
            </a>

            {/* Hamburger. The outer bars slide in and cross into an X. */}
            <button
              type="button"
              className={`flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-xl border border-accent/12 backdrop-blur-xl transition-colors duration-300 md:hidden ${
                scrolled ? 'bg-deep/90' : 'bg-deep/55'
              }`}
              onClick={() => setOpen(!open)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="mobile-menu"
            >
              <span className={`block h-px w-5 bg-muted transition-transform duration-300 ${open ? 'translate-y-[7px] rotate-45' : ''}`} />
              <span className={`block h-px w-5 bg-muted transition-all duration-300 ${open ? 'scale-x-0 opacity-0' : ''}`} />
              <span className={`block h-px w-5 bg-muted transition-transform duration-300 ${open ? '-translate-y-[7px] -rotate-45' : ''}`} />
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile menu. `inert` keeps its links out of the tab order while hidden. */}
      <div
        id="mobile-menu"
        inert={!open}
        className={`fixed inset-0 z-40 bg-night/92 backdrop-blur-xl transition-opacity duration-300 md:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div
          className={`flex h-full flex-col items-center justify-center gap-2 transition-transform duration-300 ${
            open ? 'translate-y-0' : '-translate-y-4'
          }`}
        >
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={href(link.hash)}
              onClick={() => setOpen(false)}
              className="rounded-2xl px-8 py-3 font-display text-2xl font-semibold tracking-tight transition-colors duration-200 hover:text-accent"
            >
              {link.label}
            </a>
          ))}
          <a
            href="/terms"
            onClick={() => setOpen(false)}
            className="px-6 py-2 font-mono text-xs uppercase tracking-[0.12em] text-muted transition-colors duration-200 hover:text-accent"
          >
            Terms & Conditions
          </a>
          <a
            href={href('#contact')}
            onClick={() => setOpen(false)}
            className="btn-primary mt-4 rounded-2xl px-8 py-3 text-base"
          >
            Start a Project
          </a>
        </div>
      </div>
    </>
  )
}
