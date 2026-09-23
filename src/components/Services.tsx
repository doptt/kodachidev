import Reveal from './Reveal'

const services = [
  {
    num: '01',
    title: 'Design & Development',
    desc: 'Custom websites built to last — I take pride in building a clean-looking, stable product. Thorough security & bug audits are done before pushing out.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="3" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M7 9l3 3-3 3M13 12h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 19h18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
      </svg>
    ),
  },
  {
    num: '02',
    title: 'Responsive Layouts',
    desc: 'Looks great on every screen.\nYour website adapts seamlessly across desktops, tablets, and mobile devices while maintaining its functionality, usability, and visual quality.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="4" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <rect x="15" y="7" width="6" height="9" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="8" cy="16.5" r="0.8" fill="currentColor" opacity="0.6" />
      </svg>
    ),
  },
  {
    num: '03',
    title: 'Business & Portfolio Sites',
    desc: 'Online / In-person businesses. Automatic emails, secure checkout flow, dependable backend you can trust.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M3 18V9l8-5 8 5v9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="8" y="13" width="6" height="5" rx="0.8" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    num: '04',
    title: 'Security built to protect you',
    desc: 'I use modern frameworks and libraries to ensure your website is fast and reliable. Sites are hosted on Vercel or Cloudflare, and equipped with security measures to throw off bad actors.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M4 11a7 7 0 0114 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M18 11a7 7 0 01-14 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 2" opacity="0.5" />
        <path d="M15 8l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    num: '05',
    title: 'Payments and Online Booking',
    desc: 'I use Stripe or Square to setup online payments for your business. Orders stored and organized neatly in a secure database for easy access, and order confirmations sent automatically',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="3" y="5" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M3 9h16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
        <path d="M7 13h4M7 15.5h2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
      </svg>
    ),
  },
  {
    num: '06',
    title: 'Launch & Deploy',
    desc: 'I handle hosting, domains, and deployment, so you can go live without the headache. (monthly maintenance costs may apply)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M11 15V5M7 9l4-4 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 18h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      </svg>
    ),
  },
]

export default function Services() {
  return (
    <section id="services" className="relative py-36 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div style={{
          position: 'absolute', width: '900px', height: '600px',
          right: '-200px', top: '50%', transform: 'translateY(-50%)',
          background: 'radial-gradient(ellipse at 80% 50%, rgba(117,71,255,0.06) 0%, transparent 65%)',
          filter: 'blur(60px)',
        }} />
        <div className="section-divider absolute top-0 inset-x-0" />
        <div className="section-divider absolute bottom-0 inset-x-0" />
      </div>

      <div className="relative max-w-6xl mx-auto px-6">
        {/* Header + pricing — side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-12 mb-20 items-end">
          <Reveal duration={700}>
            <span className="font-mono-label text-xs tracking-widest uppercase mb-4 block" style={{ color: '#9B6DFF', letterSpacing: '0.16em' }}>
              Services
            </span>
            <h2 className="font-display font-light mb-5" style={{
              fontSize: 'clamp(2.4rem, 5vw, 3.8rem)',
              letterSpacing: '-0.035em',
              lineHeight: 1.05,
              color: '#F5F2FF',
            }}>
              What I bring to
              <br />
              <span className="text-gradient">the table.</span>
            </h2>
            {/*<p className="text-base leading-loose max-w-lg" style={{ color: '#A29BB5', fontFamily: 'Inter, sans-serif' }}>
              Edit later
            </p>
            */}
          </Reveal>

          {/* Pricing display */}
          <Reveal delay={120} duration={700}>
            <div className="rounded-2xl p-7 relative overflow-hidden" style={{
              background: 'rgba(13,11,22,0.75)',
              border: '1px solid rgba(155,109,255,0.15)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}>
              <div className="absolute pointer-events-none" style={{
                width: '180px', height: '180px',
                top: '-50px', right: '-50px',
                background: 'radial-gradient(circle, rgba(155,109,255,0.14) 0%, transparent 70%)',
                filter: 'blur(24px)',
              }} />
              <span className="font-mono-label text-xs uppercase tracking-widest mb-3 block" style={{ color: '#A29BB5', letterSpacing: '0.12em', fontSize: '10px' }}>
                Typical project duration
              </span>
              <div className="font-display font-bold leading-none mb-4" style={{
                fontSize: 'clamp(2.6rem, 5vw, 3.4rem)',
                letterSpacing: '-0.045em',
                background: 'linear-gradient(135deg, #F5F2FF 0%, #C6A9FF 60%, #9B6DFF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                1-4 weeks
              </div>
              <div className="w-8 h-px mb-4" style={{ background: 'rgba(155,109,255,0.35)' }} />
              <a href="#contact" className="inline-flex items-center gap-2 text-sm font-display font-semibold transition-all duration-200"
                style={{ color: '#C6A9FF', letterSpacing: '-0.01em' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#F5F2FF' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#C6A9FF' }}
              >
                Discuss Your Project
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </div>
          </Reveal>
        </div>

        {/* Services grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((s, i) => (
            <Reveal key={s.num} delay={80 + (i % 3) * 80} duration={700} className="h-full">
            <div
              style={{ background: 'rgba(21,17,33,0.45)', border: '1px solid rgba(155,109,255,0.1)' }}
              className="group h-full rounded-2xl p-6 transition-all duration-300 cursor-default"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(21,17,33,0.85)'
                e.currentTarget.style.borderColor = 'rgba(155,109,255,0.25)'
                e.currentTarget.style.boxShadow = '0 0 40px rgba(117,71,255,0.08), 0 8px 32px rgba(0,0,0,0.3)'
                e.currentTarget.style.transform = 'translateY(-3px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(21,17,33,0.45)'
                e.currentTarget.style.borderColor = 'rgba(155,109,255,0.1)'
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              {/* Number + icon row */}
              <div className="flex items-start justify-between mb-5">
                <span className="font-mono-label text-xs" style={{ color: 'rgba(155,109,255,0.4)', letterSpacing: '0.06em' }}>
                  {s.num}
                </span>
                <div className="transition-colors duration-200" style={{ color: '#9B6DFF' }}>
                  {s.icon}
                </div>
              </div>

              <h3 className="font-display font-semibold mb-3" style={{
                fontSize: '1.0rem',
                letterSpacing: '-0.02em',
                color: '#F5F2FF',
                lineHeight: 1.3,
              }}>
                {s.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: '#A29BB5', fontFamily: 'Inter, sans-serif', lineHeight: 1.7 }}>
                {s.desc}
              </p>
            </div>
            </Reveal>
          ))}
        </div>

        {/* Bottom CTA strip */}
        <Reveal duration={700} className="mt-14 flex flex-col sm:flex-row items-center justify-between gap-4 pt-10" style={{
          borderTop: '1px solid rgba(155,109,255,0.08)',
        }}>
          <p className="text-sm" style={{ color: '#A29BB5', fontFamily: 'Inter, sans-serif' }}>
            Not sure what you need? That's fine — let's figure it out together.
          </p>
          <a href="#contact" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-display font-semibold text-sm transition-all duration-200 whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #9B6DFF, #7547FF)', color: '#F5F2FF', letterSpacing: '-0.01em', boxShadow: '0 0 22px rgba(117,71,255,0.32)' }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 34px rgba(117,71,255,0.52)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 22px rgba(117,71,255,0.32)'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            Get a Free Quote
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </Reveal>
      </div>
    </section>
  )
}
