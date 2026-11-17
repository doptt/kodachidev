// The move from one project to the next on the real page, as it is seen: scrolls the lensed sky to a
// project, turns the wheel past its hold, and takes stills while the sky glides on. Also reports the
// frame times of the move.
//
//   node scripts/lens-motion.mjs [--url http://localhost:5173] [--from 0] [--size 1440x900]
//     [--out screenshots/lens-motion] [--shots 14] [--back]
//
// --from   the project to start on (0 is the first)
// --back   turn the wheel the other way, from the next project back to this one
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
const from = Number(flag('from', 0))
const [width, height] = String(flag('size', '1440x900')).split('x').map(Number)
const out = flag('out', 'screenshots/lens-motion')
const shots = Number(flag('shots', 14))
const back = flag('back', false) === true
mkdirSync(out, { recursive: true })

// These match src/lens/timeline.ts
const INTRO = 0.8
const PER_PROJECT = 1.0
const HOLD = 0.6

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const page = await browser.newPage({ viewport: { width, height } })
await page.goto(url, { waitUntil: 'load' })
await page.waitForSelector('[data-lens-stage]', { state: 'attached' })
await page.waitForTimeout(2500)

// Just short of where the sky sets off (or just past it, to come back)
const within = back ? HOLD + 0.06 : HOLD - 0.06
await page.evaluate(
  ([screens]) => {
    const section = document.querySelector('[data-lens-stage]')
    const top = section.getBoundingClientRect().top + window.scrollY
    window.scrollTo({ top: top + screens * window.innerHeight, behavior: 'instant' })
  },
  [INTRO + (from + within) * PER_PROJECT],
)
// Long enough for the scene to load, come up and settle
await page.waitForTimeout(6000)
await page.screenshot({ path: path.join(out, 'move-00.png') })

await page.evaluate(() => {
  window.__frames = []
  let last = performance.now()
  const tick = (now) => {
    window.__frames.push(now - last)
    last = now
    window.__raf = requestAnimationFrame(tick)
  }
  window.__raf = requestAnimationFrame(tick)
})

await page.mouse.move(width / 2, height / 2)
const began = Date.now()
// Two notches of a wheel, as a hand would give them
await page.mouse.wheel(0, back ? -100 : 100)
await page.waitForTimeout(90)
await page.mouse.wheel(0, back ? -100 : 100)
const times = []
for (let i = 1; i <= shots; i++) {
  await page.screenshot({ path: path.join(out, `move-${String(i).padStart(2, '0')}.png`) })
  times.push(Date.now() - began)
  await page.waitForTimeout(40)
}
await page.waitForTimeout(1500)
await page.screenshot({ path: path.join(out, `move-${String(shots + 1).padStart(2, '0')}.png`) })

const frames = await page.evaluate(() => {
  cancelAnimationFrame(window.__raf)
  return window.__frames
})
const sorted = [...frames].sort((a, b) => a - b)
console.log(
  JSON.stringify({
    stillsAtMs: times,
    frames: frames.length,
    medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(1),
    worstMs: +sorted[sorted.length - 1].toFixed(1),
    over20ms: frames.filter((f) => f > 20).length,
  }),
)
await browser.close()
