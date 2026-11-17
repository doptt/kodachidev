export type Project = {
  slug: string
  name: string
  /** e.g. "Personal site" */
  kind: string
  year: string
  /** 1-2 sentences. */
  summary: string
  role: readonly string[]
  stack: readonly string[]
  url?: string
  /** Path under /work/ (served from public/work/). */
  image: string
  imageAlt: string
  /** Further views of the site, shown as cards beside the hero. `label` names the view in 1-3 words. */
  more?: readonly { image: string; imageAlt: string; label: string }[]
  /** Hex colour used for a subtle glow behind the frame. */
  accent: string
}

export const WORK_INTRO = {
  eyebrow: 'Work',
  title: 'Selected projects.',
  lede: 'A few sites I have designed and built, from a studio for local businesses to product and service concepts.',
} as const

export const PROJECTS = [
  {
    slug: 'kyvora',
    name: 'Kyvora',
    kind: 'Web studio for local businesses',
    year: '2026',
    summary:
      'A one-person studio site that sells the whole online side of a local business in one plan: website, bookings, payments and Google. The hero dashboard re-themes itself for each trade.',
    role: ['Design', 'Development', 'Payments'],
    stack: ['Next.js', 'TypeScript', 'Tailwind CSS', 'Stripe'],
    url: 'https://kyvora-green.vercel.app',
    image: '/work/kyvora.webp',
    imageAlt:
      'Kyvora homepage: the headline "Found first. Booked solid. Paid on time." on a dark bronze background beside sample booking and payment cards',
    more: [
      {
        image: '/work/kyvora-2.webp',
        imageAlt:
          'Kyvora pricing page: the headline "Pick a plan. Leave any time." above four plan cards priced from $79 a month',
        label: 'Pricing',
      },
      {
        image: '/work/kyvora-3.webp',
        imageAlt:
          'Kyvora concept builds: the headline "Sample sites for the kinds of businesses we build for." above a fan of sample site designs with a bakery at the front',
        label: 'Concept builds',
      },
      {
        image: '/work/kyvora-4.webp',
        imageAlt:
          'Kyvora before-and-after slider: the headline "Same bakery. Different first impression." above a dated bakery site on the left and its redesign on the right',
        label: 'Before and after',
      },
    ],
    accent: '#d8c39a',
  },
  {
    slug: 'solari',
    name: 'Solari',
    kind: 'Desk lighting store',
    year: '2026',
    summary:
      'A storefront for a modular desk lamp. The lamp in the hero follows your pointer and its light warms as you scroll, with a configurator for building a full desk setup.',
    role: ['Design', 'Development'],
    stack: ['HTML & CSS', 'JavaScript'],
    image: '/work/solari.webp',
    imageAlt:
      'Solari homepage: the headline "Late-afternoon light, at your desk all day." beside a brass arc lamp casting a warm glow',
    more: [
      {
        image: '/work/solari-2.webp',
        imageAlt:
          'Solari collections: the headline "Start with one piece. Add to it for years." above four arched cards for lighting, monitor mounts, shelves and complete setups',
        label: 'Collections',
      },
      {
        image: '/work/solari-3.webp',
        imageAlt:
          'Solari homepage with the lamp switched off: the brass arc lamp unlit against a plain wall, its switch reading "Off"',
        label: 'Lamp off',
      },
    ],
    accent: '#e9b872',
  },
  {
    slug: 'dewly',
    name: 'Dewly',
    kind: 'Car detailing subscription',
    year: '2026',
    summary:
      'A subscription service that sends a detailing van to your driveway. Visitors check their postcode, pick a plan and watch a live-style map of the van arriving.',
    role: ['Design', 'Development'],
    stack: ['JavaScript', 'HTML & CSS', 'Vite'],
    url: 'https://dewly-concept.vercel.app',
    image: '/work/dewly.webp',
    imageAlt:
      'Dewly homepage: the headline "Your car, detailed on the driveway. Every other Tuesday." beside a map tracking a van to a driveway',
    more: [
      {
        image: '/work/dewly-2.webp',
        imageAlt:
          'Dewly plans page: the headline "Two plans. No contract, no sign-up fee." beside a card showing the cheapest plan at £32 a month',
        label: 'Plans',
      },
      {
        image: '/work/dewly-3.webp',
        imageAlt:
          'Dewly how-it-works page: the headline "From postcode to clean car. No tap, no socket, no waiting in." beside a phone notification about tomorrow’s visit',
        label: 'How it works',
      },
      {
        image: '/work/dewly-4.webp',
        imageAlt:
          'Dewly offices page: the headline "Your car park, washed while the team works. Done by 10:00." on a navy card beside a summary of fleet visits',
        label: 'For offices',
      },
    ],
    accent: '#ff7a2f',
  },
  {
    slug: 'timmy',
    name: 'Timmy',
    kind: 'Artist portfolio',
    year: '2025',
    summary:
      'A gallery-style home for an artist’s paintings and objects, designed and built from scratch so the work stays centre stage.',
    role: ['Design', 'Development'],
    stack: ['React', 'TypeScript', 'Vercel'],
    url: 'https://timmypage.vercel.app',
    image: '/work/timmy.webp',
    imageAlt: 'Homepage of the Timmy Smith site: a ceramic vase under a spotlight with the name in wide thin lettering',
    more: [
      {
        image: '/work/timmy-2.webp',
        imageAlt:
          'Paintings room of the Timmy Smith site: the title "Paintings, 2022 — 2025" on a dark gallery wall beside two lit canvases',
        label: 'Paintings room',
      },
      {
        image: '/work/timmy-3.webp',
        imageAlt:
          'Detail view of the painting Ember Field on the Timmy Smith site: the red and orange canvas beside its title, medium, size and an Inquire button',
        label: 'Painting detail',
      },
      {
        image: '/work/timmy-4.webp',
        imageAlt:
          'Index of the Timmy Smith site: the menu on the left beside a list of the six paintings and one object with their years',
        label: 'Index',
      },
    ],
    accent: '#c9b08a',
  },
] as const satisfies readonly Project[]
