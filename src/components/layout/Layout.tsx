import { useEffect, useState, type ReactNode } from 'react'
import Nav from './Nav'
import Footer from './Footer'
import Starfield from './Starfield'

type LayoutProps = {
  children: ReactNode
  /** False on secondary pages, so section links point back to "/#section" */
  onHome?: boolean
}

// Page shell shared by every page: background glow, stars, nav and footer.
export default function Layout({ children, onHome = true }: LayoutProps) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    // overflow-x-clip (not hidden): "hidden" would turn this div into a
    // scroll container and break the hero's sticky stage
    <div id="top" className="grain relative min-h-screen overflow-x-clip bg-night">
      {/* Soft violet light washing in from the top and edges */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden
        style={{
          background: [
            'radial-gradient(ellipse 80% 60% at 50% -10%, rgb(117 71 255 / 0.12) 0%, transparent 60%)',
            'radial-gradient(ellipse 60% 40% at 100% 60%, rgb(155 109 255 / 0.06) 0%, transparent 50%)',
            'radial-gradient(ellipse 50% 40% at 0% 80%, rgb(117 71 255 / 0.07) 0%, transparent 50%)',
          ].join(', '),
        }}
      />

      <Starfield />
      <Nav scrolled={scrolled} onHome={onHome} />

      <main className="relative z-10">{children}</main>

      <Footer onHome={onHome} />
    </div>
  )
}
