import { useSyncExternalStore } from 'react'
import { ambient } from './ambient'
import { cn } from '@/lib/cn'

/**
 * The switch for the ambient sound: a small round button in the navigation,
 * off until pressed. Its four bars stand still while the sound is off and move
 * while it is on. It takes the navigation's accent colour, so it turns cream
 * with the page.
 */
export function SoundToggle() {
  const on = useSyncExternalStore(
    ambient.subscribe,
    () => ambient.on,
    () => false,
  )
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? 'Turn sound off' : 'Turn sound on'}
      title={on ? 'Sound on' : 'Sound off'}
      onClick={() => ambient.set(!on)}
      className={cn(
        'sound-toggle nav-mark grid size-11 shrink-0 place-items-center rounded-full transition-transform duration-(--duration-base) ease-(--ease-glass) hover:scale-[1.08] active:scale-[0.94] md:size-10 focus-ring',
        on && 'is-on',
      )}
    >
      <span aria-hidden="true" className="flex h-3.5 items-center gap-[3px]">
        <i />
        <i />
        <i />
        <i />
      </span>
    </button>
  )
}
