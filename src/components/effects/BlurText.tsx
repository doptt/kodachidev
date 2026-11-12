import { Fragment } from 'react'
import { motion } from 'motion/react'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/cn'

/** A run of text, optionally with its own classes (a highlighted word, say). */
export type TextSegment = string | { text: string; className?: string }

export type BlurTextProps = {
  /** The text, or a list of runs when some words are styled differently. */
  text: string | readonly TextSegment[]
  /** Element to render. */
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'div' | 'dt' | 'dd'
  className?: string
  /**
   * Classes for every word. Gradient text (`text-silver` and friends) has to go
   * here rather than on the element: a clipped background on the parent would
   * show through the words before they have faded in.
   */
  wordClassName?: string
  /** Seconds before the first word starts. */
  delay?: number
  /** Seconds between words. By default the whole line takes about a second however long it is. */
  stagger?: number
  /** Seconds each word takes to come into focus. */
  duration?: number
  id?: string
}

type Word = { text: string; className?: string }

/** Splits the runs into words, keeping together anything written without a space (a word and its full stop). */
function toGroups(text: string | readonly TextSegment[]): Word[][] {
  const groups: Word[][] = []
  let current: Word[] = []
  for (const segment of typeof text === 'string' ? [text] : text) {
    const run = typeof segment === 'string' ? { text: segment } : segment
    for (const token of run.text.split(/(\s+)/)) {
      if (!token) continue
      if (/^\s+$/.test(token)) {
        if (current.length) groups.push(current)
        current = []
      } else {
        current.push({ text: token, className: run.className })
      }
    }
  }
  if (current.length) groups.push(current)
  return groups
}

const EASE = [0.22, 1, 0.36, 1] as const

/**
 * Text that arrives a word at a time, each word fading up out of a blur, the
 * first time it scrolls into view. Modelled on Aceternity UI's "Text Generate
 * Effect", rebuilt on the site's own motion library so it can carry the
 * gradient text styles and the reduced-motion setting.
 *
 * The words stay real text in the page: nothing is hidden from assistive
 * technology, and with reduced motion it simply renders in place.
 */
export function BlurText({ text, as = 'span', className, wordClassName, delay = 0, stagger, duration = 0.55, id }: BlurTextProps) {
  const reduced = usePrefersReducedMotion()
  const groups = toGroups(text)
  const count = groups.reduce((n, g) => n + g.length, 0)
  const Tag = as

  if (reduced) {
    return (
      <Tag id={id} className={className}>
        {groups.map((group, g) => (
          <Fragment key={g}>
            {group.map((word, w) => (
              <span key={w} className={cn(wordClassName, word.className)}>
                {word.text}
              </span>
            ))}{' '}
          </Fragment>
        ))}
      </Tag>
    )
  }

  // One of motion's own elements, so its identity is stable between renders
  const MotionTag = motion[as]
  const step = stagger ?? Math.min(0.09, 1 / Math.max(1, count))
  let index = 0

  return (
    <MotionTag
      id={id}
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: step, delayChildren: delay } } }}
    >
      {groups.map((group, g) => (
        <Fragment key={g}>
          {/* Words written without a space between them never wrap apart */}
          <span className={group.length > 1 ? 'whitespace-nowrap' : undefined}>
            {group.map((word) => (
              <motion.span
                key={index++}
                className="inline-block will-change-[opacity,filter]"
                variants={{
                  hidden: { opacity: 0, filter: 'blur(10px)' },
                  // Drop the filter once it has finished, so settled text is not left on its own layer
                  shown: { opacity: 1, filter: 'blur(0px)', transition: { duration, ease: EASE }, transitionEnd: { filter: 'none' } },
                }}
              >
                <span className={cn(wordClassName, word.className)}>{word.text}</span>
              </motion.span>
            ))}
          </span>{' '}
        </Fragment>
      ))}
    </MotionTag>
  )
}
