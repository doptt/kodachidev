import { useReveal } from '../hooks/useReveal'

const techStack = ['React', 'TypeScript', 'Tailwind CSS', 'Vite']

function reveal(visible: boolean, delay = 0): React.CSSProperties {
  return {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(32px)',
    transition: `opacity 0.75s ease ${delay}ms, transform 0.75s ease ${delay}ms`,
  }
}

export default function Work() {
  const { ref, visible } = useReveal(0.1)

  return (
    <section id="work" ref={ref as React.RefObject<HTMLElement>} className="relative py-36 overflow-hidden">
      {/* Ambient */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div style={{
          position: 'absolute', width: '800px', height: '600px',
          left: '50%', top: '40%', transform: 'translate(-50%,-50%)',
          background: 'radial-gradient(ellipse, rgba(117,71,255,0.07) 0%, transparent 65%)',
          filter: 'blur(60px)',
        }} />
        <div className="section-divider absolute top-0 inset-x-0" />
      </div>

      <div className="relative max-w-6xl mx-auto px-6">
        {/* Header — wide layout */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-20" style={reveal(visible, 0)}>
          <div>
            <span className="font-mono-label text-xs tracking-widest uppercase mb-4 block" style={{ color: '#9B6DFF', letterSpacing: '0.16em' }}>
              Selected Work
            </span>
            <h2 className="font-display font-light" style={{
              fontSize: 'clamp(2.4rem, 5vw, 3.8rem)',
              letterSpacing: '-0.035em',
              lineHeight: 1.05,
              color: '#F5F2FF',
            }}>
              One project.
              <br />
              <em style={{ fontStyle: 'light', color: '#A29BB5', fontWeight: 400 }}>Infinite attention.</em>
            </h2>
          </div>
          <p className="text-sm leading-relaxed max-w-xs" style={{ color: '#A29BB5', fontFamily: 'Inter, sans-serif', paddingBottom: '4px' }}>
            Quality over quantity — I'd rather do one thing exceptionally than fill a page with mediocre work.
          </p>
        </div>

        {/* Project card */}
        <div style={reveal(visible, 150)}>
          <div className="rounded-3xl overflow-hidden" style={{
            background: 'rgba(13,11,22,0.9)',
            border: '1px solid rgba(155,109,255,0.14)',
            boxShadow: '0 0 80px rgba(117,71,255,0.08), 0 32px 64px rgba(0,0,0,0.5)',
          }}>
            {/* Browser chrome */}
            <div style={{ background: 'rgba(21,17,33,0.95)', borderBottom: '1px solid rgba(155,109,255,0.1)' }}>
              <div className="flex items-center gap-4 px-6 py-3.5">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: '#FF5F57', boxShadow: '0 0 6px rgba(255,95,87,0.4)' }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: '#FFBD2E', boxShadow: '0 0 6px rgba(255,189,46,0.4)' }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: '#28C840', boxShadow: '0 0 6px rgba(40,200,64,0.4)' }} />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="flex items-center gap-2 px-4 py-1.5 rounded-lg" style={{
                    background: 'rgba(7,6,13,0.7)',
                    border: '1px solid rgba(155,109,255,0.12)',
                    maxWidth: '300px', width: '100%',
                  }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
                      <path d="M1.5 5a3.5 3.5 0 107 0 3.5 3.5 0 00-7 0zM5 1.5v7M1.5 5h7" stroke="#9B6DFF" strokeWidth="1" />
                    </svg>
                    <span className="font-mono-label" style={{ color: '#A29BB5', fontSize: '10px', letterSpacing: '0.04em' }}>
                      yourproject.com
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 opacity-40">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="w-1 h-1 rounded-full" style={{ background: '#A29BB5' }} />
                  ))}
                </div>
              </div>
            </div>

            {/* Screenshot area */}
            <div className="relative overflow-hidden" style={{ height: 'clamp(220px, 38vw, 460px)' }}>
              <div className="absolute inset-0" style={{
                background: 'linear-gradient(145deg, #0D0B16 0%, #151121 35%, #0D0B16 70%, #0A0814 100%)',
              }} />
              <div className="absolute inset-0" style={{
                background: 'radial-gradient(ellipse 60% 60% at 50% 40%, rgba(117,71,255,0.18) 0%, transparent 65%)',
              }} />
              {/* Decorative grid lines */}
              <div className="absolute inset-0" style={{
                backgroundImage: 'linear-gradient(rgba(155,109,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(155,109,255,0.04) 1px, transparent 1px)',
                backgroundSize: '48px 48px',
              }} />
              {/* Placeholder content */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-5" style={{
                    background: 'rgba(155,109,255,0.08)',
                    border: '1px solid rgba(155,109,255,0.18)',
                    backdropFilter: 'blur(10px)',
                  }}>
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <rect x="3" y="4" width="26" height="18" rx="2.5" stroke="rgba(155,109,255,0.8)" strokeWidth="1.5" />
                      <path d="M3 22h26M10 28h12" stroke="rgba(155,109,255,0.8)" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M11 11l3 3-3 3M17 14h4" stroke="rgba(198,169,255,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="font-mono-label text-xs uppercase tracking-widest mb-2" style={{ color: '#9B6DFF', letterSpacing: '0.14em' }}>
                    Your project screenshot here
                  </p>
                  <p className="text-xs" style={{ color: '#A29BB5', opacity: 0.5, fontFamily: 'Inter, sans-serif' }}>
                    Drop in a real image to bring this to life
                  </p>
                </div>
              </div>
              {/* Bottom fade */}
              <div className="absolute bottom-0 inset-x-0 h-16" style={{
                background: 'linear-gradient(to top, rgba(13,11,22,0.9), transparent)',
              }} />
            </div>

            {/* Project metadata */}
            <div className="p-8 sm:p-10">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 items-start">
                {/* Left: info */}
                <div>
                  <div className="flex items-center gap-3 mb-5">
                    <span className="font-mono-label text-xs px-2.5 py-1 rounded-md" style={{
                      background: 'rgba(155,109,255,0.1)',
                      border: '1px solid rgba(155,109,255,0.18)',
                      color: '#9B6DFF', fontSize: '10px', letterSpacing: '0.1em',
                    }}>
                      PROJECT 01
                    </span>
                    <span className="font-mono-label text-xs" style={{ color: '#A29BB5', opacity: 0.5, fontSize: '10px' }}>2024</span>
                  </div>
                  <h3 className="font-display font-bold mb-3" style={{
                    fontSize: 'clamp(1.5rem, 3vw, 2.2rem)',
                    letterSpacing: '-0.03em',
                    color: '#F5F2FF',
                    lineHeight: 1.1,
                  }}>
                    Your Project Name
                  </h3>
                  <p className="text-sm leading-loose mb-6" style={{ color: '#A29BB5', maxWidth: '520px', fontFamily: 'Inter, sans-serif' }}>
                    Describe what you built, who it's for, and the specific problem it solves.
                    Be honest and specific — the details are what make a project feel real.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {techStack.map((tech) => (
                      <span key={tech} className="font-mono-label text-xs px-3 py-1.5 rounded-lg transition-all duration-200" style={{
                        background: 'rgba(155,109,255,0.06)',
                        border: '1px solid rgba(155,109,255,0.14)',
                        color: '#C6A9FF', fontSize: '11px', letterSpacing: '0.03em',
                      }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(155,109,255,0.14)'; e.currentTarget.style.color = '#F5F2FF' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(155,109,255,0.06)'; e.currentTarget.style.color = '#C6A9FF' }}
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Right: CTAs */}
                <div className="flex flex-row lg:flex-col gap-3 shrink-0">
                  <a href="#" className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-display font-semibold text-sm whitespace-nowrap transition-all duration-250"
                    style={{ background: 'linear-gradient(135deg, #9B6DFF, #7547FF)', color: '#F5F2FF', letterSpacing: '-0.01em', boxShadow: '0 0 24px rgba(117,71,255,0.35)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 36px rgba(117,71,255,0.55)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 24px rgba(117,71,255,0.35)'; e.currentTarget.style.transform = 'translateY(0)' }}
                  >
                    View Live
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 11L11 3M11 3H6M11 3V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                  <a href="#" className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-display text-sm whitespace-nowrap transition-all duration-200"
                    style={{ background: 'rgba(155,109,255,0.06)', border: '1px solid rgba(155,109,255,0.14)', color: '#A29BB5', letterSpacing: '-0.01em' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#C6A9FF'; e.currentTarget.style.borderColor = 'rgba(155,109,255,0.3)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#A29BB5'; e.currentTarget.style.borderColor = 'rgba(155,109,255,0.14)' }}
                  >
                    Case Study
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center mt-10 font-mono-label text-xs" style={{
          ...reveal(visible, 350),
          color: '#A29BB5', opacity: visible ? 0.45 : 0, letterSpacing: '0.08em',
        }}>
          More work on the way — check back soon.
        </p>
      </div>
    </section>
  )
}
