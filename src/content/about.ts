export type Trait = { title: string; body: string }
export type StackCategory = 'Framework' | 'Language' | 'Styling' | 'Markup' | 'Tooling'
export type StackItem = { label: string; category: StackCategory }
export type Stat = { value: string; label: string }

export const ABOUT = {
  eyebrow: 'About',
  title: 'A bit about me.',
  intro:
    'I’m a full-stack web developer who likes building engaging websites, working with software, and fixing things.',
  body: [
    'I’ve never been able to leave something alone until I understand how it works. That curiosity pulled me into tech, first by experimenting with operating systems and software, then by building websites and debugging code.',
    'I love taking an idea, figuring out how to make it work, and turning it into something people can actually use. I’m always learning, trying new tools, and getting way too invested in whatever I find next.',
  ],
  traits: [
    {
      title: 'Built around the goal',
      body: 'Design, features and tech follow what the site needs to do. No templates, no filler.',
    },
    {
      title: 'Every detail matters',
      body: 'Clean code, reliable infrastructure and careful implementation, down to the small stuff.',
    },
    {
      title: 'Clear communication',
      body: 'Plain English, honest updates and no surprises along the way.',
    },
    {
      title: 'Privacy & compliance',
      body: 'I look at how data is collected and handled, and make sure policies and disclosures are in place before launch.',
    },
  ],
  stack: [
    { label: 'React', category: 'Framework' },
    { label: 'Next.js', category: 'Framework' },
    { label: 'TanStack Start', category: 'Framework' },
    { label: 'TypeScript', category: 'Language' },
    { label: 'JavaScript', category: 'Language' },
    { label: 'Python', category: 'Language' },
    { label: 'Tailwind CSS', category: 'Styling' },
    { label: 'HTML & CSS', category: 'Markup' },
    { label: 'Vite', category: 'Tooling' },
    { label: 'Git', category: 'Tooling' },
  ],
  stats: [
    { value: '1–4 wks', label: 'Typical build time' },
    { value: '24h', label: 'Usual reply time' },
    { value: '100%', label: 'Hand-built, no templates' },
  ],
} as const satisfies {
  eyebrow: string
  title: string
  intro: string
  body: readonly string[]
  traits: readonly Trait[]
  stack: readonly StackItem[]
  stats: readonly Stat[]
}
