import { useState } from 'react'

const links = [
  { label: 'Home', href: '#home' },
  { label: 'Work', href: '#work' },
  { label: 'Services', href: '#services' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
]

export default function Nav({ scrolled }: { scrolled: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-4"
        style={{ transition: 'padding 0.3s ease' }}
      >
        <nav
          className="w-full max-w-5xl rounded-2xl px-5 py-3 flex items-center justify-between transition-all duration-300"
          style={{
            background: scrolled
              ? 'rgba(13, 11, 22, 0.88)'
              : 'rgba(13, 11, 22, 0.55)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(155, 109, 255, 0.12)',
            boxShadow: scrolled
              ? '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(155,109,255,0.06)'
              : 'none',
          }}
        >
          {/* Wordmark */}
          <a href="#home" className="flex items-center gap-2 group">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold font-display"
              style={{
                background: 'linear-gradient(135deg, #9B6DFF, #7547FF)',
                color: '#F5F2FF',
                letterSpacing: '0.05em',
              }}
            >
              NW
            </div>
            <span
              className="font-display font-semibold text-sm hidden sm:block"
              style={{ color: '#F5F2FF', letterSpacing: '-0.01em' }}
            >
              kodachi.dev
            </span>
          </a>

          {/* Desktop links */}
          <ul className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <li key={l.label}>
                <a
                  href={l.href}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
                  style={{ color: '#A29BB5', fontFamily: 'Inter, sans-serif' }}
                  onMouseEnter={(e) => {
                    const t = e.currentTarget
                    t.style.color = '#F5F2FF'
                    t.style.background = 'rgba(155,109,255,0.08)'
                  }}
                  onMouseLeave={(e) => {
                    const t = e.currentTarget
                    t.style.color = '#A29BB5'
                    t.style.background = 'transparent'
                  }}
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>

          {/* CTA + hamburger */}
          <div className="flex items-center gap-3">
            <a
              href="#contact"
              className="hidden sm:block px-4 py-2 rounded-xl text-sm font-semibold font-display transition-all duration-200"
              style={{
                background: 'linear-gradient(135deg, #9B6DFF, #7547FF)',
                color: '#F5F2FF',
                boxShadow: '0 0 20px rgba(117,71,255,0.3)',
                letterSpacing: '-0.01em',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 0 28px rgba(117,71,255,0.5)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 0 20px rgba(117,71,255,0.3)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              Terms & Conditions
            </a>
            <button
              className="md:hidden w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-lg transition-colors duration-200"
              onClick={() => setOpen(!open)}
              aria-label="Toggle menu"
              style={{ color: '#A29BB5' }}
            >
              <span
                className="block h-px w-5 transition-all duration-300"
                style={{
                  background: '#A29BB5',
                  transform: open ? 'rotate(45deg) translate(2px, 2px)' : 'none',
                }}
              />
              <span
                className="block h-px w-5 transition-all duration-300"
                style={{
                  background: '#A29BB5',
                  opacity: open ? 0 : 1,
                  transform: open ? 'scaleX(0)' : 'scaleX(1)',
                }}
              />
              <span
                className="block h-px w-5 transition-all duration-300"
                style={{
                  background: '#A29BB5',
                  transform: open ? 'rotate(-45deg) translate(2px, -2px)' : 'none',
                }}
              />
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile menu */}
      <div
        className="fixed inset-0 z-40 md:hidden transition-all duration-300"
        style={{
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          background: 'rgba(7,6,13,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <div
          className="flex flex-col items-center justify-center h-full gap-2"
          style={{ transform: open ? 'translateY(0)' : 'translateY(-16px)', transition: 'transform 0.3s ease' }}
        >
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className="text-2xl font-display font-semibold py-3 px-8 rounded-2xl transition-colors duration-200"
              style={{ color: '#F5F2FF', letterSpacing: '-0.02em' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#9B6DFF')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#F5F2FF')}
            >
              {l.label}
            </a>
          ))}
          <a
            href="#contact"
            onClick={() => setOpen(false)}
            className="mt-4 px-8 py-3 rounded-2xl text-base font-display font-semibold"
            style={{
              background: 'linear-gradient(135deg, #9B6DFF, #7547FF)',
              color: '#F5F2FF',
              boxShadow: '0 0 32px rgba(117,71,255,0.4)',
            }}
          >
            Start a Project
          </a>
        </div>
      </div>
    </>
  )
}
