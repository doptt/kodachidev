import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Background, { BgScrim } from '../src/background/Background'
import { SCENES } from '../src/background/scenes'

const ORDER = ['hero', 'build', 'work', 'about', 'contact', 'hero'] as const

function Hud() {
  const [text, setText] = useState('')
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const mode = document.querySelector('[data-bg-mode]')?.getAttribute('data-bg-mode')
      setText(`scroll ${Math.round(window.scrollY)}px  mode ${mode}\nscenes: ${Object.keys(SCENES).join(', ')}\n?nogl  ?scene=work`)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  const hidden = new URLSearchParams(location.search).has('nohud')
  if (hidden) return null
  return <div className="hud">{text}</div>
}

function Page() {
  const hideLabels = new URLSearchParams(location.search).has('nolabels')
  return (
    <>
      <Background />
      <Hud />
      {ORDER.map((name, i) => (
        <section key={i} data-bg-scene={name}>
          {!hideLabels && (
            <div style={{ position: 'relative' }}>
              {i === 2 && <BgScrim />}
              <div className="label" style={{ position: 'relative' }}>
                {name}
                <small>section {i + 1} · scene {name}</small>
              </div>
            </div>
          )}
        </section>
      ))}
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
