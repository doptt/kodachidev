export default function Footer({ onHome = true }: { onHome?: boolean }) {
  const linkStyle = { color: '#A29BB5', letterSpacing: '0.04em' }
  const hoverOn = (e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.color = '#9B6DFF')
  const hoverOff = (e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.color = '#A29BB5')

  return (
    <footer
      className="relative py-10 px-6"
      style={{ borderTop: '1px solid rgba(155,109,255,0.08)' }}
    >
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <a href={onHome ? '#home' : '/'} className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold font-display"
            style={{
              background: 'linear-gradient(135deg, #9B6DFF, #7547FF)',
              color: '#F5F2FF',
              fontSize: '9px',
            }}
          >
            NW
          </div>
          <span
            className="font-display text-sm font-semibold"
            style={{ color: '#A29BB5', letterSpacing: '-0.01em' }}
          >
            kodachi.dev
          </span>
        </a>
        <p
          className="font-mono-label text-xs"
          style={{ color: '#A29BB5', opacity: 0.5, letterSpacing: '0.04em' }}
        >
          © {new Date().getFullYear()} · Built with care
        </p>
        <div className="flex items-center gap-6">
          <a
            href="/terms"
            className="font-mono-label text-xs transition-colors duration-200"
            style={linkStyle}
            onMouseEnter={hoverOn}
            onMouseLeave={hoverOff}
          >
            Terms
          </a>
          <a
            href="#top"
            className="font-mono-label text-xs flex items-center gap-1.5 transition-colors duration-200"
            style={linkStyle}
            onMouseEnter={hoverOn}
            onMouseLeave={hoverOff}
          >
            Back to top ↑
          </a>
        </div>
      </div>
    </footer>
  )
}
