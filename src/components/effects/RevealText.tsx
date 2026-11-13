import { Fragment } from 'react'
import { motion } from 'motion/react'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { DURATION, EASE } from '@/motion/tokens'
import { cn } from '@/lib/cn'

/** A run of text, optionally with its own classes (a highlighted word, say). */
export type TextSegment = string | { text: string; className?: string }

export type RevealTextProps = {
  /** The text, or a list of runs when some words are styled differently. */
  text: string | readonly TextSegment[]
  /** Element to render. */
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'div' | 'dt' | 'dd'
  className?: string
  /**
   * Classes for every word. Gradient text (`text-silver` and friends) has to go
   * here rather than on the element: a clipped background on the parent would
   * show through the words before they have risen into place.
   */
  wordClassName?: string
  /** Seconds before the first word starts. */
  delay?: number
  /** Seconds between words. By default the whole line takes about a second however long it is. */
  stagger?: number
  /** Seconds each word takes to rise into place. */
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

/*
 * The mask each word rises through: its own box, let out a little on every
 * side so that descenders and the soft glow some text styles carry are not
 * shaved off while it is up. The two values differ by a hair only so that
 * there is something to animate between: the mask has to last as long as the
 * word is moving, and is taken away when it lands.
 */
const MASK = 'inset(-0.12em -0.12em -0.2em -0.12em)'
const MASK_END = 'inset(-0.121em -0.12em -0.2em -0.12em)'

/**
 * Text that arrives a word at a time, the first time it scrolls into view:
 * each word rises into place from behind the line it sits on, as if through a
 * slot. Nothing fades; the edge of the mask is what reveals it.
 *
 * Only transforms move: the mask is a fixed clip on each word's box, and is
 * removed once the word has landed so that glows are free to spread again.
 * The words stay real text in the page: nothing is hidden from assistive
 * technology, and with reduced motion it simply renders in place.
 */
export function RevealText({ text, as = 'span', className, wordClassName, delay = 0, stagger, duration = DURATION.reveal, id }: RevealTextProps) {
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
                className="inline-block"
                variants={{
                  hidden: { clipPath: MASK },
                  shown: { clipPath: MASK_END, transition: { duration, ease: 'linear' }, transitionEnd: { clipPath: 'none' } },
                }}
              >
                <motion.span
                  className="inline-block will-change-transform"
                  variants={{
                    hidden: { y: '115%' },
                    // Drop the transform once it has finished, so settled text is not left on its own layer
                    shown: { y: '0%', transition: { duration, ease: EASE.out }, transitionEnd: { transform: 'none', willChange: 'auto' } },
                  }}
                >
                  <span className={cn(wordClassName, word.className)}>{word.text}</span>
                </motion.span>
              </motion.span>
            ))}
          </span>{' '}
        </Fragment>
      ))}
    </MotionTag>
  )
}
