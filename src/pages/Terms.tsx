import Layout from '../components/layout/Layout'
import Reveal from '../components/ui/Reveal'

// Each entry becomes a numbered section
const LAST_UPDATED = 'September 23, 2026'

const SECTIONS = [
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
    title: 'Privacy',
    body: "When you use the contact form, your name, email, and message are emailed to me through Resend, a third-party email service. I only use them to reply to you and never sell or share them. This site doesn't use cookies or analytics. Fonts are loaded from Google Fonts, so your browser connects to Google when the page loads.",
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
        <div className="relative mx-auto max-w-3xl px-6">
          <Reveal className="mb-14">
            <a
              href="/"
              className="mb-10 inline-flex items-center gap-2 font-mono text-xs tracking-wide text-muted transition-colors duration-200 hover:text-accent"
            >
              ← Back to home
            </a>
            <span className="eyebrow">Legal</span>
            <h1 className="section-title">
              Terms & <span className="text-gradient">Conditions</span>
            </h1>
            <p className="mt-6 font-mono text-xs tracking-wide text-muted">Last updated: {LAST_UPDATED}</p>
          </Reveal>

          <Reveal delay={100}>
            <div className="panel rounded-3xl p-8 sm:p-10">
              <ol className="space-y-10">
                {SECTIONS.map((section, i) => (
                  <li key={section.title}>
                    <div className="mb-3 flex items-baseline gap-4">
                      <span className="font-mono text-xs tracking-[0.06em] text-accent/50">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">{section.title}</h2>
                    </div>
                    <p className="pl-9 text-sm leading-loose text-muted">{section.body}</p>
                  </li>
                ))}
              </ol>

              <p className="mt-12 border-t border-accent/10 pt-8 text-sm text-muted">
                Questions about these terms? Email{' '}
                <a href="mailto:contact@kodachi.dev" className="text-lavender hover:underline">
                  contact@kodachi.dev
                </a>
                .
              </p>
            </div>
          </Reveal>
        </div>
      </section>
    </Layout>
  )
}
