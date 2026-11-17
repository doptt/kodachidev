import { CONTACT } from '@/content/contact'
import { SITE } from '@/content/site'

const link =
  'inline-flex min-h-11 items-center text-[0.88rem] text-[#eadfc9] transition-colors duration-(--duration-base) hover:text-bh-highlight focus-ring lg:min-h-8'
const small = 'font-mono text-[0.72rem] tracking-[0.04em] text-bh-accent'

/**
 * The footer, at the foot of the moon. With the moon scene running it is laid
 * over the bottom of the last pinned screen, on a shade that rises out of the
 * black, so that the page ends on the settled moon with this along its lower
 * edge; where the contact section is the flat picture instead, it follows the
 * picture on black. Both are decided in moon/moon.css, by whether the pinned
 * stage is on the page.
 */
export function Footer() {
  return (
    <footer className="moon-footer">
      <div className="mx-auto flex w-full max-w-[84rem] flex-col gap-x-10 gap-y-1 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 sm:gap-y-3 sm:px-8 sm:pb-7 sm:pt-6 lg:flex-row lg:items-end lg:justify-between lg:px-14 lg:pb-6">
        <div>
          <div className="flex items-center justify-between">
            <a href="#top" className="inline-flex min-h-11 items-center rounded-glass-sm font-nav text-[1.05rem] font-light tracking-tight text-bh-highlight focus-ring lg:min-h-8">
              {SITE.name}
            </a>
            {/* Phones: the way back up is here, so the links below fit one row and the footer stays low on the moon */}
            <a
              href="#top"
              aria-label="Back to top"
              className="-mr-2 grid size-11 place-items-center rounded-full text-[#eadfc9] transition-colors duration-(--duration-base) active:text-bh-highlight focus-ring sm:hidden"
            >
              <span className="grid size-8 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgb(188_166_142/0.4)]">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path d="M8 13V3M4 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </a>
          </div>
          <p className={small}>
            © {new Date().getFullYear()} {SITE.name}. {SITE.footer}
          </p>
        </div>

        <nav aria-label="Footer">
          <ul role="list" className="flex flex-wrap justify-between gap-x-4 sm:justify-start sm:gap-x-6">
            {SITE.nav.map((l) => (
              <li key={l.href}>
                <a href={l.href} className={link}>
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <a href={CONTACT.github.url} target="_blank" rel="noreferrer" className={link}>
                GitHub
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
            <li className="max-sm:hidden">
              <a href="#top" className={link}>
                Back to top
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}
