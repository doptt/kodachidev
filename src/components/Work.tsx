import Reveal from './Reveal'

type Review = {
  name: string
  /** e.g. "Owner, Bloom Bakery" */
  role: string
  text: string
  /** e.g. "Business website" */
  project: string
  /** optional image path, e.g. "/reviews/jane.png" (put the file in public/reviews/) */
  avatar?: string
  rating: number
}

// Fill these in as reviews come in. Blank fields render as soft placeholder
// bars, so the cards still look intentional while empty.
const reviews: Review[] = [
  { name: '', role: '', text: '', project: '', rating: 5 },
  { name: '', role: '', text: '', project: '', rating: 5 },
  { name: '', role: '', text: '', project: '', rating: 5 },
  { name: '', role: '', text: '', project: '', rating: 5 },
  { name: '', role: '', text: '', project: '', rating: 5 },
  { name: '', role: '', text: '', project: '', rating: 5 },
]

const STAR_PATH =
  'M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55L2.48 9.42l6.58-.96L12 2.5z'

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1" role="img" aria-label={`${rating} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" aria-hidden className="review-star">
          <path d={STAR_PATH} fill={i < rating ? '#C6A9FF' : 'rgba(155,109,255,0.18)'} />
        </svg>
      ))}
    </div>
  )
}

function Placeholder({ width, height = 10 }: { width: string; height?: number }) {
  return <span className="review-placeholder block" style={{ width, height }} aria-hidden />
}

function ReviewCard({ r }: { r: Review }) {
  const initial = r.name.trim().charAt(0).toUpperCase()

  return (
    <article className="review-card shrink-0 w-[290px] sm:w-[340px] rounded-2xl p-6 flex flex-col">
      {/* Reviewer */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden font-display font-semibold text-sm"
          style={{
            background: initial || r.avatar ? 'linear-gradient(135deg, #9B6DFF, #7547FF)' : 'rgba(155,109,255,0.1)',
            border: '1px solid rgba(155,109,255,0.2)',
            color: '#F5F2FF',
          }}
        >
          {r.avatar ? (
            <img src={r.avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            initial
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {r.name ? (
            <div className="font-display font-semibold text-sm truncate" style={{ color: '#F5F2FF', letterSpacing: '-0.01em' }}>
              {r.name}
            </div>
          ) : (
            <Placeholder width="7rem" height={11} />
          )}
          {r.role ? (
            <div className="text-xs truncate" style={{ color: '#A29BB5', fontFamily: 'Inter, sans-serif' }}>
              {r.role}
            </div>
          ) : (
            <Placeholder width="4.5rem" height={8} />
          )}
        </div>
        {/* Quote mark */}
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="flex-shrink-0 self-start">
          <path
            d="M9.5 6C6.5 7.2 4.5 9.8 4.5 13v5h6v-6h-3c0-2 1.2-3.6 3-4.4L9.5 6zm9 0c-3 1.2-5 3.8-5 7v5h6v-6h-3c0-2 1.2-3.6 3-4.4L18.5 6z"
            fill="rgba(155,109,255,0.3)"
          />
        </svg>
      </div>

      {/* Rating */}
      <div className="mt-5">
        <Stars rating={r.rating} />
      </div>

      {/* Review body */}
      <div className="mt-4 flex-1">
        {r.text ? (
          <p className="text-sm" style={{ color: 'rgba(245,242,255,0.85)', fontFamily: 'Inter, sans-serif', lineHeight: 1.7 }}>
            {r.text}
          </p>
        ) : (
          <div className="space-y-2.5 pt-1">
            <Placeholder width="100%" />
            <Placeholder width="94%" />
            <Placeholder width="62%" />
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="mt-6 pt-4 flex items-center justify-between gap-3"
        style={{ borderTop: '1px solid rgba(155,109,255,0.1)' }}
      >
        {r.project ? (
          <span className="font-mono-label truncate" style={{ color: '#A29BB5', fontSize: '10px', letterSpacing: '0.08em' }}>
            {r.project.toUpperCase()}
          </span>
        ) : (
          <Placeholder width="5.5rem" height={8} />
        )}
        <span className="font-mono-label flex-shrink-0" style={{ color: '#9B6DFF', fontSize: '10px', letterSpacing: '0.08em' }}>
          {r.rating.toFixed(1)} / 5
        </span>
      </div>
    </article>
  )
}

export default function Work() {
  // Repeat the list so one "lap" is always wider than the screen, then render
  // that lap twice — the track slides left by exactly one lap and loops.
  const lap = reviews.length
    ? Array.from({ length: Math.max(1, Math.ceil(8 / reviews.length)) }).flatMap(() => reviews)
    : []

  return (
    <section id="work" className="relative py-36 overflow-hidden">
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
        <Reveal distance={32} className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-16">
          <div>
            <span className="font-mono-label text-xs tracking-widest uppercase mb-4 block" style={{ color: '#9B6DFF', letterSpacing: '0.16em' }}>
              Reviews
            </span>
            <h2 className="font-display font-light" style={{
              fontSize: 'clamp(2.4rem, 5vw, 3.8rem)',
              letterSpacing: '-0.035em',
              lineHeight: 1.05,
              color: '#F5F2FF',
            }}>
               Adding soon
              <br />
              <em style={{ fontStyle: 'light', color: '#A29BB5', fontWeight: 400 }}>Check back later.</em>
            </h2>
          </div>
          <p className="text-sm leading-relaxed max-w-xs" style={{ color: '#A29BB5', fontFamily: 'Inter, sans-serif', paddingBottom: '4px' }}>
            Quality over quantity — My priority is shipping out a good final product, not fast completion.
          </p>
        </Reveal>
      </div>

      {/* Review marquee — full width, fades out at both edges, pauses on hover */}
      {lap.length > 0 && (
        <Reveal delay={120} distance={32} className="relative">
          <div className="marquee">
            <div
              className="animate-marquee flex w-max"
              style={{ '--marquee-duration': `${lap.length * 7}s` } as React.CSSProperties}
            >
              {[0, 1].map((copy) => (
                <div key={copy} className="flex shrink-0 gap-5 pr-5" aria-hidden={copy === 1 || undefined}>
                  {lap.map((r, i) => (
                    <ReviewCard key={`${copy}-${i}`} r={r} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      )}

      {/* Footer note */}
      <div className="relative max-w-6xl mx-auto px-6">
        <Reveal delay={200}>
          <p className="text-center mt-10 font-mono-label text-xs" style={{
            color: '#A29BB5', opacity: 0.45, letterSpacing: '0.08em',
          }}>
            Check out reviews from some of my clients and collaborators.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
