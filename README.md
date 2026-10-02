# kodachi.dev

Source for [kodachi.dev](https://kodachi.dev), my freelance web development site. I'm Noah, and I build websites for small businesses and personal brands.

It's a React + TypeScript site built with Vite and Tailwind, hosted on Vercel. The only runtime dependencies are `react` and `react-dom`. The one bit of backend is a serverless function that emails me whatever comes through the contact form.

## The hero

The top of the page is a scroll-driven WebGL scene, written without a 3D library:

- A black hole, ray traced in a fragment shader. Light is bent around it properly, which is where the arch over the top and the thin ring underneath come from. Moving the mouse over the disk sends ripples through it.
- About 20k particles that sit on the disk at first, then break away into the Orion constellation (real star positions and distances, so it only lines up from the front), then pour into a tunnel the camera dives through.
- A canvas starfield behind every page, with parallax, the odd comet, and stars that streak during the dive.

The code lives in `src/lib/space/`, and the scroll timeline is at the top of `src/components/sections/Hero.tsx`.

## Running it

You'll need Node 20 or newer.

```bash
npm install
npm run dev
```

| Command             | What it does                    |
| ------------------- | ------------------------------- |
| `npm run dev`       | Dev server on localhost:5173    |
| `npm run build`     | Production build into `dist/`   |
| `npm run preview`   | Serve the production build      |
| `npm run typecheck` | Run TypeScript over everything  |

The contact form needs a [Resend](https://resend.com) key to actually send anything. Copy `.env.example` to `.env.local` and fill it in, and the dev server picks it up. Full setup is in [docs/contact-form.md](docs/contact-form.md).

## Deploying

Import the repo into Vercel, keep the detected Vite settings and add the variables from `.env.example`. Vercel turns `api/contact.ts` into a function on its own. `vercel.json` sets the security headers and caching, and [SECURITY.md](SECURITY.md) explains them.

## Layout

```
api/contact.ts        Contact form endpoint
public/               Favicon, robots.txt, sitemap
src/
  components/
    layout/           Layout, Nav, Footer, Starfield
    sections/         Home page sections, top to bottom
    ui/               Reveal, Select
  hooks/useReveal.ts  Scroll-into-view detection
  lib/contact.ts      Form limits and the request to the API
  lib/space/          Black hole, particles and starfield
  pages/Terms.tsx     The /terms page
  index.css           Theme, shared classes and animations
index.html            Home page
terms/index.html      /terms
vercel.json           Headers and caching
```
