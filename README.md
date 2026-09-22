# portfolio-page

React 19 + Vite 8 + Tailwind CSS v4 single-page portfolio site.

## Commands

| Command             | What it does                                 |
| ------------------- | -------------------------------------------- |
| `npm install`       | Install dependencies                          |
| `npm run dev`       | Dev server with HMR at http://localhost:5173  |
| `npm run build`     | Production build into `dist/`                 |
| `npm run preview`   | Serve the built `dist/` at http://localhost:4173 |
| `npm run typecheck` | TypeScript check, no emit                     |
| `npm run format`    | Format with oxfmt                             |

## Project structure

- `index.html` — HTML shell: `#root`, `<title>`, meta tags, favicon link
- `src/main.tsx` — React entrypoint; imports `src/index.css`, mounts `src/App.tsx`
- `src/App.tsx` — Root component; ambient background + section order
- `src/components/` — `Nav`, `Hero`, `Work`, `Services`, `About`, `Contact`, `Footer`
- `src/hooks/useReveal.ts` — IntersectionObserver hook for scroll-reveal animations
- `src/index.css` — Google Fonts imports, `@import 'tailwindcss'`, `@theme` tokens, global styles
- `public/` — Static files copied to the root of `dist/` as-is (e.g. `/favicon.ico`)
- `vite.config.ts` — React + Tailwind plugins, `@` alias for `src/`
- `docs/` — Original design brief and reference image. Not part of the build.

## Styling

Tailwind CSS v4 via the `@tailwindcss/vite` plugin — no `tailwind.config.js` and no
PostCSS config needed. Design tokens (colors, fonts) live in the `@theme inline` block
at the top of `src/index.css` and are usable as utilities, e.g. `text-accent`,
`font-display`.

## Static assets

Anything in `public/` is served from `/` in dev and copied verbatim into `dist/` on
build. Files imported from `src/` (e.g. `import logo from './logo.png'`) get hashed
and bundled instead. A file sitting at the project root is served by neither — this is
what broke the favicon originally.

## Deploying

`npm run build` produces a fully static `dist/`. Drop it on any static host
(Netlify, Vercel, Cloudflare Pages, GitHub Pages, or your own nginx).

If you deploy to a **subpath** rather than a domain root, set `base` in
`vite.config.ts` to that subpath, e.g. `base: '/portfolio/'`.
