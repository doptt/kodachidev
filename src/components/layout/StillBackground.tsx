/**
 * Stand-in for the animated WebGL `<Background />`: the still frame, fixed and
 * covering the viewport, with a soft vignette so text edges stay calm.
 * Swap this for the real background once src/background/ lands.
 */
export function StillBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 select-none">
      <picture>
        <source media="(max-width: 1279px)" srcSet="/bg/still-1280.webp" />
        <img
          src="/bg/still.webp"
          alt=""
          decoding="async"
          fetchPriority="high"
          className="h-full w-full object-cover"
        />
      </picture>
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 40%, rgb(5 6 26 / 0) 40%, rgb(5 6 26 / 0.55) 100%),' +
            'linear-gradient(180deg, rgb(5 6 26 / 0.35) 0%, rgb(5 6 26 / 0) 30%, rgb(5 6 26 / 0.15) 100%)',
        }}
      />
    </div>
  )
}
