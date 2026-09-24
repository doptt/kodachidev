import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'

type SelectProps = {
  label: string
  /** Shown after the label in a lighter color, e.g. "(optional)" */
  hint?: string
  options: readonly string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

/*
 * Custom dropdown that behaves like a native <select>, but can be animated
 * and styled to match the rest of the form.
 *
 * Follows the WAI-ARIA "select-only combobox" pattern: the trigger button
 * keeps focus the whole time and points at the highlighted option with
 * aria-activedescendant. Keyboard support:
 *   ↑ / ↓        move the highlight (opens the list if closed)
 *   Enter/Space  pick the highlighted option, or open the list
 *   Home / End   jump to the first / last option
 *   Escape / Tab close without picking
 *   Any letter   jump to the next option starting with it
 */
export default function Select({ label, hint, options, value, onChange, placeholder = 'Select…', disabled }: SelectProps) {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const selectedIndex = options.indexOf(value)
  const optionId = (i: number) => `${id}-option-${i}`

  const openList = (startAt = selectedIndex >= 0 ? selectedIndex : 0) => {
    setActive(startAt)
    setOpen(true)
  }

  const choose = (i: number) => {
    onChange(options[i])
    setOpen(false)
  }

  // Clicking anywhere outside closes the list
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault()
        if (!open) return openList()
        const step = e.key === 'ArrowDown' ? 1 : -1
        setActive((i) => Math.min(last, Math.max(0, i + step)))
        return
      }
      case 'Home':
      case 'End':
        if (!open) return
        e.preventDefault()
        setActive(e.key === 'Home' ? 0 : last)
        return
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (open && active >= 0) choose(active)
        else openList()
        return
      case 'Escape':
        if (open) {
          e.preventDefault()
          setOpen(false)
        }
        return
      case 'Tab':
        setOpen(false)
        return
    }

    // Type-to-jump, like a native select
    if (e.key.length === 1 && /\S/.test(e.key)) {
      const from = open ? active : selectedIndex
      const key = e.key.toLowerCase()
      const match = [...options.slice(from + 1), ...options.slice(0, from + 1)].find((o) =>
        o.toLowerCase().startsWith(key),
      )
      if (match) {
        const i = options.indexOf(match)
        if (open) setActive(i)
        else onChange(match)
      }
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <span id={`${id}-label`} className="field-label">
        {label} {hint && <span className="opacity-50">{hint}</span>}
      </span>

      <button
        type="button"
        role="combobox"
        aria-labelledby={`${id}-label`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        disabled={disabled}
        // detail === 0 means the click came from the keyboard, which onKeyDown already handled
        onClick={(e) => e.detail !== 0 && (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className="field flex cursor-pointer items-center justify-between text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={value ? 'text-ink' : 'text-muted/70'}>{value || placeholder}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden
          className={`shrink-0 text-accent transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M3.5 5.25L7 8.75l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          aria-labelledby={`${id}-label`}
          className="dropdown-menu panel bg-deep/95 absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl p-1.5 shadow-[0_18px_50px_rgb(0_0_0/0.5)]"
        >
          {options.map((option, i) => {
            const selected = i === selectedIndex
            return (
              <li
                key={option}
                id={optionId(i)}
                role="option"
                aria-selected={selected}
                // Keep focus on the trigger when clicking an option
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
                onPointerEnter={() => setActive(i)}
                style={{ '--i': i } as CSSProperties}
                className={`dropdown-option flex cursor-pointer items-center justify-between rounded-xl px-4 py-2.5 text-sm transition-colors duration-150 ${
                  i === active ? 'bg-accent/12 text-ink' : 'text-muted'
                }`}
              >
                {option}
                {selected && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="text-accent">
                    <path d="M3 7.5l2.5 2.5L11 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
