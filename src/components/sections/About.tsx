import Reveal from '../ui/Reveal'

const STACK = [
  { label: 'React', category: 'Framework' },
  { label: 'TypeScript', category: 'Language' },
  { label: 'Next.js', category: 'Framework' },
  { label: 'TanStack Start', category: 'Framework' },
  { label: 'Tailwind CSS', category: 'Styling' },
  { label: 'JavaScript', category: 'Language' },
  { label: 'Python', category: 'Language' },
  { label: 'HTML & CSS', category: 'Markup' },
  { label: 'Vite', category: 'Tooling' },
  { label: 'Git', category: 'Tooling' },
]

// \uFE0E forces the text version of each symbol so phones don't swap in emoji
const TRAITS = [
  {
    label: 'Built around you',
    glyph: '❖\uFE0E',
    detail:
      'Every project is different. I shape the design, features, and technology around your goals instead of forcing your business into a template.',
  },
  {
    label: 'Every detail matters',
    glyph: '⚲\uFE0E',
    detail: 'Clean code, reliable infrastructure, and thoughtful implementation to give your site a solid foundation. I\'m a ',
  },
  {
    label: 'Clear communication',
    glyph: '✉\uFE0E',
    detail:
      'No guessing how things are going. I keep communication straightforward, share progress regularly, and will frequently ask questions to make sure your vision is being met.',
  },
  {
    label: 'Privacy & Compliance',
    glyph: '⚖\uFE0E',
    detail:
      "I look beyond the website itself. I review how your business collects and handles customer information, identify the policies and disclosures your site needs, and ensure the technical pieces are properly implemented before launch.",
  },
]

export default function About() {
  return (
    <section id="about" className="relative overflow-hidden py-36">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 70% 50% at 30% 50%, rgb(117 71 255 / 0.06) 0%, transparent 70%)' }}
        />
        <div className="section-divider absolute inset-x-0 top-0" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        <Reveal className="mb-20">
          <span className="eyebrow">About Me</span>
          <h2 className="section-title">
            Thoughtful design. <span className="text-gradient">Solid engineering.</span>
          </h2>
        </Reveal>

        <div className="mb-20 grid grid-cols-1 gap-16 lg:grid-cols-2">
          <Reveal delay={80}>
            <p className="mb-5 text-[clamp(1rem,1.8vw,1.15rem)] leading-[1.8] font-light text-lavender">
              Hi, my name is Noah. I'm a fullstack web developer who enjoys building engaging websites, working with software, and fixing stuff
            </p>
            <p className="mb-5 text-sm leading-loose text-muted">
              I build thoughtful, ready-to-launch websites for small businesses and personal brands.
              From the interface to the backend, I care about making every part of the site reliable, secure, and easy to use. 
              Before launch, I test thoroughly for bugs and security issues so your site is ready for the real world.
            </p>
            <p className="text-sm leading-loose text-muted/75">
              My portfolio is growing and I'm constantly improving my work. If you're looking for a clean, reliable page,
              we'll work well together.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TRAITS.map((trait, i) => (
              <Reveal key={trait.label} delay={120 + (i % 2) * 70} className="h-full">
                <div className="card h-full cursor-default rounded-2xl p-5">
                  <span className="mb-3 block font-display text-xl leading-none text-accent" aria-hidden>
                    {trait.glyph}
                  </span>
                  <h3 className="mb-2 font-display text-[0.95rem] font-semibold tracking-[-0.015em]">{trait.label}</h3>
                  <p className="text-xs leading-[1.7] text-muted">{trait.detail}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal delay={120}>
          <div className="panel relative overflow-hidden rounded-2xl p-8 sm:p-10">
            <div
              className="pointer-events-none absolute -top-20 -right-20 h-[300px] w-[300px] blur-[30px]"
              style={{ background: 'radial-gradient(circle, rgb(155 109 255 / 0.09) 0%, transparent 70%)' }}
            />

            <div className="mb-8">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Current stack</span>
              <h3 className="font-display text-lg font-semibold tracking-[-0.02em]">Tools I work with</h3>
            </div>

            <div className="flex flex-wrap gap-3">
              {STACK.map((tool, i) => (
                <Reveal key={tool.label} variant="scale" duration={500} delay={200 + i * 40}>
                  <div className="chip flex cursor-default items-center gap-2 rounded-xl px-4 py-2.5">
                    <span className="font-display text-sm font-medium tracking-tight text-lavender">{tool.label}</span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted/50">{tool.category}</span>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
