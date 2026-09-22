export default function Hero() {
  return (
    <section
      id="home"
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
      style={{ paddingTop: '100px', paddingBottom: '80px' }}
    >
      {/* Abstract purple light sculpture */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden
        style={{ zIndex: 0 }}
      >
        {/* Core orb - primary bloom */}
        <div
          className="absolute animate-pulse-glow"
          style={{
            width: '520px',
            height: '520px',
            background:
              'radial-gradient(circle at 50% 50%, rgba(117,71,255,0.35) 0%, rgba(155,109,255,0.18) 30%, rgba(117,71,255,0.06) 60%, transparent 75%)',
            filter: 'blur(40px)',
            borderRadius: '50%',
          }}
        />
        {/* Outer haze */}
        <div
          className="absolute animate-drift-slow"
          style={{
            width: '800px',
            height: '600px',
            background:
              'radial-gradient(ellipse at 50% 50%, rgba(155,109,255,0.12) 0%, rgba(117,71,255,0.06) 40%, transparent 70%)',
            filter: 'blur(60px)',
            borderRadius: '50%',
          }}
        />
        {/* Left nebula tendril */}
        <div
          className="absolute animate-drift"
          style={{
            width: '380px',
            height: '280px',
            left: '5%',
            top: '30%',
            background:
              'radial-gradient(ellipse at 60% 40%, rgba(117,71,255,0.18) 0%, rgba(155,109,255,0.08) 50%, transparent 70%)',
            filter: 'blur(50px)',
            transform: 'rotate(-20deg)',
          }}
        />
        {/* Right nebula tendril */}
        <div
          className="absolute animate-drift"
          style={{
            width: '320px',
            height: '240px',
            right: '5%',
            top: '35%',
            background:
              'radial-gradient(ellipse at 40% 60%, rgba(198,169,255,0.12) 0%, rgba(155,109,255,0.06) 50%, transparent 70%)',
            filter: 'blur(45px)',
            transform: 'rotate(15deg)',
            animationDelay: '-8s',
          }}
        />
        {/* Top light source */}
        <div
          className="absolute animate-nebula"
          style={{
            width: '600px',
            height: '200px',
            top: '10%',
            left: '50%',
            transform: 'translateX(-50%)',
            background:
              'radial-gradient(ellipse at 50% 0%, rgba(155,109,255,0.14) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        {/* Flowing ribbon - top right */}
        <div
          className="absolute animate-float"
          style={{
            width: '250px',
            height: '400px',
            right: '15%',
            top: '15%',
            background:
              'linear-gradient(160deg, rgba(117,71,255,0.15) 0%, rgba(155,109,255,0.08) 30%, transparent 60%)',
            filter: 'blur(35px)',
            borderRadius: '40% 60% 70% 30% / 40% 50% 60% 50%',
            animationDelay: '-3s',
          }}
        />
        {/* Flowing ribbon - bottom left */}
        <div
          className="absolute animate-float"
          style={{
            width: '200px',
            height: '340px',
            left: '20%',
            bottom: '15%',
            background:
              'linear-gradient(200deg, rgba(198,169,255,0.1) 0%, rgba(117,71,255,0.06) 40%, transparent 70%)',
            filter: 'blur(30px)',
            borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%',
            animationDelay: '-6s',
          }}
        />
        {/* Central glass-like crystalline form */}
        <div
          className="absolute animate-pulse-glow"
          style={{
            width: '180px',
            height: '220px',
            background:
              'linear-gradient(135deg, rgba(198,169,255,0.12) 0%, rgba(155,109,255,0.08) 30%, rgba(117,71,255,0.15) 60%, rgba(198,169,255,0.06) 100%)',
            border: '1px solid rgba(155,109,255,0.15)',
            borderRadius: '30% 70% 70% 30% / 30% 30% 70% 70%',
            filter: 'blur(2px)',
            backdropFilter: 'blur(4px)',
            animationDelay: '-2s',
          }}
        />
      </div>

      {/* Hero content */}
      <div
        className="relative w-full max-w-5xl mx-auto px-6 flex flex-col items-center text-center"
        style={{ zIndex: 1 }}
      >
        {/* Status badge */}
        <div
          className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full mb-8 animate-fade-up"
          style={{
            background: 'rgba(155,109,255,0.08)',
            border: '1px solid rgba(155,109,255,0.2)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          <span
            className="w-2 h-2 rounded-full animate-status"
            style={{ background: '#9B6DFF', flexShrink: 0 }}
          />
          <span
            className="font-mono-label text-xs tracking-widest uppercase"
            style={{ color: '#C6A9FF', letterSpacing: '0.12em' }}
          >
            Available for Work
          </span>
        </div>

        {/* Main headline */}
        <h1
          className="font-display font-light animate-fade-up delay-100"
          style={{
            fontSize: 'clamp(2.4rem, 6vw, 5rem)',
            lineHeight: 1.08,
            letterSpacing: '-0.03em',
            color: '#F5F2FF',
            maxWidth: '780px',
            opacity: 0,
          }}
        >
          High-quality online business{' '}
          <span className="text-gradient">and web services.</span>
        </h1>

        {/* Supporting text */}
        <p
          className="mt-6 text-base sm:text-lg animate-fade-up delay-200 max-w-xl"
          style={{
            color: '#A29BB5',
            lineHeight: 1.7,
            fontFamily: 'Inter, sans-serif',
            opacity: 0,
          }}
        >
          I build modern, secure websites that help individuals and small businesses establish
          their online presence.
        </p>

       <div className="flex flex-col sm:flex-row items-center gap-3 mt-8 animate-fade-up delay-300" style={{ opacity: 0 }}>
          <a
            href="#contact"
            className="px-7 py-3.5 rounded-xl font-display font-semibold text-sm transition-all duration-300"
            style={{
              background: 'linear-gradient(135deg, #9B6DFF, #7547FF)',
              color: '#F5F2FF',
              letterSpacing: '-0.01em',
              boxShadow: '0 0 28px rgba(117,71,255,0.4), 0 2px 8px rgba(0,0,0,0.4)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 0 40px rgba(117,71,255,0.6), 0 4px 16px rgba(0,0,0,0.5)'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 0 28px rgba(117,71,255,0.4), 0 2px 8px rgba(0,0,0,0.4)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            Contact me
          </a>
          <a
            href="#work"
            className="px-7 py-3.5 rounded-xl font-display font-semibold text-sm transition-all duration-200 flex items-center gap-2"
            style={{
              background: 'rgba(155,109,255,0.08)',
              border: '1px solid rgba(155,109,255,0.2)',
              color: '#C6A9FF',
              letterSpacing: '-0.01em',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(155,109,255,0.14)'
              e.currentTarget.style.borderColor = 'rgba(155,109,255,0.35)'
              e.currentTarget.style.color = '#F5F2FF'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(155,109,255,0.08)'
              e.currentTarget.style.borderColor = 'rgba(155,109,255,0.2)'
              e.currentTarget.style.color = '#C6A9FF'
            }}
          >
            Explore My Work
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>


        {/* Pricing indicator */}
        <div
          className="mt-6 animate-fade-up delay-400"
          style={{ opacity: 0 }}
        >
          <span
            className="font-mono-label text-xs"
            style={{ color: '#A29BB5', letterSpacing: '0.04em' }}
          >
            Typical projects:{' '}
            <span style={{ color: '#C6A9FF' }}>$300–$800</span>
          </span>
        </div>
      </div>

      {/* Scroll indicator */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-fade-up delay-700"
        style={{ opacity: 0 }}
      >
        <span
          className="font-mono-label text-xs tracking-widest"
          style={{ color: '#A29BB5', opacity: 0.6, letterSpacing: '0.1em' }}
        >
          SCROLL
        </span>
        <div
          className="w-px h-10 relative overflow-hidden"
          style={{ background: 'rgba(155,109,255,0.15)' }}
        >
          <div
            className="absolute inset-x-0 top-0 h-1/2"
            style={{
              background: 'linear-gradient(to bottom, #9B6DFF, transparent)',
              animation: 'drift 2s ease-in-out infinite',
            }}
          />
        </div>
      </div>
    </section>
  )
}
