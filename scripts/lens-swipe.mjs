// The ring of cards round a project in the lensed sky, turned as a visitor would turn it, on the real
// page: scrolls to a project, then drags, flings, drags past the end, clicks a side card, uses the
// keyboard and a sideways wheel, and on a phone-sized touch screen swipes sideways and scrolls up and
// down from the picture. Takes stills along the way, says which card ended in the middle after each
// (and whether that is what should have happened), and reports the frame times of the drags.
//
//   node scripts/lens-swipe.mjs [--url http://localhost:5173] [--project 0] [--out screenshots/lens-swipe]
//     [--size 1440x900] [--phone 390x844] [--only desktop|phone] [--bare]
//
// --bare     no stills: taking one holds a frame up, so use this when it is the frame times that are wanted
// --project  the project to turn (0 is the first); it needs at least three views
// Exits with code 1 if any check fails or the page logs an error.
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
const project = Number(flag('project', 0))
const out = flag('out', 'screenshots/lens-swipe')
const [width, height] = String(flag('size', '1440x900')).split('x').map(Number)
const [phoneW, phoneH] = String(flag('phone', '390x844')).split('x').map(Number)
const only = flag('only', null)
const bare = flag('bare', false) === true
mkdirSync(out, { recursive: true })

// These match src/lens/timeline.ts
const INTRO = 0.8
const PER_PROJECT = 1.0

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures.push(name)
}
const stats = (frames) => {
  const sorted = [...frames].sort((a, b) => a - b)
  return {
    frames: frames.length,
    medianMs: +(sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(1),
    p95Ms: +(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(1),
    worstMs: +(sorted[sorted.length - 1] ?? 0).toFixed(1),
    over20ms: frames.filter((f) => f > 20).length,
  }
}

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })

async function open(viewport, touch) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 })
  const page = await context.newPage()
  const tag = `${viewport.width}x${viewport.height}`
  page.on('console', (m) => {
    if (m.type() === 'error') {
      console.log(`[${tag}] console.error: ${m.text()}`)
      failures.push(`console error at ${tag}`)
    }
  })
  page.on('pageerror', (e) => {
    console.log(`[${tag}] pageerror: ${e.message}`)
    failures.push(`page error at ${tag}`)
  })
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForSelector('[data-lens-stage]', { state: 'attached' })
  await page.waitForTimeout(2500)
  await page.evaluate(
    ([screens]) => {
      const section = document.querySelector('[data-lens-stage]')
      const top = section.getBoundingClientRect().top + window.scrollY
      window.scrollTo({ top: top + screens * window.innerHeight, behavior: 'instant' })
    },
    [INTRO + (project + 0.15) * PER_PROJECT],
  )
  // Long enough for the scene to load, come up and settle, and for the further views to arrive
  await page.waitForTimeout(6500)
  return { context, page, tag }
}

/** Which card the page says is in the middle of the project that is up, and what it is called. */
const middle = (page) =>
  page.evaluate(() => {
    const dots = [...document.querySelectorAll('.lens-caption.is-shown .lens-dot')]
    const at = dots.findIndex((d) => d.getAttribute('aria-current') === 'true')
    return { card: at, label: document.querySelector('.lens-caption.is-shown .lens-view-name.is-shown')?.textContent ?? '', of: dots.length }
  })
/** The middle of the band that takes the drag: where the picture is. */
const band = (page) =>
  page.evaluate(() => {
    const r = document.querySelector('[data-lens-swipe]').getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom, events: getComputedStyle(document.querySelector('[data-lens-swipe]')).pointerEvents }
  })
const startFrames = (page) =>
  page.evaluate(() => {
    window.__frames = []
    let last = performance.now()
    const tick = (now) => {
      window.__frames.push(now - last)
      last = now
      window.__raf = requestAnimationFrame(tick)
    }
    window.__raf = requestAnimationFrame(tick)
  })
const stopFrames = (page) =>
  page.evaluate(() => {
    cancelAnimationFrame(window.__raf)
    return window.__frames
  })
const shot = (page, tag, name) => (bare ? null : page.screenshot({ path: path.join(out, `${tag}-${name}.png`) }))

// ------------------------------------------------------------------ a mouse ----
if (only !== 'phone') {
  const { context, page, tag } = await open({ width, height }, false)
  const at = await band(page)
  check('the band over the pictures takes the pointer', at.events !== 'none', `from ${at.top.toFixed(0)} to ${at.bottom.toFixed(0)} px`)
  const start = await middle(page)
  check('the project starts on its first picture', start.card === 0 && start.of >= 3, JSON.stringify(start))
  await shot(page, tag, '00-settled')
  const scrollBefore = await page.evaluate(() => window.scrollY)

  /** Drags from x0 to x1 at the picture's height in `steps` moves `gap` ms apart; stills at the named steps. */
  const drag = async (x0, x1, steps, gap, name, stills = []) => {
    await page.mouse.move(x0, at.y)
    await page.mouse.down()
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(x0 + ((x1 - x0) * i) / steps, at.y)
      if (stills.includes(i)) await shot(page, tag, `${name}-held-${String(i).padStart(2, '0')}`)
      if (gap) await page.waitForTimeout(gap)
    }
    await page.mouse.up()
  }
  /** Stills while the ring settles after a release. */
  const settle = async (name, count = 4) => {
    for (let i = 1; i <= count; i++) {
      await page.waitForTimeout(70)
      await shot(page, tag, `${name}-after-${i}`)
    }
    await page.waitForTimeout(1100)
    await shot(page, tag, `${name}-rest`)
  }

  // 1. A slow drag a little way: it springs back
  await startFrames(page)
  await drag(at.x + 100, at.x - 40, 14, 16, '01-short', [14])
  await settle('01-short', 2)
  check('a short drag springs back', (await middle(page)).card === 0)

  // 2. A drag more than half way to the next card, held, then let go: it goes on to it
  await drag(at.x + 260, at.x - 300, 30, 16, '02-drag', [8, 16, 24, 30])
  await settle('02-drag')
  let now = await middle(page)
  check('a drag past half way goes to the next card', now.card === 1, JSON.stringify(now))

  // 3. A fling: short and fast
  await drag(at.x + 90, at.x - 90, 5, 12, '03-fling', [])
  await settle('03-fling')
  now = await middle(page)
  check('a fling goes to the next card', now.card === 2, JSON.stringify(now))
  const dragFrames = await stopFrames(page)

  // 4. Back the other way
  await drag(at.x - 260, at.x + 300, 30, 16, '04-back', [16])
  await settle('04-back', 1)
  now = await middle(page)
  check('dragging right goes back', now.card === 1, JSON.stringify(now))

  // 5. To the last card with the keyboard, then drag on past it: it resists and comes back
  await page.locator('.lens-caption.is-shown .lens-dot[aria-current="true"]').focus()
  await page.keyboard.press('End')
  await page.waitForTimeout(1300)
  now = await middle(page)
  const last = now.of - 1
  check('End goes to the last view', now.card === last, JSON.stringify(now))
  check('focus goes with the view', await page.evaluate(() => document.activeElement?.getAttribute('aria-current') === 'true'))
  await shot(page, tag, '05-last')
  await drag(at.x + 300, at.x - 400, 30, 16, '05-past', [30])
  await settle('05-past', 3)
  check('dragging past the last card springs back to it', (await middle(page)).card === last)

  // 6. The arrow keys, and Home
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(300)
  await shot(page, tag, '06-arrow-moving')
  await page.waitForTimeout(1000)
  check('ArrowLeft goes back a view', (await middle(page)).card === last - 1)
  await page.keyboard.press('Home')
  await page.waitForTimeout(1500)
  check('Home goes to the first picture', (await middle(page)).card === 0)
  await shot(page, tag, '06-focus')

  // 7. The buttons, and a click on the card beside the middle one
  await page.locator('.lens-caption.is-shown button[aria-label^="Next view"]').click()
  await page.waitForTimeout(1300)
  now = await middle(page)
  check('the next button goes on a view', now.card === 1, JSON.stringify(now))
  await page.mouse.click(width - 120, at.y)
  await page.waitForTimeout(1300)
  now = await middle(page)
  check('a click on the card to the right brings it to the middle', now.card === 2, JSON.stringify(now))
  await page.mouse.click(120, at.y)
  await page.waitForTimeout(1300)
  check('a click on the card to the left brings it back', (await middle(page)).card === 1)
  await page.mouse.click(at.x, at.y)
  await page.waitForTimeout(500)
  check('a click on the middle card changes nothing', (await middle(page)).card === 1)

  // 8. A wheel turned sideways turns the ring; turned down it scrolls the page
  check('none of that scrolled the page', Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore) < 2)
  await page.mouse.move(at.x, at.y)
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(110, 0)
    await page.waitForTimeout(30)
  }
  await page.waitForTimeout(1400)
  now = await middle(page)
  check('a wheel turned sideways turns the ring', now.card === 2, JSON.stringify(now))
  check('and does not scroll the page', Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore) < 2)
  await page.mouse.wheel(0, 100)
  await page.waitForTimeout(900)
  check('a wheel turned down over the picture scrolls the page', (await page.evaluate(() => window.scrollY)) - scrollBefore > 40)

  // 9. Scrolled on to the next project, whatever card was in the middle leaves, and this ring goes back to its first picture
  await page.evaluate(
    ([screens]) => {
      const section = document.querySelector('[data-lens-stage]')
      const top = section.getBoundingClientRect().top + window.scrollY
      window.scrollTo({ top: top + screens * window.innerHeight, behavior: 'instant' })
    },
    [INTRO + (project + 0.75) * PER_PROJECT],
  )
  for (let i = 1; i <= 8; i++) {
    await page.waitForTimeout(110)
    await shot(page, tag, `09-move-${i}`)
  }
  await page.waitForTimeout(1500)
  await shot(page, tag, '09-next')
  now = await middle(page)
  check('the next project is on its first picture', now.card === 0, JSON.stringify(now))
  const leftBehind = await page.evaluate((i) => [...document.querySelectorAll('.lens-caption')][i]?.querySelector('.lens-dot[aria-current="true"]')?.getAttribute('aria-label') ?? '', project)
  check('the project left behind has gone back to its first picture', /view 1 of/.test(leftBehind), leftBehind)

  console.log('frames while dragging, flinging and settling:', JSON.stringify(stats(dragFrames)))
  await context.close()
}

// ------------------------------------------------------------------ a finger ----
if (only !== 'desktop') {
  const { context, page, tag } = await open({ width: phoneW, height: phoneH }, true)
  const cdp = await context.newCDPSession(page)
  const at = await band(page)
  await shot(page, tag, '00-settled')
  /** One finger from (x0, y0) to (x1, y1) in `steps` moves `gap` ms apart. */
  const swipe = async (x0, y0, x1, y1, steps, gap, still) => {
    const point = (x, y) => [{ x: Math.round(x), y: Math.round(y), id: 1 }]
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(x0, y0) })
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps) })
      if (still && i === Math.round(steps * 0.6)) await shot(page, tag, still)
      await page.waitForTimeout(gap)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  await startFrames(page)
  await swipe(at.x + 120, at.y, at.x - 120, at.y, 12, 16, '01-swipe-held')
  await page.waitForTimeout(120)
  await shot(page, tag, '01-swipe-after')
  await page.waitForTimeout(1200)
  const swipeFrames = await stopFrames(page)
  let now = await middle(page)
  check('phone: a swipe to the left goes to the next card', now.card === 1, JSON.stringify(now))
  await shot(page, tag, '01-swipe-rest')

  await swipe(at.x - 100, at.y, at.x + 120, at.y, 12, 16)
  await page.waitForTimeout(1300)
  check('phone: a swipe to the right goes back', (await middle(page)).card === 0)

  const before = await page.evaluate(() => window.scrollY)
  await swipe(at.x, at.y + 40, at.x + 6, at.y - 120, 10, 16)
  await page.waitForTimeout(900)
  const after = await page.evaluate(() => window.scrollY)
  check('phone: a finger moving up from the picture scrolls the page', after - before > 60, `${(after - before).toFixed(0)} px`)
  check('phone: and does not turn the ring', (await middle(page)).card <= 0)
  await swipe(at.x, at.y - 60, at.x - 4, at.y + 100, 10, 16)
  await page.waitForTimeout(900)

  await page.locator('.lens-caption.is-shown button[aria-label^="Next view"]').tap()
  await page.waitForTimeout(1300)
  now = await middle(page)
  check('phone: the next button goes on a view', now.card === 1, JSON.stringify(now))
  await shot(page, tag, '02-second')

  console.log('phone: frames while swiping and settling:', JSON.stringify(stats(swipeFrames)))
  await context.close()
}

await browser.close()
console.log(failures.length ? `${failures.length} failed: ${failures.join('; ')}` : 'all passed')
process.exit(failures.length ? 1 : 0)
