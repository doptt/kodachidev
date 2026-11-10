import { SITE } from '@/content/site'

const link =
  'inline-flex min-h-11 items-center font-mono text-[0.75rem] tracking-[0.04em] text-ink-muted transition-colors duration-(--duration-base) hover:text-ink focus-ring'

export function Footer() {
  return (
    <footer className="relative border-t border-line bg-navy-950/70">
      <div className="mx-auto flex max-w-[76rem] flex-col items-center justify-between gap-3 px-5 py-8 sm:flex-row sm:px-8">
        <p className="font-mono text-[0.75rem] tracking-[0.04em] text-ink-muted">
          © {new Date().getFullYear()} {SITE.name}
        </p>
        <p className="font-mono text-[0.75rem] tracking-[0.04em] text-ink-faint">{SITE.footer}</p>
        <a href="#top" className={link}>
          Back to top ↑
        </a>
      </div>
    </footer>
  )
}
