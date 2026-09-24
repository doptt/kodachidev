# kodachi.dev

This is the source for [kodachi.dev](https://kodachi.dev), my freelance web development site. I'm Noah, and I build websites for small businesses and personal brands. This site is both my storefront and a sample of how I work, so the code is here for anyone who wants to see what's under the hood.

It's a small React site with no backend of its own, apart from one serverless function that sends contact form messages to my inbox.

## What's on the site

- **Home page** with a hero, reviews, services, an about section and a contact form
- **Terms & Conditions** at [/terms](https://kodachi.dev/terms)
- A **starfield background** with three depth layers that drift as you scroll, plus a few comets
- **Scroll reveals** on the content, done with a small `IntersectionObserver` hook instead of an animation library
- A **reviews carousel** that loops forever and pauses when you hover over it
- A **contact form** that emails me through [Resend](https://resend.com), with a custom animated budget dropdown

## Built with

- [React 19](https://react.dev) + TypeScript
- [Vite 8](https://vite.dev) for the dev server and build
- [Tailwind CSS 4](https://tailwindcss.com) for styling
- [Vercel](https://vercel.com) for hosting and the serverless function
- [Resend](https://resend.com) for sending email

The only runtime dependencies are `react` and `react-dom`. Resend is called with a plain `fetch`, so there's no SDK to keep updated.

## Running it locally

You'll need Node 20 or newer.

```bash
npm install
npm run dev
```

That opens the site at http://localhost:5173. Everything works locally except sending email, which needs a Resend key. See the next section.

Other scripts:

| Command             | What it does                               |
| ------------------- | ------------------------------------------ |
| `npm run build`     | Production build into `dist/`              |
| `npm run preview`   | Serve the production build locally         |
| `npm run typecheck` | Run TypeScript over the site and API       |
| `npm run format`    | Format the code with oxfmt                 |

## Contact form

The form posts to `/api/contact`, which checks the message and forwards it to my inbox with Resend. To make it work, copy `.env.example` to `.env.local` and fill in your Resend key and sender address. The dev server picks those up automatically, so the form works with plain `npm run dev`.

The full setup, including verifying a domain in Resend and adding the keys to Vercel, is in [docs/contact-form.md](docs/contact-form.md).

## Deploying

The site is set up for Vercel. Import the repo, keep the detected Vite settings, add the environment variables from `.env.example`, and deploy. Vercel builds the static site from `dist/` and turns `api/contact.ts` into a function on its own.

`vercel.json` adds security headers to every response, gives `/terms` a clean URL, and sets long-term caching on the hashed files in `/assets`. More on the security side in [SECURITY.md](SECURITY.md).

## Project layout

```
api/
  contact.ts            Serverless function: validates the form and sends it via Resend
public/                 Copied into the build as-is (favicon, robots.txt, sitemap)
src/
  components/
    layout/             Page shell: Layout, Nav, Footer, Starfield
    sections/           The home page sections, top to bottom
    ui/                 Reusable pieces: Reveal, Select
  hooks/useReveal.ts    Scroll-into-view detection for Reveal
  lib/contact.ts        Budget options, field limits, and the form request
  pages/Terms.tsx       The /terms page
  index.css             Design tokens, component classes and all animations
  main.tsx              Entry for the home page
  terms.tsx             Entry for /terms
index.html              Home page HTML shell
terms/index.html        /terms HTML shell
vite.config.ts          Build config, plus a dev-only route for /api/contact
vercel.json             Security headers and caching
```

## A few notes on how things work

**Colors and fonts** live in one `@theme` block at the top of `src/index.css`. Tailwind turns those into classes like `text-muted` and `border-accent/15`. Anything with a hover state or a glow (buttons, cards, form fields) is a small class in the same file, so the components don't need to manage hover styles themselves.

**The starfield** is about 160 stars built from a seeded formula, so they land in the same spots every visit. Twinkling and drifting are pure CSS. The only JavaScript is a scroll listener that moves each layer by a different amount. It writes to a CSS variable through a ref, so none of the stars re-render while you scroll. Each layer holds two stacked copies of its stars and wraps around, which is what lets the sky keep moving no matter how long the page is.

**Scroll reveals** watch each element on its own, rather than a whole section at once. That way, a card near the bottom of a section animates when you actually reach it. The observer also treats anything you've already scrolled past as seen, so content can't get stuck invisible if you jump down the page.

**The budget dropdown** is custom because a native `<select>` can't be animated. It follows the WAI-ARIA combobox pattern, so it still works with a keyboard (arrow keys, Home/End, Enter, Escape, and jumping by typing a letter) and with screen readers.

## Usage

The code is public so people can see how the site is built. The design, copy and branding are mine, so please don't redeploy the site as your own. If you want to borrow a technique, go for it.
