import { BUILD_INTRO, BUILD_ITEMS } from '@/content/build'
import { BentoCell, BentoPanel } from '@/components/ui/Bento'
import { Reveal } from '@/components/ui/Reveal'
import { Section, SectionHeader } from '@/components/ui/Section'
import { ISO_ART, IsoArt, type IsoBox } from '@/components/build/IsoArt'

const art: Record<(typeof BUILD_ITEMS)[number]['id'], readonly IsoBox[]> = {
  design: ISO_ART.design,
  responsive: ISO_ART.responsive,
  secure: ISO_ART.secure,
  backend: ISO_ART.backend,
  payments: ISO_ART.payments,
  launch: ISO_ART.launch,
}

// Uneven widths on wide screens: 5/4/3 on the first row, mirrored on the second
const spans = ['lg:col-span-5', 'lg:col-span-4', 'lg:col-span-3', 'lg:col-span-3', 'lg:col-span-4', 'lg:col-span-5']

/** "What I build": one glass panel of six hairline cells, each with an isometric drawing. */
export function Build() {
  return (
    <Section id="build" scene="build" labelledBy="build-title">
      <SectionHeader id="build-title" eyebrow={BUILD_INTRO.eyebrow} title={BUILD_INTRO.title} lede={BUILD_INTRO.lede} />

      <Reveal>
        <BentoPanel as="ul">
          {BUILD_ITEMS.map((item, i) => (
            <BentoCell
              as="li"
              key={item.id}
              className={`flex flex-col hover:bg-periwinkle-300/[0.035] ${spans[i]}`}
            >
              <span className="font-mono text-[0.72rem] tracking-[0.08em] text-ink-faint" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="flex justify-center py-4 md:py-6">
                <IsoArt boxes={art[item.id]} floatDelay={i * 1.3} />
              </div>
              <h3 className="text-[1.05rem] font-medium tracking-[-0.01em] text-ink">{item.title}</h3>
              <p className="mt-2 max-w-[26rem] text-[0.9rem] leading-[1.6] text-pretty text-ink-muted">{item.body}</p>
            </BentoCell>
          ))}
        </BentoPanel>
      </Reveal>

      <Reveal delay={0.1}>
        <p className="mt-8 text-[0.95rem] text-ink-muted">
          Not sure what you need? That’s fine,{' '}
          <a
            href="#contact"
            className="text-ink underline decoration-ink-faint/60 underline-offset-[5px] transition-colors duration-(--duration-base) hover:decoration-periwinkle-300 focus-ring"
          >
            we can figure it out together
          </a>
          .
        </p>
      </Reveal>
    </Section>
  )
}
