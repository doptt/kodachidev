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
    image: '/work/kyvora.webp',
    imageAlt:
      'Kyvora homepage: the headline "Found first. Booked solid. Paid on time." on a dark bronze background beside sample booking and payment cards',
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
    image: '/work/dewly.webp',
    imageAlt:
      'Dewly homepage: the headline "Your car, detailed on the driveway. Every other Tuesday." beside a map tracking a van to a driveway',
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
    accent: '#c9b08a',
  },
] as const satisfies readonly Project[]
