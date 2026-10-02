export default function Footer({ onHome = true }: { onHome?: boolean }) {
  const linkClass = 'font-mono text-xs tracking-wide text-muted transition-colors duration-200 hover:text-accent'

  return (
    <footer className="relative border-t border-accent/8 px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
        <a href={onHome ? '#home' : '/'} className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand font-display text-[9px] font-bold">
            NW
          </span>
          <span className="font-display text-sm font-semibold tracking-tight text-muted">kodachi.dev</span>
        </a>

        <p className="font-mono text-xs tracking-wide text-muted/50">© {new Date().getFullYear()} kodachi.dev</p>

        <div className="flex items-center gap-6">
          <a href="/terms" className={linkClass}>
            Terms
          </a>
          <a href="#top" className={linkClass}>
            Back to top ↑
          </a>
        </div>
      </div>
    </footer>
  )
}
