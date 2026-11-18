import { useEffect, useState } from 'react'
import { stage } from '@/stage/stage'
import { onTrouble, trouble, troubles } from '@/stage/trouble'

const SCENES = ['field', 'lens', 'moon'] as const

/**
 * A readout for a device with no console: open the page with `?debug` and a
 * small panel says what the graphics are doing (the GPU's name, the quality
 * tier, each scene's state, the frame rate) and lists anything that has gone
 * wrong. It is how a fault that only shows on someone's phone gets found: a
 * screenshot of this says what a description cannot. Not rendered otherwise.
 */
export function DebugReadout() {
  const [, tick] = useState(0)

  useEffect(() => {
    const again = () => tick((n) => n + 1)
    const timer = window.setInterval(again, 500)
    const onError = (e: ErrorEvent) => trouble('page', e.error ?? e.message)
    const onRejection = (e: PromiseRejectionEvent) => trouble('page (promise)', e.reason)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    const stops = [stage.subscribe(again), onTrouble(again)]
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      stops.forEach((stop) => stop())
    }
  }, [])

  const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-stage]')
  const hole = document.querySelector<HTMLCanvasElement>('canvas[data-bh-tier]')
  const d = canvas?.dataset ?? {}
  const nav = navigator as Navigator & { deviceMemory?: number }
  const lines = [
    `gpu     ${d.stageGpu || '(none)'}`,
    `stage   ${stage.supported === false ? 'NOT SUPPORTED' : `tier ${d.stageTier ?? '?'}  ${canvas?.width}x${canvas?.height}  ${d.stageFps ?? '?'}fps`}`,
    `showing ${d.stageActive ?? '(nothing)'}`,
    ...SCENES.map((id) => `${id.padEnd(7)} ${stage.status(id)}${id === 'moon' && d.statPhase ? `  (${d.statPhase})` : ''}`),
    `hole    ${hole ? `tier ${hole.dataset.bhTier}` : 'not mounted'}`,
    `screen  ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}  cores ${navigator.hardwareConcurrency ?? '?'}  mem ${nav.deviceMemory ?? '?'}`,
    `touch   ${window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine'}  motion ${window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full'}`,
  ]
  const wrong = troubles()

  return (
    <pre
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-2 bottom-2 z-[200] max-h-[46vh] overflow-hidden rounded-lg bg-black/85 p-2.5 font-mono text-[10px] leading-[1.45] whitespace-pre-wrap text-[#9dffb0] shadow-[inset_0_0_0_1px_rgb(157_255_176/0.35)]"
    >
      {lines.join('\n')}
      {'\n'}
      <span className="text-[#ffb3a1]">{wrong.length ? wrong.map((t) => `! ${(t.at / 1000).toFixed(1)}s ${t.where}: ${t.what}`).join('\n') : 'no errors noted'}</span>
      {'\n'}
      <span className="text-white/50">{navigator.userAgent.replace(/Mozilla\/5\.0 /, '').slice(0, 110)}</span>
    </pre>
  )
}
