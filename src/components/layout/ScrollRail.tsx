import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring } from 'motion/react'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/cn'

const SECTIONS = [
  { id: 'top', label: 'Intro' },
  { id: 'build', label: 'What I build' },
  { id: 'stack', label: 'Full stack' },
  { id: 'about', label: 'About' },
  { id: 'work', label: 'Work' },
  { id: 'approach', label: 'Approach' },
  { id: 'contact', label: 'Contact' },
] as const

/**
 * Wide screens only: a thin progress line on the right edge with the number and
 * name of the section under the middle of the viewport. Decorative; the nav
 * already links to every section.
 */
export function ScrollRail() {
  const reduced = usePrefersReducedMotion()
  const { scrollY, scrollYProgress } = useScroll()
  const fill = useSpring(scrollYProgress, { stiffness: 200, damping: 34, mass: 0.3 })
  const [active, setActive] = useState(0)
  const [shown, setShown] = useState(false)

  // Current section: the last one whose top edge has passed the middle of the viewport
  const update = (y: number) => {
    setShown(y > 160)
    const mid = window.innerHeight / 2
    let i = 0
    SECTIONS.forEach((sec, n) => {
      const el = document.getElementById(sec.id)
      if (el && el.getBoundingClientRect().top <= mid) i = n
    })
    setActive(i)
  }
  useMotionValueEvent(scrollY, 'change', update)
  useEffect(() => update(window.scrollY), [])

  const current = SECTIONS[active]

  return (
    <div aria-hidden="true" data-bh-vars="theme dim" className="nav-vars bh-dims pointer-events-none fixed right-5 top-1/2 z-40 hidden -translate-y-1/2 xl:block">
      <div
        className={cn(
          'flex flex-col items-center gap-4 transition-opacity duration-(--duration-slow) ease-(--ease-glass)',
          shown ? 'opacity-100' : 'opacity-0',
        )}
      >
        <span className="nav-mark font-mono text-[0.68rem] tracking-[0.08em] tabular-nums">
          {String(active + 1).padStart(2, '0')}
        </span>
        <span className="relative h-28 w-px overflow-hidden rounded-full bg-ink/15">
          <motion.span
            className="nav-fill absolute inset-0 origin-top"
            style={{ scaleY: reduced ? scrollYProgress : fill }}
          />
        </span>
        <span className="relative h-28 w-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={current.id}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className="absolute left-0 top-0 font-mono text-[0.68rem] tracking-[0.12em] whitespace-nowrap text-ink-muted uppercase [writing-mode:vertical-rl]"
            >
              {current.label}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>
    </div>
  )
}
