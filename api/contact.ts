/*
 * POST /api/contact
 *
 * Takes a submission from the contact form, checks it, and emails it to me
 * through Resend (https://resend.com). Vercel deploys every file in /api as
 * a serverless function, and in development vite.config.ts serves it too.
 *
 * Environment variables:
 *   RESEND_API_KEY      required. A "sending access" key is enough.
 *   CONTACT_FROM_EMAIL  required. Sender on a domain verified in Resend,
 *                       e.g. "kodachi.dev <noreply@kodachi.dev>"
 *   CONTACT_TO_EMAIL    optional. Inbox that receives messages
 *                       (defaults to contact@kodachi.dev)
 *   ALLOWED_ORIGINS     optional. Extra comma-separated origins allowed to
 *                       post here. The site's own origin always works.
 *
 * What it guards against, in order:
 *   1. Other websites posting to this endpoint (Origin check)
 *   2. Spam bursts from one address (rate limit)
 *   3. Oversized or malformed bodies (size cap, JSON + field validation)
 *   4. Bots (honeypot field, answered with a fake success)
 *   5. HTML injection in the email (everything is escaped)
 */

// Keep these in sync with src/lib/contact.ts
const BUDGET_OPTIONS = ['$125 – $250', '$250 – $500', '$500 – $750', '$750+', 'Not sure yet']
const LIMITS = { name: 100, email: 254, details: 5000 }

const MAX_BODY_BYTES = 16 * 1024
const RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 } // 5 messages per 10 minutes per IP
const RESEND_TIMEOUT_MS = 10_000

// -----------------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  if (!isSameSite(request)) {
    return reply(403, { error: 'Forbidden.' })
  }

  if (!request.headers.get('content-type')?.includes('application/json')) {
    return reply(415, { error: 'Expected a JSON body.' })
  }

  if (isRateLimited(clientIp(request))) {
    return reply(429, { error: 'Too many messages. Please wait a few minutes and try again.' }, { 'Retry-After': '600' })
  }

  const raw = await request.text()
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return reply(413, { error: 'That message is too long.' })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return reply(400, { error: 'Invalid request.' })
  }

  const result = validate(body)
  if (!result.ok) {
    return reply(400, { error: result.error })
  }

  // Honeypot was filled in, so this is almost certainly a bot. Say "sent" so
  // it moves on, but don't actually send anything.
  if (result.honeypot) {
    return reply(200, { ok: true })
  }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.CONTACT_FROM_EMAIL
  const to = process.env.CONTACT_TO_EMAIL || 'contact@kodachi.dev'

  if (!apiKey || !from) {
    console.error('[contact] RESEND_API_KEY or CONTACT_FROM_EMAIL is not set')
    return reply(500, { error: 'The form is not set up yet. Please email contact@kodachi.dev directly.' })
  }

  const message = result.value
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: message.email, // hitting "Reply" goes straight to the visitor
        subject: `New inquiry from ${message.name}`,
        html: renderHtml(message),
        text: renderText(message),
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    })

    if (!res.ok) {
      // Log the details for me, keep the visitor's error generic
      console.error('[contact] Resend responded', res.status, await res.text().catch(() => ''))
      return reply(502, { error: "Your message couldn't be sent. Please try again, or email me directly." })
    }
  } catch (err) {
    console.error('[contact] Request to Resend failed', err)
    return reply(502, { error: "Your message couldn't be sent. Please try again, or email me directly." })
  }

  return reply(200, { ok: true })
}

// -----------------------------------------------------------------------------
// Request checks
// -----------------------------------------------------------------------------

function reply(status: number, body: object, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}

/*
 * Browsers always attach an Origin header to POST requests, so a real
 * submission from the site will have an Origin matching the host it was sent
 * to. Anything else (another website, or a script without an Origin) is
 * turned away. Scripts can fake the header, which is why this is only one
 * layer of several.
 */
function isSameSite(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return false

  const extra = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  if (extra.includes(origin)) return true

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  try {
    return host !== null && new URL(origin).host === host
  } catch {
    return false
  }
}

function clientIp(request: Request) {
  // Vercel sets both of these itself, so visitors can't spoof them
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}

/*
 * Simple in-memory limiter. Good enough to stop someone mashing the button,
 * but each serverless instance has its own memory, so it isn't a hard
 * guarantee. For that, add a rate-limit rule for /api/contact in the Vercel
 * Firewall (see SECURITY.md).
 */
const hits = new Map<string, number[]>()

function isRateLimited(ip: string) {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs)

  if (recent.length >= RATE_LIMIT.max) {
    hits.set(ip, recent)
    return true
  }

  recent.push(now)
  hits.set(ip, recent)

  // Stop the map growing forever on a long-lived instance
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= RATE_LIMIT.windowMs)) hits.delete(key)
    }
  }
  return false
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

type Message = { name: string; email: string; details: string; budget: string }

type Validation = { ok: true; value: Message; honeypot: boolean } | { ok: false; error: string }

// Control characters (except tab/newline) and bidi overrides, which can be
// used to make text display differently from what it really says
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g

// WHATWG's email pattern, but requiring a dot in the domain
const EMAIL =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/

const singleLine = (value: string) => value.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim()
const multiLine = (value: string) =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLE, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()

function validate(input: unknown): Validation {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'Invalid request.' }
  }

  const data = input as Record<string, unknown>
  const text = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : '')

  const name = singleLine(text('name'))
  const email = singleLine(text('email')).toLowerCase()
  const details = multiLine(text('details'))
  const budget = singleLine(text('budget'))

  if (!name) return { ok: false, error: 'Please enter your name.' }
  if (name.length > LIMITS.name) return { ok: false, error: 'That name is too long.' }

  if (email.length > LIMITS.email || !EMAIL.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }

  if (!details) return { ok: false, error: 'Please tell me a bit about your project.' }
  if (details.length > LIMITS.details) {
    return { ok: false, error: `Project details can be up to ${LIMITS.details} characters.` }
  }

  if (budget && !BUDGET_OPTIONS.includes(budget)) {
    return { ok: false, error: 'Please pick a budget from the list.' }
  }

  return { ok: true, value: { name, email, details, budget }, honeypot: text('website').trim() !== '' }
}

// -----------------------------------------------------------------------------
// Email body
// -----------------------------------------------------------------------------

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderText({ name, email, details, budget }: Message) {
  return [`Name: ${name}`, `Email: ${email}`, `Budget: ${budget || 'Not specified'}`, '', details].join('\n')
}

function renderHtml({ name, email, details, budget }: Message) {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 16px 6px 0;color:#6b6480;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:6px 0;color:#15121f">${value}</td></tr>`

  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;max-width:600px">
  <h2 style="margin:0 0 16px;font-size:18px;color:#15121f">New inquiry from kodachi.dev</h2>
  <table style="border-collapse:collapse;margin-bottom:20px">
    ${row('Name', escapeHtml(name))}
    ${row('Email', `<a href="mailto:${escapeHtml(email)}" style="color:#7547ff">${escapeHtml(email)}</a>`)}
    ${row('Budget', escapeHtml(budget || 'Not specified'))}
  </table>
  <div style="padding:16px;border-radius:8px;background:#f5f2ff;color:#15121f;white-space:pre-wrap">${escapeHtml(details)}</div>
</div>`
}
