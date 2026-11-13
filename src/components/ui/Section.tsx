import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { RevealText } from '@/components/effects/RevealText'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/cn'
import { blurIn } from './Reveal'

/**
 * Page section: registers its background scene, lays a soft scrim over the
 * animated background so type stays legible, and centres the content column.
 */
export function Section({
  id,
  scene,
  labelledBy,
  className,
  children,
}: {
  id: string
  scene: string
  labelledBy: string
  className?: string
  children: ReactNode
}) {
  return (
    <section id={id} data-bg-scene={scene} aria-labelledby={labelledBy} className={cn('relative overflow-x-clip py-24 md:py-36', className)}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgb(5 6 26 / 0) 0%, rgb(5 6 26 / 0.5) 16%, rgb(5 6 26 / 0.5) 84%, rgb(5 6 26 / 0) 100%)',
        }}
      />
      <div className="relative mx-auto max-w-[76rem] px-5 sm:px-8">{children}</div>
    </section>
  )
}

/** Eyebrow, headline and optional lede, left-aligned above a section's content. Each arrives word by word. */
export function SectionHeader({
  id,
  eyebrow,
  title,
  lede,
  className,
}: {
  id: string
  eyebrow: string
  title: string
  lede?: string
  className?: string
}) {
  return (
    <div className={cn('mb-12 max-w-[44rem] md:mb-16', className)}>
      <RevealText as="p" className="eyebrow-indigo mb-5" text={eyebrow} />
      <RevealText as="h2" id={id} className="font-hero text-display-lg text-balance" wordClassName="text-silver" text={title} delay={0.12} />
      {lede && <RevealText as="p" className="mt-5 max-w-[36rem] text-lead text-pretty text-ink-soft" text={lede} delay={0.3} />}
    </div>
  )
}

/** Small outlined tag for stack items, roles and the like. Pops into focus when it scrolls into view. */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = usePrefersReducedMotion()
  return (
    <motion.span
      {...blurIn(reduced, 0, { y: 6, blur: 6, duration: 0.5 })}
      className={cn(
        'inline-flex items-center rounded-pill bg-ink/[0.04] px-2.5 py-1 font-mono text-[0.72rem] tracking-[0.03em] text-ink-muted shadow-[inset_0_0_0_1px_rgb(199_203_255/0.12)]',
        className,
      )}
    >
      {children}
    </motion.span>
  )
}
