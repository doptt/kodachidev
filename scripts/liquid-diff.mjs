// Verifies the LiquidGlass filter changes rendered pixels vs the blur-only fallback (?noliquid).
import { chromium } from 'playwright'
import { PNG } from './png.mjs'
const url = process.argv[2] ?? 'http://localhost:5175'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
async function shot(u) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  await p.goto(u, { waitUntil: "networkidle" })
  // High-contrast checkerboard behind the hero content so refraction is measurable
  await p.evaluate(() => {
    const d = document.createElement("div")
    d.style.cssText = "position:fixed;inset:0;z-index:0;background:repeating-conic-gradient(#000 0 25%,#fff 0 50%) 0 0/20px 20px"
    document.body.prepend(d)
  })
  await p.waitForTimeout(800)
  const cta = p.locator('#top a[href="#work"]')
  const filter = await cta.evaluate((el) => getComputedStyle(el).backdropFilter)
  const box = await cta.boundingBox()
  await cta.evaluate((el) => el.querySelectorAll('*').forEach((c) => (c.style.visibility = 'hidden')))
  const clip = { x: box.x, y: box.y, width: Math.ceil(box.width), height: Math.ceil(box.height) }
  const buf = await p.screenshot({ clip })
  await p.screenshot({ path: `screenshots/glass/liquid-check-${u.includes("noliquid") ? "fallback" : "liquid"}.png`, clip: { x: clip.x - 20, y: clip.y - 20, width: clip.width + 40, height: clip.height + 40 } })
  await ctx.close()
  return { png: PNG.decode(buf), filter }
}
const a = await shot(url)
const n = await shot(url + '/?noliquid')
let diff = 0, count = 0
for (let i = 0; i < a.png.data.length; i += 4) {
  const d = Math.abs(a.png.data[i] - n.png.data[i]) + Math.abs(a.png.data[i + 1] - n.png.data[i + 1]) + Math.abs(a.png.data[i + 2] - n.png.data[i + 2])
  if (d > 24) count++
  diff += d
}
console.log('liquid backdrop-filter:', a.filter)
console.log('fallback backdrop-filter:', n.filter)
console.log(`pixels differing noticeably: ${((count / (a.png.width * a.png.height)) * 100).toFixed(1)}%  mean abs diff/channel: ${(diff / (a.png.data.length * 0.75)).toFixed(2)}`)
await b.close()
