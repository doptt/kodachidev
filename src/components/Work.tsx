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
        </div>

        {/* Footer note */}
        <p className="text-center mt-10 font-mono-label text-xs" style={{
          ...reveal(visible, 350),
          color: '#A29BB5', opacity: visible ? 0.45 : 0, letterSpacing: '0.08em',
        }}>
          Check out reviews from some of my clients and collaborators.
        </p>
      </div>
    </section>
  )
}
