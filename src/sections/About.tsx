import { ABOUT, type StackCategory } from '@/content/about'
import { StarField } from '@/blackhole/StarField'
import { RevealText } from '@/components/effects/RevealText'
import { BentoCell, BentoPanel } from '@/components/ui/Bento'
import { Reveal } from '@/components/ui/Reveal'
import { Chip, Section, SectionHeader } from '@/components/ui/Section'

const categories: StackCategory[] = ['Framework', 'Language', 'Styling', 'Markup', 'Tooling']
const label = 'font-mono text-[0.72rem] tracking-[0.08em] text-ink-faint'

/**
 * How I work and the tools I use, in one hairline bento panel. The bio and the
 * numbers that used to open this panel now live in AboutSpace, in the dark
 * above the black hole.
 *
 * It sits between the lensed sky and the moon, so it is set in the same dark:
 * `on-dark` swaps the site's periwinkle inks for the black hole's cream.
 */
export function About() {
  return (
    <div className="relative">
      <StarField seed={0x1b7d} />
      <Section id="approach" scene="blackhole" labelledBy="approach-title" className="on-dark">
      <SectionHeader id="approach-title" eyebrow={ABOUT.approach.eyebrow} title={ABOUT.approach.title} />

      <Reveal>
        <BentoPanel>
          {/* How I work */}
          {ABOUT.traits.map((t, i) => (
            <BentoCell key={t.title} index={i} className="hover:bg-periwinkle-300/[0.035] lg:col-span-3">
              <p className={label} aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </p>
              <RevealText as="h3" className="mt-8 text-[1.05rem] font-medium tracking-[-0.01em] text-ink" text={t.title} delay={0.15 + i * 0.07} />
              <RevealText as="p" className="mt-2 text-[0.9rem] leading-[1.6] text-pretty text-ink-muted" text={t.body} delay={0.3 + i * 0.07} />
            </BentoCell>
          ))}

          {/* Tools */}
          <BentoCell index={ABOUT.traits.length} className="md:col-span-6 lg:col-span-12">
            <RevealText as="h3" className={label} text="Tools I use" />
            <dl className="mt-6 grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
              {categories.map((c, i) => (
                <div key={c}>
                  <RevealText as="dt" className="mb-2.5 text-[0.85rem] text-ink-soft" text={c} delay={0.1 + i * 0.06} />
                  <dd className="flex flex-wrap gap-1.5">
                    {ABOUT.stack
                      .filter((s) => s.category === c)
                      .map((s) => (
                        <Chip key={s.label}>{s.label}</Chip>
                      ))}
                  </dd>
                </div>
              ))}
            </dl>
          </BentoCell>
        </BentoPanel>
      </Reveal>
      </Section>
    </div>
  )
}
