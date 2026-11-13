// Isolated harness for the moon (the contact section): the same scene and the
// same overlay as the site, on a canvas of its own, with scroll replaced by a
// slider.
//
//   /dev/moon.html?p=1               fixed scroll progress (0..1; the view settles at about 0.6)
//   &bhtier=ultra|high|medium|low    force a quality tier
//   &nohud                           hide the slider (for screenshots)
//   &still                           as under reduced motion: nothing moves on its own
//   &yaw=0.3&tilt=0.05               start with the camera swung round and tilted (radians), and no idle sway
//   &pin=email                       open a pin's label and swing the view toward it, as moonControls.focusPin does
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@fontsource-variable/outfit'
import '../src/styles/index.css'
import '../src/moon/moon.css'
import { CONTACT, CONTACT_PINS } from '../src/content/contact'
import { MoonOverlay } from '../src/moon/MoonOverlay'
import { createMoonScene } from '../src/moon/scene'
import { createMoonState } from '../src/moon/state'
import { runStandalone } from '../src/stage/standalone'

const params = new URLSearchParams(location.search)
const state = createMoonState()
state.progress = Number(params.get('p') ?? 1)
if (params.has('yaw') || params.has('tilt')) {
  state.orbit.yaw = Number(params.get('yaw') ?? 0)
  state.orbit.tilt = Number(params.get('tilt') ?? 0)
  // Never idle long enough to start swaying
  state.orbit.idle = -Infinity
}
// For poking at from the console and from the screenshot scripts
Object.assign(window, { moon: state })

const canvas = document.getElementById('stage') as HTMLCanvasElement
let failed = false
runStandalone(canvas, createMoonScene({ state, pins: CONTACT_PINS }), { still: params.has('still'), onFail: () => (failed = true) })

function Page() {
  const [p, setP] = useState(state.progress)
  const [live, setLive] = useState(false)
  const [info, setInfo] = useState('')

  useEffect(() => {
    const id = window.setInterval(() => {
      const ready = canvas.dataset.stageState === 'ready'
      setLive(ready)
      setInfo(`${failed ? 'failed' : canvas.dataset.stageState} · ${canvas.dataset.stageTier} · ${canvas.dataset.stageFps ?? '-'} fps · ${canvas.width}×${canvas.height} · ${canvas.dataset.statPhase ?? ''} · ${canvas.dataset.statTriangles ?? 0} tris`)
    }, 250)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const pin = params.get('pin')
    if (pin && live) state.open(pin, true)
  }, [live])

  return (
    <>
      <h1 className="moon-sr">{CONTACT.title}</h1>
      <MoonOverlay state={state} pins={CONTACT_PINS} live={live} still={params.has('still')} />
      {!params.has('nohud') && (
        <div className="hud" data-moon-ui>
          <div>
            p{' '}
            <input
              type="range"
              aria-label="Scroll progress"
              min={0}
              max={1}
              step={0.001}
              value={p}
              onChange={(e) => {
                state.progress = Number(e.target.value)
                setP(state.progress)
              }}
            />{' '}
            {p.toFixed(3)}
          </div>
          <div>{info}</div>
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
