// Screenshots of a GLB in the neutral model viewer (dev/model-viewer.html), on the real GPU.
//
//   node scripts/model-shots.mjs --src models/alien.glb
//     [--url http://localhost:5173] [--out screenshots/assets] [--name alien]
//     [--views front,three,left]     named views (front, back, left, right, three, top) or az:el pairs such as 35:12
//     [--focus all|head|hands|feet]  the part of the model to frame
//     [--clip idle --t 0,1.5,3]      pose at these seconds into a clip (default: the bind pose)
//     [--size 900x1200] [--ortho] [--unlit] [--wire] [--bones] [--bg 8a8d91] [--software]
//     [--manifest models/alien.json] draw that manifest's eye and antenna measurements over the model
//     [--query "turn=Head:10,0,0&fit=pose"]   extra query string passed to the viewer (see dev/model-viewer.ts)
//
// --src is a path the dev server serves: anything under public/ (as models/…) or a repo path (as assets-src/raw/…).
// Prints the facts the viewer read from the file (triangles, textures, clips, bones) as JSON on the first shot.
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
// Git Bash rewrites an argument with a leading slash into a Windows path, so the slash is optional
const srcArg = String(flag('src', 'models/alien.glb'))
const src = /^(\/|https?:)/.test(srcArg) ? srcArg : `/${srcArg}`
const out = String(flag('out', 'screenshots/assets'))
const name = String(flag('name', path.basename(src).replace(/\.[^.]+$/, '')))
const views = String(flag('views', 'front,three,left')).split(',')
const focus = String(flag('focus', 'all'))
const clip = flag('clip', null)
const times = String(flag('t', '0')).split(',').map(Number)
const [width, height] = String(flag('size', '900x1200')).split('x').map(Number)
const software = flag('software', false) === true
const extra = flag('query', null)

mkdirSync(out, { recursive: true })

const gpuArgs = software
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu']
const browser = await chromium.launch({ args: gpuArgs })
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
page.on('pageerror', (error) => console.error('page error:', error.message))
page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') console.error(`page ${message.type()}:`, message.text())
})

let printed = false
let failed = false
for (const view of views) {
  for (const t of clip ? times : [0]) {
    const query = new URLSearchParams({ src, focus })
    if (view.includes(':')) {
      const [az, el] = view.split(':')
      query.set('az', az)
      query.set('el', el)
    } else {
      query.set('view', view)
    }
    if (clip) {
      query.set('clip', String(clip))
      query.set('t', String(t))
    }
    for (const toggle of ['ortho', 'unlit', 'wire', 'bones']) if (flag(toggle, false) === true) query.set(toggle, '1')
    const bg = flag('bg', null)
    if (bg) query.set('bg', String(bg))
    const manifest = flag('manifest', null)
    if (manifest) query.set('manifest', `/${String(manifest).replace(/^\//, '')}`)

    await page.goto(`${url}/dev/model-viewer.html?${query}${extra ? `&${extra}` : ''}`)
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.ready !== undefined, null, { timeout: 60000 })
    // A beat for the compositor to present the settled frame
    await page.waitForTimeout(250)

    const facts = await page.evaluate(() => window.__model)
    if (facts?.error) {
      console.error(`could not load ${src}: ${facts.error}`)
      failed = true
      break
    }
    if (!printed) {
      console.log(JSON.stringify(facts, null, 2))
      printed = true
    }
    // Clip names from exporters carry characters a Windows file name cannot ("Armature|Idle|baselayer")
    const label = [name, view.replace(':', '_'), focus === 'all' ? null : focus, clip ? `${clip}_${t}` : null]
      .filter(Boolean)
      .join('-')
      .replace(/[^\w.-]+/g, '_')
    const file = path.join(out, `${label}.png`)
    await page.screenshot({ path: file })
    console.log(file)
  }
  if (failed) break
}

await browser.close()
if (failed) process.exit(1)
