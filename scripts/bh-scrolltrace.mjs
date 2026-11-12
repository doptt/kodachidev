// Frame times while actually scrolling (wheel input) from the fade to black, through About, into the black hole.
//
//   node scripts/bh-scrolltrace.mjs ["css to inject"]
//   URL=http://localhost:4173/ SETTLE=8000 node scripts/bh-scrolltrace.mjs
//
// Prints the share of frames over 20ms, overall and per half-screen of scroll (positions are in
// viewport heights relative to the top of #about). The optional CSS is injected before scrolling:
// hide one thing at a time (".bh-intro{display:none!important}") to see what it costs.
// A page at rest says nothing about this; measure the production build (vite preview) for real
// numbers, since dev mode is roughly twice as slow. Expect run-to-run noise of several points.
import { chromium } from 'playwright'
const css = process.argv[2] ?? ''
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
await p.goto(process.env.URL ?? 'http://localhost:5173/', { waitUntil: 'networkidle' })
if (css) await p.addStyleTag({ content: css })
await p.evaluate(() => {
  const about = document.getElementById('about')
  window.__aboutTop = about.getBoundingClientRect().top + scrollY
  scrollTo({ top: window.__aboutTop - innerHeight * 2.4, behavior: 'instant' })
})
await p.waitForTimeout(Number(process.env.SETTLE ?? 6500))
await p.evaluate(() => {
  window.__f = []
  let last = 0
  const tick = (now) => {
    if (last) window.__f.push([(scrollY - window.__aboutTop) / innerHeight, now - last])
    last = now
    if (window.__f.length < 3000) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
await p.mouse.move(700, 450)
for (let i = 0; i < 470; i++) {
  await p.mouse.wheel(0, 11)
  await p.waitForTimeout(16)
}
await p.waitForTimeout(500)
const frames = await p.evaluate(() => window.__f)
const buckets = new Map()
for (const [pos, dt] of frames) {
  const k = Math.floor(pos * 2) / 2
  const cur = buckets.get(k) ?? { n: 0, slow: 0, max: 0 }
  cur.n++
  if (dt > 20) cur.slow++
  cur.max = Math.max(cur.max, dt)
  buckets.set(k, cur)
}
const total = frames.length
const slow = frames.filter((f) => f[1] > 20).length
console.log(`${css ? 'with: ' + css.slice(0, 70) : 'as is'}  ->  ${((100 * slow) / total).toFixed(0)}% of ${total} frames over 20ms`)
console.log([...buckets.entries()].sort((a, c) => a[0] - c[0]).map(([k, v]) => `${k.toFixed(1).padStart(5)}vh: ${String(Math.round((100 * v.slow) / v.n)).padStart(3)}% slow, worst ${Math.round(v.max)}ms`).join('\n'))
await b.close()
