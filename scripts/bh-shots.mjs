// Screenshots of the black hole scene, rendered on the real GPU where there is one.
//
//   node scripts/bh-shots.mjs [--url http://localhost:5173] [--mode dev|site]
//     [--p 0,0.25,0.5,0.75,1] [--sizes 1440x900,390x844@2] [--out screenshots/bh]
//     [--name shot] [--tier ultra] [--frames 48] [--software] [--reduced-motion] [--back]
//     [--query nogl]   extra query string for site mode (nogl shows the still-image fallback)
//
// dev   loads /dev/blackhole.html?p=… (the isolated scene)
// site  loads the real page and scrolls the pinned Work intro to each progress
//       (values below 0 or above 1 step outside it, in viewport heights)
// --back   (site mode) after the last position, scrolls back to the top and shoots again
// --sizes  WIDTHxHEIGHT, with an optional @deviceScaleFactor
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
const mode = flag('mode', 'dev')
const ps = String(flag('p', '0,0.25,0.5,0.75,1')).split(',').map(Number)
const sizes = String(flag('sizes', '1440x900,390x844@2')).split(',')
const out = flag('out', 'screenshots/bh')
const name = flag('name', 'shot')
const tier = flag('tier', null)
const frames = Number(flag('frames', 48))
const software = flag('software', false) === true
const reduced = flag('reduced-motion', false) === true
const back = flag('back', false) === true
// Narrow sizes emulate a phone (touch, coarse pointer) unless --desktop is given
const desktop = flag('desktop', false) === true
// dev mode: frame overrides, e.g. --set smear:0,iris:0
const set = flag('set', null)
const query = flag('query', null)

mkdirSync(out, { recursive: true })

const gpuArgs = software
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu']
const browser = await chromium.launch({ args: gpuArgs })

/** Waits until the canvas has accumulated enough frames to be settled (or the scene has gone black / fallen back). */
async function settle(page) {
  const start = Date.now()
  await page
    .waitForFunction(
      (n) => {
        const c = document.querySelector('canvas[data-bh-tier]')
        return !c || Number(c.dataset.bhFrames ?? 0) >= n
      },
      frames,
      { timeout: 20000 },
    )
    .catch(() => {})
  // A beat for the compositor to present the last frame
  await page.waitForTimeout(Math.max(250, 700 - (Date.now() - start)))
}

for (const size of sizes) {
  const [dims, dsf = '1'] = size.split('@')
  const [width, height] = dims.split('x').map(Number)
  const phone = width < 768 && !desktop
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: Number(dsf),
    hasTouch: phone,
    isMobile: phone,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  })
  const page = await context.newPage()
  const tag = `${width}x${height}`
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[${tag}] console.${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => console.log(`[${tag}] pageerror: ${e.message}`))

  const shoot = async (label) => {
    await settle(page)
    const file = path.join(out, `${name}-${tag}-${label}.png`)
    await page.screenshot({ path: file })
    const info = await page.evaluate(() => {
      const c = document.querySelector('canvas[data-bh-tier]')
      const root = getComputedStyle(document.querySelector('header[data-bh-vars]') ?? document.documentElement)
      const mode = document.querySelector('[data-bh-stage]')?.dataset.bhMode
      return {
        mode,
        tier: c?.dataset.bhTier,
        fps: c?.dataset.bhFps,
        canvas: c ? `${c.width}x${c.height}` : 'none',
        gpu: c?.dataset.bhGpu?.replace(/^ANGLE \((.*)\)$/, '$1').slice(0, 60),
        theme: root.getPropertyValue('--bh-theme').trim(),
        dim: root.getPropertyValue('--bh-dim').trim(),
        entered: document.documentElement.dataset.bhEntered,
      }
    })
    console.log(file, JSON.stringify(info))
  }

  if (mode === 'dev') {
    for (const p of ps) {
      const q = new URLSearchParams({ p: String(p), nohud: '1' })
      if (tier) q.set('bhtier', tier)
      if (reduced) q.set('still', '1')
      if (set) q.set('set', set)
      await page.goto(`${url}/dev/blackhole.html?${q}`, { waitUntil: 'networkidle' })
      await shoot(`p${String(p).replace('.', '_')}`)
    }
  } else {
    const qs = [tier && `bhtier=${tier}`, query].filter(Boolean).join('&')
    await page.goto(`${url}/${qs ? `?${qs}` : ''}`, { waitUntil: 'networkidle' })
    const scrollTo = async (p) => {
      await page.evaluate((p) => {
        const el = document.querySelector('[data-bh-stage]')
        const top = el.getBoundingClientRect().top + window.scrollY
        const stage = el.firstElementChild.offsetHeight
        const span = el.offsetHeight - stage
        // Below 0 and above 1 are in viewport heights: -0.5 is the section half scrolled in, 1.5 half scrolled out
        const y = p < 0 ? top + stage * p : p > 1 ? top + span + stage * (p - 1) : top + span * p
        window.scrollTo({ top: y, behavior: 'instant' })
      }, p)
      // Let the smoothed progress catch up with the scroll position
      await page.waitForTimeout(1600)
    }
    for (const p of ps) {
      await scrollTo(p)
      await shoot(`p${String(p).replace('.', '_')}`)
    }
    if (back) {
      await scrollTo(0)
      await shoot('back-p0')
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      await page.waitForTimeout(1600)
      await shoot('back-top')
    }
  }
  await context.close()
}
await browser.close()
