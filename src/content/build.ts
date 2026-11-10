export type BuildIcon =
  | 'design'
  | 'responsive'
  | 'backend'
  | 'security'
  | 'payments'
  | 'launch'

export type BuildItem = {
  id: string
  title: string
  /** 1-2 sentences, 190 characters or fewer. */
  body: string
  /** 2-3 short tags. */
  tags: readonly string[]
  icon: BuildIcon
}

export const BUILD_INTRO = {
  eyebrow: 'What I build',
  title: 'From the first sketch to a live site.',
  lede: 'I design, build and ship whole websites myself, so the details stay consistent from the look down to the server.',
} as const

export const BUILD_ITEMS = [
  {
    id: 'design',
    title: 'Design & development',
    body: 'Interfaces designed down to the pixel, then built in clean, typed React. Simple to navigate, easy to remember.',
    tags: ['React', 'TypeScript', 'Tailwind'],
    icon: 'design',
  },
  {
    id: 'responsive',
    title: 'Responsive by default',
    body: 'Every layout is built for phones, tablets and wide screens from the start, not squeezed to fit afterwards.',
    tags: ['Mobile first', 'Accessible'],
    icon: 'responsive',
  },
  {
    id: 'secure',
    title: 'Fast & secure',
    body: 'Lean code, modern hosting and sensible security headers, so sites load quickly and stay up.',
    tags: ['Performance', 'Security headers', 'Rate limiting'],
    icon: 'security',
  },
  {
    id: 'backend',
    title: 'Full sites, real backends',
    body: 'Not just a pretty front. I build the server side too: databases, APIs and forms that store things safely and do what they should.',
    tags: ['APIs', 'Databases', 'Auth'],
    icon: 'backend',
  },
  {
    id: 'payments',
    title: 'Payments & booking',
    body: 'Checkout and appointment flows with Stripe or Square. Orders go into a secure database and confirmations send themselves.',
    tags: ['Stripe', 'Square', 'Bookings'],
    icon: 'payments',
  },
  {
    id: 'launch',
    title: 'Launch & deployment',
    body: 'Hosting, domains and configuration handled end to end, with uptime and DDoS protection in place before anyone visits.',
    tags: ['Hosting', 'Domains', 'Uptime'],
    icon: 'launch',
  },
] as const satisfies readonly BuildItem[]
