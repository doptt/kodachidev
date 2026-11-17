// Captures the further views of each project's site: the cards beside the hero in the work section
// (public/work/<slug>-2.webp … -4.webp, listed as `more` in src/content/projects.ts).
//
//   node scripts/work-shots.mjs [--only kyvora,timmy] [--out public/work] [--quality 86]
//     [--png <dir>] [--solari ../solari]
//
// Every view is a 1600x1000 desktop viewport at 1x, the framing of the heroes, saved as WebP.
// --only    the projects to shoot (default all four)
// --png     also keeps the PNG originals in this folder (keep it outside the repo)
// --solari  Solari is not live: its source folder is served on a spare local port for the run
//           (default ../solari, beside this repo) and skipped if the folder is missing
//
// The views are the VIEWS table below: a page to load and the steps to reach the frame.
import { chromium } from 'playwright'
import sharp from 'sharp'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return fallback
  const next = args[i + 1]
  return next === undefined || next.startsWith('--') ? true : next
}

const repo = path.resolve(import.meta.dirname, '..')
const only = flag('only', null)
const out = path.resolve(repo, String(flag('out', 'public/work')))
const quality = Number(flag('quality', 86))
const png = flag('png', null)
const solariDir = path.resolve(repo, String(flag('solari', '../solari')))

const KYVORA = 'https://kyvora-green.vercel.app'
const DEWLY = 'https://dewly-concept.vercel.app'
const TIMMY = 'https://timmypage.vercel.app'

const jump = (page, y) => page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y)

/** Scrolls to the bottom in steps and back, so lazy images and reveal-on-scroll content have all fired. */
async function walk(page) {
  let height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < height; y += 500) {
    await jump(page, y)
    await page.waitForTimeout(250)
    height = await page.evaluate(() => document.documentElement.scrollHeight)
  }
  await jump(page, 0)
  await page.waitForTimeout(400)
}

/** Scrolls so the element's top sits `gap` pixels below the top of the viewport. */
async function scrollToEl(page, selector, gap = 0) {
  const y = await page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top + window.scrollY, selector)
  await jump(page, Math.max(0, y - gap))
}

/** Scrolls in steps, as a visitor would: Timmy's gallery walk is smoothed and takes a moment to arrive. */
async function stroll(page, y) {
  const from = await page.evaluate(() => window.scrollY)
  const steps = Math.max(1, Math.ceil(Math.abs(y - from) / 400))
  for (let i = 1; i <= steps; i++) {
    await jump(page, from + ((y - from) * i) / steps)
    await page.waitForTimeout(120)
  }
  await page.waitForTimeout(2500)
}

/** Timmy draws its own cursor dot: leave it over the empty floor rather than on the picture. */
const parkPointer = (page) => page.mouse.move(1420, 790, { steps: 6 })

const VIEWS = [
  // Kyvora: a multi-page site. The home page is one long scroll with a pinned "how it works" story
  { slug: 'kyvora', n: 2, label: 'Pricing', url: `${KYVORA}/pricing` },
  {
    slug: 'kyvora',
    n: 3,
    label: 'Concept builds',
    url: KYVORA,
    steps: async (page) => {
      await walk(page)
      await scrollToEl(page, '#work h2', 110)
    },
  },
  {
    slug: 'kyvora',
    n: 4,
    label: 'Before and after',
    url: KYVORA,
    steps: async (page) => {
      await walk(page)
      await scrollToEl(page, '#before-after-title', 70)
    },
  },

  // Dewly: one page per nav item, each with a header card of its own
  { slug: 'dewly', n: 2, label: 'Plans', url: `${DEWLY}/plans.html` },
  { slug: 'dewly', n: 3, label: 'How it works', url: `${DEWLY}/how-it-works.html` },
  { slug: 'dewly', n: 4, label: 'For offices', url: `${DEWLY}/offices.html` },

  // Timmy: a single scroll-driven walk through the rooms, with overlays for a painting and for the index.
  // Look at these after a run: headless Chromium now and then captures the wall a little way down the frame,
  // under a black band
  {
    slug: 'timmy',
    n: 2,
    label: 'Paintings room',
    url: TIMMY,
    steps: async (page) => {
      await page.locator('header a[href="#gallery"]').first().click()
      await page.waitForTimeout(3500)
      await parkPointer(page)
    },
  },
  {
    slug: 'timmy',
    n: 3,
    label: 'Painting detail',
    url: TIMMY,
    steps: async (page) => {
      await stroll(page, 4300)
      await page.getByRole('button', { name: /^Ember Field.*open details/ }).click()
      await page.waitForTimeout(3000)
      await parkPointer(page)
    },
  },
  {
    slug: 'timmy',
    n: 4,
    label: 'Index',
    url: TIMMY,
    steps: async (page) => {
      await page.locator('header a[href="#index"]').first().click()
      await page.waitForTimeout(3000)
      await parkPointer(page)
    },
  },

  // Solari: one short page (served from disk), so it has two further views, the second being the
  // hero's lamp switched off. (The lamp aimed down was tried and is too like the hero to be a card.)
  {
    slug: 'solari',
    n: 2,
    label: 'Collections',
    url: 'solari:',
    steps: async (page) => {
      await walk(page)
      await scrollToEl(page, '.desk')
    },
  },
  {
    slug: 'solari',
    n: 3,
    label: 'Lamp off',
    url: 'solari:',
    steps: async (page) => {
      await page.locator('#lamp-switch').click()
      await page.evaluate(() => document.activeElement?.blur())
    },
  },
]

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

/** Serves a folder of static files on a spare local port. Resolves to { url, close }. */
async function serve(root) {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const file = path.join(root, pathname.endsWith('/') ? `${pathname}index.html` : pathname)
    if (!file.startsWith(root)) return res.writeHead(403).end()
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() }
}

/** Waits for the fonts and for every picture in the viewport to have loaded. */
async function settle(page) {
  await page.evaluate(() => document.fonts.ready)
  await page
    .waitForFunction(
      () =>
        [...document.images]
          .filter((img) => {
            const r = img.getBoundingClientRect()
            return r.width > 0 && r.bottom > 0 && r.top < innerHeight
          })
          .every((img) => img.complete && img.naturalWidth > 0),
      null,
      { timeout: 8000 },
    )
    .catch(() => console.log('  some pictures in view had not loaded'))
  // A beat for transitions and reveals to finish
  await page.waitForTimeout(1500)
}

const wanted = VIEWS.filter((v) => !only || String(only).split(',').includes(v.slug))
let solari = null
if (wanted.some((v) => v.slug === 'solari')) {
  if (existsSync(path.join(solariDir, 'index.html'))) solari = await serve(solariDir)
  else console.log(`Solari source not found at ${solariDir}: skipping it (pass --solari <folder>)`)
}

mkdirSync(out, { recursive: true })
if (png) mkdirSync(String(png), { recursive: true })

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
try {
  // One context per site, so a cookie choice made for the first view holds for the rest
  for (const slug of [...new Set(wanted.map((v) => v.slug))]) {
    if (slug === 'solari' && !solari) continue
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    page.on('pageerror', (e) => console.log(`[${slug}] pageerror: ${e.message}`))

    for (const view of wanted.filter((v) => v.slug === slug)) {
      await page.goto(view.url === 'solari:' ? solari.url : view.url, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1500)
      // Kyvora's cookie banner: decline it. Clicked from the page rather than with the mouse, which would leave
      // the site's cursor ring in the shot; once declined the button stays in the page but inert
      const declined = await page.evaluate(() => {
        const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Reject')
        if (!button || button.closest('[inert]')) return false
        button.click()
        return true
      })
      if (declined) await page.waitForTimeout(600)
      await view.steps?.(page)
      await settle(page)

      const shot = await page.screenshot()
      const name = `${slug}-${view.n}`
      if (png) writeFileSync(path.join(String(png), `${name}.png`), shot)
      const file = path.join(out, `${name}.webp`)
      await sharp(shot).webp({ quality, effort: 6, smartSubsample: true }).toFile(file)
      console.log(`${file}  ${view.label}  ${Math.round(statSync(file).size / 1024)} KB`)
    }
    await context.close()
  }
} finally {
  await browser.close()
  solari?.close()
}
