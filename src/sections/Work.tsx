import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useInView } from 'motion/react'
import { PROJECTS, WORK_INTRO, type Project } from '@/content/projects'
import { BlurText } from '@/components/effects/BlurText'
import { GlassSurface } from '@/components/glass/GlassSurface'
import { Reveal } from '@/components/ui/Reveal'
import { Chip, Section, SectionHeader } from '@/components/ui/Section'
import { cn } from '@/lib/cn'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { WorkIntro } from './WorkIntro'

const projects: readonly Project[] = PROJECTS
const host = (url: string) => new URL(url).host

function Status({ project }: { project: Project }) {
  return project.url ? (
    <span className="inline-flex items-center gap-2 whitespace-nowrap font-mono text-[0.72rem] tracking-[0.06em] text-periwinkle-200">
      <span className="size-1.5 rounded-full bg-periwinkle-300 shadow-[0_0_8px_rgb(142_150_255/0.9)]" aria-hidden="true" />
      Live
    </span>
  ) : (
    <span className="whitespace-nowrap font-mono text-[0.72rem] tracking-[0.06em] text-periwinkle-200">Live soon</span>
  )
}

/** Name, summary, role and stack for one project. */
function Details({ project, heading: Heading }: { project: Project; heading: 'h3' | 'p' }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-mono text-[0.72rem] tracking-[0.06em] text-ink-faint">
          {project.kind} · {project.year}
        </span>
        <Status project={project} />
      </div>
      <BlurText
        as={Heading}
        className="mt-3 font-hero text-[clamp(2rem,1.4rem+2vw,3rem)] leading-[1.05] tracking-[-0.02em] text-ink"
        text={project.name}
        duration={0.7}
      />
      <BlurText as="p" className="mt-4 text-[0.98rem] leading-[1.65] text-pretty text-ink-muted" text={project.summary} delay={0.15} />
      <dl className="mt-6 space-y-3">
        <div className="flex gap-4">
          <dt className="w-12 shrink-0 pt-1 font-mono text-[0.72rem] tracking-[0.06em] text-ink-faint">Role</dt>
          <dd className="flex flex-wrap gap-1.5">
            {project.role.map((r) => (
              <Chip key={r}>{r}</Chip>
            ))}
          </dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-12 shrink-0 pt-1 font-mono text-[0.72rem] tracking-[0.06em] text-ink-faint">Stack</dt>
          <dd className="flex flex-wrap gap-1.5">
            {project.stack.map((s) => (
              <Chip key={s}>{s}</Chip>
            ))}
          </dd>
        </div>
      </dl>
    </>
  )
}

/** Glass browser window holding a project screenshot. */
function Frame({ project, onActive }: { project: Project; onActive: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  // "Active" once the frame crosses the middle band of the viewport
  const centred = useInView(ref, { margin: '-45% 0px -45% 0px' })
  useEffect(() => {
    if (centred) onActive()
  }, [centred, onActive])

  const shot = (
    <img
      src={project.image}
      alt={project.imageAlt}
      width={1600}
      height={1000}
      loading="lazy"
      decoding="async"
      className="block aspect-[16/10] w-full object-cover object-top"
    />
  )

  return (
    <div ref={ref} className="relative">
      {/* Glow in the project's own colour */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-10 -z-10 rounded-full opacity-25 blur-3xl"
        style={{ background: `radial-gradient(closest-side, ${project.accent}, transparent)` }}
      />
      <GlassSurface variant="tint" radius="md" className="glass-dark glass-raised transition-shadow duration-(--duration-base) ease-(--ease-glass)" contentClassName="overflow-hidden rounded-[inherit]">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-ink/15" />
            <span className="size-2.5 rounded-full bg-ink/15" />
            <span className="size-2.5 rounded-full bg-ink/15" />
          </span>
          <span className="mx-auto min-w-0 max-w-[60%] truncate rounded-pill bg-ink/[0.05] px-4 py-1 font-mono text-[0.7rem] tracking-[0.04em] text-ink-faint">
            {project.url ? host(project.url) : 'launching soon'}
          </span>
          <span className="w-[2.625rem]" aria-hidden="true" />
        </div>
        {project.url ? (
          <a
            href={project.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Visit ${project.name} (opens in a new tab)`}
            className="group/shot relative block focus-ring"
          >
            {shot}
            <span className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-pill bg-navy-950/80 px-3.5 py-2 text-[0.8rem] text-ink shadow-[inset_0_0_0_1px_rgb(199_203_255/0.2)] transition-transform duration-(--duration-base) ease-(--ease-glass) group-hover/shot:-translate-y-0.5">
              Visit site
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M5 11 11 5M6 5h5v5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </a>
        ) : (
          shot
        )}
      </GlassSurface>
    </div>
  )
}

/**
 * Work: on wide screens the project details stay pinned on the left while the
 * browser frames scroll past on the right; on smaller screens each frame is
 * followed by its own details.
 */
export function Work() {
  const [active, setActive] = useState(0)
  const reduced = usePrefersReducedMotion()
  const current = projects[active]

  return (
    <>
      {/* Opening sequence: owns the #work anchor, so "Work" in the nav lands on it */}
      <WorkIntro />
      <Section id="work-projects" scene="work" labelledBy="work-title">
        <SectionHeader id="work-title" eyebrow={WORK_INTRO.eyebrow} title={WORK_INTRO.title} lede={WORK_INTRO.lede} />

        <div className="lg:grid lg:grid-cols-12 lg:gap-14">
          {/* Pinned details (wide screens). Decorative copy of the per-project text below. */}
          <div className="hidden lg:col-span-4 lg:block" aria-hidden="true">
            <div className="sticky top-[22vh] flex gap-6">
              <ol className="flex flex-col gap-2 pt-1.5">
                {projects.map((p, i) => (
                  <li
                    key={p.slug}
                    className={cn(
                      'w-px transition-[height,background-color] duration-(--duration-base) ease-(--ease-glass)',
                      i === active ? 'h-9 bg-periwinkle-200 shadow-[0_0_10px_rgb(142_150_255/0.9)]' : 'h-4 bg-ink/20',
                    )}
                  />
                ))}
              </ol>
              <div className="min-h-[24rem] flex-1">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={current.slug}
                    initial={reduced ? false : { opacity: 0, y: 14, filter: 'blur(8px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={reduced ? undefined : { opacity: 0, y: -10, filter: 'blur(8px)' }}
                    transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                  >
                    <p className="mb-5 font-mono text-[0.72rem] tracking-[0.08em] text-ink-faint">
                      {String(active + 1).padStart(2, '0')} / {String(projects.length).padStart(2, '0')}
                    </p>
                    <Details project={current} heading="p" />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>

          <ol role="list" className="flex flex-col gap-16 lg:col-span-8 lg:gap-28">
            {projects.map((p, i) => (
              <li key={p.slug}>
                <Reveal>
                  <Frame project={p} onActive={() => setActive(i)} />
                  <div className="mt-6 lg:sr-only">
                    <Details project={p} heading="h3" />
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </Section>
    </>
  )
}
