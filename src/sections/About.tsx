import { ABOUT, type StackCategory } from '@/content/about'
import { BentoCell, BentoPanel } from '@/components/ui/Bento'
import { Reveal } from '@/components/ui/Reveal'
import { Chip, Section, SectionHeader } from '@/components/ui/Section'

const categories: StackCategory[] = ['Framework', 'Language', 'Styling', 'Markup', 'Tooling']
const label = 'font-mono text-[0.72rem] tracking-[0.08em] text-ink-faint'

/** About: bio, quick numbers, how I work and the tools I use, in one hairline bento panel. */
export function About() {
  return (
    <Section id="about" scene="about" labelledBy="about-title">
      <SectionHeader id="about-title" eyebrow={ABOUT.eyebrow} title={ABOUT.title} />

      <Reveal>
        <BentoPanel>
          {/* Bio */}
          <BentoCell className="md:col-span-6 lg:col-span-7 lg:row-span-3 lg:p-12">
            <p className={label}>Bio</p>
            <p className="mt-6 max-w-[34rem] font-hero text-[clamp(1.4rem,1.1rem+1.1vw,1.9rem)] leading-[1.3] tracking-[-0.01em] text-pretty text-ink">
              {ABOUT.intro}
            </p>
            <div className="mt-6 max-w-[34rem] space-y-4 text-[0.98rem] leading-[1.7] text-pretty text-ink-muted">
              {ABOUT.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </BentoCell>

          {/* Numbers */}
          {ABOUT.stats.map((s) => (
            <BentoCell key={s.label} className="flex items-baseline justify-between gap-6 md:col-span-2 md:flex-col md:justify-start md:gap-3 lg:col-span-5 lg:flex-row lg:items-baseline lg:justify-between">
              <span className="font-hero text-[clamp(2rem,1.5rem+1.6vw,2.75rem)] leading-none tracking-[-0.02em] text-indigo-glow">
                {s.value}
              </span>
              <span className="text-right text-[0.9rem] text-ink-muted md:text-left lg:text-right">{s.label}</span>
            </BentoCell>
          ))}

          {/* How I work */}
          {ABOUT.traits.map((t, i) => (
            <BentoCell key={t.title} className="hover:bg-periwinkle-300/[0.035] lg:col-span-3">
              <p className={label} aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-8 text-[1.05rem] font-medium tracking-[-0.01em] text-ink">{t.title}</h3>
              <p className="mt-2 text-[0.9rem] leading-[1.6] text-pretty text-ink-muted">{t.body}</p>
            </BentoCell>
          ))}

          {/* Tools */}
          <BentoCell className="md:col-span-6 lg:col-span-12">
            <h3 className={label}>Tools I use</h3>
            <dl className="mt-6 grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
              {categories.map((c) => (
                <div key={c}>
                  <dt className="mb-2.5 text-[0.85rem] text-ink-soft">{c}</dt>
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
  )
}
