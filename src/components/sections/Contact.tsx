import { useState, type FormEvent, type ReactNode } from 'react'
import Reveal from '../ui/Reveal'
import Select from '../ui/Select'
import { BUDGET_OPTIONS, LIMITS, sendContactMessage, type ContactPayload } from '../../lib/contact'

type Status = 'idle' | 'sending' | 'sent' | 'error'

const EMPTY_FORM: ContactPayload = { name: '', email: '', details: '', budget: '', website: '' }

const DISCORD_HANDLE = 'kodache'

// Icon paths. Email and GitHub are 24×24 strokes, Discord is a filled 256×199 logo.
const ICONS = {
  email: 'M3 8l7 5 7-5M3 8v8a1 1 0 001 1h12a1 1 0 001-1V8M3 8a1 1 0 011-1h12a1 1 0 011 1',
  github:
    'M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22',
  discord:
    'M216.856339,16.5966031 C200.285002,8.84328665 182.566144,3.2084988 164.041564,0 C161.766523,4.11318106 159.108624,9.64549908 157.276099,14.0464379 C137.583995,11.0849896 118.072967,11.0849896 98.7430163,14.0464379 C96.9108417,9.64549908 94.1925838,4.11318106 91.8971895,0 C73.3526068,3.2084988 55.6133949,8.86399117 39.0420583,16.6376612 C5.61752293,67.146514 -3.4433191,116.400813 1.08711069,164.955721 C23.2560196,181.510915 44.7403634,191.567697 65.8621325,198.148576 C71.0772151,190.971126 75.7283628,183.341335 79.7352139,175.300261 C72.104019,172.400575 64.7949724,168.822202 57.8887866,164.667963 C59.7209612,163.310589 61.5131304,161.891452 63.2445898,160.431257 C105.36741,180.133187 151.134928,180.133187 192.754523,160.431257 C194.506336,161.891452 196.298154,163.310589 198.110326,164.667963 C191.183787,168.842556 183.854737,172.420929 176.223542,175.320965 C180.230393,183.341335 184.861538,190.991831 190.096624,198.16893 C211.238746,191.588051 232.743023,181.531619 254.911949,164.955721 C260.227747,108.668201 245.831087,59.8662432 216.856339,16.5966031 Z M85.4738752,135.09489 C72.8290281,135.09489 62.4592217,123.290155 62.4592217,108.914901 C62.4592217,94.5396472 72.607595,82.7145587 85.4738752,82.7145587 C98.3405064,82.7145587 108.709962,94.5189427 108.488529,108.914901 C108.508531,123.290155 98.3405064,135.09489 85.4738752,135.09489 Z M170.525237,135.09489 C157.88039,135.09489 147.510584,123.290155 147.510584,108.914901 C147.510584,94.5396472 157.658606,82.7145587 170.525237,82.7145587 C183.391518,82.7145587 193.761324,94.5189427 193.539891,108.914901 C193.539891,123.290155 183.391518,135.09489 170.525237,135.09489 Z',
}

function StrokeIcon({ path }: { path: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="text-accent">
      <path d={path} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DiscordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 256 199" aria-hidden className="text-accent">
      <path d={ICONS.discord} fill="currentColor" />
    </svg>
  )
}

// One row in the "Email / GitHub / Discord" list on the left
function ContactRow({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <>
      <span className="icon-tile flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">{icon}</span>
      <span className="text-left">
        <span className="mb-0.5 block font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{label}</span>
        <span className="block font-display text-sm tracking-tight text-lavender">{value}</span>
      </span>
    </>
  )
}

export default function Contact() {
  const [form, setForm] = useState<ContactPayload>(EMPTY_FORM)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const update = (field: keyof ContactPayload) => (value: string) => setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (status === 'sending') return

    setStatus('sending')
    setError('')
    try {
      await sendContactMessage(form)
      setStatus('sent')
      setForm(EMPTY_FORM)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  // Discord has no public profile URL for a username, so copy it instead
  const copyDiscord = async () => {
    try {
      await navigator.clipboard.writeText(DISCORD_HANDLE)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked; the handle is visible on screen anyway
    }
  }

  const sending = status === 'sending'

  return (
    <section id="contact" className="relative overflow-hidden py-36">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div
          className="absolute top-1/2 left-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 blur-[70px]"
          style={{ background: 'radial-gradient(circle, rgb(117 71 255 / 0.1) 0%, rgb(155 109 255 / 0.04) 45%, transparent 70%)' }}
        />
        <div className="section-divider absolute inset-x-0 top-0" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        <Reveal className="mb-16">
          <span className="eyebrow">Contact</span>
          <h2 className="section-title">
            Have an idea?
            <br />
            <span className="text-gradient">Let's bring it to life.</span>
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 items-start gap-16 lg:grid-cols-[1fr_1.4fr]">
          {/* Left: intro + ways to reach me */}
          <Reveal delay={80}>
            <p className="mb-8 text-[1.05rem] leading-[1.8] font-light text-lavender">
              Tell me what you're looking for, I'll handle the rest.
            </p>
            <p className="mb-12 text-sm leading-loose text-muted">Typical Response Time: 24 hours</p>

            <ul className="space-y-5">
              <li>
                <a href="mailto:contact@kodachi.dev" className="group flex items-center gap-4">
                  <ContactRow label="Email" value="contact@kodachi.dev" icon={<StrokeIcon path={ICONS.email} />} />
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/noahwdev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-4"
                >
                  <ContactRow label="GitHub" value="github.com/noahwdev" icon={<StrokeIcon path={ICONS.github} />} />
                </a>
              </li>
              <li>
                <button type="button" onClick={copyDiscord} className="group flex cursor-pointer items-center gap-4">
                  <ContactRow
                    label={copied ? 'Discord · Copied!' : 'Discord'}
                    value={`@${DISCORD_HANDLE}`}
                    icon={<DiscordIcon />}
                  />
                </button>
              </li>
            </ul>
          </Reveal>

          {/* Right: the form */}
          <Reveal delay={160}>
            <div className="rounded-3xl bg-[linear-gradient(140deg,rgb(155_109_255/0.18)_0%,rgb(117_71_255/0.06)_50%,rgb(155_109_255/0.14)_100%)] p-0.5">
              <div className="rounded-3xl bg-deep/90 p-8 backdrop-blur-2xl sm:p-10">
                {status === 'sent' ? (
                  <div className="py-10 text-center" role="status">
                    <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/22 bg-accent/10">
                      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
                        <path d="M5 13l6 6L21 7" stroke="#9B6DFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h3 className="mb-2 font-display text-[1.4rem] font-bold tracking-[-0.025em]">Message received.</h3>
                    <p className="text-sm text-muted">I'll get back to you within 24 hours.</p>
                    <button
                      type="button"
                      onClick={() => setStatus('idle')}
                      className="mt-6 font-mono text-xs tracking-wide text-muted underline-offset-4 transition-colors hover:text-accent hover:underline"
                    >
                      Send another message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <div>
                        <label htmlFor="contact-name" className="field-label">
                          Name
                        </label>
                        <input
                          id="contact-name"
                          type="text"
                          autoComplete="name"
                          placeholder="Your name"
                          required
                          maxLength={LIMITS.name}
                          value={form.name}
                          onChange={(e) => update('name')(e.target.value)}
                          className="field"
                        />
                      </div>
                      <div>
                        <label htmlFor="contact-email" className="field-label">
                          Email
                        </label>
                        <input
                          id="contact-email"
                          type="email"
                          autoComplete="email"
                          placeholder="your@email.com"
                          required
                          maxLength={LIMITS.email}
                          value={form.email}
                          onChange={(e) => update('email')(e.target.value)}
                          className="field"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="contact-details" className="field-label">
                        Project details
                      </label>
                      <textarea
                        id="contact-details"
                        placeholder="Tell me about your business and what you'd like to build..."
                        required
                        rows={5}
                        maxLength={LIMITS.details}
                        value={form.details}
                        onChange={(e) => update('details')(e.target.value)}
                        className="field min-h-[130px] resize-y"
                      />
                    </div>

                    <Select
                      label="Budget range"
                      hint="(optional)"
                      placeholder="Select a range..."
                      options={BUDGET_OPTIONS}
                      value={form.budget}
                      onChange={update('budget')}
                      disabled={sending}
                    />

                    {/* Honeypot: off-screen and skipped by keyboard + screen readers.
                        Real people never see it, bots tend to fill every field. */}
                    <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
                      <label htmlFor="contact-website">Leave this empty</label>
                      <input
                        id="contact-website"
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={form.website}
                        onChange={(e) => update('website')(e.target.value)}
                      />
                    </div>

                    {status === 'error' && (
                      <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">
                        {error}
                      </p>
                    )}

                    <button type="submit" disabled={sending} className="btn-primary w-full cursor-pointer rounded-2xl py-4 text-[0.9rem]">
                      {sending ? 'Sending…' : 'Start a Conversation'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
