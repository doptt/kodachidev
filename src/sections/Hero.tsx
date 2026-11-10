import { motion } from 'motion/react'
import { LiquidGlass } from '@/components/glass/LiquidGlass'
import { FlipWords } from '@/components/effects/FlipWords'
import { Spotlight, SpotlightReveal } from '@/components/effects/Spotlight'
import { HeroCluster } from '@/components/hero/HeroCluster'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'

const words = ['care.', 'intent.', 'craft.']

export function Hero() {
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
      {/* Soft scrim behind the text column so type stays legible over bright ridges */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(70% 80% at 22% 55%, rgb(5 6 26 / 0.72) 0%, rgb(5 6 26 / 0.4) 45%, rgb(5 6 26 / 0) 100%)',
        }}
      />
      <Spotlight className="min-h-svh" radius={460} rest={[0.3, 0.4]}>
        <div className="relative z-[1] mx-auto flex min-h-svh max-w-[88rem] flex-col justify-center px-5 pb-16 pt-28 sm:px-8 md:px-12 md:pb-24 md:pt-36 lg:px-16">
          <div className="max-w-[62rem] lg:max-w-[46%] xl:max-w-[48%]">
            <motion.p {...rise(0.05)} className="label-mono mb-6 md:mb-8">
              Noah, web developer
              <span aria-hidden="true" className="mx-2 text-ink-faint">
                /
              </span>
              Portfolio
            </motion.p>

            <motion.h1
              id="hero-title"
              {...rise(0.15)}
              className="font-display-light text-display-xl text-balance text-ink lg:text-[clamp(3.25rem,4.9vw,5.6rem)]"
            >
              <SpotlightReveal
                revealClassName="text-periwinkle-100"
                reveal={
                  <>
                    Websites,
                    <br />
                    built with <span className="invisible">{words[0]}</span>
                  </>
                }
              >
                Websites,
                <br />
                built with <FlipWords words={words} className="text-periwinkle-200" />
              </SpotlightReveal>
            </motion.h1>

            <motion.p {...rise(0.3)} className="mt-7 max-w-[34rem] text-lead text-pretty text-ink-soft md:mt-9">
              I design and build fast, modern websites, from the first sketch to the last pixel. Here is some
              of what I have made.
            </motion.p>

            <motion.div {...rise(0.42)} className="mt-9 flex flex-wrap items-center gap-3 md:mt-11 md:gap-4">
              <LiquidGlass
                as="a"
                href="#work"
                radius="pill"
                strength={36}
                rim={0.6}
                className="group inline-flex min-h-13 items-center transition-shadow duration-(--duration-base) ease-(--ease-glass) hover:shadow-(--shadow-glow) focus-ring"
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
                Get in touch
              </a>
            </motion.div>
          </div>

          {/* Floating glass cluster, right column at lg+ */}
          <HeroCluster className="absolute bottom-[16svh] right-[4%] top-[18svh] min-h-[420px] w-[42%] xl:right-[5%] xl:w-[40%]" />

          {/* Scroll cue, bottom left under the text column on wide screens */}
          <motion.a
            {...rise(0.7)}
            href="#build"
            className="label-mono absolute bottom-8 left-12 hidden items-center gap-3 rounded-pill py-2 pl-1 pr-2 text-ink-muted hover:text-ink md:flex lg:left-16 focus-ring"
          >
            <span aria-hidden="true" className="relative block h-10 w-px overflow-hidden bg-ink-faint/40">
              <motion.span
                className="absolute inset-x-0 top-0 h-1/2 bg-periwinkle-200"
                animate={reduced ? undefined : { y: ['-100%', '200%'] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
            </span>
            Scroll
          </motion.a>
        </div>
      </Spotlight>
    </section>
  )
}
