// Isolated harness for the lensed sky (the scene after the fall).
//
//   /dev/lens.html?p=0.5             fixed scroll progress (0..1)
//   &bhtier=ultra|high|medium|low    force a quality tier
//   &nohud                           hide the slider (for screenshots)
//   &set=phase:1.5,fade:1            override fields of the frame, to isolate an effect
//   &card=0.5                        hold the settled project's ring of cards there, for a still:
//                                    1 is its second view in the middle, 0.5 half way to it
//
// Dragging the slider across a project's hold plays the move to the next one in time, as on the site.
// Dragging across the sky turns the settled project's ring of cards, as on the site; so does clicking
// a card beside the middle one, and a wheel or trackpad turned sideways.
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import LensScene from '../src/lens/LensScene'
import { PROJECTS } from '../src/content/projects'
import { RING_KEEP, createRings } from '../src/lens/ring'
import { attachSwipe, frameTime } from '../src/lens/swipe'
import { caption, glide, type Glide, type LensFrame } from '../src/lens/timeline'

const params = new URLSearchParams(location.search)
const overrides = Object.fromEntries(
  (params.get('set') ?? '')
    .split(',')
    .filter(Boolean)
    .map((pair) => pair.split(':'))
    .map(([k, v]) => [k, Number(v)]),
)
const images = PROJECTS.map((p) => p.image)
const more = PROJECTS.map((p) => ('more' in p ? p.more.map((m) => m.image) : []))
const rings = createRings(more.map((list) => 1 + list.length))
const heldAt = params.has('card') ? Number(params.get('card')) : null

// The site's driver glides the phase; here the page does it, once for each frame drawn.
// It also does the section's part for the rings: which one can be turned, and putting back
// the ring of a project that has gone out of sight.
let sky: Glide | null = null
let seen = 0
let turnable = -1
function glided(frame: LensFrame): LensFrame {
  const now = performance.now()
  const dt = Math.min((now - seen) / 1000, 0.1)
  seen = now
  sky = sky ? glide(sky, frame.phase, dt) : { value: frame.phase, velocity: 0 }
  const drawn = { ...frame, phase: sky.value, ...overrides }
  const up = caption(drawn, images.length)
  const can = up.shown && drawn.fall <= 0 ? up.index : -1
  if (can !== turnable) {
    turnable = can
    rings.releaseAll(now)
  }
  for (let i = 0; i < images.length; i++) {
    if (heldAt !== null) rings.set(i, i === up.index ? heldAt : 0)
    else if (rings.away(i) && Math.abs(drawn.phase - i) > RING_KEEP) rings.reset(i)
  }
  return drawn
}

function Page() {
  const [p, setP] = useState(() => Number(params.get('p') ?? 0.2))
  const progress = useRef(p)
  progress.current = p
  const swipe = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('starting')
  const [info, setInfo] = useState('')

  useEffect(() => {
    const id = window.setInterval(() => {
      const c = document.querySelector('canvas')
      if (c) {
        const card = turnable >= 0 ? ` · card ${rings.read(turnable, performance.now()).toFixed(2)} of project ${turnable + 1}` : ''
        setInfo(`${c.dataset.stageTier} · ${c.dataset.stageFps} fps · ${c.width}×${c.height} · views ${c.dataset.statViews} · ${c.dataset.stageGpu}${card}`)
        setStatus(c.dataset.stageState ?? 'starting')
      }
    }, 500)
    return () => window.clearInterval(id)
  }, [])

  // The whole page takes the drag here: there is nothing else on it to press
  useEffect(() => {
    const el = swipe.current
    if (!el || heldAt !== null) return
    return attachSwipe(el, { rings, project: () => turnable, bounds: () => el.getBoundingClientRect() })
  }, [])

  return (
    <>
      <LensScene progress={() => progress.current} images={images} more={more} ring={(i) => rings.read(i, frameTime())} held={rings.holding} tweak={glided} />
      <div ref={swipe} style={{ position: 'fixed', inset: 0, touchAction: 'pan-y', userSelect: 'none' }} />
      {!params.has('nohud') && (
        <div className="hud">
          <div>
            p <input type="range" min={0} max={1} step={0.0005} value={p} onChange={(e) => setP(Number(e.target.value))} /> {p.toFixed(4)}
          </div>
          <div>
            {status} · {info}
          </div>
        </div>
      )}
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
