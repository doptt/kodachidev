import type { ElementType, ReactNode } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/cn'
import { GlassSurface } from '@/components/glass/GlassSurface'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { blurIn } from './Reveal'

/**
 * One dark glass panel divided into cells by hairlines, in place of separate
 * cards. Cells set their own column spans; the panel clips the outer lines.
 */
export function BentoPanel({
  as,
  className,
  gridClassName,
  children,
}: {
  /** Element for the grid itself, e.g. 'ul' when the cells are list items. */
  as?: ElementType
  className?: string
  gridClassName?: string
  children: ReactNode
}) {
  const Grid = (as ?? 'div') as ElementType
  return (
    <GlassSurface
      variant="blur"
      radius="lg"
      className={cn('glass-dark', className)}
      contentClassName="overflow-hidden rounded-[inherit]"
    >
      <Grid
        role={as === 'ul' ? 'list' : undefined}
        className={cn('-mb-px -mr-px grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12', gridClassName)}
      >
        {children}
      </Grid>
    </GlassSurface>
  )
}

/**
 * One cell of a bento panel. Cells come into focus one after another as the
 * panel scrolls into view: pass `index` to place a cell in that sequence.
 */
export function BentoCell({
  as,
  index = 0,
  className,
  children,
}: {
  as?: 'div' | 'li'
  /** Position in the entrance sequence. */
  index?: number
  className?: string
  children: ReactNode
}) {
  const reduced = usePrefersReducedMotion()
  const Tag = as === 'li' ? motion.li : motion.div
  return (
    <Tag
      {...blurIn(reduced, index * 0.07, { y: 16, blur: 8, duration: 0.7 })}
      className={cn(
        'group/cell relative border-b border-r border-line p-7 transition-colors duration-(--duration-base) ease-(--ease-glass) md:col-span-3 md:p-9',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
