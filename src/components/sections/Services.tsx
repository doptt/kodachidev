import Reveal from '../ui/Reveal'

const SERVICES = [
  {
    num: '01',
    title: 'Design & Development',
    desc: 'I build clean, reliable websites tailored to your needs, with careful attention to performance, stability, and usability.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <rect x="2" y="3" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M7 9l3 3-3 3M13 12h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 19h18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
      </svg>
    ),
  },
  {
    num: '02',
    title: 'Responsive Layouts',
    desc: 'Looks great on every screen — Your website adapts seamlessly across desktops, tablets, and mobile devices while maintaining functionality and visual quality.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <rect x="2" y="4" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <rect x="15" y="7" width="6" height="9" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="8" cy="16.5" r="0.8" fill="currentColor" opacity="0.6" />
      </svg>
    ),
  },
  {
    num: '03',
    title: 'Businesses & Portfolios',
    desc: 'Whether you\'re running a business, showcasing your work, or building your brand, I create professional websites with solid backend, automated emails, and secure user experiences.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <path d="M3 18V9l8-5 8 5v9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="8" y="13" width="6" height="5" rx="0.8" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    num: '04',
    title: 'Built with security in mind',
    desc: 'I use modern frameworks, and libraries to help keep your website fast and reliable. Hosting handled through platforms like Vercel or Cloudflare, with security measures such as rate limiting and CSRF protection to reduce common threats.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <path d="M4 11a7 7 0 0114 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M18 11a7 7 0 01-14 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 2" opacity="0.5" />
        <path d="M15 8l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    num: '05',
    title: 'Payments and Online Booking',
    desc: 'Payments for your business setup with Stripe, Square, or another third-party provider. Orders stored and organized neatly in a secure database for easy access, and confirmations sent automatically',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <rect x="3" y="5" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M3 9h16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
        <path d="M7 13h4M7 15.5h2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
      </svg>
    ),
  },
  {
    num: '06',
    title: 'Launch & Deployment',
    desc: 'I handle the technical side of getting your website online — including hosting, domains, configuration, and deployment. (Monthly hosting and maintenance costs may apply)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <path d="M11 15V5M7 9l4-4 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 18h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      </svg>
    ),
  },
]

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function Services() {
  return (
    <section id="services" className="relative overflow-hidden py-36">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div
          className="absolute top-1/2 -right-[200px] h-[600px] w-[900px] -translate-y-1/2 blur-[60px]"
          style={{ background: 'radial-gradient(ellipse at 80% 50%, rgb(117 71 255 / 0.06) 0%, transparent 65%)' }}
        />
        <div className="section-divider absolute inset-x-0 top-0" />
        <div className="section-divider absolute inset-x-0 bottom-0" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        {/* Heading on the left, turnaround time on the right */}
        <div className="mb-20 grid grid-cols-1 items-end gap-12 lg:grid-cols-[1fr_340px]">
          <Reveal duration={700}>
            <span className="eyebrow">Services</span>
            <h2 className="section-title mb-5">
              What I bring to
              <br />
              <span className="text-gradient">the table.</span>
            </h2>
          </Reveal>

          <Reveal delay={120} duration={700}>
            <div className="panel relative overflow-hidden rounded-2xl p-7">
              <div
                className="pointer-events-none absolute -top-[50px] -right-[50px] h-[180px] w-[180px] blur-[24px]"
                style={{ background: 'radial-gradient(circle, rgb(155 109 255 / 0.14) 0%, transparent 70%)' }}
              />
              <span className="mb-3 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                Typical project duration
              </span>
              <p
                className="mb-4 font-display text-[clamp(2.6rem,5vw,3.4rem)] leading-none font-bold tracking-[-0.045em]"
                style={{
                  background: 'linear-gradient(135deg, #F5F2FF 0%, #C6A9FF 60%, #9B6DFF 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                1-4 weeks
              </p>
              <div className="mb-4 h-px w-8 bg-accent/35" />
              <a
                href="#contact"
                className="inline-flex items-center gap-2 font-display text-sm font-semibold tracking-tight text-lavender transition-colors duration-200 hover:text-ink"
              >
                Discuss Your Project
                <ArrowIcon />
              </a>
            </div>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service, i) => (
            // Stagger by column so each row animates left to right
            <Reveal key={service.num} delay={80 + (i % 3) * 80} duration={700} className="h-full">
              <div className="card h-full cursor-default rounded-2xl p-6">
                <div className="mb-5 flex items-start justify-between">
                  <span className="font-mono text-xs tracking-[0.06em] text-accent/40">{service.num}</span>
                  <div className="text-accent">{service.icon}</div>
                </div>
                <h3 className="mb-3 font-display text-base leading-[1.3] font-semibold tracking-[-0.02em]">{service.title}</h3>
                <p className="text-sm leading-[1.7] text-muted">{service.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal
          duration={700}
          className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-accent/8 pt-10 sm:flex-row"
        >
          <p className="text-sm text-muted">Not sure what you need? That's fine — let's figure it out together.</p>
          <a href="#contact" className="btn-primary rounded-xl px-6 py-3 text-sm whitespace-nowrap">
            Get a Free Quote
            <ArrowIcon />
          </a>
        </Reveal>
      </div>
    </section>
  )
}
