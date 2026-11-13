// Screenshots of the alien actor in its harness (dev/alien.html), on the real GPU.
//
//   node scripts/alien-shots.mjs [--url http://localhost:5173] [--out screenshots/alien]
//     [--set props|alien|all]      which of the named lists below to shoot (default all)
//     [--q "cam=face&t=6&sip=1.3" --label mid-sip]   or one shot from a query string of your own
//     [--size 1440x900] [--tier ultra] [--frames 20] [--extra "sun=120,30"] [--software]
//
// Every shot holds time still (t=…), so the same command gives the same picture.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return fallback
  const next = args[i + 1]
  return next === undefined || next.startsWith('--') ? true : next
}

const url = String(flag('url', 'http://localhost:5173')).replace(/\/$/, '')
const out = flag('out', 'screenshots/alien')
const set = flag('set', 'all')
const [width, height] = String(flag('size', '1440x900')).split('x').map(Number)
const tier = flag('tier', null)
const frames = Number(flag('frames', 20))
const extra = flag('extra', null)
const software = flag('software', false) === true

/** label → query string. */
const PROPS = {
  'chair-3q': 'only=chair&t=0',
  'chair-back': 'only=chair&cam=chair-back&t=0',
  'chair-top': 'only=chair&cam=chair-top&t=0',
  'chair-weave': 'only=chair&cam=weave&t=0',
  'beer-side': 'only=beer&t=0',
  'beer-top': 'only=beer&cam=beer-top&t=0',
  cooler: 'only=cooler&t=0',
}
const ALIEN = {
  'set-ref': 'cam=ref&t=4&nolook',
  'set-owner': 'cam=owner&t=4&nolook',
  'set-front': 'cam=front&t=4&nolook',
  'set-3q': 'cam=3q&t=4&nolook',
  'set-side': 'cam=side&t=4&nolook',
  'set-left': 'cam=left&t=4&nolook',
  'set-back': 'cam=back&t=4&nolook',
  'set-above': 'cam=above&t=4&nolook',
  face: 'cam=face&t=4&nolook',
  hand: 'cam=hand&t=4&nolook',
  'hand-front': 'cam=hand-front&t=4&nolook',
  'sip-raise': 'cam=ref&t=4&nolook&sip=0.6',
  'sip-mid': 'cam=ref&t=4&nolook&sip=1.7',
  'sip-mid-face': 'cam=face&t=4&nolook&sip=1.7',
  'sip-lower': 'cam=ref&t=4&nolook&sip=2.7',
  'sip-exhale': 'cam=face&t=4&nolook&sip=3.15',
  'blink-mid': 'cam=face&t=4&nolook&blink=0.09',
  'look-far-left': 'cam=front&t=4&look=6,1,0.5',
  'look-far-right': 'cam=front&t=4&look=-6,1,0.5',
  'look-up': 'cam=front&t=4&look=0,6,1',
  'look-behind': 'cam=front&t=4&look=0.5,1,-6',
  'beat-look-up': 'cam=ref&t=4&nolook&beat=lookUp:1.8',
  'beat-shift': 'cam=ref&t=4&nolook&beat=shift:0.9',
  'dust-puff': 'cam=ref&t=0&nolook&puff=0.2',
  'dust-puff-late': 'cam=ref&t=0&nolook&puff=0.6',
  still: 'cam=ref&still&t=2',
  'idle-seam-start': 'cam=ref&t=1&nolook&clip=idle:0',
  'idle-seam-end': 'cam=ref&t=1&nolook&clip=idle:end',
}

const single = flag('q', null)
const shots = single ? { [String(flag('label', 'shot'))]: String(single) } : { ...(set === 'alien' ? {} : PROPS), ...(set === 'props' ? {} : ALIEN) }

mkdirSync(out, { recursive: true })
const gpuArgs = software
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu']
const browser = await chromium.launch({ args: gpuArgs })
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
const page = await context.newPage()
let label = ''
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[${label}] console.${m.type()}: ${m.text()}`)
})
page.on('pageerror', (e) => console.log(`[${label}] pageerror: ${e.message}`))

for (const [name, query] of Object.entries(shots)) {
  label = name
  const q = new URLSearchParams(query)
  q.set('nohud', '1')
  if (tier) q.set('bhtier', tier)
  if (extra) for (const [k, v] of new URLSearchParams(extra)) q.set(k, v)
  await page.goto(`${url}/dev/alien.html?${q}`, { waitUntil: 'load' })
  const ok = await page
    .waitForFunction((n) => Number(document.querySelector('canvas')?.dataset.stageFrames ?? 0) >= n, frames, { timeout: 30000 })
    .then(() => true)
    .catch(() => false)
  await page.waitForTimeout(150)
  const file = path.join(out, `${name}.png`)
  await page.screenshot({ path: file })
  const info = await page.evaluate(() => ({ ...document.querySelector('canvas').dataset }))
  console.log(file, ok ? '' : 'TIMED OUT', JSON.stringify(info))
}
await browser.close()
