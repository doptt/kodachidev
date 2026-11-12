// Frame cost of the black hole scene on this machine's GPU.
//
//   node scripts/bh-perf.mjs [--url http://localhost:5173] [--p 0,0.5,0.75,0.82]
//     [--sizes 1440x900,1920x1080@2,390x844@2] [--tiers ultra,high,medium,low] [--software]
//
// For each size, tier and scroll progress it loads the isolated scene, lets it
// settle, then reports the median interval between frames and an estimate of
// the GPU time per frame (a one-pixel readback after the scene has drawn, which
// has to wait for the frame's draw calls to finish). A frame budget at 60fps is
// 16.7ms. Headless Chromium on a desktop GPU says nothing about phones: test
// those on the device.
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return fallback
  const next = args[i + 1]
  return next === undefined || next.startsWith('--') ? true : next
}
const url = String(flag('url', 'http://localhost:5173')).replace(/\/$/, '')
const ps = String(flag('p', '0,0.5,0.75,0.82')).split(',').map(Number)
const sizes = String(flag('sizes', '1440x900,1920x1080@2')).split(',')
const tiers = String(flag('tiers', 'ultra,high,medium,low')).split(',')
const software = flag('software', false) === true

const browser = await chromium.launch({
  args: software
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'],
})

const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1]

for (const size of sizes) {
  const [dims, dsf = '1'] = size.split('@')
  const [width, height] = dims.split('x').map(Number)
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: Number(dsf) })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))
  for (const tier of tiers) {
    for (const p of ps) {
      await page.goto(`${url}/dev/blackhole.html?p=${p}&nohud=1&bhtier=${tier}`, { waitUntil: 'networkidle' })
      await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.bhFrames ?? 0) >= 16, null, { timeout: 15000 }).catch(() => {})
      const r = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const canvas = document.querySelector('canvas')
            const gl = canvas.getContext('webgl2')
            const intervals = []
            const gpu = []
            const px = new Uint8Array(4)
            let last = 0
            let n = 0
            const tick = (now) => {
              // Runs after the scene's own frame callback, so the readback waits for exactly its work
              const t0 = performance.now()
              gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
              gpu.push(performance.now() - t0)
              if (last) intervals.push(now - last)
              last = now
              if (++n < 90) requestAnimationFrame(tick)
              else resolve({ intervals, gpu, w: canvas.width, h: canvas.height, name: canvas.dataset.bhGpu })
            }
            requestAnimationFrame(tick)
          }),
      )
      const interval = median(r.intervals)
      console.log(
        `${size.padEnd(14)} ${tier.padEnd(7)} p=${String(p).padEnd(5)} canvas ${`${r.w}x${r.h}`.padEnd(10)} frame ${interval.toFixed(1).padStart(5)}ms (${(1000 / interval).toFixed(0)} fps)  gpu ${median(r.gpu).toFixed(1).padStart(5)}ms`,
      )
    }
  }
  await context.close()
}
await browser.close()
