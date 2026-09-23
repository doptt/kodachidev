import { useState } from 'react'
import Reveal from './Reveal'

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', details: '' })
  const [sent, setSent] = useState(false)

  const input = (override?: React.CSSProperties): React.CSSProperties => ({
    width: '100%',
    background: 'rgba(7,6,13,0.65)',
    border: '1px solid rgba(155,109,255,0.15)',
    borderRadius: '14px',
    padding: '14px 18px',
    color: '#F5F2FF',
    fontSize: '14px',
    fontFamily: 'Inter, sans-serif',
    lineHeight: 1.6,
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    ...override,
  })

  const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = 'rgba(155,109,255,0.45)'
    e.target.style.boxShadow = '0 0 0 4px rgba(155,109,255,0.07)'
  }
  const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = 'rgba(155,109,255,0.15)'
    e.target.style.boxShadow = 'none'
  }

  return (
    <section id="contact" className="relative py-36 overflow-hidden">
      {/* Atmosphere */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div style={{
          position: 'absolute', width: '800px', height: '800px',
          left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          background: 'radial-gradient(circle, rgba(117,71,255,0.1) 0%, rgba(155,109,255,0.04) 45%, transparent 70%)',
          filter: 'blur(70px)',
        }} />
        <div className="section-divider absolute top-0 inset-x-0" />
      </div>

      <div className="relative max-w-6xl mx-auto px-6">
        {/* Wide header */}
        <Reveal className="mb-16">
          <span className="font-mono-label text-xs tracking-widest uppercase mb-4 block" style={{ color: '#9B6DFF', letterSpacing: '0.16em' }}>
            Contact
          </span>
          <h2 className="font-display font-light" style={{
            fontSize: 'clamp(2.4rem, 5vw, 3.8rem)',
            letterSpacing: '-0.035em',
            lineHeight: 1.05,
            color: '#F5F2FF',
          }}>
            Have an idea?
            <br />
            <span className="text-gradient">Let's bring it to life.</span>
          </h2>
        </Reveal>

        {/* Two-column: copy + form */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-16 items-start">
          {/* Left: copy + socials */}
          <Reveal delay={80}>
            <p className="mb-8" style={{
              fontSize: '1.05rem',
              lineHeight: 1.8,
              color: '#C6A9FF',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 300,
            }}>
              Tell me what you're looking for, I'll handle the rest.
            </p>
            <p className="text-sm leading-loose mb-12" style={{ color: '#A29BB5', fontFamily: 'Inter, sans-serif' }}>
              Typical Response Time: 24 hours
            </p>

            {/* Info rows */}
            <div className="space-y-5">
              {
  [
    {
      label: 'Email',
      value: 'contact@kodachi.dev',
      href: 'mailto:contact@kodachi.dev',
      // Added native viewBox configuration
      viewBox: '0 0 24 24',
      isStroke: true,
      icon: 'M3 8l7 5 7-5M3 8v8a1 1 0 001 1h12a1 1 0 001-1V8M3 8a1 1 0 011-1h12a1 1 0 011 1',
    },
    {
      label: 'GitHub',
      value: 'github.com/noahwdev',
      href: 'https://github.com/noahwdev',
      // Added native viewBox configuration
      viewBox: '0 0 24 24',
      isStroke: true,
      icon: 'M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22',
    },
    {
      label: 'Discord',
      value: '@kodache',
      href: '#',
      // Added native viewBox configuration
      viewBox: '0 0 256 199',
      isStroke: false,
      icon: 'M216.856339,16.5966031 C200.285002,8.84328665 182.566144,3.2084988 164.041564,0 C161.766523,4.11318106 159.108624,9.64549908 157.276099,14.0464379 C137.583995,11.0849896 118.072967,11.0849896 98.7430163,14.0464379 C96.9108417,9.64549908 94.1925838,4.11318106 91.8971895,0 C73.3526068,3.2084988 55.6133949,8.86399117 39.0420583,16.6376612 C5.61752293,67.146514 -3.4433191,116.400813 1.08711069,164.955721 C23.2560196,181.510915 44.7403634,191.567697 65.8621325,198.148576 C71.0772151,190.971126 75.7283628,183.341335 79.7352139,175.300261 C72.104019,172.400575 64.7949724,168.822202 57.8887866,164.667963 C59.7209612,163.310589 61.5131304,161.891452 63.2445898,160.431257 C105.36741,180.133187 151.134928,180.133187 192.754523,160.431257 C194.506336,161.891452 196.298154,163.310589 198.110326,164.667963 C191.183787,168.842556 183.854737,172.420929 176.223542,175.320965 C180.230393,183.341335 184.861538,190.991831 190.096624,198.16893 C211.238746,191.588051 232.743023,181.531619 254.911949,164.955721 C260.227747,108.668201 245.831087,59.8662432 216.856339,16.5966031 Z M85.4738752,135.09489 C72.8290281,135.09489 62.4592217,123.290155 62.4592217,108.914901 C62.4592217,94.5396472 72.607595,82.7145587 85.4738752,82.7145587 C98.3405064,82.7145587 108.709962,94.5189427 108.488529,108.914901 C108.508531,123.290155 98.3405064,135.09489 85.4738752,135.09489 Z M170.525237,135.09489 C157.88039,135.09489 147.510584,123.290155 147.510584,108.914901 C147.510584,94.5396472 157.658606,82.7145587 170.525237,82.7145587 C183.391518,82.7145587 193.761324,94.5189427 193.539891,108.914901 C193.539891,123.290155 183.391518,135.09489 170.525237,135.09489 Z',
    },
  ].map((row) => (
    <a
      key={row.label}
      href={row.href}
      className="flex items-center gap-4 group transition-all duration-200"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200"
        style={{
          background: 'rgba(155,109,255,0.07)',
          border: '1px solid rgba(155,109,255,0.12)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(155,109,255,0.15)';
          e.currentTarget.style.borderColor = 'rgba(155,109,255,0.28)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(155,109,255,0.07)';
          e.currentTarget.style.borderColor = 'rgba(155,109,255,0.12)';
        }}
      >
        {/* Made viewBox dynamic (row.viewBox) and increased uniform display size to width/height 18 */}
        <svg
          width="18"
          height="18"
          viewBox={row.viewBox}
          fill={row.isStroke ? 'none' : '#9B6DFF'}
          style={{ color: '#9B6DFF' }}
        >
          <path
            d={row.icon}
            stroke={row.isStroke ? 'currentColor' : 'none'}
            strokeWidth={row.isStroke ? '2' : '0'}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    <div>
                    <div className="font-mono-label text-xs mb-0.5" style={{ color: '#A29BB5', fontSize: '10px', letterSpacing: '0.08em' }}>
                      {row.label.toUpperCase()}
                    </div>
                    <div className="font-display text-sm transition-colors duration-200" style={{ color: '#C6A9FF', letterSpacing: '-0.01em' }}>
                      {row.value}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </Reveal>

          {/* Right: form */}
          <Reveal delay={160}>
            <div className="rounded-3xl p-0.5" style={{
              background: 'linear-gradient(140deg, rgba(155,109,255,0.18) 0%, rgba(117,71,255,0.06) 50%, rgba(155,109,255,0.14) 100%)',
            }}>
              <div className="rounded-3xl p-8 sm:p-10" style={{
                background: 'rgba(13,11,22,0.9)',
                backdropFilter: 'blur(30px)',
                WebkitBackdropFilter: 'blur(30px)',
              }}>
                {sent ? (
                  <div className="py-10 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6" style={{
                      background: 'rgba(155,109,255,0.1)',
                      border: '1px solid rgba(155,109,255,0.22)',
                    }}>
                      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                        <path d="M5 13l6 6L21 7" stroke="#9B6DFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h3 className="font-display font-bold mb-2" style={{ fontSize: '1.4rem', letterSpacing: '-0.025em', color: '#F5F2FF' }}>
                      Message received.
                    </h3>
                    <p className="text-sm" style={{ color: '#A29BB5', fontFamily: 'Inter, sans-serif' }}>
                      I'll get back to you within 24 hours.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={(e) => { e.preventDefault(); setSent(true) }} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="font-mono-label text-xs uppercase block mb-2" style={{ color: '#A29BB5', letterSpacing: '0.1em', fontSize: '10px' }}>
                          Name
                        </label>
                        <input
                          type="text" placeholder="Your name" required
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          style={input()}
                          onFocus={onFocus} onBlur={onBlur}
                        />
                      </div>
                      <div>
                        <label className="font-mono-label text-xs uppercase block mb-2" style={{ color: '#A29BB5', letterSpacing: '0.1em', fontSize: '10px' }}>
                          Email
                        </label>
                        <input
                          type="email" placeholder="your@email.com" required
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          style={input()}
                          onFocus={onFocus} onBlur={onBlur}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="font-mono-label text-xs uppercase block mb-2" style={{ color: '#A29BB5', letterSpacing: '0.1em', fontSize: '10px' }}>
                        Project details
                      </label>
                      <textarea
                        placeholder="Tell me about your business and what you'd like to build..."
                        required rows={5}
                        value={form.details}
                        onChange={(e) => setForm({ ...form, details: e.target.value })}
                        style={input({ resize: 'vertical', minHeight: '130px' })}
                        onFocus={onFocus} onBlur={onBlur}
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-4 rounded-2xl font-display font-semibold text-sm transition-all duration-300"
                      style={{
                        background: 'linear-gradient(135deg, #9B6DFF, #7547FF)',
                        color: '#F5F2FF',
                        letterSpacing: '-0.01em',
                        boxShadow: '0 0 28px rgba(117,71,255,0.35)',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = '0 0 44px rgba(117,71,255,0.55)'
                        e.currentTarget.style.transform = 'translateY(-2px)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = '0 0 28px rgba(117,71,255,0.35)'
                        e.currentTarget.style.transform = 'translateY(0)'
                      }}
                    >
                      Start a Conversation
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
