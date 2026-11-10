import { Card3D, Card3DBody } from '@/components/glass/Card3D'
import { FloatCard, TiltGroup } from '@/components/effects/TiltGroup'
import { PROJECTS, type Project } from '@/content/projects'
import { cn } from '@/lib/cn'

const latest: Project = PROJECTS[0]

/**
 * Floating cluster of translucent glass cards on the right of the hero
 * (lg and up). Group tilt + depth parallax + per-card float via TiltGroup.
 * Only the project card is interactive; the rest is decorative.
 */
export function HeroCluster({ className }: { className?: string }) {
  return (
    <TiltGroup
      role="group"
      aria-label="Latest work preview"
      className={cn('hidden lg:block', className)}
      groupClassName="h-full"
    >
      {/* (a) Latest project: browser frame, the one blurred surface in the cluster */}
      <FloatCard depth={2} floatDelay={2} introDelay={0.5} className="absolute left-0 top-[14%] z-20 w-[64%]">
        <Card3D className="h-full">
          <Card3DBody variant="blur" surface="even" className="group/project rounded-glass">
            <a
              href="#work"
              aria-label={`See ${latest.name}, ${latest.kind.toLowerCase()}, in my work`}
              className="absolute inset-0 z-10 rounded-[inherit] focus-ring"
            />
            <div className="p-2.5">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-2 pb-2.5 pt-1">
                <span className="flex gap-1.5" aria-hidden="true">
                  <i className="size-2 rounded-full bg-ink/25" />
                  <i className="size-2 rounded-full bg-ink/25" />
                  <i className="size-2 rounded-full bg-ink/25" />
                </span>
                <span className="label-mono ml-2 flex-1 truncate rounded-pill bg-navy-950/40 px-3 py-1 text-[0.7rem] text-ink-muted">
                  {latest.url?.replace(/^https?:\/\//, '') ?? 'localhost:5173'}
                </span>
              </div>
              <div className="relative overflow-hidden rounded-[0.9rem] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]">
                <img
                  src={latest.image}
                  alt=""
                  width={1280}
                  height={800}
                  loading="eager"
                  decoding="async"
                  className="block aspect-[16/10] w-full object-cover object-top transition-transform duration-(--duration-slow) ease-(--ease-glass) group-hover/project:scale-[1.02]"
                />
              </div>
              <div className="flex items-end justify-between gap-3 px-2 pb-1.5 pt-3.5">
                <div>
                  <p className="label-mono text-[0.7rem]">Latest work</p>
                  <p className="mt-1 font-display text-[1.25rem] font-normal leading-none tracking-tight text-ink">
                    {latest.name}
                  </p>
                </div>
                <p className="text-[0.8rem] text-ink-muted">{latest.kind}</p>
              </div>
            </div>
          </Card3DBody>
        </Card3D>
      </FloatCard>

      {/* (b) Code card */}
      <FloatCard depth={3} floatDelay={5} introDelay={0.65} className="absolute right-0 top-0 z-30 w-[46%]" aria-hidden="true">
        <Card3D>
          <Card3DBody variant="tint" surface="even" className="rounded-glass">
            <pre className="overflow-hidden p-4 font-mono text-[0.72rem] leading-[1.7] text-ink-soft">
              <code>
                <span className="text-periwinkle-300">export function</span> <span className="text-ink">Site</span>() {'{'}
                {'\n  '}
                <span className="text-periwinkle-300">return</span> (
                {'\n    '}
                <span className="text-ink-muted">{'<'}</span>
                <span className="text-periwinkle-100">Hero</span> <span className="text-ink-faint">title</span>
                <span className="text-ink-muted">=</span>
                <span className="text-periwinkle-200">"With care"</span>
                <span className="text-ink-muted">{' />'}</span>
                {'\n  '})
                {'\n'}
                {'}'}
              </code>
            </pre>
          </Card3DBody>
        </Card3D>
      </FloatCard>

      {/* (c) Deploy status */}
      <FloatCard depth={1} floatDelay={3.5} introDelay={0.8} className="absolute left-[58%] top-[66%] z-10 w-[42%]" aria-hidden="true">
        <Card3D>
          <Card3DBody variant="tint" surface="even" className="rounded-glass">
            <div className="flex items-center gap-3 p-4">
              <span className="relative grid size-2.5 place-items-center">
                <span className="absolute inset-0 rounded-full bg-periwinkle-300/40 blur-[3px]" />
                <span className="relative size-2 rounded-full bg-periwinkle-200" />
              </span>
              <div className="min-w-0">
                <p className="text-[0.85rem] font-medium text-ink">Deployed to production</p>
                <p className="label-mono mt-1 flex gap-3 text-[0.7rem] text-ink-soft">
                  <span>main</span>
                  <span>a3f9c2e</span>
                  <span>42s</span>
                </p>
              </div>
            </div>
          </Card3DBody>
        </Card3D>
      </FloatCard>

      {/* (d) Stack chips */}
      <FloatCard depth={0} floatDelay={1} introDelay={0.95} className="absolute left-[6%] top-[86%] z-0" aria-hidden="true">
        <Card3D>
          <Card3DBody variant="tint" surface="even" className="rounded-pill">
            <ul className="flex items-center gap-1 px-1.5 py-1.5 text-[0.78rem] text-ink-soft">
              {['React', 'TypeScript', 'Tailwind'].map((s) => (
                <li key={s} className="rounded-pill bg-ink/[0.06] px-3 py-1">
                  {s}
                </li>
              ))}
            </ul>
          </Card3DBody>
        </Card3D>
      </FloatCard>
    </TiltGroup>
  )
}
