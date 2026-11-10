import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { LiquidGlass } from '@/components/glass/LiquidGlass'
import { GlassSurface } from '@/components/glass/GlassSurface'
import { PyramidMark } from '@/components/hero/PyramidMark'
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
}: {
  glyph: ReactNode
  title: string
  children: ReactNode
  href?: string
  label?: string
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
        <p className="text-[0.9rem] font-medium text-ink">{title}</p>
        <div className="mt-1 text-[0.82rem] leading-snug text-ink-muted">{children}</div>
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
  const rise = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] as const, delay },
        }

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
              <span className="mr-[calc(var(--eyebrow-track)*-1)]">
                Fullstack Web Developer
                <span aria-hidden="true" className="mx-[0.6em] opacity-70">
                  /
                </span>
                2026
              </span>
              <span
                aria-hidden="true"
                className="hidden h-px w-8 bg-linear-to-l from-transparent to-[#7b80ff]/70 sm:block md:w-14"
              />
            </motion.p>

            <motion.h1
              id="hero-title"
              {...rise(0.2)}
              className="font-hero whitespace-nowrap text-ink text-[clamp(2.75rem,1rem+6vw,6rem)] leading-[1.02] tracking-[-0.03em]"
            >
              <span className="text-silver">Hey, I’m</span> <span className="text-indigo-glow">Noah</span>
              <span className="text-silver">.</span>
            </motion.h1>

            <motion.p {...rise(0.32)} className="mt-6 max-w-[38rem] text-lead text-pretty text-ink-soft md:mt-7">
              I make <span className="text-indigo">secure</span> and <span className="text-indigo">engaging</span> web
              applications.
            </motion.p>

            <motion.div {...rise(0.44)} className="mt-8 flex flex-wrap items-center justify-center gap-3 md:mt-9 md:gap-4">
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
          <motion.ul
            {...rise(0.6)}
            role="list"
            className="mt-12 grid w-full max-w-[64rem] grid-cols-1 gap-2.5 sm:grid-cols-3 md:mt-14 md:gap-4"
          >
            <li>
              <HeroCard glyph={icon.code} title="Modern Development" href="#work" label="See my work">
                Clean, scalable, and visually engaging design.
              </HeroCard>
            </li>
            <li>
              <HeroCard glyph={icon.bolt} title="Performance Focus">
                Optimized for speed, built for the future.
              </HeroCard>
            </li>
            <li>
              <HeroCard glyph={icon.shield} title="Secure by Design">
                Secure backend and a production-ready page is my priority.
              </HeroCard>
            </li>
          </motion.ul>
        </div>
      </div>
    </section>
  )
}
