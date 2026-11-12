# kodachi.dev rebuild: plan

A personal portfolio that shows my work. Liquid-glass design on an animated shader background.

## Sections

| Section | Layout | Component |
| --- | --- | --- |
| Nav | Floating glass pill, shrinks on scroll. Full-screen glass menu on phones | Glass pill |
| Hero | Left-aligned, work-first headline ("Websites, built with care."), very little text | Cursor light reveal, flip words used sparingly, liquid-glass refraction on hero-level glass (Chromium) with blur-only fallback |
| What I build | Split header, 3 columns, middle column offset down | Translucent 3D tilt cards with a cursor-following specular highlight. Touch: gentle auto-tilt plus drag |
| Statement (interlude) | Pinned for two screens of scroll between What I build and Work | A periwinkle box pops up, opens into a full-width band with one sentence revealed word by word, folds into the pyramid mark and docks into a small full-stack diagram. Laid out statically with reduced motion |
| Work intro (black hole) | Pinned for about four screens of scroll at the top of Work (`#work`) | A ray-marched black hole in its own lazy-loaded WebGL2 canvas (`src/blackhole/`). Scroll falls into it until the screen is exactly black; `blackHole` in `src/blackhole/state.ts` exposes progress, theme, dim and an `entered` event for the scene that follows. Still image without WebGL; one static frame and a fade with reduced motion |
| Work (centerpiece) | Sticky project text on the left, glass browser frames scrolling past on the right with parallax. Stacked frames on phones | Sticky scroll reveal. Placeholder screenshots for now |
| About | Dense bento grid with mixed sizes | Bio, traits, tools strip, small stats |
| Contact | Links only (email, GitHub, Discord), in a glass panel | Moving-border primary link |
| Footer | Mark, short line, site and contact links, oversized wordmark | — |
| Desktop extra | Thin scroll progress rail with the current section's label | — |

Dropped: Reviews, Process, /terms, the contact form and `api/contact.ts`.

## Background

- One fixed WebGL2 canvas (hand-written, no three.js) behind everything.
- Texture: a still frame from `animatedbg.mp4`. The clip barely moves, so all motion comes from the shader.
- Scroll moves a camera through an endless field made from mirrored, rotated, re-warped copies of the image, so the waves change with each section.
- Each section has its own scene settings (wave strength, zoom, highlight angle, star density, darkness), blended while scrolling. Scroll velocity adds a gentle ripple that eases out.
- Flowing UV wave warp, light sliding along the ridges, 3 layers of twinkling stars (bigger stars move faster), about 10px of eased mouse parallax, darker areas behind text.
- At most devicePixelRatio 1.5, 60fps cap, paused when the tab is hidden. Falls back to the still image without WebGL or with reduced motion.

## Glass system

- All colors are `@theme` tokens: navy/indigo base, periwinkle highlights.
- Glass: backdrop blur and saturation, thin bright inner border, top-edge highlight, inner glow, noise grain.
- Blur budget: real backdrop blur only on the nav, hero glass and at most one featured surface per section. Dense groups get a translucent tint plus grain, with no blur of their own.
- Liquid-glass refraction (SVG `feDisplacementMap`) on hero-level elements in Chromium only, with a blur-only fallback for Safari and Firefox.

## Stack and dependencies

- React 19, Vite 8, TypeScript, Tailwind CSS v4, deployed on Vercel.
- Runtime: `motion`, `clsx` and `tailwind-merge` (for `cn()`), `@fontsource-variable/*` (self-hosted fonts).
- Fonts: Bricolage Grotesque (display), Geist (body), Geist Mono (labels).
- Dev: Playwright and axe-core for screenshots and accessibility checks. Lighthouse is run with `npx`.

## Requirements

- Responsive from 375px up. On touch devices, cursor effects are replaced and there are fewer blurred layers.
- `prefers-reduced-motion`: still image, no tilt or parallax, fades only.
- Lighthouse 90+. Text contrast of at least 4.5:1 on glass, measured from the rendered pixels behind the text.
- Semantic HTML, visible focus, title, meta description and Open Graph image.

## Order of work

1. Scaffold, still frame, tokens.
2. Background shader and glass system (GlassSurface, LiquidGlass, Card3D). Screenshots of the hero and one card for review.
3. Sections one at a time, with desktop and phone screenshots, fixing problems before moving on.
4. Small, clearly described commits.
