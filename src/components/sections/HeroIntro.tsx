export function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// The headline and buttons, shared by the phone and full heroes
export default function HeroIntro() {
  return (
    <div className="hero-scrim relative mx-auto flex w-full max-w-5xl flex-col items-center text-center">
      <div className="mb-8 inline-flex animate-fade-up items-center gap-2.5 rounded-full border border-accent/20 bg-accent/8 px-4 py-2 backdrop-blur-md">
        <span className="h-2 w-2 shrink-0 animate-status rounded-full bg-accent" />
        <span className="font-mono text-xs uppercase tracking-[0.12em] text-lavender">Available for Work</span>
      </div>

      <h1 className="max-w-[780px] animate-fade-up font-display text-[clamp(2.4rem,6vw,5rem)] leading-[1.08] font-light tracking-[-0.03em] delay-100">
        Modern websites built to <span className="text-gradient">grow your business.</span>
      </h1>

      <p className="mt-6 max-w-xl animate-fade-up text-base leading-[1.7] text-muted delay-200 sm:text-lg">
        I build fast, responsive websites that turn visitors into customers.
      </p>

      <div className="mt-8 flex animate-fade-up flex-col items-center gap-3 delay-300 sm:flex-row">
        <a href="#contact" className="btn-primary rounded-xl px-7 py-3.5 text-sm">
          Contact me
        </a>
        <a href="#work" className="btn-ghost rounded-xl px-7 py-3.5 text-sm backdrop-blur-md max-sm:bg-deep/70">
          Explore My Work
          <ArrowIcon />
        </a>
      </div>
    </div>
  )
}
