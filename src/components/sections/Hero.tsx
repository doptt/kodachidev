import type { CSSProperties } from 'react'

// Blurred light shapes behind the headline. Pure decoration.
const GLOWS: { className: string; style: CSSProperties }[] = [
  // Core bloom
  {
    className: 'animate-pulse-glow',
    style: {
      width: 520,
      height: 520,
      borderRadius: '50%',
      filter: 'blur(40px)',
      background:
        'radial-gradient(circle, rgb(117 71 255 / 0.35) 0%, rgb(155 109 255 / 0.18) 30%, rgb(117 71 255 / 0.06) 60%, transparent 75%)',
    },
  },
  // Outer haze
  {
    className: 'animate-drift-slow',
    style: {
      width: 800,
      height: 600,
      borderRadius: '50%',
      filter: 'blur(60px)',
      background: 'radial-gradient(ellipse, rgb(155 109 255 / 0.12) 0%, rgb(117 71 255 / 0.06) 40%, transparent 70%)',
    },
  },
  // Left nebula
  {
    className: 'animate-drift',
    style: {
      width: 380,
      height: 280,
      left: '5%',
      top: '30%',
      filter: 'blur(50px)',
      background: 'radial-gradient(ellipse at 60% 40%, rgb(117 71 255 / 0.18) 0%, rgb(155 109 255 / 0.08) 50%, transparent 70%)',
    },
  },
  // Right nebula
  {
    className: 'animate-drift',
    style: {
      width: 320,
      height: 240,
      right: '5%',
      top: '35%',
      filter: 'blur(45px)',
      animationDelay: '-8s',
      background: 'radial-gradient(ellipse at 40% 60%, rgb(198 169 255 / 0.12) 0%, rgb(155 109 255 / 0.06) 50%, transparent 70%)',
    },
  },
  // Light from above
  {
    className: 'animate-nebula',
    style: {
      width: 600,
      height: 200,
      top: '10%',
      filter: 'blur(40px)',
      background: 'radial-gradient(ellipse at 50% 0%, rgb(155 109 255 / 0.14) 0%, transparent 70%)',
    },
  },
  // Ribbon, top right
  {
    className: 'animate-float',
    style: {
      width: 250,
      height: 400,
      right: '15%',
      top: '15%',
      filter: 'blur(35px)',
      animationDelay: '-3s',
      borderRadius: '40% 60% 70% 30% / 40% 50% 60% 50%',
      background: 'linear-gradient(160deg, rgb(117 71 255 / 0.15) 0%, rgb(155 109 255 / 0.08) 30%, transparent 60%)',
    },
  },
  // Ribbon, bottom left
  {
    className: 'animate-float',
    style: {
      width: 200,
      height: 340,
      left: '20%',
      bottom: '15%',
      filter: 'blur(30px)',
      animationDelay: '-6s',
      borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%',
      background: 'linear-gradient(200deg, rgb(198 169 255 / 0.1) 0%, rgb(117 71 255 / 0.06) 40%, transparent 70%)',
    },
  },
  // Glassy crystal in the middle
  {
    className: 'animate-pulse-glow',
    style: {
      width: 180,
      height: 220,
      filter: 'blur(2px)',
      animationDelay: '-2s',
      border: '1px solid rgb(155 109 255 / 0.15)',
      borderRadius: '30% 70% 70% 30% / 30% 30% 70% 70%',
      background:
        'linear-gradient(135deg, rgb(198 169 255 / 0.12) 0%, rgb(155 109 255 / 0.08) 30%, rgb(117 71 255 / 0.15) 60%, rgb(198 169 255 / 0.06) 100%)',
    },
  },
]

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function Hero() {
  return (
    <section id="home" className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden pt-[100px] pb-20">
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center" aria-hidden>
        {GLOWS.map((glow, i) => (
          <div key={i} className={`absolute ${glow.className}`} style={glow.style} />
        ))}
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-6 text-center">
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
          <a href="#work" className="btn-ghost rounded-xl px-7 py-3.5 text-sm">
            Explore My Work
            <ArrowIcon />
          </a>
        </div>

        <p className="mt-6 animate-fade-up font-mono text-xs tracking-wide text-muted delay-400">
          Projects starting at: <span className="text-lavender">$125</span>
        </p>
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 animate-fade-up flex-col items-center gap-2 delay-700" aria-hidden>
        <span className="font-mono text-xs tracking-[0.1em] text-muted/60">SCROLL</span>
        <div className="relative h-10 w-px overflow-hidden bg-accent/15">
          <div className="animate-scroll-hint absolute inset-x-0 top-0 h-1/2 bg-[linear-gradient(to_bottom,var(--color-accent),transparent)]" />
        </div>
      </div>
    </section>
  )
}
