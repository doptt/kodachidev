# kodachi.dev: how the site is laid out and how it works

Last brought up to date on 2026-11-12, after a clean-up of the whole codebase. This is the one document that describes the site; read it before changing anything. The code's own comments go further into each file.

## State

- **One commit is on `main`, not pushed**: the black hole sequence. Everything after it is in the working tree, uncommitted: the lensed sky, the shared stage, smooth scrolling, the preloader, the moon, the alien, the clean-up. Commit only when the owner asks.
- `npm test` (78 tests), `npx tsc --noEmit` and `npx vite build` pass. axe reports 0 violations at 1440 and 375 wide.
- Dev server: `npm run dev`, port 5173.

## What the owner has decided

These stand until the owner says otherwise. Where a pasted brief or an older note disagrees, these win.

- **The black hole is finished and theirs.** Its look, renderer and pacing (`src/blackhole/`) are not to be changed unless they ask for exactly that. A rewrite was started once from a pasted brief and they had it reverted.
- **The moon scene and the alien model are approved as they are**: the framing, the ground, the light, his colours, the chair, the model. Changes since approval were all asked for one at a time: a beer bottle in place of a mug, the footer up for the whole moon section, icon badges over the pins.
- **The moon is never a floating globe.** It is a dome across the lower half of the screen, with its edge on a line the owner drew (`OUTLINE` in `src/moon/timeline.ts`).
- **The page goes dark and stays dark.** The purple of the first three sections fades to black before "about me", and everything after is cream on black.
- **Palette of the dark part**: Creamy Candle Flame `#FFEDC1` for highlights and hot parts, Muted Biscuit `#BCA68E` for bodies and secondary text, on true black. Tokens are `--color-bh-*`.
- **Text arrives word by word, rising through a mask** (`RevealText`). Cards and panels still come into focus out of a blur (`Reveal`, `blurIn`).
- **Sound is off until the visitor turns it on.**
- **They want decisions made, not asked.** Pick, say what was picked in a line, carry on. They steer by reacting to what is on the dev server, often with a screenshot drawn over.

## Stack and commands

Vite 8, React 19, TypeScript 7 (strict, no unused locals or parameters), Tailwind 4, `motion` for DOM animation, `lenis` and `gsap` (ScrollTrigger only) for scrolling, `three` for the moon. The black hole, the lensed sky and the purple background are hand-written WebGL2 with no library. `@/` is `src/`.

| Command | What it does |
| --- | --- |
| `npm run dev` | The site on port 5173, and the harness pages under `/dev/`. |
| `npm test` | Node's test runner over `tests/*.test.mjs`. The tests import `.ts` files directly, so anything a test imports must be plain TypeScript with no `@/` imports. |
| `npx tsc --noEmit` | Type check (`src/` only; `dev/` is not checked). |
| `npx vite build`, `npx vite preview` | Production build and a server for it on port 4173. Measure performance here, not on the dev server. |

## Where things are

```
index.html              the page shell, and the preloader's markup and CSS (inline, so it paints first)
src/
  main.tsx, App.tsx     entry; App lays the page out and starts scrolling and the preloader
  sections/             one file per section of the page, in page order (see the table below)
  content/              all the words and data: site.ts, build.ts, statement.ts, about.ts, projects.ts, contact.ts
  components/
    layout/             Nav, ScrollRail, Footer
    effects/            RevealText, ScrambleText, NoiseBackground, CursorCircle
    glass/              GlassSurface, LiquidGlass (the glass panels of the purple sections)
    ui/                 Section, Bento, Reveal, PyramidGlyph
    hero/, build/       PyramidMark (the particle pyramid), IsoArt (the line drawings in What I build)
  stage/                the one shared canvas every 3D scene but the black hole draws on
  motion/               timing tokens, smooth scrolling, the preloader's logic
  background/           the purple field behind the first sections (a stage scene)
  blackhole/            the black hole and the fall into it (its own canvas)
  lens/                 the lensed sky that shows the projects (a stage scene)
  moon/                 the moon, its pins and their labels (a stage scene, three.js)
  alien/                the alien, his chair, beer, cooler: everything at his spot on the moon
  sound/                the ambient sound and its switch
  styles/index.css      design tokens, the glass recipe, and the CSS of the scroll-driven parts
public/                 what is served as is: bg/, work/, sky/, moon/, models/, basis/, contact/
assets-src/             how the generated and downloaded assets were made (scripts, logs, readmes)
dev/                    harness pages: one scene on its own, with a slider
scripts/                screenshot and measuring tools (Playwright)
tests/                  unit tests of the pure modules
```

## The page, top to bottom

`App.tsx` renders, in order: `Background` (fixed, behind everything), `Nav`, `ScrollRail`, `CursorCircle`, then `<main>` with the sections, then `Footer`.

| # | Section | File | What it is |
| --- | --- | --- | --- |
| 1 | Hero | `sections/HeroCentered.tsx` | `#top`. The particle pyramid, "Hey, I'm Noah.", two buttons, three small glass cards. Purple. |
| 2 | What I build | `sections/Build.tsx` | `#build`. A bento panel of three items with line drawings. |
| 3 | Statement | `sections/Statement.tsx` | `#stack`. Pinned. A periwinkle card opens, shows one sentence word by word, folds into the pyramid mark and docks into a small "full stack" diagram. |
| 4 | Run-in | in `sections/WorkIntro.tsx` | 150lvh of empty page in which the purple fades to black and the first stars drift in. |
| 5 | About | `sections/AboutSpace.tsx` | `#about`. Huge glowing "about me", three numbers, the bio decoding itself out of scrambled letters. |
| 6 | Black hole | `sections/WorkIntro.tsx` + `src/blackhole/` | `#work`. Pinned for 600lvh. A caption and "See more" while it idles, then the fall, ending in exact black. |
| 7 | Projects | `sections/LensedWork.tsx` + `src/lens/` | `#work-projects`. Pinned for about 815lvh. The lensed sky: each project rises over the horizon as a ring of light and unrolls into its picture. |
| 8 | How I work | `sections/About.tsx` | `#approach`. Four traits and the tools list in a bento panel, recoloured cream by the `on-dark` class. |
| 9 | Contact | `sections/Contact.tsx` + `src/moon/` + `src/alien/` | `#contact`. Pinned for 380lvh. The moon, the alien, and a pin for each way of getting in touch. |
| 10 | Footer | `components/layout/Footer.tsx` | Site name, credit, links. Sticks to the bottom of the screen for the whole of the moon section. |

`sections/Work.tsx` is just the black hole followed by the projects.

**Chrome that stays on screen.** `Nav` is a floating pill at the top that shrinks once the page scrolls; on phones it opens a full-screen menu. It holds the sound switch and "Get in touch". `ScrollRail` (wide screens only) is a thin progress line on the right with the current section's number and name; its list of sections is at the top of the file. `CursorCircle` replaces the cursor on devices with a mouse. All three turn from periwinkle to cream as the page goes dark, and fade out during the fall.

## How it runs

### The stage: one canvas for the 3D scenes

`src/stage/` owns one `<canvas>` and one WebGL2 context, fixed behind the page inside `Background`. A scene is anything that implements `StageScene` (`types.ts`): it is handed the context, never owns or resizes the canvas, assumes nothing about GL state when its turn comes, never blocks on a shader compile, and draws a full opaque frame.

- `stage.define(id, factory, { priority })` registers a scene. The factory runs the first time the scene is wanted, so a scene's code can be a separate chunk.
- `stage.preload(id)` loads and compiles it without showing it. `stage.show(id)` asks for it to be on screen and returns a function that withdraws the request; `useShowScene(id, on)` does that from a component. When more than one is asked for, the highest priority that is ready is drawn. When none is, the canvas is black and the loop stops.
- A scene that becomes ready while another is showing gets one `warm()` call, to pay its first-frame costs off screen.
- A scene nothing has asked for in a while is disposed and made again when next wanted.
- The stage picks a quality tier from the GPU's name (`blackhole/quality.ts`: ultra, high, medium, low), steps down if the frame rate cannot hold, and handles a lost context.
- `standalone.ts` runs one scene on a canvas of its own under the same contract. The harness pages use it.

The scenes on the stage, by priority: `field` (0, the purple background), `lens` (2, the projects), `moon` (3). **The black hole is not on the stage**: it has its own canvas inside its pinned section, as it had before the stage existed, because the owner wants it left alone. Once its fall has ended in black, CSS hides that section's contents (`html[data-bh-entered] .bh-stage`) so its canvas does not sit in front of the shared one.

**Anything that draws with the stage's three.js renderer outside its own `render` call must call `renderer.resetState()` before and after.** three.js remembers the GL state it last set, and that memory is wrong once another scene has drawn. This caused a real bug: the alien's eyes were fitted from a texture read that came back black, and came out as goggles.

### Scrolling

`src/motion/scroll.ts`. Lenis smooths the wheel (touch, keyboard and the scrollbar stay native; under reduced motion Lenis is not started). Links to `#ids` glide. `trackProgress(element, start, end, fn)` wraps a ScrollTrigger and reports 0..1 as the page scrolls between two positions of an element; the black hole's driver and the lens's driver use it. ScrollTrigger is refreshed whenever the page changes height. The moon reads scroll through its own small driver (`src/moon/driver.ts`).

Each scroll-driven scene is built the same way: a tall section whose one child sticks to the screen; a **driver** that turns scroll into a progress number and eases it; a pure **timeline** function that turns progress into everything the scene needs (tested, no DOM); and the scene, which reads that every frame.

### Timing

`src/motion/tokens.ts` has the easing curves, durations and `damp`. The same curves and the three UI durations are in CSS as `--ease-*` and `--duration-*`.

### The preloader

Its markup and CSS are inline in `index.html`. `src/motion/intro.ts` fills in real progress (fonts, the still image behind the hero, the purple field's shader and texture), draws the pyramid mark as it goes, then wipes it away. `App` remounts the hero at that moment, so its entrance plays as it is uncovered. If scripts never run, the preloader takes itself away after 12 seconds.

### Text

`RevealText` splits text into words and raises each through a fixed mask the first time it scrolls into view. Gradient text classes go on `wordClassName`, not on the element. `ScrambleText` is the decoding monospace text of the bio. Both render plainly under reduced motion.

### Sound

`src/sound/ambient.ts` builds a drone in the browser (nothing is downloaded) and re-voices it by where the page is: the lit page, the dark, the fall, the lensed sky, the moon. `SoundToggle` in the nav turns it on. Nobody has listened to it.

## The scenes

### The purple field (`src/background/`)

A flowing field made from one tileable image (`public/bg/field.webp`), with a camera that moves through it as the page scrolls. Each section names a look with `data-bg-scene`, and `controller.ts` blends between the looks of whatever is on screen (`scenes.ts`). It fades to black with the page and is withdrawn once the page is fully dark. A still image (`public/bg/still*.webp`) shows before it is ready, without WebGL, and under reduced motion.

### The black hole (`src/blackhole/`)

A ray-marched Schwarzschild black hole with a disk of spiral strands, drawn in its own canvas by `BlackHoleScene.tsx`, loaded lazily a few seconds after the page.

- `driver.ts` follows four stretches of scroll (the run-in's fade, the approach, the pinned stretch, the leaving) and publishes the result through `state.ts`.
- `state.ts` holds `progress`, `theme` (0 purple .. 1 black), `dim` (the UI fading for the fall), `arrive`, `intro`, and `entered` (true while the screen is black). It mirrors them to CSS as `--bh-*`, **only onto elements that ask by name** with `data-bh-vars="theme dim"`: a scroll-driven custom property on a large subtree restyles all of it every frame.
- `timeline.ts` is the pacing: `timeline(p)` gives the camera, exposure, smear, iris and blackout for a progress; `derive` gives the page-level values. After the stage scrolls away the black page is held and the dimmed UI comes back.
- `renderer.ts`, `camera.ts`, `gl.ts`, `shaders/`: the scene, a radial smear, temporal accumulation, bloom, an ACES grade. `quality.ts` has the tiers and the frame-rate governor, which the stage also uses.
- `StarField.tsx` is the thin scatter of 2D-canvas stars used in the dark DOM sections.
- Without WebGL it shows `public/work/blackhole.jpg`, which is the owner's original reference and no longer matches the scene.

### The lensed sky (`src/lens/`)

What follows the fall. The camera hovers just above the hole; the hole's shadow is the black lower part of the screen and its edge is the horizon. The projects are lit pictures hung on the sky. One is settled above the horizon, readable; the next is behind the hole, smeared by the lens into the ring along the horizon. Scrolling turns the sky: the settled picture leaves over the top and the ring unrolls into the next. After the last, the camera drops and the sky closes into a shrinking ring overhead.

- `geodesic.ts`: the physics. A ray stays in one plane, so the lens is a single table per camera height: angle from straight down to how far round the hole the ray ends up. 384 entries, spaced toward the edge of the shadow; the innermost are continued along their logarithm, not integrated.
- **The lens is eased on purpose.** A real hole this close would bend every screenshot beyond reading, so the true deflection is used at the edge of the shadow and eased toward flat space a few degrees above it (`LENS_FLOOR`, `skyAngle`). During the last fall the easing is let go.
- `timeline.ts`: `lensTimeline(p, count)` gives the phase (which project), the fall, the camera and the fades; `sources` says which projects are lit and where; `composition` frames the picture for the screen's shape. Pacing constants are at the top: `INTRO`, `PER_PROJECT`, `OUTRO`, `HOLD`, `THETA_STEP`. The section's height follows from the number of projects.
- `renderer.ts`, `shaders/lens.frag.glsl`: one table lookup a pixel, the screenshots as an array texture, and NASA's star map (`public/sky/`) looked up in the direction each ray ends up, so the sky is really lensed. `shaders/grade.frag.glsl` grades without a film curve, so screenshots keep their colours.
- **The sky moves.** NASA's map is the galaxy and its dust; it drifts slowly round the vertical (`STAR_DRIFT`), and the stars in it shimmer. Over it the shader draws three layers of stars of its own (`starLayer` in `lens.frag.glsl`): round dots a pixel or two wide, coloured from ember to blue-white, each twinkling on its own beat, each layer drifting a little faster than the one behind (`LAYER_DRIFT`), which gives the sky depth. Now and then a shooting star crosses (`meteor`). All of it is looked up in the direction each ray ends up, so it is lensed with the rest. Under reduced motion the clock is held at 0: nothing drifts or twinkles, and there are no shooting stars. The hole, its edge line, the rings and the pictures were not touched.
- `scene.ts` is the stage scene; `LensScene.tsx` is the same scene on its own canvas, for the harness only.
- `sections/LensedWork.tsx` is the pinned section and the words for each project, set in the shadow under the horizon. Every project's words are always in the page; only the settled one's are visible. With reduced motion or no WebGL it renders `Flat`, a plain list.
- While the visitor is paused on a project, this section preloads the moon.

The join with the black hole: the lens section has `margin-top: -100lvh`, so it pins on the frame the black hole's stage lets go, black on black.

### The moon (`src/moon/`)

A three.js scene, fetched as its own chunk. The top of a moon a few metres across fills the lower half of the screen; the alien sits on top; the Earth and the Milky Way are behind.

- `timeline.ts`: scroll to camera. The section opens close on the alien and pulls back to the settled view (`TRAVEL` 1.7 screens of scroll, then `HOLD` 1.1 in which nothing moves but what the visitor moves). The settled camera is solved so the moon's limb lies on `OUTLINE`, the owner's drawn line; a test checks the fit.
- `config.ts`: the fixed facts (where he sits, the sun, the Earth, pin sizes). `geo.ts`: latitude and longitude to positions, and the occlusion test for pins.
- `world.ts` builds and draws it: `ground.ts` (NASA colour and slopes over the whole ball, a made-up close-up of the ground round the chair, a tiling grain; a lunar reflectance model; the pins' pulse rings), `rocks.ts`, `earth.ts`, `pins3d.ts`, the sun with a shadow map, and `post.ts` (bloom, the sky laid in behind, the film curve). `assets.ts` loads the textures by tier.
- `orbit.ts`: dragging swings the camera a little way round the chair, with inertia and limits, and a slow sway when left alone.
- `state.ts` is the one object the scene and the page share: the page writes scroll progress, the drag and which pin is open; the scene writes back where each pin is on screen.
- `MoonOverlay.tsx` is the DOM over the canvas: for each pin a hit target carrying its floating icon badge, a leader line, and a label card with its link and copy button. The cards are real links and buttons, so the keyboard reaches them; focusing one swings the view to its pin. On phones a tapped pin's card is a sheet at the bottom.
- `sections/Contact.tsx` is the pinned section. Any link to `#contact`, the nav's "Get in touch" included, calls `moonControls.flyTo()`. It marks `<html data-moon-in>` while the moon is the scene, which is what keeps the footer up. With `?nogl`, or if the scene fails, it shows a flat picture (`public/contact/moon.webp`, from the owner's first reference) with the contact details as a plain list.
- Pins are rows in `content/contact.ts`: label, value, link or text to copy, an optional `icon`, and the spot on screen where the pin's foot should stand.

### The alien (`src/alien/`)

Everything at his spot, as one actor the moon scene places (`types.ts` is the agreement between the two: the moon owns the world, lights, camera and ground; the actor owns what sits on the ground there and what he does).

- `rig.ts` loads the model and its manifest (`public/models/alien.glb`, `alien.json`). `measure.ts` reads off the mesh what the actor needs: limb lengths, the eyes, the hands, the antennae.
- **The model's own clips are not played.** `pose.ts` seats him with an IK solver as he sits in the owner's picture (reclined, ankles crossed, one hand hanging, the other holding the bottle), and `clips.ts` bakes that pose into clips at load: idle, sip, look up, shift. An AnimationMixer cross-fades them; `maths/schedule.ts` decides when (a sip every 6 to 10 seconds, blinks, the odd ambient beat).
- `gaze.ts` turns his head and eyes toward the cursor or a hovered pin, within what a neck can do. `antennae.ts` springs the antenna bones from the head's motion. `face.ts` gives each painted eye a glossy shell and a lid for the blink. `hands.ts` bends the finger vertices once, at load, round the bottle (the model has no finger bones). `skin.ts` replaces the one material with one that treats skin and cloth differently.
- `props/`: the lawn chair (bent tube, woven webbing), the beer bottle, the cooler and water bottles, all built in code. `textures.ts` paints their textures on canvases. `env.ts` is a small reflection map for the shiny things. `contact.ts` lays contact shadows; `dust.ts` is the puff when he is first revealed.
- `maths/` holds the pure parts (IK, spring, look limits, schedule, shape fitting), with tests.

## Styling

`src/styles/index.css`: the `@theme` block is the design tokens (type, colours, radii, shadows, easing); then the glass recipe (`.glass`, `.glass-blur`, `.glass-tint`, `.glass-dark`); then the CSS of the black hole sequence, the big glowing text, the nav's colour change, the lensed sky's captions, the sound switch; then utilities for the hero's gradient text. `.on-dark` recolours a section for the black page by overriding the theme's colour variables inside it. The moon's CSS is its own file, `src/moon/moon.css`.

Fonts: Outfit for display (`font-hero`), Geist for text, Geist Mono for small labels, Montserrat in the nav, Bricolage Grotesque for the nav's monogram.

## Fallbacks and accessibility

- Every canvas is decoration and hidden from assistive technology. What a visitor needs is real DOM: the caption and button over the black hole, the words for every project, the pins' cards.
- **Reduced motion**: no smooth scrolling, text renders in place, the purple field is the still image, the black hole draws one settled frame, the projects are a plain list, the moon is held on its settled view.
- **No WebGL** (or `?nogl`): the still background, the black hole's still image, the projects as a list, the flat moon picture with the contact details listed.
- Keyboard: focus rings everywhere; a project's link scrolls to that project when focused; a pin's card opens and the view turns to it.

## Assets

| Where | What | Made by |
| --- | --- | --- |
| `public/bg/` | The purple field, its glow map, the hero stills | `dev/background.build-field.py`, from `animatedbg.mp4` in the repo root |
| `public/work/` | Project screenshots; the black hole's still | by hand |
| `public/sky/{512,1024,2048}/` | NASA's Deep Star Map as cube faces | `assets-src/scripts/sky.py`, see `assets-src/README-sky.md` |
| `public/moon/` | Moon colour and slopes, the close-up ground, the grain, the Earth (KTX2) | `assets-src/scripts/moon.py`, `moon.mjs`, see `README-moon.md` |
| `public/models/` | The alien and his manifest | the pipeline in `assets-src/`, see its `README.md` |
| `public/basis/` | The Basis transcoder three.js uses for KTX2, and `worker.js`, the file its workers start from | the transcoder is copied from `three`; `worker.js` is ours |

**KTX2 and the Content-Security-Policy.** The Basis transcoder builds functions with `new Function`, which the page's policy (`vercel.json`) forbids. So KTX2 loaders are made with `createKTX2Loader` (`src/stage/ktx2.ts`), which starts the transcoder's workers from `/basis/worker.js`; `vercel.json` serves that one file with a policy of its own that allows it. A plain `new KTX2Loader()` works on the dev server, which sends no policy, and fails silently on the deployment. To check before deploying, serve `dist/` with the headers of `vercel.json`.
| `public/contact/` | The flat moon picture for the fallback | the owner's first reference, re-encoded |

The alien was generated with Higgsfield from the owner's picture; every call and its cost is in `assets-src/ASSET_LOG.md`. The account began that session with 270 credits and ended with 109.75. `assets-src/raw/` and `assets-src/tools/` (downloads, intermediates, the KTX encoder) are not in git; things that were generated but are not used on the site are in `raw/not-shipped/`.

## Dev tools

Harness pages, each one scene on its own. Most take `?p=0.5` for a fixed scroll progress, `&nohud` to hide the slider and `&bhtier=low` to force a quality tier; the header comment of each page's script lists its switches.

| Page | Scene |
| --- | --- |
| `/dev/background.html` | The purple field |
| `/dev/blackhole.html` | The black hole (`&set=smear:0` overrides a field of the frame) |
| `/dev/lens.html` | The lensed sky. Projects settle at p = 0.112, 0.294, 0.476, 0.657; the fall starts at 0.839 |
| `/dev/moon.html` | The moon |
| `/dev/alien.html` | The alien on plain ground, with camera presets and buttons for sip, blink, beats |
| `/dev/model-viewer.html` | Any GLB on a turntable |

Scripts (Playwright; screenshots land in `screenshots/`, which is not in git):

| Command | What it does |
| --- | --- |
| `node scripts/screenshots.mjs --gpu --scroll "0,#about,end" --widths 1440,390` | Screenshots of the real page at ids, pixel offsets or `end`. |
| `node scripts/bh-shots.mjs --mode site --p 0.05,0.5` | The real page at pinned-progress positions of a stage. `--stage "[data-lens-stage]"` for the projects; `--mode dev --page lens` for a harness page. |
| `node scripts/bh-scrolltrace.mjs` | Frame times during a real wheel scroll. `FROM="[data-lens-stage]"` to start elsewhere; `URL=` to point at the preview build. |
| `node scripts/bh-perf.mjs` | GPU cost of the black hole per tier, at rest. |
| `node scripts/moon-shots.mjs`, `alien-shots.mjs`, `model-shots.mjs` | Stills of those harness pages. |
| `node scripts/glass-probe.mjs axe --url http://localhost:5173` | Accessibility scan. |

Playwright only uses the real GPU when Chromium is launched with `--use-angle=d3d11 --enable-gpu`; the scripts do this (`screenshots.mjs` with `--gpu`). With default flags it is software rendering and the scenes fall back.

## Working practice that has mattered

- **Measure frame rate while scrolling, not at rest**, and on the production build. The dev server is about twice as slow.
- **Never put a scroll-driven custom property on a large subtree.** Use `data-bh-vars` on the small element that needs it.
- **Animate only opacity and transform on anything large**, and on anything laid over a canvas.
- **Never ask for a shader's compile status before it has finished in the background**; it blocks for the whole compile.
- **Look at what was made.** Screenshot, compare with the reference, fix, repeat. Say plainly when only stills were checked: the owner judges motion themselves.
- In the Bash tool on this machine, a heredoc containing an apostrophe fails; write the script to a file instead.

## Known issues and what has not been done

- **Building the moon stalls the page for about a third of a second.** It is held back until the visitor has stopped scrolling on a project (or reaches the third), which hides it, but the work itself is not split up.
- **Performance is only known on one machine.** Scrolling through the lensed sky had 0% of frames over 20ms on every tier on an RTX 4060 laptop, on the dev server. The moon has not been measured per tier. Nothing has been measured on a mid-range laptop or a phone.
- **Nothing has been tested in Safari or Firefox**, or on a real phone or tablet.
- **The alien's motion has only been judged from stills**, as has the bobbing of the pins' badges.
- **Up close**: the beer bottle's glass reads as glossy and opaque; his fingers go about halfway round it; mid-sip, from the settled camera, the bottle crosses in front of one eye.
- **On phones the footer overlaps the lowest pin's ring.**
- **The sections do not flow into one another as one camera move.** Each scene starts and ends in black.
- **The black hole's still image** (`public/work/blackhole.jpg`) does not match the scene.
- **The flat moon picture** in the fallback is the owner's first reference: a different alien, in a space suit.
- The ambient sound has never been listened to.

## Files in the repo root that are not the site

`reference.mp4`, `texteffect.mkv`, `bigtext.png`, `scene.png`, `Blackholeref.mp4`, `Alienchairref.jpg` are the owner's reference media, untracked. Do not delete them; ask whether to commit or ignore them. Two more references are on their Desktop: the alien picture the model was made from and the screenshot with the moon's outline drawn on it. `animatedbg.mp4` is tracked: it is the source of the purple field.
