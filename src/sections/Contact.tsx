import { useEffect, useState, type ReactNode } from 'react'
import { CONTACT } from '@/content/contact'
import { motion } from 'motion/react'
import { BlurText } from '@/components/effects/BlurText'
import { LiquidGlass } from '@/components/glass/LiquidGlass'
import { BentoCell, BentoPanel } from '@/components/ui/Bento'
import { Reveal, blurIn } from '@/components/ui/Reveal'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { Section } from '@/components/ui/Section'

const rowClass =
  'group/row flex h-full min-h-[5.5rem] w-full items-center gap-4 px-7 py-5 text-left transition-colors duration-(--duration-base) ease-(--ease-glass) hover:bg-periwinkle-300/[0.05] md:px-9 focus-ring'

function RowBody({ label, value, hint, icon }: { label: string; value: string; hint: ReactNode; icon: ReactNode }) {
  return (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-glass-sm bg-ink/[0.06] text-periwinkle-200 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {icon}
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <BlurText className="block font-mono text-[0.72rem] tracking-[0.08em] text-ink-faint" text={label} delay={0.2} />
        <BlurText className="mt-1 block truncate text-[1rem] text-ink" text={value} delay={0.3} />
      </span>
      <span className="shrink-0 text-[0.8rem] text-ink-muted transition-colors duration-(--duration-base) group-hover/row:text-ink">
        {hint}
      </span>
    </>
  )
}

const arrow = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M5 11 11 5M6 5h5v5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Contact: a short invitation on the left, three ways to reach me on the right. */
export function Contact() {
  const [copied, setCopied] = useState(false)
  const reduced = usePrefersReducedMotion()
  // The three ways to reach me slide into focus one after another
  const row = (i: number) => blurIn(reduced, 0.15 + i * 0.1, { y: 14, blur: 8, duration: 0.7 })
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(t)
  }, [copied])

  const copyDiscord = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT.discord.handle)
      setCopied(true)
    } catch {
      // Clipboard blocked: the handle is still visible to copy by hand
    }
  }

  return (
    <Section id="contact" scene="contact" labelledBy="contact-title">
      <Reveal>
        <BentoPanel>
          <BentoCell index={0} className="flex flex-col md:col-span-3 lg:col-span-6 lg:p-12">
            <BlurText as="p" className="eyebrow-indigo mb-5" text={CONTACT.eyebrow} />
            <BlurText as="h2" id="contact-title" className="font-hero text-display-lg" wordClassName="text-silver" text={CONTACT.title} delay={0.12} />
            <BlurText as="p" className="mt-5 max-w-[26rem] text-lead text-pretty text-ink-soft" text={CONTACT.lede} delay={0.3} />
            <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3 md:mt-auto md:pt-12">
              <LiquidGlass
                as="a"
                href={`mailto:${CONTACT.email}`}
                radius="pill"
                strength={36}
                rim={0.6}
                className="glass-dark glow-outline group inline-flex min-h-13 items-center focus-ring"
                contentClassName="flex items-center gap-3 py-1 pl-6 pr-2"
              >
                <span className="text-[0.95rem] font-medium text-ink">Send an email</span>
                <span
                  aria-hidden="true"
                  className="grid size-9 place-items-center rounded-full bg-periwinkle-200 text-navy-950 transition-transform duration-(--duration-base) ease-(--ease-glass) group-hover:translate-x-0.5"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </LiquidGlass>
              <BlurText as="p" className="text-[0.85rem] text-ink-muted" text={CONTACT.replyTime} delay={0.5} />
            </div>
          </BentoCell>

          <BentoCell index={1} className="p-0 md:col-span-3 md:p-0 lg:col-span-6">
            <ul role="list" className="flex h-full flex-col">
              <motion.li {...row(0)} className="flex-1 border-b border-line last:border-b-0">
                <a href={`mailto:${CONTACT.email}`} className={rowClass}>
                  <RowBody
                    label="Email"
                    value={CONTACT.email}
                    hint={arrow}
                    icon={<path d="M2.5 4.5h13v9h-13zM2.5 5l6.5 5 6.5-5" />}
                  />
                </a>
              </motion.li>
              <motion.li {...row(1)} className="flex-1 border-b border-line last:border-b-0">
                <a href={CONTACT.github.url} target="_blank" rel="noreferrer" className={rowClass}>
                  <RowBody
                    label="GitHub"
                    value={CONTACT.github.label}
                    hint={arrow}
                    icon={<path d="M6.5 5 2.5 9l4 4M11.5 5l4 4-4 4" />}
                  />
                </a>
              </motion.li>
              <motion.li {...row(2)} className="flex-1 border-b border-line last:border-b-0">
                <button type="button" onClick={copyDiscord} className={rowClass}>
                  <RowBody
                    label="Discord"
                    value={CONTACT.discord.handle}
                    hint={<span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>}
                    icon={<path d="M3 4.5h12v8H8.5L5.5 15v-2.5H3z" />}
                  />
                </button>
              </motion.li>
            </ul>
          </BentoCell>
        </BentoPanel>
      </Reveal>
    </Section>
  )
}
