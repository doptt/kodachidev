import type { CSSProperties } from 'react'
import Reveal from '../ui/Reveal'

type Review = {
  name: string
  /** e.g. "Owner, Bloom Bakery" */
  role: string
  text: string
  /** e.g. "Business website" */
  project: string
  /** Optional photo, e.g. "/reviews/jane.jpg" (file goes in public/reviews/) */
  avatar?: string
  rating: number
}

// Fill these in as reviews come in. Empty fields show as soft placeholder
// bars so the cards still look intentional in the meantime.
const REVIEWS: Review[] = [
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
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" className="review-star" aria-hidden>
          <path d={STAR_PATH} fill={i < rating ? '#C6A9FF' : 'rgb(155 109 255 / 0.18)'} />
        </svg>
      ))}
    </div>
  )
}

function Placeholder({ width, height = 10 }: { width: string; height?: number }) {
  return <span className="review-placeholder" style={{ width, height }} aria-hidden />
}

function ReviewCard({ review: r }: { review: Review }) {
  const initial = r.name.trim().charAt(0).toUpperCase()

  return (
    <article className="review-card flex w-[290px] shrink-0 flex-col rounded-2xl p-6 sm:w-[340px]">
      {/* Who wrote it */}
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent/20 font-display text-sm font-semibold ${
            initial || r.avatar ? 'bg-brand' : 'bg-accent/10'
          }`}
        >
          {r.avatar ? <img src={r.avatar} alt="" className="h-full w-full object-cover" /> : initial}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {r.name ? (
            <p className="truncate font-display text-sm font-semibold tracking-tight">{r.name}</p>
          ) : (
            <Placeholder width="7rem" height={11} />
          )}
          {r.role ? <p className="truncate text-xs text-muted">{r.role}</p> : <Placeholder width="4.5rem" height={8} />}
        </div>

        <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0 self-start" aria-hidden>
          <path
            d="M9.5 6C6.5 7.2 4.5 9.8 4.5 13v5h6v-6h-3c0-2 1.2-3.6 3-4.4L9.5 6zm9 0c-3 1.2-5 3.8-5 7v5h6v-6h-3c0-2 1.2-3.6 3-4.4L18.5 6z"
            fill="rgb(155 109 255 / 0.3)"
          />
        </svg>
      </div>

      <div className="mt-5">
        <Stars rating={r.rating} />
      </div>

      <div className="mt-4 flex-1">
        {r.text ? (
          <p className="text-sm leading-[1.7] text-ink/85">{r.text}</p>
        ) : (
          <div className="space-y-2.5 pt-1">
            <Placeholder width="100%" />
            <Placeholder width="94%" />
            <Placeholder width="62%" />
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-accent/10 pt-4 font-mono text-[10px] tracking-[0.08em]">
        {r.project ? <span className="truncate uppercase text-muted">{r.project}</span> : <Placeholder width="5.5rem" height={8} />}
        <span className="shrink-0 text-accent">{r.rating.toFixed(1)} / 5</span>
      </div>
    </article>
  )
}

export default function Reviews() {
  // Repeat the list until one copy is wider than the screen, then render
  // that copy twice so the marquee can loop without a visible seam.
  const repeats = REVIEWS.length ? Math.ceil(8 / REVIEWS.length) : 0
  const lap = Array.from({ length: repeats }, () => REVIEWS).flat()

  return (
    // id stays "work" so the existing nav + hero links keep working
    <section id="work" className="relative overflow-hidden py-36">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div
          className="absolute top-[40%] left-1/2 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 blur-[60px]"
          style={{ background: 'radial-gradient(ellipse, rgb(117 71 255 / 0.07) 0%, transparent 65%)' }}
        />
        <div className="section-divider absolute inset-x-0 top-0" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        <Reveal distance={32} className="mb-16 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="eyebrow">Reviews</span>
            <h2 className="section-title">
              Adding soon
              <br />
              <em className="font-normal text-muted">Check back later.</em>
            </h2>
          </div>
          <p className="max-w-xs pb-1 text-sm leading-relaxed text-muted">
            Quality over quantity — My priority is shipping out a good final product, not fast completion.
          </p>
        </Reveal>
      </div>

      {/* Full-width marquee. Fades at the edges, pauses on hover. */}
      {lap.length > 0 && (
        <Reveal delay={120} distance={32}>
          <div className="marquee">
            <div className="marquee-track flex w-max" style={{ '--marquee-duration': `${lap.length * 7}s` } as CSSProperties}>
              {[0, 1].map((copy) => (
                <div key={copy} className="flex shrink-0 gap-5 pr-5" aria-hidden={copy === 1 || undefined}>
                  {lap.map((review, i) => (
                    <ReviewCard key={`${copy}-${i}`} review={review} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      )}

      <div className="relative mx-auto max-w-6xl px-6">
        <Reveal delay={200}>
          <p className="mt-10 text-center font-mono text-xs tracking-[0.08em] text-muted/45">
            Check out reviews from some of my clients and collaborators.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
