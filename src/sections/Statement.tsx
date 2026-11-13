import { useLayoutEffect, useRef, type RefObject } from 'react'
import { motion, useMotionTemplate, useMotionValue, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react'
import { STATEMENT } from '@/content/statement'
import { GlassSurface } from '@/components/glass/GlassSurface'
import { PyramidTile } from '@/components/ui/PyramidGlyph'
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/cn'

/** Size of the mark once it has docked into the diagram, and of the tile inside it. */
const CHIP = 52
const TILE = 44

/** Stage size and the centre of the diagram slot, both in stage pixels. */
type Geo = { W: number; H: number; sx: number; sy: number }

const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const easeOut = (t: number) => 1 - (1 - t) ** 3
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
/** Overshoots a little, so the box "pops" rather than fades up. */
const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2

/*
 * Scroll timeline (p runs 0 → 1 across the pinned section):
 *   0.00–0.07  a small rounded box pops in
 *   0.07–0.24  it stretches into a full-width band
 *   0.22–0.56  eyebrow, logo tile and the statement (word by word) appear
 *   0.56–0.63  the text fades
 *   0.62–0.76  the band folds into a squircle around the tile
 *   0.70–0.86  the stack card rises underneath
 *   0.78–0.93  the mark flies into the card's empty slot
 *   0.92–1.00  the rail lights up outward from the mark
 */
const WORDS_FROM = 0.27
const WORDS_TO = 0.55

function frame(p: number, g: Geo) {
  const phone = g.W < 640
  const small = Math.min(220, g.W * 0.5)
  const gutter = phone ? 8 : 16
  const bandW = g.W - gutter * 2
  const bandH = Math.min(Math.max(g.H * 0.46, 320), 440)
  const squircle = phone ? 92 : 108

  const pop = seg(p, 0, 0.07)
  const grow = easeInOut(seg(p, 0.07, 0.24))
  const fold = easeInOut(seg(p, 0.62, 0.76))
  const dock = easeInOut(seg(p, 0.78, 0.93))

  const w = mix(mix(mix(small, bandW, grow), squircle, fold), CHIP, dock)
  const h = mix(mix(mix(small * 0.64, bandH, grow), squircle, fold), CHIP, dock)
  const cx = mix(g.W / 2, g.sx, dock)
  const cy = mix(g.H / 2, g.sy, dock)

  return {
    w,
    h,
    x: cx - w / 2,
    y: cy - h / 2,
    radius: mix(mix(mix(26, 30, grow), 32, fold), 16, dock),
    scale: pop <= 0 ? 0 : easeOutBack(pop),
    opacity: g.W === 0 ? 0 : easeOut(seg(p, 0, 0.03)),
    glow: 1 - dock,
    // Logo tile: sits under the text in the band, centres as the band folds
    tileX: cx - TILE / 2,
    tileY: cy + mix(bandH * 0.3, 0, fold) - TILE / 2,
    tileScale: easeOutBack(seg(p, 0.22, 0.3)) * mix(1, 1.2, fold) * mix(1, 0.7, dock),
    tileOpacity: seg(p, 0.22, 0.26),
    textY: -bandH * 0.12,
    textOpacity: seg(p, 0.21, 0.26) * (1 - seg(p, 0.56, 0.63)),
    eyebrowOpacity: seg(p, 0.22, 0.28),
    scrim: mix(mix(0, 0.5, grow), 0.3, fold),
    cardOpacity: easeOut(seg(p, 0.7, 0.86)),
    cardY: mix(56, 0, easeOut(seg(p, 0.7, 0.86))),
    rail: easeInOut(seg(p, 0.92, 1)),
  }
}

/** Centre of `el` in `root` coordinates, from layout offsets (so transforms don't skew it). */
function centreWithin(el: HTMLElement, root: HTMLElement) {
  let x = el.offsetWidth / 2
  let y = el.offsetHeight / 2
  let node: HTMLElement | null = el
  while (node && node !== root) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  return { x, y }
}

const statementClass =
  'mx-auto max-w-[15em] text-[clamp(1.75rem,1rem+3.3vw,3.5rem)] font-normal leading-[1.08] tracking-[-0.03em] text-navy-950 text-balance'
const eyebrowClass = 'mb-5 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-navy-950/70 md:mb-6'
const accentClass = 'font-semibold text-indigo-700'

function Word({ progress, index, text, accent }: { progress: MotionValue<number>; index: number; text: string; accent?: boolean }) {
  const step = (WORDS_TO - WORDS_FROM) / STATEMENT.words.length
  const from = WORDS_FROM + index * step
  const opacity = useTransform(progress, [from, from + step * 1.6], [0.2, 1])
  // Each word sharpens as the scroll reaches it
  const blur = useTransform(progress, [from, from + step * 1.6], [5, 0])
  const filter = useMotionTemplate`blur(${blur}px)`
  // The space goes after the word's box, not inside it: a space at the end of an inline-block is
  // collapsed away, and the words would touch
  return (
    <>
      <motion.span style={{ opacity, filter }} className={cn('inline-block', accent && accentClass)}>
        {text}
      </motion.span>{' '}
    </>
  )
}

function Stop({ label, rail, at }: { label: string; rail: MotionValue<number>; at: number }) {
  const lit = useTransform(rail, [at - 0.2, at], [0, 1])
  const labelOpacity = useTransform(lit, [0, 1], [0.55, 1])
  return (
    <li className="flex flex-col items-center gap-3">
      <span className="grid place-items-center" style={{ height: CHIP }}>
        <span className="relative size-2.5 rounded-full bg-navy-900 shadow-[inset_0_0_0_1px_rgb(199_203_255/0.3)]">
          <motion.span
            style={{ opacity: lit }}
            className="absolute inset-0 rounded-full bg-periwinkle-200 shadow-[0_0_12px_rgb(142_150_255/0.95)]"
          />
        </span>
      </span>
      <motion.span
        style={{ opacity: labelOpacity }}
        className="font-mono text-[0.66rem] tracking-[0.04em] whitespace-nowrap text-ink-soft sm:text-[0.74rem]"
      >
        {label}
      </motion.span>
    </li>
  )
}

/** The mark as it rests in the diagram. */
function DockedMark() {
  return (
    <span className="statement-panel grid place-items-center rounded-2xl" style={{ width: CHIP, height: CHIP }}>
      <PyramidTile size={31} />
    </span>
  )
}

/** Glass card the mark lands in: a rail of four stops with a slot for the mark in the middle. */
function StackCard({ rail, slotRef, filled }: { rail: MotionValue<number>; slotRef?: RefObject<HTMLLIElement | null>; filled?: boolean }) {
  const { dock } = STATEMENT
  const ring = useTransform(rail, [0, 0.4], [0, 1])
  return (
    <GlassSurface variant="blur" radius="lg" className="glass-dark" contentClassName="px-5 py-9 text-center sm:px-10 md:px-14 md:py-12">
      <p className="eyebrow-indigo mb-4">{dock.eyebrow}</p>
      <h2 id="stack-title" className="font-hero text-display-md text-balance text-silver">
        {dock.title}
      </h2>
      <p className="mx-auto mt-4 max-w-[30rem] text-[0.95rem] leading-[1.6] text-pretty text-ink-muted">{dock.lede}</p>

      <div className="relative mt-8 md:mt-10">
        {/* Rail: a faint track, lit from the mark outward */}
        <div aria-hidden="true" className="absolute inset-x-[10%] h-px bg-line" style={{ top: CHIP / 2 }} />
        <motion.div
          aria-hidden="true"
          className="absolute left-[10%] right-1/2 h-px origin-right bg-linear-to-l from-periwinkle-200 to-periwinkle-400/60"
          style={{ top: CHIP / 2, scaleX: rail }}
        />
        <motion.div
          aria-hidden="true"
          className="absolute left-1/2 right-[10%] h-px origin-left bg-linear-to-r from-periwinkle-200 to-periwinkle-400/60"
          style={{ top: CHIP / 2, scaleX: rail }}
        />
        <ol role="list" className="relative grid grid-cols-5">
          <Stop label={dock.before[0]} rail={rail} at={1} />
          <Stop label={dock.before[1]} rail={rail} at={0.5} />
          <li ref={slotRef} className="relative mx-auto flex flex-col items-center gap-3">
            <span
              className="relative grid place-items-center rounded-2xl bg-navy-950 shadow-[inset_0_0_0_1px_rgb(199_203_255/0.16)]"
              style={{ width: CHIP, height: CHIP }}
            >
              <motion.span
                aria-hidden="true"
                style={{ opacity: ring }}
                className="absolute -inset-1.5 rounded-[1.25rem] shadow-[0_0_0_1px_rgb(142_150_255/0.4),0_0_28px_rgb(110_116_255/0.7)]"
              />
              {filled && <DockedMark />}
            </span>
            <span className="font-mono text-[0.66rem] tracking-[0.04em] whitespace-nowrap text-periwinkle-200 sm:text-[0.74rem]">Me</span>
          </li>
          <Stop label={dock.after[0]} rail={rail} at={0.5} />
          <Stop label={dock.after[1]} rail={rail} at={1} />
        </ol>
      </div>
    </GlassSurface>
  )
}

/** Scroll-driven version: the section pins while the box pops, opens, folds and docks. */
function StatementPinned() {
  const sectionRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLLIElement>(null)
  const geo = useMotionValue<Geo>({ W: 0, H: 0, sx: 0, sy: 0 })

  useLayoutEffect(() => {
    const stage = stageRef.current
    const slot = slotRef.current
    if (!stage || !slot) return
    const measure = () => {
      const c = centreWithin(slot, stage)
      // The slot <li> also holds the label, so aim at the square on top
      geo.set({ W: stage.clientWidth, H: stage.clientHeight, sx: c.x, sy: c.y - slot.offsetHeight / 2 + CHIP / 2 })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(stage)
    ro.observe(slot)
    document.fonts?.ready.then(measure).catch(() => {})
    return () => ro.disconnect()
  }, [geo])

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start 0.35', 'end end'] })
  const p = useSpring(scrollYProgress, { stiffness: 220, damping: 36, mass: 0.35, restDelta: 0.0004 })
  const f = <K extends keyof ReturnType<typeof frame>>(key: K) => useTransform(() => frame(p.get(), geo.get())[key])

  const glow = f('glow')
  const boxShadow = useTransform(
    () =>
      `inset 0 1px 0 rgb(255 255 255 / 0.55), inset 0 0 0 1px rgb(255 255 255 / 0.18), 0 0 ${90 * glow.get()}px -10px rgb(110 116 255 / 0.6), 0 30px 80px -30px rgb(0 0 0 / ${0.8 * glow.get()})`,
  )

  return (
    <section
      ref={sectionRef}
      id="stack"
      data-bg-scene="statement"
      aria-labelledby="stack-title"
      className="pointer-events-none relative -mt-24 h-[300svh] md:-mt-36"
    >
      <div ref={stageRef} className="sticky top-0 h-svh overflow-clip">
        <motion.div aria-hidden="true" className="absolute inset-0 bg-navy-950" style={{ opacity: f('scrim') }} />

        <div className="absolute inset-0 grid place-items-center px-4 pt-16">
          <motion.div className="w-full max-w-[46rem]" style={{ opacity: f('cardOpacity'), y: f('cardY') }}>
            <StackCard rail={f('rail')} slotRef={slotRef} />
          </motion.div>
        </div>

        <motion.div
          aria-hidden="true"
          className="statement-panel absolute left-0 top-0 will-change-transform"
          style={{
            x: f('x'),
            y: f('y'),
            width: f('w'),
            height: f('h'),
            borderRadius: f('radius'),
            scale: f('scale'),
            opacity: f('opacity'),
            boxShadow,
          }}
        />

        <motion.div className="absolute inset-x-0 top-1/2 px-6" style={{ y: f('textY'), opacity: f('textOpacity') }}>
          <div className="-translate-y-1/2 text-center" style={{ fontFamily: 'var(--font-hero)' }}>
            <motion.p aria-hidden="true" className={eyebrowClass} style={{ opacity: f('eyebrowOpacity') }}>
              [ {STATEMENT.eyebrow} ]
            </motion.p>
            <p className={statementClass}>
              {STATEMENT.words.map((w, i) => (
                <Word key={i} progress={p} index={i} text={w.text} accent={'accent' in w && w.accent} />
              ))}
            </p>
          </div>
        </motion.div>

        <motion.div
          aria-hidden="true"
          className="absolute left-0 top-0"
          style={{ x: f('tileX'), y: f('tileY'), scale: f('tileScale'), opacity: f('tileOpacity') }}
        >
          <PyramidTile size={TILE} />
        </motion.div>
      </div>
    </section>
  )
}

/** Reduced motion: the same content laid out in place, nothing pinned or moving. */
function StatementStill() {
  const rail = useMotionValue(1)
  return (
    <section id="stack" data-bg-scene="statement" aria-labelledby="stack-title" className="relative py-12 md:py-20">
      <div className="mx-auto max-w-[76rem] px-5 sm:px-8">
        <div
          className="statement-panel rounded-[1.75rem] px-6 py-14 text-center md:py-20"
          style={{ fontFamily: 'var(--font-hero)' }}
        >
          <p aria-hidden="true" className={eyebrowClass}>
            [ {STATEMENT.eyebrow} ]
          </p>
          <p className={statementClass}>
            {STATEMENT.words.map((w, i) => (
              <span key={i} className={cn('accent' in w && w.accent && accentClass)}>
                {w.text}{' '}
              </span>
            ))}
          </p>
        </div>
        <div className="mx-auto mt-8 max-w-[46rem]">
          <StackCard rail={rail} filled />
        </div>
      </div>
    </section>
  )
}

/**
 * Interlude between "What I build" and "Work": a periwinkle box pops up, opens
 * into a band carrying one sentence, then folds into the pyramid mark and docks
 * into a small full-stack diagram.
 */
export function Statement() {
  const reduced = usePrefersReducedMotion()
  return reduced ? <StatementStill /> : <StatementPinned />
}
