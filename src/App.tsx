import { useState, useEffect, useRef } from 'react'
import Nav from './components/Nav'
import Hero from './components/Hero'
import Work from './components/Work'
import Services from './components/Services'
import About from './components/About'
import Contact from './components/Contact'
import Footer from './components/Footer'
import Starfield from './components/Starfield'

export default function App() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="relative bg-[#07060D] min-h-screen overflow-x-hidden grain">
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

      <Nav scrolled={scrolled} />

      <main className="relative z-10">
        <Hero />
        <Work />
        <Services />
        <About />
        <Contact />
      </main>

      <Footer />
    </div>
  )
}
