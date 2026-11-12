# Handoff: black hole sequence, next steps

Written 2026-11-12 at the end of the session that built the black hole sequence. Read this before touching `src/blackhole/` or `src/sections/WorkIntro.tsx`.

## Where things stand

- **The session's work is committed on `main` as one commit** ("Add black hole scroll sequence…"), at the owner's request. It has not been pushed.
- `npm test` (24 tests), `npx tsc --noEmit` and `npx vite build` all pass. axe reports 0 violations. No console errors.
- The dev server was started from the session and ends with it. Start it again with `npm run dev` (port 5173).
- Reference files were left out of that commit and sit untracked in the repo root: `reference.mp4`, `texteffect.mkv`, `bigtext.png`, `scene.png` (and a stray `desktop.ini`). They are the owner's references, not site assets: recordings and screenshots of other sites, one of which shows the owner's desktop. Do not delete them; ask whether to commit or gitignore them.

## What the owner wants next

In this order. They said they will bring more detail and references next session, so confirm scope before building.

1. **Gravitational lensing after the fall.** After falling into the black hole, a lensing effect based on NASA's 360° simulation of falling into a black hole. Ask for the exact video. See "Notes for the lensing scene" below for what the current renderer can and cannot do.
2. **A creative way to show the work.** Undecided. The owner will work this out; do not design it unprompted. The existing project list (`src/sections/Work.tsx`, `#work-projects`) is still on the page below the black hole and is what gets replaced or reworked.
3. **Footer and Contact on a moon.** The footer and contact section set on the surface of a moon, with a green alien relaxing in a lawn chair and a beer on the ground. Current versions are `src/sections/Contact.tsx` and `src/components/layout/Footer.tsx`.

## The page today, top to bottom

| # | Section | File | Notes |
| --- | --- | --- | --- |
| 1 | Hero | `sections/HeroCentered.tsx` | Purple. Text arrives word by word out of a blur. |
| 2 | What I build | `sections/Build.tsx` | Bento panel, cells blur in one after another. |
| 3 | Full stack (Statement) | `sections/Statement.tsx` | Pinned, scroll-driven. Pre-existing. |
| 4 | Run-in | in `sections/WorkIntro.tsx` | 150lvh of empty page. The purple background fades to black here; stars drift in over the second half. |
| 5 | About, in the dark | `sections/AboutSpace.tsx` | `#about`. Huge glowing "about me", three numbers, bio in decoding monospace text. |
| 6 | Black hole | `sections/WorkIntro.tsx` + `src/blackhole/` | `#work`. Pinned for 600lvh. Caption and "See more" button while idle, then the fall, then exactly black. |
| 7 | Project list | `sections/Work.tsx` | `#work-projects`. Page returns to purple here (temporary bridge, see below). |
| 8 | How I work | `sections/About.tsx` | `#approach`. The trait cards and tools list left over from the old About. |
| 9 | Contact, Footer | `sections/Contact.tsx`, `layout/Footer.tsx` | Purple. |

## How the black hole sequence works

**Scroll drives everything through one module.** `src/blackhole/driver.ts` reads where the run-in and the pinned stage are, eases that, and calls `publish()` in `state.ts`. `state.ts` holds the values and mirrors them to CSS.

| Value | Meaning | CSS variable |
| --- | --- | --- |
| `progress` | 0..1 through the pinned stretch | `--bh-progress` |
| `theme` | 0 purple page .. 1 black, driven by the run-in | `--bh-theme` |
| `dim` | 0..1 as the UI fades out during the fall | `--bh-dim` |
| `arrive` | 0..1 as the scene fades up while scrolling in | `--bh-arrive` |
| `intro` | 0..1 while the caption is up over the idle scene | `--bh-intro` |
| `entered` | true while the screen is fully black | `data-bh-entered` on `<html>` |

**The hook for the next scene** is already there: `blackHole.onEntered(fn)`, `blackHole.onExited(fn)`, `blackHole.subscribe(fn)` from `@/blackhole/state`, the `onEntered` / `onExited` / `onProgress` props on `<WorkIntro>`, and `bh:entered` / `bh:exited` window events. `entered` flips at progress 0.95 and back below 0.925.

**`RELEASE_AFTER` in `driver.ts` is a temporary bridge.** It is `true`, so theme and dim let go as the stage scrolls away and the purple page comes back. Set it to `false` to hold the black state past the end, which is what a scene that continues from the black will need.

**All pacing is pure functions in `src/blackhole/timeline.ts`**, with no DOM or GL, and is what the tests cover. Key constants: `IDLE_END` 0.13, `FALL_END` 0.9, `BLACK_AT` 0.935, `DIST_FAR` 62, `DIST_NEAR` 3 (camera distance in Schwarzschild radii).

**Files in `src/blackhole/`:**

| File | Role |
| --- | --- |
| `timeline.ts` | Scroll position to camera, grade and page values. Pure. |
| `driver.ts` | Reads scroll, eases, publishes. Owns `RELEASE_AFTER`. |
| `state.ts` | Shared state, CSS variables, enter/exit events. |
| `BlackHoleScene.tsx` | The canvas component (lazy-loaded). Frame loop, pointer parallax, quality governor. |
| `renderer.ts`, `gl.ts`, `camera.ts` | Raw WebGL2, no three.js. Passes: scene, radial smear, temporal accumulation, bloom chain, composite. |
| `quality.ts` | Tiers (ultra, high, medium, low) and the frame-rate governor. |
| `StarField.tsx` | 2D-canvas stars that scroll with the page. Three instances: run-in, About, stage. |
| `shaders/scene.frag.glsl` | The ray-marcher: lensed disk of spiral strands, gas glow, veil layer. |

**The canvas is transparent where the scene is empty.** The scene shader outputs coverage in alpha and draws no sky. The black behind it is the page's own background fading (`.bh-veil` in `Background.tsx`), and the stars are the DOM `StarField` layers, not part of the shader.

## Decisions the owner has made

Do not undo these without being asked.

- **Palette:** Muted Biscuit `#BCA68E` for the body of the disk, Creamy Candle Flame `#FFEDC1` for the hot parts. Tokens are `--color-bh-*` in `src/styles/index.css`.
- **No clouds.** They were built twice and removed. No dust in the foreground.
- **Stars:** few, small, scrolling with the page (explicitly not a fixed backdrop), drifting and sparkling.
- **Transition:** the purple background simply fades to black over the run-in. No cut, no black hole visible until the page is black.
- **Nav:** the "NW" monogram stays at all times. The button, the rim glow and the monogram turn cream as the page goes black, and back on the way up.
- **Text:** blur fade-in word by word across the site (`components/effects/BlurText.tsx`, modelled on Aceternity's Text Generate Effect). Cards and UI blur in (`blurIn` in `components/ui/Reveal.tsx`).
- **Caption over the idle black hole:** bottom-left, with a "See more" button wrapped in Aceternity's Noise Background (`components/effects/NoiseBackground.tsx`).

## Open questions left with the owner

- Should the page stay black/cream after the black hole, or return to purple? Today it returns (the bridge). They also floated recolouring the whole site to match the black hole and deferred it.
- The old About was split: bio and numbers moved up into the dark section, the trait cards and tools stayed below as "How I work." They have not confirmed they like the split.
- "See more" jumps to the project list, skipping the fall. Not confirmed.
- The caption reuses the old Work heading copy ("Selected projects." and its lede).

## Notes for the lensing scene

These are facts about the current code that bear on goal 1, not a design.

- The fall never crosses the horizon. The camera stops at 3 Schwarzschild radii and the picture is taken to black by an iris and a final multiply (`iris`, `blackout` in `timeline.ts`). Rays that reach r < 1.02 are simply marked captured and drawn black.
- The camera is a static observer. There is no aberration or Doppler shift from the camera's own infall velocity, which is most of what makes a real plunge look the way it does. Only the disk's orbital Doppler brightening is modelled.
- The integrator bends rays with the Schwarzschild photon-orbit equation (`v -= 1.5 * h2 * x / r^5 * dt` in `trace()`). It is not Kerr; the hole does not spin.
- There is no sky in the shader to lens. An earlier procedural star field and wisps lived in the shader and were removed at the owner's request; that code was never committed and would have to be rewritten. Lensed background stars would have to go back into the shader, since the DOM stars cannot be bent.
- Whether the new scene starts from the black screen or replaces the blackout is undecided.

## Working practice that mattered

- **Measure frame rate while scrolling, not at rest.** For most of the session I reported 60fps from a page sitting still; under an actual scroll it was 20 to 30fps. Use `node scripts/bh-scrolltrace.mjs`, which takes an optional CSS string to switch one thing off at a time. That is how every real cause was found; guessing was wrong three times.
- **Never put a scroll-driven custom property on a large subtree.** A changing custom property restyles everything that inherits it, every frame. The values are written only to elements that ask by name: `data-bh-vars="theme dim"`. Anything new that needs one in CSS must add that attribute naming it, on itself or a close ancestor, and keep that element small.
- **Animate opacity and transform only on anything large.** Animating blur or text-shadow on the big headline, or blur on the caption over the canvas, each caused stalls.
- **Shaders compile in the background** (`KHR_parallel_shader_compile`, `prepare()` in `renderer.ts`) and the scene is mounted at idle a few seconds after load. Do not add a call that asks for compile or link status before `prepare()` reports ready; it blocks for the whole compile.
- **Measure the production build** (`npx vite build && npx vite preview`, port 4173) for real numbers. Dev mode is roughly twice as slow and React StrictMode double-mounts the scene.
- The owner asked for a screenshot comparison loop on visual work: capture, compare against the reference, list differences, fix, repeat. They judge motion themselves; say plainly that stills are all that was checked.

## Tools in the repo

| Command | What it does |
| --- | --- |
| `npm test` | Timeline, scroll and governor tests (Node's test runner, TypeScript stripped on import). |
| `node scripts/bh-shots.mjs --mode site --p 0.05,0.5,1 --sizes 1440x900,390x844@2 --back` | Screenshots of the real page at pinned-progress positions, on the real GPU. `--mode dev` uses the isolated scene. `--reduced-motion`, `--query nogl` for the fallbacks. |
| `node scripts/bh-scrolltrace.mjs ["css"]` | Frame times by scroll position during a real wheel scroll. `URL=` and `SETTLE=` env vars. |
| `node scripts/bh-perf.mjs` | GPU cost per frame of the isolated scene, by tier and size. At rest only. |
| `node scripts/glass-probe.mjs axe --url http://localhost:5173` | Accessibility scan. |
| `/dev/blackhole.html?p=0.5&bhtier=ultra&set=smear:0` | Isolated scene with a progress slider and frame overrides. |

Screenshots land in `screenshots/` (gitignored). Playwright must launch Chromium with `--use-angle=d3d11 --enable-gpu` to use the real GPU; the default flags give software rendering, which the scene treats as "no WebGL" and shows the fallback image.

## Known issues

- **A pause of about 0.2s when the caption first appears** at the start of the pinned stretch. It is tied to the Noise Background button (hiding it removes the pause). Three attempts at the cause failed: removing the caption's blur, isolating its React state, and removing the button's rounded clip.
- **Frame rate under scroll is not settled.** The production build measured 1 to 2% of frames slow in the best runs and about 10% in others, for the same code. The last dev-mode runs showed about 5% slow frames but also stalls of 0.5 to 1.6s that were not there earlier and were not diagnosed. Another program was using the GPU at the time. Re-measure on a quiet machine before trusting any number here.
- **The fallback image no longer matches the scene.** `public/work/blackhole.jpg` is the owner's original reference image, regraded. It still shows clouds, more stars and a different composition. It is shown without WebGL, on software rendering and on low-end phones.
- **Untested:** real phones and tablets (their quality tier is a guess from the GPU name), Safari and Firefox, integrated GPUs, and the governor's automatic step-down in practice.
- **`docs/PLAN.md` is partly out of date.** Its Work-intro row predates the run-in, the About-in-the-dark section, the caption and the removal of clouds.
- The veil layer, the fifth strand octave and supersampling only run on the top quality tier; phones get a simpler disk.
