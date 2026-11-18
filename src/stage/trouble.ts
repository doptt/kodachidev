/**
 * What has gone wrong, kept where it can be read. The scenes fail quietly by
 * design: a visitor gets the fallback and never a message. But a phone has no
 * console to look in, so what failed, and where, is noted here, and shown on
 * the page when it is opened with `?debug` (see components/dev/DebugReadout).
 */
export type Trouble = { at: number; where: string; what: string }

const notes: Trouble[] = []
const heard = new Set<() => void>()

/** Notes that `where` went wrong with `err`. Never throws. */
export function trouble(where: string, err: unknown) {
  const what = err instanceof Error ? `${err.name}: ${err.message}` : typeof err === 'string' ? err : (JSON.stringify(err) ?? String(err))
  notes.push({ at: typeof performance !== 'undefined' ? performance.now() : 0, where, what: what.slice(0, 240) })
  if (notes.length > 12) notes.shift()
  if (import.meta.env?.DEV) console.error(`[${where}]`, err)
  for (const fn of heard) fn()
}

export function troubles(): readonly Trouble[] {
  return notes
}

export function onTrouble(fn: () => void) {
  heard.add(fn)
  return () => void heard.delete(fn)
}
