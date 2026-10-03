import { useEffect, useRef } from 'react'
import { paintGalaxy } from '../../lib/space/galaxy'
import HeroIntro from './HeroIntro'

// Biggest the galaxy texture gets, in pixels. Past this the extra detail
// doesn't survive being squashed by the tilt anyway.
const MAX_SIZE = 1400

// The phone hero: the intro over a tilted spiral galaxy. The galaxy is
// painted once and only ever rotated afterwards, so it's cheap on any phone.
export default function PhoneHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = canvas.height = Math.min(MAX_SIZE, Math.round(canvas.clientWidth * devicePixelRatio))
    if (paintGalaxy(canvas)) canvas.dataset.ready = ''
  }, [])

  return (
    <section id="home" className="relative flex min-h-svh flex-col overflow-hidden pt-28">
      <div className="relative z-10 px-6">
        <HeroIntro />
      </div>

      <div className="galaxy-stage" aria-hidden>
        <div className="galaxy">
          <canvas ref={canvasRef} className="galaxy-disk" />
        </div>
        <div className="galaxy-core" />
        <span className="sparkle" />
        <span className="sparkle" />
        <span className="sparkle" />
        <span className="sparkle" />
      </div>
    </section>
  )
}
