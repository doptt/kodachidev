// Motion smoothness + fallback checks for the background. Run with the dev server on 5174:
//   node dev/bg-checks.mjs
//  - captures 4 frames 400ms apart at scroll 0 and reports mean abs pixel diff between consecutive frames
//  - checks ?nogl and prefers-reduced-motion show the still (data-bg-mode="still", no canvas)
//  - simulates a context loss and restore
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

const base = 'http://localhost:5174/dev/background.html?nolabels&nohud'
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })

function diff(a, b) {
  const A = PNG.sync.read(a), B = PNG.sync.read(b)
  let sum = 0, max = 0
  for (let i = 0; i < A.data.length; i += 4) {
    const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2])
    sum += d; if (d > max) max = d
  }
  return { mean: (sum / (A.data.length / 4)).toFixed(3), max }
}

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  const frames = []
  for (let i = 0; i < 4; i++) {
    frames.push(await page.screenshot({ path: `screenshots/bg/motion-${i}.png` }))
    await page.waitForTimeout(400)
  }
  for (let i = 1; i < frames.length; i++) console.log(`motion frame ${i - 1}->${i}:`, diff(frames[i - 1], frames[i]))
  // Flow speed: match 48px patches between frames 1s apart (integer search, +-8px). The
  // liquid should drift a few px/s at most; at 60fps that is a few hundredths of a pixel
  // per frame, i.e. smooth. (Pixel diffs are a poor smoothness metric under SwiftShader's
  // ~8fps, where every frame carries ~125ms of flow.)
  const fa = PNG.sync.read(await page.screenshot())
  await page.waitForTimeout(1000)
  const fb = PNG.sync.read(await page.screenshot())
  const lum = (img, x, y) => { const i = (y * img.width + x) * 4; return img.data[i] + img.data[i + 1] + img.data[i + 2] }
  const speeds = []
  for (const [cx, cy] of [[300, 200], [640, 400], [900, 600], [400, 650], [1000, 250], [200, 450], [700, 150], [1100, 700]]) {
    let best = { sad: Infinity, d: 0 }
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      let sad = 0
      for (let y = 0; y < 48; y += 2) for (let x = 0; x < 48; x += 2) sad += Math.abs(lum(fa, cx + x, cy + y) - lum(fb, cx + x + dx, cy + y + dy))
      if (sad < best.sad) best = { sad, d: Math.hypot(dx, dy) }
    }
    speeds.push(best.d)
  }
  speeds.sort((p, q) => p - q)
  console.log('flow speed px/s per patch:', speeds.map((s) => s.toFixed(1)).join(' '), ' median:', speeds[4].toFixed(1), '(calm: < 10)')
  const fps = await page.evaluate(
    () =>
      new Promise((r) => {
        let n = 0
        const t0 = performance.now()
        const f = () => {
          n++
          if (performance.now() - t0 < 2000) requestAnimationFrame(f)
          else r(n / 2)
        }
        requestAnimationFrame(f)
      }),
  )
  console.log('rAF fps under SwiftShader (software GL, not representative of a GPU):', fps)
  // scroll ripple: scroll fast then compare
  await page.evaluate(() => window.scrollTo({ top: 1500, behavior: 'instant' }))
  await page.waitForTimeout(100)
  const s0 = await page.screenshot()
  await page.waitForTimeout(400)
  const s1 = await page.screenshot()
  console.log('after fast scroll 0.1s -> 0.5s:', diff(s0, s1))

  // context loss / restore
  const lost = await page.evaluate(async () => {
    const canvas = document.querySelector('[data-bg-mode] canvas')
    const gl = canvas.getContext('webgl2')
    const ext = gl.getExtension('WEBGL_lose_context')
    ext.loseContext()
    await new Promise(r => setTimeout(r, 300))
    const modeLost = document.querySelector('[data-bg-mode]').getAttribute('data-bg-mode')
    ext.restoreContext()
    await new Promise(r => setTimeout(r, 1500))
    const modeRestored = document.querySelector('[data-bg-mode]').getAttribute('data-bg-mode')
    return { modeLost, modeRestored }
  })
  console.log('context loss/restore:', lost)
  await page.close()
}

for (const [label, url, opts] of [
  ['?nogl', base + '&nogl', {}],
  ['reduced-motion', base, { reducedMotion: 'reduce' }],
]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message))
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const info = await page.evaluate(() => ({
    mode: document.querySelector('[data-bg-mode]')?.getAttribute('data-bg-mode'),
    canvas: !!document.querySelector('[data-bg-mode] canvas'),
  }))
  await page.screenshot({ path: `screenshots/bg/fallback-${label.replace('?', '')}.png` })
  console.log(label, info)
  await ctx.close()
}
await browser.close()
