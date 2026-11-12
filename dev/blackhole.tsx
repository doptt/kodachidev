// Isolated harness for the black hole scene.
//
//   /dev/blackhole.html?p=0.5        fixed scroll progress (0..1)
//   &bhtier=ultra|high|medium|low    force a quality tier
//   &still                           reduced-motion still
//   &nohud                           hide the slider (for screenshots)
//   &set=smear:0,iris:0              override fields of the frame, to isolate an effect
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import BlackHoleScene from '../src/blackhole/BlackHoleScene'

const params = new URLSearchParams(location.search)
const overrides = Object.fromEntries(
  (params.get('set') ?? '')
    .split(',')
    .filter(Boolean)
    .map((pair) => pair.split(':'))
    .map(([k, v]) => [k, Number(v)]),
)

function Page() {
  const [p, setP] = useState(() => Number(params.get('p') ?? 0))
  const progress = useRef(p)
  progress.current = p
  const [status, setStatus] = useState('starting')
  const [info, setInfo] = useState('')

  useEffect(() => {
    const id = window.setInterval(() => {
      const c = document.querySelector('canvas')
      if (c) setInfo(`${c.dataset.bhTier} · ${c.dataset.bhFps} fps · ${c.width}×${c.height} · ${c.dataset.bhGpu}`)
    }, 500)
    return () => window.clearInterval(id)
  }, [])

  return (
    <>
      <BlackHoleScene
        progress={() => progress.current}
        still={params.has('still')}
        tweak={(f) => ({ ...f, ...overrides })}
        onLive={() => setStatus('live')}
        onFail={() => setStatus('failed')}
      />
      {!params.has('nohud') && (
        <div className="hud">
          <div>
            p <input type="range" min={0} max={1} step={0.001} value={p} onChange={(e) => setP(Number(e.target.value))} /> {p.toFixed(3)}
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
