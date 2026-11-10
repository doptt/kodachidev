import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/cn'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'

export type FlipWordsProps = {
  words: string[]
  /** Time each word stays, in ms (default 3200). */
  duration?: number
  className?: string
}

/**
 * Cycles through words with a soft blur/rise transition. The slot reserves the
 * width of the longest word so the line never reflows. With reduced motion the
 * first word is shown statically.
 */
export function FlipWords({ words, duration = 3200, className }: FlipWordsProps) {
  const reduced = usePrefersReducedMotion()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (reduced || words.length < 2) return
    const id = window.setInterval(() => setIndex((i) => (i + 1) % words.length), duration)
    return () => window.clearInterval(id)
  }, [reduced, words.length, duration])

  const word = words[reduced ? 0 : index] ?? ''

  return (
    <span className={cn('relative inline-grid align-baseline', className)}>
      {/* Width reservation */}
      {words.map((w) => (
        <span key={w} aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-nowrap">
          {w}
        </span>
      ))}
      <span className="sr-only">{word}</span>
      <AnimatePresence initial={false}>
        <motion.span
          key={word}
          aria-hidden="true"
          className="col-start-1 row-start-1 whitespace-nowrap"
          initial={reduced ? false : { opacity: 0, y: 14, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={reduced ? undefined : { opacity: 0, y: -14, filter: 'blur(8px)' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {word}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
