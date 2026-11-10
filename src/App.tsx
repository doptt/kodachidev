import Background from '@/background/Background'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CursorCircle } from '@/components/effects/CursorCircle'
// Hero variants: swap between Hero (split layout) and HeroCentered
import { HeroCentered as Hero } from '@/sections/HeroCentered'
import { Build } from '@/sections/Build'
import { Work } from '@/sections/Work'
import { About } from '@/sections/About'
import { Contact } from '@/sections/Contact'

export default function App() {
  return (
    <>
      <Background />
      <Nav />
      <CursorCircle />
      <main>
        <Hero />
        <Build />
        <Work />
        <About />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
