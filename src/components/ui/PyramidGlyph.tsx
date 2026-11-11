import { cn } from '@/lib/cn'

/** Line drawing of the pyramid mark, for small tiles where the particle version would be mush. */
export function PyramidGlyph({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 3 2.5 16.5 13.5 21 21.5 15.5Z" />
      <path d="M12 3 13.5 21" />
      <path d="M2.5 16.5 21.5 15.5" strokeOpacity="0.35" strokeDasharray="1.5 2.5" />
    </svg>
  )
}

/** Dark rounded tile holding the pyramid glyph: the site's small logo chip. */
export function PyramidTile({ size = 44, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center bg-navy-950 text-periwinkle-200 shadow-[inset_0_1px_0_rgb(220_222_255/0.18),inset_0_0_0_1px_rgb(142_150_255/0.3),0_6px_16px_-6px_rgb(5_6_26/0.8)]',
        className,
      )}
      style={{ width: size, height: size, borderRadius: size * 0.29 }}
    >
      <PyramidGlyph size={Math.round(size * 0.56)} />
    </span>
  )
}
