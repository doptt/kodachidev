/*
 * Everything the contact form needs that isn't UI: the budget choices, field
 * limits, and the request to /api/contact.
 *
 * The limits are mirrored on the server in api/contact.ts. The browser copy
 * is only there for nicer feedback; the server never trusts it.
 */

export const BUDGET_OPTIONS = ['$125 – $250', '$250 – $500', '$500 – $750', '$750+', 'Not sure yet'] as const

export const LIMITS = {
  name: 100,
  email: 254,
  details: 5000,
} as const

export type ContactPayload = {
  name: string
  email: string
  details: string
  budget: string
  /** Honeypot. Hidden from people, so only bots fill it in. */
  website: string
}

export async function sendContactMessage(payload: ContactPayload): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.")
  }

  if (!response.ok) {
    const data: { error?: string } = await response.json().catch(() => ({}))
    throw new Error(data.error ?? 'Something went wrong. Please try again, or email me directly.')
  }
}
