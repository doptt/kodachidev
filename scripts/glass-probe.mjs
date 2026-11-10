// Playwright probes for the glass system.
//
//   node scripts/glass-probe.mjs <command> [--url http://localhost:5175] [--out screenshots/glass]
//
// Commands:
//   crop <in.png> <out.png> <x> <y> <w> <h>   crop a screenshot
//   hover                                      hover the first card at three positions (desktop)
//   nav                                        scrolled nav state (desktop + phone)
//   menu                                       open mobile menu (phone)
//   reduced                                    reduced-motion hero + cards (desktop)
//   contrast                                   WCAG contrast of each text style against rendered pixels
//   axe                                        run axe-core and print violations
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { PNG } from './png.mjs'

const args = process.argv.slice(2)
const cmd = args[0]
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i < 0 ? fallback : args[i + 1]
}
const url = flag('url', 'http://localhost:5175')
const out = flag('out', 'screenshots/glass')
mkdirSync(out, { recursive: true })

const launch = () =>
  chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })

const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }
const phone = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }

const wire = (page, tag) => {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[${tag}] console.${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => console.log(`[${tag}] pageerror: ${e.message}`))
}

if (cmd === 'crop') {
  const [, inp, outFile, x, y, w, h] = args
  const b = await launch()
  const p = await b.newPage({ viewport: { width: 2000, height: 2000 } })
  const data = readFileSync(inp).toString('base64')
  await p.setContent(`<img src="data:image/png;base64,${data}" style="position:absolute;left:0;top:0">`)
  await p.waitForTimeout(100)
  await p.screenshot({ path: outFile, clip: { x: +x, y: +y, width: +w, height: +h } })
  await b.close()
  console.log(outFile)
}

if (cmd === 'hover') {
  const b = await launch()
  const page = await b.newPage(desktop)
  wire(page, 'hover')
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.querySelector('#build')?.scrollIntoView({ block: 'start', behavior: 'instant' }))
  await page.waitForTimeout(800)
  const card = page.locator('#build li').first()
  const box = await card.boundingBox()
  const spots = { tl: [0.15, 0.2], c: [0.5, 0.5], br: [0.85, 0.8] }
  for (const [name, [fx, fy]] of Object.entries(spots)) {
    await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy, { steps: 12 })
    await page.waitForTimeout(900)
    const file = path.join(out, `card-hover-${name}.png`)
    await page.screenshot({ path: file, clip: { x: box.x - 40, y: box.y - 40, width: box.width + 80, height: box.height + 80 } })
    console.log(file)
  }
  // Full row for context
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.35, { steps: 10 })
  await page.waitForTimeout(900)
  const file = path.join(out, 'cards-hover-1440.png')
  await page.screenshot({ path: file })
  console.log(file)
  await b.close()
}

if (cmd === 'nav') {
  const b = await launch()
  for (const [tag, ctx] of [['1440', desktop], ['375', phone]]) {
    const page = await b.newPage(ctx)
    wire(page, `nav-${tag}`)
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }))
    await page.waitForTimeout(1200)
    const file = path.join(out, `nav-scrolled-${tag}.png`)
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: ctx.viewport.width, height: 120 } })
    console.log(file)
    await page.close()
  }
  await b.close()
}

if (cmd === 'menu') {
  const b = await launch()
  const page = await b.newPage(phone)
  wire(page, 'menu')
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Open menu' }).click()
  await page.waitForTimeout(800)
  const file = path.join(out, 'menu-open-375.png')
  await page.screenshot({ path: file })
  console.log(file)
  const focused = await page.evaluate(() => document.activeElement?.textContent)
  console.log('focused after open:', focused)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  const afterEsc = await page.evaluate(() => ({
    open: !!document.querySelector('[role=dialog]'),
    focus: document.activeElement?.getAttribute('aria-label'),
  }))
  console.log('after Escape:', afterEsc)
  await b.close()
}

if (cmd === 'reduced') {
  const b = await launch()
  const ctx = await b.newContext({ ...desktop, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  wire(page, 'reduced')
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.mouse.move(600, 400)
  await page.waitForTimeout(800)
  let file = path.join(out, 'reduced-hero-1440.png')
  await page.screenshot({ path: file })
  console.log(file)
  await page.evaluate(() => document.querySelector('#build')?.scrollIntoView({ block: 'start', behavior: 'instant' }))
  const box = await page.locator('#build li').first().boundingBox()
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3, { steps: 6 })
  await page.waitForTimeout(800)
  const transform = await page.locator('#build li').first().locator('[style*="transform"]').first().evaluate((el) => getComputedStyle(el).transform)
  console.log('card transform under reduced motion:', transform)
  file = path.join(out, 'reduced-cards-1440.png')
  await page.screenshot({ path: file })
  console.log(file)
  await b.close()
}

// ---------------------------------------------------------------- contrast
function srgbToLin(c) {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
function luminance([r, g, b]) {
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b)
}
function ratio(l1, l2) {
  const [a, b] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (a + 0.05) / (b + 0.05)
}
function parseColor(s) {
  const m = s.match(/rgba?\(([^)]+)\)/)
  if (!m) return [255, 255, 255]
  return m[1].split(/[\s,\/]+/).slice(0, 3).map(Number)
}

if (cmd === 'contrast') {
  const targets = [
    { name: 'hero eyebrow (mono)', sel: '#top p.label-mono', large: false },
    { name: 'hero headline', sel: '#hero-title', large: true },
    { name: 'hero lead', sel: '#top p.text-lead', large: false },
    { name: 'hero CTA "See my work"', sel: '#top a[href="#work"] span:first-child', large: false },
    { name: 'hero secondary link', sel: '#top a[href="#contact"]', large: false },
    { name: 'nav wordmark', sel: 'nav a[href="#top"] span:last-child', large: false },
    { name: 'nav link', sel: 'nav ul a', large: false },
    { name: 'nav "Get in touch"', sel: 'nav > div > a[href="#contact"]', large: false },
    { name: 'build eyebrow (mono)', sel: '#build p.label-mono', large: false },
    { name: 'card title', sel: '#build h3', large: true },
    { name: 'card body', sel: '#build li p', large: false },
    { name: 'cluster "Latest work" label', sel: '#top [role=group] p.label-mono', large: false },
    { name: 'cluster project name', sel: '#top [role=group] p.font-display', large: false },
    { name: 'cluster project kind', sel: '#top [role=group] .items-end > p', large: false },
    { name: 'cluster code', sel: '#top [role=group] pre', large: false },
    { name: 'cluster deploy title', sel: '#top [role=group] p.font-medium', large: false },
    { name: 'cluster deploy meta', sel: '#top [role=group] p.font-medium + p', large: false },
    { name: 'cluster stack chip', sel: '#top [role=group] li', large: false },
  ]
  const b = await launch()
  for (const [tag, ctx] of [['1440', desktop], ['375', phone]]) {
    const page = await (await b.newContext({ ...ctx, reducedMotion: "reduce" })).newPage()
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.addStyleTag({ content: '*{transition:none!important;animation:none!important}' })
    console.log(`\n== ${tag} ==`)
    for (const t of targets) {
      const loc = page.locator(t.sel).first()
      if ((await loc.count()) === 0) {
        console.log(`  ${t.name}: not found`)
        continue
      }
      if (!(await loc.isVisible())) {
        console.log(`  ${t.name}: hidden at this width`)
        continue
      }
      await loc.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }))
      await page.evaluate(() => window.scrollBy(0, -120))
      await page.waitForTimeout(400)
      const box = await loc.boundingBox()
      if (!box || box.width < 2 || box.height < 2) {
        console.log(`  ${t.name}: hidden at this width`)
        continue
      }
      const color = parseColor(await loc.evaluate((el) => getComputedStyle(el).color))
      // Hide the text (and any aria-hidden twin layered over it) and shoot the box
      await loc.evaluate((el) => {
        el.dataset.probe = '1'
        el.style.setProperty('color', 'transparent', 'important')
        el.style.setProperty('text-decoration-color', 'transparent', 'important')
        el.querySelectorAll('*').forEach((c) => c.style.setProperty('color', 'transparent', 'important'))
      })
      await page.waitForTimeout(80)
      const buf = await page.screenshot({ clip: { x: box.x, y: box.y, width: Math.ceil(box.width), height: Math.ceil(box.height) } })
      await loc.evaluate((el) => {
        el.style.removeProperty('color')
        el.style.removeProperty('text-decoration-color')
        el.querySelectorAll('*').forEach((c) => c.style.removeProperty('color'))
      })
      const png = PNG.decode(buf)
      let maxL = 0
      let sum = 0
      const lums = []
      // sample a stride so big boxes stay fast
      const stride = Math.max(1, Math.floor(Math.sqrt((png.width * png.height) / 40000)))
      for (let y = 0; y < png.height; y += stride) {
        for (let x = 0; x < png.width; x += stride) {
          const i = (y * png.width + x) * 4
          const l = luminance([png.data[i], png.data[i + 1], png.data[i + 2]])
          maxL = Math.max(maxL, l)
          lums.push(l)
          sum += l
        }
      }
      lums.sort((a, b) => a - b)
      const avgL = sum / lums.length
      const p95L = lums[Math.floor(lums.length * 0.95)]
      const textL = luminance(color)
      const worst = ratio(textL, maxL)
      const p95 = ratio(textL, p95L)
      const avg = ratio(textL, avgL)
      const need = t.large ? 3 : 4.5
      // Pass criterion: the 95th-percentile background (single sparkle pixels are reported but do not fail)
      const ok = p95 >= need ? (worst >= need ? 'PASS ' : 'PASS*') : 'FAIL '
      console.log(
        `  ${ok} ${t.name}: text rgb(${color.join(',')}) vs p95 bg ${p95.toFixed(2)}:1, brightest px ${worst.toFixed(2)}:1, avg ${avg.toFixed(2)}:1 (need ${need})`,
      )
    }
    await page.close()
  }
  await b.close()
}

if (cmd === 'axe') {
  const { AxeBuilder } = await import('@axe-core/playwright')
  const b = await launch()
  for (const [tag, ctx] of [['1440', desktop], ['375', phone]]) {
    const page = await (await b.newContext(ctx)).newPage()
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    const results = await new AxeBuilder({ page }).analyze()
    console.log(`\n== axe ${tag}: ${results.violations.length} violations ==`)
    for (const v of results.violations) {
      console.log(`- [${v.impact}] ${v.id}: ${v.help}`)
      for (const n of v.nodes.slice(0, 4)) console.log(`    ${n.target.join(' ')} :: ${n.failureSummary?.split('\n')[1] ?? ''}`)
    }
    if (tag === '375') {
      await page.getByRole('button', { name: 'Open menu' }).click()
      await page.waitForTimeout(600)
      const r2 = await new AxeBuilder({ page }).analyze()
      console.log(`== axe 375 menu open: ${r2.violations.length} violations ==`)
      for (const v of r2.violations) console.log(`- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(' | ')})`)
    }
    await page.close()
  }
  await b.close()
}
