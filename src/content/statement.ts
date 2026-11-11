export type StatementWord = { text: string; accent?: boolean }

export const STATEMENT = {
  eyebrow: 'The whole idea',
  /** Revealed one word at a time as the panel opens. */
  words: [
    { text: 'The' },
    { text: 'best' },
    { text: 'website' },
    { text: 'is' },
    { text: 'the' },
    { text: 'one' },
    { text: 'nobody', accent: true },
    { text: 'has', accent: true },
    { text: 'to', accent: true },
    { text: 'think', accent: true },
    { text: 'about.' },
  ],
  dock: {
    eyebrow: 'Full stack',
    title: 'One developer, the whole stack.',
    lede: 'Design, front end, back end and launch all pass through the same pair of hands, so nothing gets lost between them.',
    /** Two stops either side of the mark. */
    before: ['Design', 'Front end'],
    after: ['Back end', 'Launch'],
  },
} as const satisfies {
  eyebrow: string
  words: readonly StatementWord[]
  dock: { eyebrow: string; title: string; lede: string; before: readonly string[]; after: readonly string[] }
}
