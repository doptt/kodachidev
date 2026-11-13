// Takes screenshots of the running site with Playwright's Chromium.
//
//   node scripts/screenshots.mjs [--url http://localhost:5173] [--widths 1440,375]
//     [--scroll 0,900,#work] [--out screenshots] [--name hero] [--wait 1500]
//     [--full] [--reduced-motion] [--mouse 0.3,0.4] [--gpu]
//
// --scroll takes pixel offsets, #ids or "end" (the bottom of the page), one screenshot each.
// --gpu uses the real GPU instead of software rendering, so the black hole and the lensed sky run.
// --mouse moves the pointer to a fraction of the viewport before the shot.
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

const url = flag('url', 'http://localhost:5173')
const widths = String(flag('widths', '1440,375')).split(',').map(Number)
const scrolls = String(flag('scroll', '0')).split(',')
const out = flag('out', 'screenshots')
const name = flag('name', 'shot')
const wait = Number(flag('wait', 1500))
const full = flag('full', false) === true
const reduced = flag('reduced-motion', false) === true
const mouse = flag('mouse', null)
const gpu = flag('gpu', false) === true

mkdirSync(out, { recursive: true })

// SwiftShader gives headless Chromium working WebGL
const browser = await chromium.launch({
  args: gpu
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

for (const width of widths) {
  const phone = width < 768
  const context = await browser.newContext({
    viewport: { width, height: phone ? 812 : 900 },
    deviceScaleFactor: phone ? 2 : 1,
    hasTouch: phone,
    isMobile: phone,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  })
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') console.log(`[${width}] console.${msg.type()}: ${msg.text()}`)
  })
  page.on('pageerror', (err) => console.log(`[${width}] pageerror: ${err.message}`))

  await page.goto(url, { waitUntil: 'networkidle' })
  for (const s of scrolls) {
    if (s === 'end') {
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
    } else if (s.startsWith('#')) {
      await page.evaluate((id) => document.querySelector(id)?.scrollIntoView({ block: 'start', behavior: 'instant' }), s)
    } else {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Number(s))
    }
    if (mouse && !phone) {
      const [mx, my] = String(mouse).split(',').map(Number)
      await page.mouse.move(width * mx, 900 * my, { steps: 8 })
    }
    await page.waitForTimeout(wait)
    const file = path.join(out, `${name}-${width}-${s.replace('#', '')}.png`)
    await page.screenshot({ path: file, fullPage: full })
    console.log(file)
  }
  await context.close()
}
await browser.close()
