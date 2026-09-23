import { useEffect, useState, type ReactNode } from 'react'
import Nav from './Nav'
import Footer from './Footer'
import Starfield from './Starfield'

/** Shared page chrome: ambient background, starfield, nav and footer. */
export default function Layout({ children, onHome = true }: { children: ReactNode; onHome?: boolean }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40)
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div id="top" className="relative bg-[#07060D] min-h-screen overflow-x-hidden grain">
      {/* Global ambient background */}
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
        {/* Deep space gradient base */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(117,71,255,0.12) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 100% 60%, rgba(155,109,255,0.06) 0%, transparent 50%), radial-gradient(ellipse 50% 40% at 0% 80%, rgba(117,71,255,0.07) 0%, transparent 50%)',
          }}
        />
      </div>

      {/* Starfield: twinkling stars + comets, fixed across the whole page */}
      <Starfield />

      <Nav scrolled={scrolled} onHome={onHome} />

      <main className="relative z-10">{children}</main>

      <Footer onHome={onHome} />
    </div>
  )
}
