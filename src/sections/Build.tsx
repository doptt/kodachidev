import { BUILD_INTRO, BUILD_ITEMS } from '@/content/build'
import { RevealText } from '@/components/effects/RevealText'
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
              index={i}
              key={item.id}
              // On a phone the drawing stands beside its number and title and the words run under both,
              // so six cells are three screens, not seven; from 640px up it is the column it always was
              className={`grid grid-cols-[8.25rem_minmax(0,1fr)] gap-x-4 hover:bg-periwinkle-300/[0.035] data-[lit=true]:bg-periwinkle-300/[0.035] sm:flex sm:flex-col ${spans[i]}`}
            >
              <span className="col-start-2 row-start-1 max-sm:self-end font-mono text-[0.72rem] tracking-[0.08em] text-ink-faint" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="col-start-1 row-span-2 row-start-1 flex justify-center max-sm:items-center sm:py-4 md:py-6">
                <IsoArt boxes={art[item.id]} floatDelay={i * 1.3} />
              </div>
              <RevealText
                as="h3"
                className="col-start-2 row-start-2 text-[1.05rem] max-sm:mt-1.5 max-sm:self-start font-medium tracking-[-0.01em] text-ink"
                text={item.title}
                delay={0.15 + i * 0.07}
              />
              <RevealText
                as="p"
                className="col-span-2 mt-2 max-w-[26rem] text-[0.9rem] leading-[1.6] text-pretty text-ink-muted max-sm:mt-3"
                text={item.body}
                delay={0.3 + i * 0.07}
              />
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
