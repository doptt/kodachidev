export const SITE = {
  name: 'kodachi.dev',
  owner: 'Noah',
  role: 'Full-stack web developer',
  nav: [
    { label: 'Work', href: '#work' },
    { label: 'What I build', href: '#build' },
    { label: 'About', href: '#about' },
    { label: 'Contact', href: '#contact' },
  ],
  footer: 'Designed and built by Noah.',
} as const satisfies {
  name: string
  owner: string
  role: string
  nav: readonly { label: string; href: string }[]
  footer: string
}
