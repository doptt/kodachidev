import { useRef } from 'react'
import { motion, useScroll, useTransform, type MotionValue } from 'motion/react'
import { ABOUT } from '@/content/about'
import { StarField } from '@/blackhole/StarField'
import { BlurText } from '@/components/effects/BlurText'
import { ScrambleText } from '@/components/effects/ScrambleText'
import { Reveal } from '@/components/ui/Reveal'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'

/** The headline, split the way it is set: a small lead-in, then two enormous words. */
const LEAD_IN = 'A bit'
const BIG = 'about me'
const NBSP = String.fromCharCode(160)

const label = 'font-mono text-[0.72rem] tracking-[0.08em] text-bh-glow'

/**
 * One letter of the big headline. It comes alight in turn as the headline
 * climbs the screen: a blurred ghost of the letter gives way to the sharp one,
 * and its glow comes up behind it.
 *
 * Nothing here is re-drawn while scrolling. The ghost, the glow and the letter
 * are three fixed pictures stacked on each other, and only their opacity
 * changes. Animating the blur or the glow itself would mean repainting letters
 * a third of a screen tall, with their shadows, on every frame.
 */
function Letter({ char, index, count, progress }: { char: string; index: number; count: number; progress: MotionValue<number> }) {
  const from = (index / count) * 0.55
  const lit = useTransform(progress, [from, from + 0.4], [0, 1])
  const sharp = useTransform(lit, [0, 0.35, 1], [0, 0.25, 1])
  const ghost = useTransform(lit, [0, 0.5, 1], [0.16, 0.5, 0])
  const glyph = char === ' ' ? NBSP : char
  return (
    <span className="relative inline-block">
      <motion.span className="bigtext-ghost" style={{ opacity: ghost }}>
        {glyph}
      </motion.span>
      <motion.span className="bigtext-glow" style={{ opacity: lit }}>
        {glyph}
      </motion.span>
      <motion.span className="bigtext-sharp" style={{ opacity: sharp }}>
        {glyph}
      </motion.span>
    </span>
  )
}

/**
 * About, set in the dark between the page and the black hole: nothing here but
 * stars, so the type can be the light source. A small lead-in sits over two
 * enormous glowing words that light up letter by letter as they scroll into
 * place; underneath, the bio decodes itself out of scrambled letters, beside
 * three numbers.
 */
export function AboutSpace() {
  const headline = useRef<HTMLHeadingElement>(null)
  const reduced = usePrefersReducedMotion()
  // 0 as the headline comes in at the bottom of the screen, 1 once it is a third of the way up
  const { scrollYProgress } = useScroll({ target: headline, offset: ['start 0.98', 'start 0.34'] })
  const drift = useTransform(scrollYProgress, [0, 1], ['3%', '0%'])

  return (
    <section
      id="about"
      aria-labelledby="about-title"
      data-bg-scene="blackhole"
      className="relative overflow-x-clip pb-[42lvh] pt-[8lvh]"
    >
      <StarField seed={0x77c1} />

      <div className="relative mx-auto max-w-[110rem] px-5 sm:px-8 lg:px-12">
        <h2 id="about-title" ref={headline} aria-label={`${LEAD_IN} ${BIG}.`} className="relative">
          <BlurText
            className="mb-[0.6vw] block pl-[0.4vw] font-hero text-[clamp(1rem,0.55rem+1.25vw,1.75rem)] font-medium uppercase tracking-[0.01em] text-bh-accent"
            text={`${LEAD_IN},`}
          />
          <motion.span
            aria-hidden="true"
            className="bigtext relative block whitespace-nowrap text-[clamp(4.1rem,20.4vw,24rem)]"
            style={reduced ? undefined : { x: drift }}
          >
            {/* The wide, soft light the words throw into the dark around them */}
            <motion.span className="bigtext-aura" style={reduced ? undefined : { opacity: scrollYProgress }} />
            {reduced ? (
              <span className="bigtext-static relative">{BIG}</span>
            ) : (
              BIG.split('').map((char, i) => <Letter key={i} char={char} index={i} count={BIG.length} progress={scrollYProgress} />)
            )}
          </motion.span>
        </h2>

        <div className="mt-[clamp(3.5rem,7vw,7rem)] grid gap-y-14 lg:grid-cols-12 lg:gap-x-10">
          {/* Numbers */}
          <div className="lg:col-span-4">
            <BlurText as="p" className={label} text="////// In numbers" />
            <dl className="mt-7 space-y-7">
              {ABOUT.stats.map((s, i) => (
                // One <div> per pair, directly inside the <dl>: the only grouping a description list allows
                <Reveal key={s.label} delay={i * 0.1} className="flex items-baseline gap-5 border-t border-bh-accent/15 pt-5">
                  <dt className="order-2 font-mono text-[0.8rem] tracking-[0.02em] text-bh-glow">{s.label}</dt>
                  <dd className="bigtext-number order-1 min-w-[5.5ch] font-hero text-[clamp(2.1rem,1.5rem+1.6vw,3rem)] leading-none tracking-[-0.03em]">
                    {s.value}
                  </dd>
                </Reveal>
              ))}
            </dl>
          </div>

          {/* Bio */}
          <div className="lg:col-span-7 lg:col-start-6">
            <BlurText as="p" className={label} text="////// Bio" />
            <ScrambleText
              className="mt-7 font-mono text-[clamp(1rem,0.9rem+0.45vw,1.3rem)] leading-[1.55] text-[#eadfc9]"
              text={ABOUT.intro}
            />
            <div className="mt-8 space-y-6">
              {ABOUT.body.map((p) => (
                <ScrambleText key={p} className="max-w-[46rem] font-mono text-[0.9rem] leading-[1.8] text-[#b3a792]" text={p} />
              ))}
            </div>
            <BlurText as="p" className={`${label} mt-12`} text="/// The work is further down" delay={0.2} />
          </div>
        </div>
      </div>
    </section>
  )
}
