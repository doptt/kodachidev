export const CONTACT = {
  eyebrow: 'Contact',
  /** The section's heading. Read out, not shown: the moon is the invitation. */
  title: 'Get in touch',
  email: 'contact@kodachi.dev',
  github: { label: 'github.com/noahwdev', url: 'https://github.com/noahwdev' },
  discord: { handle: '@kodache' },
} as const

/**
 * A way of getting in touch, as a pin stood in the ground near the alien.
 *
 * `href` makes the pin's label a link (mailto, or a page that opens in a new
 * tab); `copy` gives it a button that copies that text. A pin may have either
 * or both.
 *
 * `spot` is where the foot of the pin stands in the settled picture, as
 * fractions of the screen's width and height from the top left: once for wide
 * screens and once for tall ones, whose picture is composed differently. The
 * scene finds the place on the moon that is seen there and plants the pin in
 * it. Keep a spot on the ground (below the moon's edge), clear of the alien in
 * the middle, and a label's width from its neighbours.
 */
export type ContactPin = {
  id: string
  label: string
  value: string
  /** The badge that floats over the pin, so it can be told apart before its label is opened. */
  icon?: 'email' | 'github' | 'discord'
  /** What the link says. */
  action?: string
  href?: string
  copy?: string
  /** What the copy button says: "Copy address". */
  copyLabel?: string
  spot: { wide: readonly [number, number]; tall: readonly [number, number] }
}

/** The pins, in the order the keyboard visits them: left of him, right of him, and in front. To add a way of getting in touch, add a row. */
export const CONTACT_PINS: readonly ContactPin[] = [
  {
    id: 'email',
    label: 'Email',
    icon: 'email',
    value: CONTACT.email,
    action: 'Write to me',
    href: `mailto:${CONTACT.email}`,
    copy: CONTACT.email,
    copyLabel: 'Copy address',
    spot: { wide: [0.16, 0.8], tall: [0.2, 0.67] },
  },
  {
    id: 'github',
    label: 'GitHub',
    icon: 'github',
    value: CONTACT.github.label,
    action: 'Open profile',
    href: CONTACT.github.url,
    spot: { wide: [0.85, 0.79], tall: [0.8, 0.66] },
  },
  {
    id: 'discord',
    label: 'Discord',
    icon: 'discord',
    value: CONTACT.discord.handle,
    copy: CONTACT.discord.handle,
    copyLabel: 'Copy handle',
    spot: { wide: [0.65, 0.86], tall: [0.5, 0.77] },
  },
]
