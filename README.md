# kodachi.dev

Source for [kodachi.dev](https://kodachi.dev), my freelance web development site. I'm Noah, and I build websites for small businesses and personal brands.

It's a React + TypeScript site built with Vite and Tailwind, hosted on Vercel. The only runtime dependencies are `react` and `react-dom`. The one bit of backend is a serverless function that emails me whatever comes through the contact form.

## The hero

The top of the page is a scroll-driven WebGL scene, written without a 3D library:

- A black hole, ray traced in a fragment shader. Light is bent around it properly, which is where the arch over the top and the thin ring underneath come from. Moving the mouse over the disk sends ripples through it.
- About 20k particles that sit on the disk at first, then break away into the Orion constellation (real star positions and distances, so it only lines up from the front), then gather into a rocket. It flies after your cursor and a click fires the engine. Every speck of exhaust remembers where the nozzle was when it came out, so the rocket leaves a trail of stars along its path. Scroll on and it launches off screen.
- A canvas starfield behind every page, with parallax, the odd comet, and stars that streak as the rocket launches.

The code lives in `src/lib/space/`, and the scroll timeline is at the top of `src/components/sections/ScrollHero.tsx`.

Phones get a lighter version: just the intro, over a spiral galaxy. A shader paints the galaxy once, face on, and CSS tilts it and turns it slowly, so after the first frame it costs next to nothing. Tablets and desktops get the full scene.

## Work

Below the services, each project I've built is a planet, drawn by one fragment shader in `src/lib/space/planets.ts`. Click one and the camera flies in, with the details and a screenshot beside it. Projects are listed at the top of `src/components/sections/Work.tsx`, and their screenshots go in `public/work/`. Until a screenshot is there it shows the address in the planet's colours instead.

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
public/               Favicon, robots.txt, sitemap, project screenshots in work/
src/
  components/
    layout/           Layout, Nav, Footer, Starfield
    sections/         Home page sections. Hero picks ScrollHero or PhoneHero, Work has the planets
    ui/               Reveal, Select
  hooks/              Scroll-into-view detection, phone detection
  lib/contact.ts      Form limits and the request to the API
  lib/space/          Black hole, particles, starfield and the phone galaxy
  pages/Terms.tsx     The /terms page
  index.css           Theme, shared classes and animations
index.html            Home page
terms/index.html      /terms
vercel.json           Headers and caching
```
