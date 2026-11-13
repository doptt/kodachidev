// Isolated harness for the alien actor (the alien, his chair, his beer, the cooler and the water bottles).
//
//   /dev/alien.html                    live: he animates, looks at the pointer, drag to orbit
//   &cam=ref|owner|front|3q|side|left|back|above|face|hand   a named camera angle (ref: as the reference picture)
//   &cam=x,y,z,tx,ty,tz[,fov]          or any camera: position, then target
//   &only=chair|beer|cooler|alien     one part by itself (cam defaults to a view of it;
//                                      also cam=chair-back|chair-top|weave|beer-top)
//   &t=12                              run 12 s before the first frame, then hold time still
//   &sip=1.4                           (with t) start a sip and hold 1.4 s into it
//   &blink=0.08                        (with t) start a blink and hold 0.08 s into it
//   &beat=lookUp:1.2                   (with t) start an ambient beat and hold 1.2 s into it
//   &clip=idle:3.9                     (with t) hold one clip alone at that time (for checking loop seams)
//   &look=x,y,z   &glance=x,y,z        fixed points to look or glance at, in world space
//   &nolook                            leave his head to the animation
//   &reveal=0.3                        hold the reveal at a value; &puff=0.4 (with t) fires the dust and holds 0.4 s in
//   &still                             reduced motion: the held pose
//   &nomodel                           as if the model had failed to load: the set, and an empty chair
//   &sun=-28,17 &sunlight=6 &fill=0.22 &exposure=1 &shadows=0   the stand-in lighting
//   &bhtier=ultra|high|medium|low      force a quality tier
//   &nohud                             hide the readout (for screenshots)
import { alienHarness } from '../src/alien/harness/scene'
import { runStandalone } from '../src/stage/standalone'

const params = new URLSearchParams(location.search)
const canvas = document.getElementById('stage') as HTMLCanvasElement
const harness = alienHarness(params)
runStandalone(canvas, harness.factory, { still: params.has('still') })

if (!params.has('nohud')) {
  const hud = document.createElement('div')
  hud.className = 'hud'
  const buttons = document.createElement('div')
  const readout = document.createElement('div')
  hud.append(buttons, readout)
  document.body.append(hud)

  const button = (label: string, run: () => void) => {
    const b = document.createElement('button')
    b.textContent = label
    b.addEventListener('click', run)
    buttons.append(b)
  }
  for (const name of ['ref', 'owner', 'front', '3q', 'side', 'above', 'face', 'hand']) button(name, () => harness.controls()?.setCamera(name))
  for (const action of ['sip', 'blink', 'lookUp', 'shift', 'puff']) button(action, () => harness.controls()?.actor.debug.trigger?.(action))

  window.setInterval(() => {
    const d = canvas.dataset
    const stats = Object.entries(d)
      .filter(([key]) => key.startsWith('stat'))
      .map(([key, value]) => `${key.slice(4).toLowerCase()} ${value}`)
      .join(' · ')
    readout.textContent = `${d.stageState} · ${d.stageTier} · ${d.stageFps ?? '-'} fps · ${canvas.width}×${canvas.height} · ${stats}`
  }, 400)
}
