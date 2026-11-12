import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { LiquidGlass } from '@/components/glass/LiquidGlass'
import { GlassSurface } from '@/components/glass/GlassSurface'
import { PyramidMark } from '@/components/hero/PyramidMark'
import { BlurText } from '@/components/effects/BlurText'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'

const icon = {
  code: <path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5M9 3 7 13" strokeLinecap="round" strokeLinejoin="round" />,
  bolt: <path d="M9 1.8 3.5 9H8l-1 5.2L12.5 7H8z" strokeLinejoin="round" />,
  shield: (
    <path
      d="M8 1.8 3 3.8V8c0 2.9 2.1 4.9 5 6.2 2.9-1.3 5-3.3 5-6.2V3.8zM5.9 7.9l1.4 1.4 2.8-2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
}

function HeroCard({
  glyph,
  title,
  children,
  href,
  label,
  delay = 0,
}: {
  glyph: ReactNode
  title: string
  children: string
  href?: string
  label?: string
  /** When the card itself starts to appear, so its text can follow it in. */
  delay?: number
}) {
  return (
    <GlassSurface
      variant="tint"
      radius="md"
      className="glass-dark glass-raised group relative h-full text-left transition-shadow duration-(--duration-base) ease-(--ease-glass)"
      contentClassName="flex h-full items-start gap-3.5 p-4"
    >
      {href && <a href={href} aria-label={label} className="absolute inset-0 z-10 rounded-[inherit] focus-ring" />}
      <span className="grid size-8 shrink-0 place-items-center rounded-glass-sm bg-ink/[0.06] text-periwinkle-200 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
          {glyph}
        </svg>
      </span>
      <div className="min-w-0 pt-0.5">
        <BlurText as="p" className="text-[0.9rem] font-medium text-ink" text={title} delay={delay + 0.15} />
        <BlurText as="p" className="mt-1 text-[0.82rem] leading-snug text-ink-muted" text={children} delay={delay + 0.3} />
      </div>
    </GlassSurface>
  )
}

/**
 * Centered hero: a glowing particle pyramid, eyebrow, headline and calls to action stacked
 * in the middle, with three small glass cards along the bottom.
 */
export function HeroCentered() {
  const reduced = usePrefersReducedMotion()
  // Everything in the hero rises out of a blur, in order down the page
  const rise = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 18, filter: 'blur(10px)' },
          animate: { opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } },
          transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] as const, delay },
        }
  const cardsAt = 0.95

  return (
    <section id="top" data-bg-scene="hero" aria-labelledby="hero-title" className="relative">
      {/* Scrim behind the centered column so type stays legible over bright ridges */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(60% 70% at 50% 42%, rgb(5 6 26 / 0.74) 0%, rgb(5 6 26 / 0.42) 50%, rgb(5 6 26 / 0) 100%)',
        }}
      />
      <div className="relative min-h-svh">
        <div className="relative z-[1] mx-auto flex min-h-svh max-w-[76rem] flex-col items-center px-5 pb-8 pt-28 text-center sm:px-8 md:pb-10 md:pt-28">
          <div className="flex flex-1 flex-col items-center justify-center">
            <motion.div
              initial={reduced ? false : { opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            >
              <PyramidMark size={150} className="mb-5 md:mb-7" />
            </motion.div>

            <motion.p {...rise(0.1)} className="eyebrow-indigo mb-5 flex items-center gap-3 md:mb-6 md:gap-4">
              <span
                aria-hidden="true"
                className="hidden h-px w-8 bg-linear-to-r from-transparent to-[#7b80ff]/70 sm:block md:w-14"
              />
              <BlurText
                className="mr-[calc(var(--eyebrow-track)*-1)]"
                text={['Fullstack Web Developer ', { text: '/', className: 'opacity-70' }, ' 2026']}
                delay={0.15}
              />
              <span
                aria-hidden="true"
                className="hidden h-px w-8 bg-linear-to-l from-transparent to-[#7b80ff]/70 sm:block md:w-14"
              />
            </motion.p>

            <BlurText
              as="h1"
              id="hero-title"
              className="font-hero whitespace-nowrap text-ink text-[clamp(2.75rem,1rem+6vw,6rem)] leading-[1.02] tracking-[-0.03em]"
              text={[
                { text: 'Hey, I’m ', className: 'text-silver' },
                { text: 'Noah', className: 'text-indigo-glow' },
                { text: '.', className: 'text-silver' },
              ]}
              delay={0.3}
              stagger={0.14}
              duration={0.8}
            />

            <BlurText
              as="p"
              className="mt-6 max-w-[38rem] text-lead text-pretty text-ink-soft md:mt-7"
              text={['I make ', { text: 'secure', className: 'text-indigo' }, ' and ', { text: 'engaging', className: 'text-indigo' }, ' web applications.']}
              delay={0.6}
            />

            <motion.div {...rise(0.8)} className="mt-8 flex flex-wrap items-center justify-center gap-3 md:mt-9 md:gap-4">
              <LiquidGlass
                as="a"
                href="#work"
                radius="pill"
                strength={36}
                rim={0.6}
                className="glass-dark glow-outline group inline-flex min-h-13 items-center focus-ring"
                contentClassName="flex items-center gap-3 py-1 pl-6 pr-2"
              >
                <span className="text-[0.95rem] font-medium text-ink">See my work</span>
                <span
                  aria-hidden="true"
                  className="grid size-9 place-items-center rounded-full bg-periwinkle-200 text-navy-950 transition-transform duration-(--duration-base) ease-(--ease-glass) group-hover:translate-x-0.5"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </LiquidGlass>
              <a
                href="#contact"
                className="inline-flex min-h-13 items-center rounded-pill px-5 text-[0.95rem] text-ink-soft underline decoration-ink-faint/60 underline-offset-[6px] transition-colors duration-(--duration-base) hover:text-ink hover:decoration-periwinkle-300 focus-ring"
              >
                Contact me
              </a>
            </motion.div>
          </div>

          {/* Three cards along the bottom of the hero */}
          <ul role="list" className="mt-12 grid w-full max-w-[64rem] grid-cols-1 gap-2.5 sm:grid-cols-3 md:mt-14 md:gap-4">
            <motion.li {...rise(cardsAt)}>
              <HeroCard glyph={icon.code} title="Modern Development" href="#work" label="See my work" delay={cardsAt}>
                Clean, scalable, and visually engaging design.
              </HeroCard>
            </motion.li>
            <motion.li {...rise(cardsAt + 0.12)}>
              <HeroCard glyph={icon.bolt} title="Performance Focus" delay={cardsAt + 0.12}>
                Optimized for speed, built for the future.
              </HeroCard>
            </motion.li>
            <motion.li {...rise(cardsAt + 0.24)}>
              <HeroCard glyph={icon.shield} title="Secure by Design" delay={cardsAt + 0.24}>
                Secure backend and a production-ready page is my priority.
              </HeroCard>
            </motion.li>
          </ul>
        </div>
      </div>
    </section>
  )
}
