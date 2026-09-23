import Layout from '../components/Layout'
import Reveal from '../components/Reveal'

// Placeholder copy — edit freely. Each entry renders as a numbered section.
const LAST_UPDATED = 'September 23, 2026'

const sections = [
  {
    title: 'Overview',
    body: 'These terms apply to all web design and development services provided by kodachi.dev. By requesting a quote or starting a project, you agree to these terms.',
  },
  {
    title: 'Project scope & quotes',
    body: 'Every project begins with an agreed scope and quote. Work outside that scope may be quoted separately before it begins.',
  },
  {
    title: 'Payments',
    body: 'Payment terms, including any deposit, are agreed before work starts. The final site is delivered once the remaining balance is paid.',
  },
  {
    title: 'Revisions',
    body: 'A reasonable number of revisions is included with each project. Additional revision rounds may be billed separately.',
  },
  {
    title: 'Timelines',
    body: 'Estimated timelines depend on receiving content, feedback, and approvals on time. Delays on either side may shift the delivery date.',
  },
  {
    title: 'Ownership',
    body: 'Once paid in full, you own the final website and its content. Third-party assets, libraries, and services remain under their own licenses.',
  },
  {
    title: 'Hosting & third-party services',
    body: 'Hosting, domains, payment processors, and other third-party services are subject to their own terms and may carry ongoing costs.',
  },
  {
    title: 'Limitation of liability',
    body: 'kodachi.dev is not liable for losses caused by third-party services, outages, or changes made to the site by others after delivery.',
  },
  {
    title: 'Changes to these terms',
    body: 'These terms may be updated from time to time. The date at the top of this page shows when they were last changed.',
  },
]

export default function Terms() {
  return (
    <Layout onHome={false}>
      <section className="relative pt-40 pb-28">
        <div className="relative max-w-3xl mx-auto px-6">
          <Reveal className="mb-14">
            <a
              href="/"
              className="font-mono-label text-xs inline-flex items-center gap-2 mb-10 transition-colors duration-200"
              style={{ color: '#A29BB5', letterSpacing: '0.06em' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#9B6DFF')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#A29BB5')}
            >
              ← Back to home
            </a>
            <span
              className="font-mono-label text-xs tracking-widest uppercase mb-4 block"
              style={{ color: '#9B6DFF', letterSpacing: '0.16em' }}
            >
              Legal
            </span>
            <h1
              className="font-display font-light"
              style={{
                fontSize: 'clamp(2.4rem, 5vw, 3.8rem)',
                letterSpacing: '-0.035em',
                lineHeight: 1.05,
                color: '#F5F2FF',
              }}
            >
              Terms & <span className="text-gradient">Conditions</span>
            </h1>
            <p className="font-mono-label text-xs mt-6" style={{ color: '#A29BB5', letterSpacing: '0.06em' }}>
              Last updated: {LAST_UPDATED}
            </p>
          </Reveal>

          <Reveal delay={100}>
            <div
              className="rounded-3xl p-8 sm:p-10"
              style={{
                background: 'rgba(13,11,22,0.8)',
                border: '1px solid rgba(155,109,255,0.14)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
              }}
            >
              <div className="space-y-10">
                {sections.map((s, i) => (
                  <div key={s.title}>
                    <div className="flex items-baseline gap-4 mb-3">
                      <span className="font-mono-label text-xs" style={{ color: 'rgba(155,109,255,0.5)', letterSpacing: '0.06em' }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <h2
                        className="font-display font-semibold"
                        style={{ fontSize: '1.1rem', letterSpacing: '-0.02em', color: '#F5F2FF' }}
                      >
                        {s.title}
                      </h2>
                    </div>
                    <p className="text-sm leading-loose pl-9" style={{ color: '#A29BB5', fontFamily: 'Inter, sans-serif' }}>
                      {s.body}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-12 pt-8" style={{ borderTop: '1px solid rgba(155,109,255,0.1)' }}>
                <p className="text-sm" style={{ color: '#A29BB5', fontFamily: 'Inter, sans-serif' }}>
                  Questions about these terms? Email{' '}
                  <a href="mailto:contact@kodachi.dev" style={{ color: '#C6A9FF' }}>
                    contact@kodachi.dev
                  </a>
                  .
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </Layout>
  )
}
