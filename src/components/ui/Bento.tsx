import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { GlassSurface } from '@/components/glass/GlassSurface'

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

export function BentoCell({
  as,
  className,
  children,
}: {
  as?: ElementType
  className?: string
  children: ReactNode
}) {
  const Tag = (as ?? 'div') as ElementType
  return (
    <Tag
      className={cn(
        'group/cell relative border-b border-r border-line p-7 transition-colors duration-(--duration-base) ease-(--ease-glass) md:col-span-3 md:p-9',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
