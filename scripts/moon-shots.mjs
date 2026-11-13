// Screenshots of the moon (the contact section), on the real GPU.
//
//   node scripts/moon-shots.mjs [--url http://localhost:5173] [--mode dev|site] [--p 0.05,0.3,1]
//     [--sizes 1440x900,390x844@2] [--out screenshots/moon] [--name shot] [--tier ultra]
//     [--query "yaw=1.6&tilt=0.2"]   extra query string (dev: see dev/moon.tsx; site: e.g. nogl)
//     [--do hover:email]             something to do before the picture is taken, at each position:
//                                      hover:<pin>   put the mouse on a pin
//                                      tap:<pin>     tap or click a pin
//                                      tab:<n>       press Tab n times
//                                      drag:<dx>,<dy>   drag the view by that many pixels and let go
//                                      hold:<dx>,<dy>   the same, but shoot with the button still down
//     [--wait 900]                   milliseconds to let things settle after that (default 900)
//     [--outline]                    draw the owner's outline points (cream) and the limb the camera was solved for (blue)
//                                    over the picture, and print how far apart they are
//     [--axe]                        also run an accessibility scan at each position, after --do, and print what it finds
//     [--perf]                       dev mode: no pictures; times every frame while the camera runs its whole path
//                                    and then while the moon is dragged back and forth, and prints the frame rates.
//                                    --tier takes a list here: --tier ultra,high,medium,low
//     [--reduced-motion] [--software] [--desktop] [--frames 40]
//
// dev   loads /dev/moon.html?p=… (the scene and its overlay on their own)
// site  loads the real page and scrolls the pinned contact section to each progress
//       (values above 1 carry on past it, in viewport heights: 1.2 is the very end of the page)
// --sizes  WIDTHxHEIGHT, with an optional @deviceScaleFactor. Narrow sizes
//          emulate a phone (touch, coarse pointer) unless --desktop is given.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { ALIEN_HEIGHT } from '../src/moon/config.ts'
import { OUTLINE, framing, limbHeight, radiusFor } from '../src/moon/timeline.ts'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return fallback
  const next = args[i + 1]
  return next === undefined || next.startsWith('--') ? true : next
}

const url = String(flag('url', 'http://localhost:5173')).replace(/\/$/, '')
const mode = flag('mode', 'dev')
const ps = String(flag('p', '0.05,0.3,1')).split(',').map(Number)
const sizes = String(flag('sizes', '1440x900,390x844@2')).split(',')
const out = flag('out', 'screenshots/moon')
const name = flag('name', 'shot')
const tier = flag('tier', null)
const query = flag('query', null)
const action = flag('do', null)
const wait = Number(flag('wait', 900))
const frames = Number(flag('frames', 40))
const reduced = flag('reduced-motion', false) === true
const software = flag('software', false) === true
const desktop = flag('desktop', false) === true
const axe = flag('axe', false) === true
const perf = flag('perf', false) === true
const outline = flag('outline', false) === true

mkdirSync(out, { recursive: true })

const gpuArgs = software
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu']
const browser = await chromium.launch({ args: gpuArgs })

/**
 * The limb the settled camera was solved for on a screen of this size, as
 * pixel points across it, and how far the owner's outline points are from it.
 */
function limbFor(width, height) {
  const aspect = width / height
  const f = framing(aspect, radiusFor(aspect, ALIEN_HEIGHT), ALIEN_HEIGHT)
  const t = Math.tan((f.fov * Math.PI) / 360)
  const curve = []
  for (let i = -8; i <= 408; i++) {
    const y = limbHeight(((i / 400) * 2 - 1) * aspect * t, f.alpha, f.beta)
    if (y !== null) curve.push([(i / 400) * width, (0.5 - y / t / 2) * height])
  }
  const gaps = OUTLINE.map(([px, py]) => {
    let best = Infinity
    for (let i = 1; i < curve.length; i++) {
      const [x1, y1] = curve[i - 1]
      const dx = curve[i][0] - x1
      const dy = curve[i][1] - y1
      const u = Math.min(1, Math.max(0, ((px * width - x1) * dx + (py * height - y1) * dy) / (dx * dx + dy * dy)))
      best = Math.min(best, Math.hypot(px * width - x1 - u * dx, py * height - y1 - u * dy))
    }
    return best
  })
  return { curve, gaps }
}

/** Where a pin's head is on screen: the middle of the pointer target the overlay keeps over it. */
const spot = (page, id) =>
  page.evaluate((id) => {
    const r = document.querySelector(`.moon-card[data-pin="${id}"]`).parentElement.querySelector('.moon-pin-hit').getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, id)

/** Frame times collected in the page between start() and stop(): how many, the mean rate, and how many ran long. */
const report = (times) => {
  const n = times.length
  const mean = times.reduce((a, b) => a + b, 0) / Math.max(1, n)
  const sorted = [...times].sort((a, b) => a - b)
  const slow = times.filter((t) => t > 20).length
  return `${n} frames, ${(1000 / mean).toFixed(1)} fps mean, 1% low ${(1000 / sorted[Math.floor(n * 0.99)]).toFixed(0)} fps, ${((slow / Math.max(1, n)) * 100).toFixed(1)}% over 20ms, worst ${sorted[n - 1]?.toFixed(0)}ms`
}

if (perf) {
  for (const size of sizes) {
    const [dims, dsf = '1'] = size.split('@')
    const [width, height] = dims.split('x').map(Number)
    const phone = width < 768 && !desktop
    for (const t of String(tier ?? 'ultra').split(',')) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: Number(dsf), hasTouch: phone, isMobile: phone })
      const page = await context.newPage()
      await page.goto(`${url}/dev/moon.html?p=0&nohud=1&bhtier=${t}${query ? `&${query}` : ''}`, { waitUntil: 'load' })
      await page.waitForSelector('#stage[data-stage-state="ready"]', { timeout: 90000 })
      await page.waitForTimeout(1500)
      await page.evaluate(() => {
        window.frameTimes = []
        window.timing = false
        let last = 0
        const tick = (now) => {
          if (window.timing && last) window.frameTimes.push(now - last)
          last = now
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      const start = () => page.evaluate(() => ((window.frameTimes = []), (window.timing = true)))
      const stop = () => page.evaluate(() => ((window.timing = false), window.frameTimes))

      // The whole camera path, there and back, as a scroll would drive it: eight seconds each way
      await start()
      await page.evaluate(
        () =>
          new Promise((done) => {
            const began = performance.now()
            const step = (now) => {
              const t = (now - began) / 8000
              window.moon.progress = t < 1 ? t : Math.max(0, 2 - t)
              if (t < 2) requestAnimationFrame(step)
              else done()
            }
            requestAnimationFrame(step)
          }),
      )
      const travel = await stop()

      // Dragging: the settled moon, thrown back and forth for six seconds
      await page.evaluate(() => (window.moon.progress = 1))
      await page.waitForTimeout(800)
      await start()
      const from = { x: width * 0.52, y: height * 0.62 }
      for (let i = 0; i < 6; i++) {
        const dir = i % 2 ? -1 : 1
        await page.mouse.move(from.x - dir * width * 0.12, from.y)
        await page.mouse.down()
        await page.mouse.move(from.x + dir * width * 0.12, from.y - 30, { steps: 30 })
        await page.mouse.up()
        await page.waitForTimeout(450)
      }
      const dragging = await stop()
      const info = await page.evaluate(() => {
        const c = document.getElementById('stage')
        return `${c.width}x${c.height}, ${c.dataset.statMaps} maps, ${c.dataset.statTriangles} triangles`
      })
      console.log(`${width}x${height}@${dsf} ${t} (${info})
  travel:   ${report(travel)}
  dragging: ${report(dragging)}`)
      await context.close()
    }
  }
  await browser.close()
  process.exit(0)
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

  if (mode === 'site') {
    const q = [tier && `bhtier=${tier}`, query].filter(Boolean).join('&')
    await page.goto(`${url}/${q ? `?${q}` : ''}`, { waitUntil: 'load' })
    await page.waitForTimeout(1500)
  }

  for (const p of ps) {
    if (mode === 'site') {
      await page.evaluate((p) => {
        const el = document.querySelector('#contact')
        const top = el.getBoundingClientRect().top + window.scrollY
        const pin = el.querySelector('[data-moon-pin]')?.offsetHeight ?? window.innerHeight
        const span = el.offsetHeight - pin
        window.scrollTo({ top: p > 1 ? top + span + pin * (p - 1) : top + span * p, behavior: 'instant' })
      }, p)
      await page.waitForSelector('canvas[data-stage][data-stage-active="moon"]', { timeout: 60000 }).catch(() => console.log(`[${tag}] the moon never took the stage`))
      await page.waitForTimeout(900)
    } else {
      const q = new URLSearchParams({ p: String(p), nohud: '1' })
      if (tier) q.set('bhtier', tier)
      if (reduced) q.set('still', '1')
      await page.goto(`${url}/dev/moon.html?${q}${query ? `&${query}` : ''}`, { waitUntil: 'load' })
      await page.waitForSelector('#stage[data-stage-state="ready"], #stage[data-stage-state="failed"]', { timeout: 60000 }).catch(() => console.log(`[${tag}] the scene never came up`))
      await page.waitForFunction((n) => Number(document.getElementById('stage').dataset.stageFrames ?? 0) >= n, frames, { timeout: 20000 }).catch(() => {})
    }

    if (action) {
      const [verb, arg = ''] = String(action).split(':')
      if (verb === 'hover' || verb === 'tap') {
        const at = await spot(page, arg)
        if (verb === 'hover') await page.mouse.move(at.x, at.y, { steps: 8 })
        else if (phone) await page.touchscreen.tap(at.x, at.y)
        else await page.mouse.click(at.x, at.y)
      } else if (verb === 'tab') {
        for (let i = 0; i < Number(arg || 1); i++) await page.keyboard.press('Tab')
      } else if (verb === 'drag' || verb === 'hold') {
        const [dx, dy] = arg.split(',').map(Number)
        // From a point on the moon's lower half, clear of where the pins first stand
        const from = { x: width * 0.52, y: height * 0.62 }
        await page.mouse.move(from.x, from.y)
        await page.mouse.down()
        await page.mouse.move(from.x + dx, from.y + (dy || 0), { steps: 24 })
        if (verb === 'drag') await page.mouse.up()
      }
    }
    await page.waitForTimeout(wait)

    if (outline) {
      const { curve, gaps } = limbFor(width, height)
      await page.evaluate(
        ([points, line, w, h]) => {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
          svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
          svg.setAttribute('style', 'position:fixed;inset:0;width:100%;height:100%;z-index:99;pointer-events:none')
          svg.innerHTML =
            `<polyline points="${line.map((q) => q.join(',')).join(' ')}" fill="none" stroke="#6cf" stroke-width="1.5"/>` +
            points.map(([x, y]) => `<circle cx="${x * w}" cy="${y * h}" r="7" fill="none" stroke="#ffedc1" stroke-width="2.5"/>`).join('')
          document.body.append(svg)
        },
        [OUTLINE, curve, width, height],
      )
      console.log(`  outline at ${width}x${height}: worst ${Math.max(...gaps).toFixed(1)}px, each ${gaps.map((g) => g.toFixed(0)).join(' ')}`)
    }

    const file = path.join(out, `${name}-${tag}-p${String(p).replace('.', '_')}.png`)
    await page.screenshot({ path: file })
    const info = await page.evaluate(() => {
      const c = document.querySelector('#stage, canvas[data-stage]')
      return {
        state: c?.dataset.stageState ?? c?.dataset.stageActive ?? 'none',
        tier: c?.dataset.stageTier,
        fps: c?.dataset.stageFps,
        canvas: c ? `${c.width}x${c.height}` : 'none',
        gpu: c?.dataset.stageGpu?.replace(/^ANGLE \((.*)\)$/, '$1').slice(0, 50),
        pins: c?.dataset.statPins,
        open: document.querySelector('.moon-pin[data-open="true"] .moon-card')?.dataset.pin ?? null,
      }
    })
    console.log(file, JSON.stringify(info))

    if (axe) {
      const { AxeBuilder } = await import('@axe-core/playwright')
      const results = await new AxeBuilder({ page }).analyze()
      console.log(`  axe: ${results.violations.length} violations`)
      for (const v of results.violations) {
        console.log(`  - [${v.impact}] ${v.id}: ${v.help}`)
        for (const n of v.nodes.slice(0, 4)) console.log(`      ${n.target.join(' ')} :: ${n.failureSummary?.split('\n')[1] ?? ''}`)
      }
    }
  }
  await context.close()
}
await browser.close()
