import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type GlassVariant = 'blur' | 'tint'
export type GlassRadius = 'sm' | 'md' | 'lg' | 'pill' | 'none'

const radii: Record<GlassRadius, string> = {
  none: '',
  sm: 'rounded-glass-sm',
  md: 'rounded-glass',
  lg: 'rounded-glass-lg',
  pill: 'rounded-pill',
}

type OwnProps<T extends ElementType> = {
  /** Element to render, e.g. 'div', 'a', 'nav', 'section'. */
  as?: T
  /** 'blur' uses backdrop-filter (budget: 2–3 in view). 'tint' is a translucent tint only. */
  variant?: GlassVariant
  radius?: GlassRadius
  className?: string
  /** Extra classes for the inner content wrapper (sits above the border/grain layers). */
  contentClassName?: string
  children?: ReactNode
}

export type GlassSurfaceProps<T extends ElementType = 'div'> = OwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof OwnProps<T>>

/**
 * Base glass recipe: dark translucent tint, gradient inner border (brighter at
 * the top), soft top highlight, inner glow and fine grain.
 */
export function GlassSurface<T extends ElementType = 'div'>({
  as,
  variant = 'blur',
  radius = 'md',
  className,
  contentClassName,
  children,
  ...rest
}: GlassSurfaceProps<T>) {
  const Tag = (as ?? 'div') as ElementType
  return (
    <Tag
      className={cn('glass', variant === 'blur' ? 'glass-blur' : 'glass-tint', radii[radius], className)}
      {...rest}
    >
      <div className={cn('glass-content', contentClassName)}>{children}</div>
    </Tag>
  )
}
