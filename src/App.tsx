import { useEffect } from 'react'
import Background from '@/background/Background'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { runIntro, useIntroPhase } from '@/motion/intro'
import { startScroll } from '@/motion/scroll'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { ScrollRail } from '@/components/layout/ScrollRail'
import { CursorCircle } from '@/components/effects/CursorCircle'
import { HeroCentered } from '@/sections/HeroCentered'
import { Build } from '@/sections/Build'
import { Statement } from '@/sections/Statement'
import { Work } from '@/sections/Work'
import { About } from '@/sections/About'
import { Contact } from '@/sections/Contact'

export default function App() {
  const reduced = usePrefersReducedMotion()
  // Smooth wheel scrolling for the whole page (off under reduced motion)
  useEffect(() => startScroll({ reducedMotion: reduced }), [reduced])
  // The preloader: the hero is mounted afresh as it lifts, so its entrance plays as it is uncovered
  useEffect(runIntro, [])
  const held = useIntroPhase() === 'loading'

  return (
    <>
      <Background />
      <Nav />
      <ScrollRail />
      <CursorCircle />
      <main>
        <HeroCentered key={held ? 'held' : 'live'} />
        <Build />
        <Statement />
        <Work />
        <About />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
