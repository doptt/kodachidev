import { CONTACT } from '@/content/contact'
import { SITE } from '@/content/site'
import { PyramidTile } from '@/components/ui/PyramidGlyph'

const link =
  'inline-flex min-h-11 items-center text-[0.9rem] text-ink-muted transition-colors duration-(--duration-base) hover:text-ink focus-ring md:min-h-8'
const heading = 'mb-2 font-mono text-[0.72rem] tracking-[0.08em] text-ink-faint'
const small = 'font-mono text-[0.75rem] tracking-[0.04em]'

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-line bg-navy-950/80">
      <div className="mx-auto max-w-[76rem] px-5 pt-14 sm:px-8 md:pt-16">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-12">
          <div className="sm:col-span-2 md:col-span-6">
            <a href="#top" className="inline-flex items-center gap-3 rounded-glass-sm text-ink focus-ring">
              <PyramidTile size={40} />
              <span className="font-nav text-[1.05rem] font-light tracking-tight">{SITE.name}</span>
            </a>
            <p className="mt-5 max-w-[24rem] text-[0.95rem] leading-[1.6] text-pretty text-ink-muted">
              {SITE.role}. Websites designed, built and launched by one person, start to finish.
            </p>
          </div>

          <nav aria-label="Footer" className="md:col-span-3">
            <p className={heading}>Site</p>
            <ul role="list">
              {SITE.nav.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className={link}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="md:col-span-3">
            <p className={heading}>Elsewhere</p>
            <ul role="list">
              <li>
                <a href={`mailto:${CONTACT.email}`} className={link}>
                  {CONTACT.email}
                </a>
              </li>
              <li>
                <a href={CONTACT.github.url} target="_blank" rel="noreferrer" className={link}>
                  {CONTACT.github.label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-line py-6 sm:flex-row">
          <p className={`${small} text-ink-muted`}>
            © {new Date().getFullYear()} {SITE.name}
          </p>
          <p className={`${small} text-ink-faint`}>{SITE.footer}</p>
          <a href="#top" className={`${small} inline-flex min-h-11 items-center text-ink-muted transition-colors duration-(--duration-base) hover:text-ink focus-ring`}>
            Back to top ↑
          </a>
        </div>
      </div>

      {/* Oversized wordmark, cut off by the bottom edge */}
      <p
        aria-hidden="true"
        className="pointer-events-none -mb-[0.26em] select-none text-center font-hero text-[clamp(4rem,17.5vw,17rem)] leading-none tracking-[-0.04em] whitespace-nowrap text-transparent"
        style={{
          backgroundImage: 'linear-gradient(180deg, rgb(142 150 255 / 0.26) 0%, rgb(142 150 255 / 0.03) 78%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
        }}
      >
        {SITE.name}
      </p>
    </footer>
  )
}
