// Isolated harness for the lensed sky (the scene after the fall).
//
//   /dev/lens.html?p=0.5             fixed scroll progress (0..1)
//   &bhtier=ultra|high|medium|low    force a quality tier
//   &nohud                           hide the slider (for screenshots)
//   &set=phase:1.5,fade:1            override fields of the frame, to isolate an effect
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import LensScene from '../src/lens/LensScene'
import { PROJECTS } from '../src/content/projects'

const params = new URLSearchParams(location.search)
const overrides = Object.fromEntries(
  (params.get('set') ?? '')
    .split(',')
    .filter(Boolean)
    .map((pair) => pair.split(':'))
    .map(([k, v]) => [k, Number(v)]),
)
const images = PROJECTS.map((p) => p.image)

function Page() {
  const [p, setP] = useState(() => Number(params.get('p') ?? 0.2))
  const progress = useRef(p)
  progress.current = p
  const [status, setStatus] = useState('starting')
  const [info, setInfo] = useState('')

  useEffect(() => {
    const id = window.setInterval(() => {
      const c = document.querySelector('canvas')
      if (c) {
        setInfo(`${c.dataset.stageTier} · ${c.dataset.stageFps} fps · ${c.width}×${c.height} · ${c.dataset.stageGpu}`)
        setStatus(c.dataset.stageState ?? 'starting')
      }
    }, 500)
    return () => window.clearInterval(id)
  }, [])

  return (
    <>
      <LensScene
        progress={() => progress.current}
        images={images}
        tweak={(f) => ({ ...f, ...overrides })}
      />
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
