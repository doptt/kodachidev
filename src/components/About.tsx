import Reveal from './Reveal'

const stack = [
  { label: 'React', cat: 'Framework' },
  { label: 'TypeScript', cat: 'Language' },
  { label: 'Next.js', cat: 'Framework' },
  { label: 'TanStack Start', cat: 'Framework'},
  { label: 'Tailwind CSS', cat: 'Styling' },
  { label: 'JavaScript', cat: 'Language' },
  { label: 'Python', cat: 'Language' },
  { label: 'HTML & CSS', cat: 'Markup' },
  { label: 'Vite', cat: 'Tooling' },
  { label: 'Git', cat: 'Tooling' },
]

const traits = [
  {
    label: 'Versatile',
    detail: 'I adapt to your project needs. I work with payment processors, databases, emailing, and other typical business needs. Just let me know.',
    glyph: '⊹',
  },
  {
    label: 'Detail‑oriented',
    detail: 'The small details make or break your sites impression, I assure everything is just right before deployment.',
    glyph: '◈',
  },
  {
    label: 'Communicative',
    detail: 'I reply quickly and clearly. I keep you updated on progress and will be frequently asking questions to assure your vision is being met.',
    glyph: '⟁',
  },
  {
    label: 'Compliance',
    detail: 'If you\'re selling a product or service, collecting user data, or anything that requires legal compliance, I assure your site is up to code with the latest regulations.',
    glyph: '⌘',
  },
]

export default function About() {
  return (
    <section id="about" className="relative py-36 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 70% 50% at 30% 50%, rgba(117,71,255,0.06) 0%, transparent 70%)',
        }} />
        <div className="section-divider absolute top-0 inset-x-0" />
      </div>

      <div className="relative max-w-6xl mx-auto px-6">
        {/* Section label */}
        <Reveal className="mb-20">
          <span className="font-mono-label text-xs tracking-widest uppercase mb-4 block" style={{ color: '#9B6DFF', letterSpacing: '0.16em' }}>
            About
          </span>
          <h2 className="font-display font-light" style={{
            fontSize: 'clamp(2.4rem, 5vw, 3.8rem)',
            letterSpacing: '-0.035em',
            lineHeight: 1.05,
            color: '#F5F2FF',
          }}>
            Small beginnings.{' '}
            <span className="text-gradient">Big ideas.</span>
          </h2>
        </Reveal>

        {/* Two column main content */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-16 mb-20">
          {/* Intro text */}
          <Reveal delay={80}>
            <p className="mb-5" style={{
              fontSize: 'clamp(1rem, 1.8vw, 1.15rem)',
              lineHeight: 1.8,
              color: '#C6A9FF',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 300,
            }}>
              Hi, my name is Noah and I'm an independent web developer who enjoys building modern, functional,
              and engaging websites.
            </p>
            <p className="mb-5 text-sm leading-loose" style={{ color: '#A29BB5', fontFamily: 'Inter, sans-serif' }}>
              I focus on creating thoughtful digital experiences and ready-to-go business websites for small businesses, personal brands, etc. Deep security audits and bug testing are done before the site goes live, so you can rest easy knowing your page is safe with secure backend.
            </p>
            <p className="text-sm leading-loose" style={{ color: '#A29BB5', fontFamily: 'Inter, sans-serif', opacity: 0.75 }}>
              My portfolio is growing and I'm constantly improving my work. If you're looking
              for a clean, reliable page with security being a priority. We'll work well together.
            </p>
          </Reveal>

          {/* Trait cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {traits.map((t, i) => (
              <Reveal key={t.label} delay={120 + (i % 2) * 70} className="h-full">
              <div
                className="h-full rounded-2xl p-5 transition-all duration-250 cursor-default"
                style={{
                  background: 'rgba(21,17,33,0.5)',
                  border: '1px solid rgba(155,109,255,0.1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(21,17,33,0.9)'
                  e.currentTarget.style.borderColor = 'rgba(155,109,255,0.22)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(21,17,33,0.5)'
                  e.currentTarget.style.borderColor = 'rgba(155,109,255,0.1)'
                  e.currentTarget.style.transform = `translateY(0)`
                }}
              >
                <span className="font-display text-xl mb-3 block" style={{ color: '#9B6DFF', lineHeight: 1 }}>
                  {t.glyph}
                </span>
                <div className="font-display font-semibold mb-2" style={{ fontSize: '0.95rem', letterSpacing: '-0.015em', color: '#F5F2FF' }}>
                  {t.label}
                </div>
                <p className="text-xs" style={{ color: '#A29BB5', lineHeight: 1.7, fontFamily: 'Inter, sans-serif' }}>
                  {t.detail}
                </p>
              </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Tech stack — horizontal flow */}
        <Reveal delay={120}>
          <div className="rounded-2xl p-8 sm:p-10 relative overflow-hidden" style={{
            background: 'rgba(13,11,22,0.7)',
            border: '1px solid rgba(155,109,255,0.12)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}>
            {/* Corner glow */}
            <div className="absolute pointer-events-none" style={{
              width: '300px', height: '300px',
              top: '-80px', right: '-80px',
              background: 'radial-gradient(circle, rgba(155,109,255,0.09) 0%, transparent 70%)',
              filter: 'blur(30px)',
            }} />

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-8">
              <div>
                <span className="font-mono-label text-xs uppercase tracking-widest mb-1 block" style={{ color: '#A29BB5', letterSpacing: '0.12em', fontSize: '10px' }}>
                  Current stack
                </span>
                <h3 className="font-display font-semibold" style={{ fontSize: '1.1rem', letterSpacing: '-0.02em', color: '#F5F2FF' }}>
                  Tools I work with
                </h3>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {stack.map((t, i) => (
                <Reveal key={t.label} variant="scale" duration={500} delay={200 + i * 40}>
                <div
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-200 cursor-default"
                  style={{
                    background: 'rgba(155,109,255,0.06)',
                    border: '1px solid rgba(155,109,255,0.12)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(155,109,255,0.14)'
                    e.currentTarget.style.borderColor = 'rgba(155,109,255,0.28)'
                    e.currentTarget.style.transform = 'scale(1.03)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(155,109,255,0.06)'
                    e.currentTarget.style.borderColor = 'rgba(155,109,255,0.12)'
                    e.currentTarget.style.transform = 'scale(1)'
                  }}
                >
                  <span className="font-display font-medium text-sm" style={{ color: '#C6A9FF', letterSpacing: '-0.01em' }}>
                    {t.label}
                  </span>
                  <span className="font-mono-label" style={{ color: '#A29BB5', opacity: 0.5, fontSize: '9px', letterSpacing: '0.08em' }}>
                    {t.cat.toUpperCase()}
                  </span>
                </div>
                </Reveal>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
