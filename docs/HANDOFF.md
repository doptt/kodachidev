# kodachi.dev: how the site is laid out and how it works

Last brought up to date on 2026-11-17, at the end of a session that put the projects back on the earlier lensed sky and gave it the horizon and the movement of the owner's reference video. This is the one document that describes the site; read it before changing anything. The code's own comments go further into each file.

## State

- **`main` is what is live** (kodachi.dev, deployed by Vercel from `main`). On 2026-11-17 the owner had everything committed and pushed to `main`: the work of 2026-11-13 from the branch `true-lens` (the alien's black sweatshirt, the chair's tan straps, the first half of a better moon surface) and the projects section as described below.
- **The owner did not like the true lens** (2026-11-13). The projects went back to the earlier lensed sky, edited to match a reference video of theirs (see "The lensed sky"). The true lens is in the history (`530b749`) and its design and plan are in `docs/superpowers/`.
- They have seen the projects section on the dev server and said it looked good so far; the cards, the glow on every project and the new ending went in after that and were pushed at their word without their having watched them.
- `npm test` (98 tests), `npm run typecheck` and `npm run build` pass on the working tree.
- Dev server: `npm run dev`, port 5173.

## Where the last session stopped (2026-11-17)

Read this first if you are picking the work up.

**Finished, waiting for the owner's eye**

- **The projects, after the owner's reference video.** The video (a ten second clip on their laptop, `Downloads/hf_20261117_044254_….mp4`, not in the repo) shows the earlier lensed sky with a soft glowing horizon in lavender, streaks running under it, and one continuous move from each project to the next. They asked for exactly that look with the lavender replaced by the tan and gold of the navigation, and for the movement to be as smooth as the video's. Stills of the result, beside the old one, are in `screenshots/work-horizon/`. Decided without them, and theirs to overturn:
  - **Scroll no longer scrubs the move between projects.** Scrolling past a point in a project's stretch sends the sky on to the next, and the move then plays out in time, about a second, the same every time. It was the only way to get the video's one unbroken move from a wheel that turns in notches.
  - A project's stretch of scroll is one screen, down from 1.3.
  - The waiting project is dark until the sky brings it round, so there is no ring across the screen while a project is being read.
  - The picture is a little smaller and the horizon a little higher than on `main`, as in the video.
- **Four further things the owner asked for the same day**, each built by an agent and checked from stills and scripted input only (stills in `screenshots/glow/`, `screenshots/ending/`, `screenshots/cards/`):
  - **The horizon glows on every project.** The flare that used to show only as the scene opens is now the band's look whenever a project is settled; it dims during a move and swells again on arrival. Settled strength is `RIM_SETTLED` (0.6, about four fifths of the opening flare); at full strength the small labels in the shadow washed out.
  - **Kyvora's sky is darker.** The galaxy's core was moved up and left of the picture (`GALAXY_RISE`, `GALAXY_SIDE`, `GALAXY_TILT` in `renderer.ts`) and its dust put through a contrast curve (`GALAXY_*` in the shader), so the picture stands on near-black sky.
  - **A ring of cards for each project.** Further views of each site (`more` in `content/projects.ts`, pictures `public/work/<slug>-2..4.webp`) curve away to the right of the hero; drag, fling, click, sideways wheel, touch swipe and keyboard turn the ring. Kyvora and Dewly now link to their live sites. See "The ring of cards" below.
  - **The ending drops into the dark.** From `fall` 0.46 the camera tips down and the glowing arc leaves through the top; the sky no longer closes into a ring. The next section's stars fade in over the black.
  - Known and left as they are, with the owner's agreement: Dewly's hero picture shows an older headline than the live site; one Kyvora card carries the site's line "No client work to show yet".
- **The alien's sweatshirt is black** (`src/alien/skin.ts`, in the shader). Stills: `screenshots/hoodie/`.
- **The chair's coloured straps are the theme's tan as seen on screen** (`TAN` in `src/alien/textures.ts`).

**Not finished**

- **The moon's surface.** The owner asked for a better-looking moon made with Higgsfield: the same size and place on screen, better shading, more detail. What is in: three generated pictures behind the close-up ground, a new tiling crater layer and the grain; fresh craters with pale aprons. At the settled view it still reads much as it did. What is not in, and is the part that would show: shadows cast by the generated relief under the low sun, and more tonal range. The heights the shadows need are already in the tiles' alpha channel. The plan for the shader, step by step, is in `assets-src/README-moon.md` and in the known issue below. `uAlbedo` in `ground.ts` was not retuned after the last rebuild and the ground is a little darker than before (median 95 against 99). The limb was measured after the first rebuild (under 0.15 px of shift) and not after the second, though nothing that moves it changed.
- **Nobody has watched any of this move.** Everything was judged from stills on one laptop GPU. Safari, Firefox, real phones and slower GPUs are untested.

**For a session without this machine**

- No GPU: `scripts/bh-shots.mjs --software` renders with SwiftShader. It is slow and its frame rates mean nothing, but the pictures are right.
- `assets-src/raw/` and `assets-src/tools/` are not in git. Without them `assets-src/scripts/moon.py` cannot rebuild `site-*`, `moon-craters-*` or `moon-detail`: the three Higgsfield pictures it starts from are in `assets-src/raw/moon/hf/` on the owner's laptop, as is the KTX encoder. The shader work on the moon needs none of that; rebuilding textures does.
- `screenshots/` is not in git either. The stills named in this document are on the owner's laptop.
- Higgsfield: the moon work spent 10.25 credits and left the balance at 59.5. The balance read 69.75 when that work began, though this document had recorded 109.75 after the alien; nothing in this session's log accounts for the difference. The owner set no budget beyond "use Higgsfield for the moon"; the last session capped itself at 40.

## What the owner has decided

These stand until the owner says otherwise. Where a pasted brief or an older note disagrees, these win.

- **The black hole is finished and theirs.** Its look, renderer and pacing (`src/blackhole/`) are not to be changed unless they ask for exactly that. A rewrite was started once from a pasted brief and they had it reverted.
- **The moon scene and the alien model are approved as they are**: the framing, the ground, the light, his colours, the chair, the model. Changes since approval were all asked for one at a time: a beer bottle in place of a mug, the footer up for the whole moon section, icon badges over the pins, a matte black sweatshirt, the chair's green straps in the theme's gold-tan, and a better-shaded, more detailed moon surface in the same place on screen.
- **The projects are shown as in their reference video of 2026-11-17**: the earlier lensed sky (words in the shadow under the picture), a glowing streaked horizon in the theme's tan and gold where the video has lavender, and a smooth move from one project to the next. They saw the true lens (2026-11-13, approved on paper) and did not like it; do not bring it back unless they ask.
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
| 7 | Projects | `sections/LensedWork.tsx` + `src/lens/` | `#work-projects`. Pinned for about 695lvh. The lensed sky: a picture above a glowing tan horizon, its words in the shadow below; the next comes up over the horizon and unrolls into place. |
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

What follows the fall. The camera hovers just above the hole; the hole's shadow is the dark lower part of the screen and its edge is the horizon. One project's picture is settled in the sky above the horizon, with its words in the shadow below. The look and the movement follow the owner's reference video.

- `geodesic.ts`: the physics. A ray stays in one plane, so the lens is a single table per camera height: angle from straight down to how far round the hole the ray ends up. 384 entries, spaced toward the edge of the shadow. **The lens is eased** (`skyAngle`, `LENS_FLOOR`): true at the edge of the shadow, nearly flat above it, so that a settled picture can be read. It is let go toward the real one during the last fall.
- `timeline.ts`: `lensTimeline(p, count)` gives the phase (which project), the fall, the camera and the fades; `sources` says which projects are lit, where, and how brightly; `composition` frames the screen. Pacing constants are at the top: `INTRO`, `PER_PROJECT`, `OUTRO`, `HOLD`. The camera stays at `R_HOVER` (1.78) until the fall.
- **The move between projects is played in time, not scrubbed.** `lensTimeline` only says where the sky is headed: its phase steps from one project to the next once the page is `HOLD` (0.6) of the way through a project's stretch. `glide` (a critically damped spring, `GLIDE_RATE`) follows that step, so the move starts gently, takes about a second, never overshoots, and is the same however the page was scrolled; scrolling back sends it back the same way. The driver (`driver.ts`) runs the glide and goes on running after the page has stopped, until the sky has too; it hands the glided phase to the section, which gives it to the scene and decides the words by it. The intro (the first picture coming up) and the last fall are still tied to scroll.
- **What a move looks like.** The sky turns by `THETA_STEP` (92 degrees). The settled picture is carried up and out over the top. The next one starts behind the hole, where the lens would make a ring of it right across the screen; it is kept dark there (`LIT_FROM`) and lit as it comes round, so what appears is a bright sliver on the horizon, wider than the picture, which gathers and unrolls upward into it. Only a picture's first image is drawn: the later ones were hairlines against the edge of the shadow.
- **The horizon** is drawn in `shaders/lens.frag.glsl`, not worked out: a band lying just inside the edge of the shadow, with a hot cream core that swells and thins along its length, a tan body under it, a glow that spills up into the sky, and fine streaks running round the hole under it, sliding slowly, thinning into the dark (`BAND_*`, `streaks`). Cream is the palette's `#FFEDC1`, tan its `#BCA68E` pushed a shade toward gold. The band flares as the scene opens, and that glow is its look on every settled project: `horizonGlow(phase)` in `timeline.ts` takes it down to its dim base during a move and back up as the next project arrives (`RIM_FLARE`, `RIM_SETTLED`, `GLOW_GONE`); the renderer multiplies `rim` by it. Just above it the lensed sky, which the lens piles into thin arcs there, is dimmed so the band stands alone.
- **Framing** (`composition`). On a wide screen the horizon is at 63% of the way down, the picture is about 36% of the screen high with its top under the navigation, and the words are in the bottom fifth, under the streaks. Narrow screens keep the framing they had on `main`.
- `renderer.ts`: one table lookup a pixel for the lens, the screenshots as an array texture, and NASA's star map (`public/sky/`) looked up in the direction each ray ends up, with three layers of drawn stars that twinkle and drift, and a shooting star now and then. The star map turns with the projects. For the first project the galaxy's core is up to the left of the picture and its band runs down behind it (`GALAXY_RISE`, `GALAXY_SIDE`, `GALAXY_TILT`); it is gone for the second. The map's stars keep their light; its dust goes through a contrast curve so the sky between is black. `shaders/grade.frag.glsl` grades without a film curve, so screenshots keep their colours.
- `scene.ts` is the stage scene; `LensScene.tsx` is the same scene on its own canvas, for the harness only.
- `sections/LensedWork.tsx` is the pinned section and the words for each project, set in the shadow: number, kind and name on the left, the summary in the middle, what it is built with and the link on the right; stacked on a phone. Every project's words are always in the page; only the settled one's are visible. With reduced motion or no WebGL it renders `Flat`, a plain list.
- While the visitor is paused on a project, this section preloads the moon.
- **The ring of cards** (`ring.ts`, pure and tested; `swipe.ts`, the DOM side). The settled project's further views are cards at the hero's height, each a step further round the vertical axis to the right (about 46 degrees on a wide screen, 34 on a phone), on the same sky sphere, so they curve away like panels inside a sphere. Side cards are a little smaller and dimmer and fade toward the screen's edges; the middle one is always full. They exist only while their project is settled, and a ring goes back to its hero once its project has left. The shader has six card slots (`MAX_CARDS`), each with its own right vector; further views are a second array texture (`uMore`, 1280x800 on desktop, 768x480 on coarse pointers; about 94 MB in all on desktop, 36 on phones), loaded after the heroes and uploaded only when the sky is still, so readiness never waits for them. Dragging turns the ring angle for angle; on release it goes to the card nearest where the fling would carry it and settles with `glide`; it does not wrap and resists past its ends. A click on a side card, a sideways wheel, a touch swipe (`touch-action: pan-y`, so vertical swipes still scroll) and the arrow keys all turn it. The hit band is `[data-lens-swipe]`, placed from `composition()`. The controls (`Views` in `LensedWork.tsx`: previous, a dot per view, next, the view's name) sit under the picture; the hero is called "Home". `Flat` shows the views as a scroll-snapping row. `scripts/work-shots.mjs` re-captures the pictures from the live sites (Solari from `../solari` on the owner's Desktop).
- **The ending** (`closing`, `SINK_*`, `cameraPitch` in `timeline.ts`). The fall is as it was up to `SINK_FROM` (0.46): the radius drops and the horizon curls up into a wide arc. From there the radius coasts to a stop near 1.09 and the camera tips down by `SINK_DIVE`, so the arc and the sky leave through the top and the screen is black by about fall 0.78. `beyond` (0.64 to 0.98) is the opacity of a `StarField` laid in the pinned stage (`data-lens-beyond`, set directly by the driver callback), with the same seed as the next section's, so the stars are already there when the stage scrolls away.

The join with the black hole: the lens section has `margin-top: -100lvh`, so it pins on the frame the black hole's stage lets go, black on black.

### The moon (`src/moon/`)

A three.js scene, fetched as its own chunk. The top of a moon a few metres across fills the lower half of the screen; the alien sits on top; the Earth and the Milky Way are behind.

- `timeline.ts`: scroll to camera. The section opens close on the alien and pulls back to the settled view (`TRAVEL` 1.7 screens of scroll, then `HOLD` 1.1 in which nothing moves but what the visitor moves). The settled camera is solved so the moon's limb lies on `OUTLINE`, the owner's drawn line; a test checks the fit.
- `config.ts`: the fixed facts (where he sits, the sun, the Earth, pin sizes). `geo.ts`: latitude and longitude to positions, and the occlusion test for pins.
- `world.ts` builds and draws it: `ground.ts` (NASA colour and slopes over the whole ball; a close-up of the ground round the chair whose crater field is a generated height map, with its shadows baked for the scene's sun; two tiling squares, clods and small craters 4.6 m across and a grain 1.3 m across, laid on from three sides so they do not pinch at the map's pole, each carrying its heights in the alpha channel, which the shader does not read yet; a lunar reflectance model; the pins' pulse rings), `rocks.ts`, `earth.ts`, `pins3d.ts`, the sun with a shadow map, and `post.ts` (bloom, the sky laid in behind, the film curve). `assets.ts` loads the textures by tier.
- `orbit.ts`: dragging swings the camera a little way round the chair, with inertia and limits, and a slow sway when left alone.
- `state.ts` is the one object the scene and the page share: the page writes scroll progress, the drag and which pin is open; the scene writes back where each pin is on screen.
- `MoonOverlay.tsx` is the DOM over the canvas: for each pin a hit target carrying its floating icon badge, a leader line, and a label card with its link and copy button. The cards are real links and buttons, so the keyboard reaches them; focusing one swings the view to its pin. On phones a tapped pin's card is a sheet at the bottom.
- `sections/Contact.tsx` is the pinned section. Any link to `#contact`, the nav's "Get in touch" included, calls `moonControls.flyTo()`. It marks `<html data-moon-in>` while the moon is the scene, which is what keeps the footer up. With `?nogl`, or if the scene fails, it shows a flat picture (`public/contact/moon.webp`, from the owner's first reference) with the contact details as a plain list.
- Pins are rows in `content/contact.ts`: label, value, link or text to copy, an optional `icon`, and the spot on screen where the pin's foot should stand.

### The alien (`src/alien/`)

Everything at his spot, as one actor the moon scene places (`types.ts` is the agreement between the two: the moon owns the world, lights, camera and ground; the actor owns what sits on the ground there and what he does).

- `rig.ts` loads the model and its manifest (`public/models/alien.glb`, `alien.json`). `measure.ts` reads off the mesh what the actor needs: limb lengths, the eyes, the hands, the antennae.
- **The model's own clips are not played.** `pose.ts` seats him with an IK solver as he sits in the owner's picture (reclined, ankles crossed, one hand hanging, the other holding the bottle), and `clips.ts` bakes that pose into clips at load: idle, sip, look up, shift. An AnimationMixer cross-fades them; `maths/schedule.ts` decides when (a sip every 6 to 10 seconds, blinks, the odd ambient beat).
- `gaze.ts` turns his head and eyes toward the cursor or a hovered pin, within what a neck can do. `antennae.ts` springs the antenna bones from the head's motion. `face.ts` gives each painted eye a glossy shell and a lid for the blink. `hands.ts` bends the finger vertices once, at load, round the bottle (the model has no finger bones). `skin.ts` replaces the one material with one that treats skin and cloth differently. The sweatshirt is dyed black in that shader, not in the model: the texture in `alien.glb` still has it lilac grey, and `DYE` in `skin.ts` is the colour it becomes, with the texture's light and dark kept so the folds show. A pixel is dyed if it has the sweatshirt's hue and lies on or just past the clothed bones (a per-vertex `dyeZone` attribute built in `measureCloth`, which keeps the dye off the eye rims and toes); well inside the sweatshirt everything darker than a drawstring is dyed whatever its hue, because the texture atlas has no margins and skin leaks in along every patch edge. Building `dyeZone` adds about 20 ms to the actor's build.
- `props/`: the lawn chair (bent tube, woven webbing in white and tan; the tan is painted `#8b7252` so that in the moon's sun it shows as the theme's `--color-bh-accent`, about `#c3ad8b` measured on screen), the beer bottle, the cooler and water bottles, all built in code. `textures.ts` paints their textures on canvases. `env.ts` is a small reflection map for the shiny things. `contact.ts` lays contact shadows; `dust.ts` is the puff when he is first revealed.
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
| `public/moon/` | Moon colour and slopes, the close-up ground, the tiling craters, the grain, the Earth (KTX2) | `assets-src/scripts/moon.py`, `moon.mjs`, see `README-moon.md` |
| `public/models/` | The alien and his manifest | the pipeline in `assets-src/`, see its `README.md` |
| `public/basis/` | The Basis transcoder three.js uses for KTX2, and `worker.js`, the file its workers start from | the transcoder is copied from `three`; `worker.js` is ours |

**KTX2 and the Content-Security-Policy.** The Basis transcoder builds functions with `new Function`, which the page's policy (`vercel.json`) forbids. So KTX2 loaders are made with `createKTX2Loader` (`src/stage/ktx2.ts`), which starts the transcoder's workers from `/basis/worker.js`; `vercel.json` serves that one file with a policy of its own that allows it. A plain `new KTX2Loader()` works on the dev server, which sends no policy, and fails silently on the deployment. To check before deploying, serve `dist/` with the headers of `vercel.json`.
| `public/contact/` | The flat moon picture for the fallback | the owner's first reference, re-encoded |

The alien was generated with Higgsfield from the owner's picture; every call and its cost is in `assets-src/ASSET_LOG.md`. The account began that session with 270 credits and ended with 109.75. `assets-src/raw/` and `assets-src/tools/` (downloads, intermediates, the KTX encoder) are not in git; things that were generated but are not used on the site are in `raw/not-shipped/`.

The moon's close-up ground, its tiling craters and its grain were also made from Higgsfield pictures (three text-only images, two of them unlit height maps, 10.25 credits; see "The moon's ground" in `assets-src/ASSET_LOG.md` and `assets-src/README-moon.md`). The account read 59.5 credits afterwards. The pictures are in `assets-src/raw/moon/hf/`, not in git; `moon.py` needs them to rebuild `site-*`, `moon-craters-*` and `moon-detail`.

## Dev tools

Harness pages, each one scene on its own. Most take `?p=0.5` for a fixed scroll progress, `&nohud` to hide the slider and `&bhtier=low` to force a quality tier; the header comment of each page's script lists its switches.

| Page | Scene |
| --- | --- |
| `/dev/background.html` | The purple field |
| `/dev/blackhole.html` | The black hole (`&set=smear:0` overrides a field of the frame) |
| `/dev/lens.html` | The lensed sky. Projects settle at p = 0.134, 0.303, 0.471, 0.639; the sky sets off for the next at 0.235, 0.403, 0.571; the fall starts at 0.807. Dragging the slider across one of those plays the move in time, as on the site. `&set=phase:0.5` holds the sky part way through a move, for a still; `&card=0.5` holds the ring of cards part way between two |
| `/dev/moon.html` | The moon |
| `/dev/alien.html` | The alien on plain ground, with camera presets and buttons for sip, blink, beats |
| `/dev/model-viewer.html` | Any GLB on a turntable |

Scripts (Playwright; screenshots land in `screenshots/`, which is not in git):

| Command | What it does |
| --- | --- |
| `node scripts/screenshots.mjs --gpu --scroll "0,#about,end" --widths 1440,390` | Screenshots of the real page at ids, pixel offsets or `end`. |
| `node scripts/bh-shots.mjs --mode site --p 0.05,0.5` | The real page at pinned-progress positions of a stage. `--stage "[data-lens-stage]"` for the projects; `--mode dev --page lens` for a harness page. |
| `node scripts/lens-swipe.mjs` | Drives the ring of cards on the real page (drag, fling, click, keys, wheel, touch) and checks 26 things; `--bare` for frame times without stills. |
| `node scripts/work-shots.mjs` | Re-captures the further views of each project from the live sites into `public/work/`. |
| `node scripts/lens-motion.mjs --from 1` | The move from one project to the next on the real page: turns the wheel past the hold, takes stills while the sky glides, and reports frame times. |
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
- **Performance is only known on one machine, and not for the projects as they are now.** The lensed sky as it is on `main` was measured scrolling on the production build on an RTX 4060 laptop: 0% and 1% of about 3,780 frames over 20ms, the slow ones where the moon is fetched and built (the third project) and where the lens hands over to the moon. The horizon's band adds three noise lookups a pixel inside the shadow and has not been measured on the production build or on any lower tier; on the dev server a move between projects had no frame over 20ms. The moon has not been measured per tier. Nothing has been measured on a mid-range laptop or a phone.
- **Nothing has been tested in Safari or Firefox**, or on a real phone or tablet.
- **The move between projects has been watched only as a strip of stills** taken a third of a second apart on one GPU (no frame over 20 ms during it on the dev server, RTX 4060). Its feel, the length of the hold before it sets off, and how it reads on a trackpad or a phone, where a flick can cross two projects, are for the owner to judge.
- **The ring of cards, the glow and the new ending have not been watched moving, nor tried on a real trackpad, phone, Safari or Firefox.** Dragging held 60 fps on the dev server (RTX 4060) at desktop and emulated phone sizes; the production build was not measured. Texture memory for the projects went from 34 MB to about 94 MB on desktop.
- **On short wide screens the streaks under the horizon reach the top of the words.** They are faint there; nothing was done about it.
- **The alien's motion has only been judged from stills**, as has the bobbing of the pins' badges.
- **The moon's generated relief is only shaded, not shadowed, outside the baked close-up.** The tiling craters and grain brighten and darken the ground but cast nothing. The heights needed are already in the tiles' alpha; the planned step is a short march toward the sun in `moon.frag.glsl` with step counts per tier (see `assets-src/README-moon.md`). More tonal range (mare against highland) was also asked for and not done.
- **Up close**: the beer bottle's glass reads as glossy and opaque; his fingers go about halfway round it; mid-sip, from the settled camera, the bottle crosses in front of one eye; a few pale flecks remain along the hood seam by the collar, where the texture atlas bleeds and the dye is deliberately cautious next to skin.
- **On phones the footer overlaps the lowest pin's ring.**
- **The sections do not flow into one another as one camera move.** Each scene starts and ends in black.
- **The black hole's still image** (`public/work/blackhole.jpg`) does not match the scene.
- **The flat moon picture** in the fallback is the owner's first reference: a different alien, in a space suit.
- The ambient sound has never been listened to.

## Files in the repo root that are not the site

`reference.mp4`, `texteffect.mkv`, `bigtext.png`, `scene.png`, `Blackholeref.mp4`, `Alienchairref.jpg` are the owner's reference media, untracked. Do not delete them; ask whether to commit or ignore them. Two more references are on their Desktop: the alien picture the model was made from and the screenshot with the moon's outline drawn on it. `animatedbg.mp4` is tracked: it is the source of the purple field.
