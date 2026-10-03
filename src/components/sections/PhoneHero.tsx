import { useEffect, useRef, useState } from 'react'
import loopHevc from '../../assets/black-hole.mp4'
import loopVp9 from '../../assets/black-hole.webm'
import still from '../../assets/black-hole.webp'
import { HoleVideo } from '../../lib/space/holeVideo'
import { prefersReducedMotion } from '../../lib/space/sky'
import HeroIntro from './HeroIntro'

// The phone hero: just the intro, with a pre-rendered loop of the black hole
// underneath. The still image shows until the video is playing, and stays
// if it can't play (reduced motion, iOS Low Power Mode, no WebGL).
export default function PhoneHero() {
  const sectionRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [reduced] = useState(prefersReducedMotion)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const section = sectionRef.current
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!section || !canvas || !video) return

    const player = HoleVideo.create(canvas)
    if (!player) return

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      // no point going past the video's own resolution
      player.resize(Math.min(1080, canvas.clientWidth * dpr), Math.min(840, canvas.clientHeight * dpr))
    }
    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)

    let shown = false
    let pending = 0
    const draw = () => {
      if (video.readyState >= 2) {
        player.draw(video)
        if (!shown) {
          shown = true
          setPlaying(true)
        }
      }
      pending = 'requestVideoFrameCallback' in video ? video.requestVideoFrameCallback(draw) : requestAnimationFrame(draw)
    }
    const stopDrawing = () => {
      if ('cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(pending)
      else cancelAnimationFrame(pending)
    }

    // Only play while the hero is on screen
    const visibility = new IntersectionObserver(([entry]) => {
      stopDrawing()
      if (entry.isIntersecting) {
        video.play().then(draw, () => {})
      } else {
        video.pause()
      }
    })
    visibility.observe(section)

    return () => {
      stopDrawing()
      visibility.disconnect()
      resizeObserver.disconnect()
      video.pause()
      player.dispose()
    }
  }, [])

  return (
    <section id="home" ref={sectionRef} className="relative flex min-h-svh flex-col overflow-hidden pt-28">
      <div className="relative z-10 px-6">
        <HeroIntro />
      </div>

      <div className="phone-hero-stage" aria-hidden>
        <div className="phone-hero-art">
          <img src={still} alt="" className="absolute inset-0 h-full w-full" />
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${playing ? 'opacity-100' : 'opacity-0'}`}
          />
        </div>
        {!reduced && (
          <video
            ref={videoRef}
            muted
            loop
            playsInline
            preload="auto"
            className="pointer-events-none absolute top-0 left-0 h-px w-px opacity-0"
          >
            {/* HEVC for Safari, VP9 for everything else */}
            <source src={loopHevc} type='video/mp4; codecs="hvc1"' />
            <source src={loopVp9} type='video/webm; codecs="vp9"' />
          </video>
        )}
      </div>
    </section>
  )
}
