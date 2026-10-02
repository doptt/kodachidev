/*
 * POST /api/contact
 *
 * Checks a contact form submission and emails it to me through Resend.
 * Vercel runs this as a serverless function, and vite.config.ts serves it
 * during development.
 *
 * Environment variables:
 *   RESEND_API_KEY      required, a key with sending access
 *   CONTACT_FROM_EMAIL  required, e.g. "kodachi.dev <noreply@kodachi.dev>"
 *   CONTACT_TO_EMAIL    where messages go, defaults to contact@kodachi.dev
 *   ALLOWED_ORIGINS     extra comma-separated origins allowed to post here
 *
 * See SECURITY.md for what each check is for.
 */

// Keep in sync with src/lib/contact.ts
const BUDGET_OPTIONS = ['$125 – $250', '$250 – $500', '$500 – $750', '$750+', 'Not sure yet']
const LIMITS = { name: 100, email: 254, details: 5000 }

const MAX_BODY_BYTES = 16 * 1024
const RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 }
const RESEND_TIMEOUT_MS = 10_000

const SEND_FAILED = "Your message couldn't be sent. Please try again, or email me directly."

export async function POST(request: Request): Promise<Response> {
  if (!isSameSite(request)) {
    return reply(403, { error: 'Forbidden.' })
  }

  if (mediaType(request) !== 'application/json') {
    return reply(415, { error: 'Expected a JSON body.' })
  }

  if (isRateLimited(clientIp(request))) {
    return reply(429, { error: 'Too many messages. Please wait a few minutes and try again.' }, { 'Retry-After': '600' })
  }

  const raw = await readBody(request, MAX_BODY_BYTES)
  if (raw === null) {
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

  // Only bots fill in the hidden field. Tell them it worked and send nothing.
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
        reply_to: message.email,
        subject: `New inquiry from ${message.name}`,
        html: renderHtml(message),
        text: renderText(message),
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    })

    if (!res.ok) {
      console.error('[contact] Resend responded', res.status, await res.text().catch(() => ''))
      return reply(502, { error: SEND_FAILED })
    }
  } catch (err) {
    console.error('[contact] Request to Resend failed', err)
    return reply(502, { error: SEND_FAILED })
  }

  return reply(200, { ok: true })
}

function reply(status: number, body: object, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}

// Browsers send an Origin header with every POST and can't fake it, so this
// stops other sites from submitting the form on a visitor's behalf.
function isSameSite(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return false

  const allowed = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  if (allowed.includes(origin)) return true

  // Newer browsers also say outright when a request comes from another site
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  try {
    return host !== null && new URL(origin).host === host
  } catch {
    return false
  }
}

// "application/json; charset=utf-8" -> "application/json". Comparing the whole
// type matters: a cross-site form can send "text/plain; application/json".
function mediaType(request: Request) {
  return (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
}

// Reads the body but gives up as soon as it passes the limit, so a huge
// upload never ends up in memory. Returns null if it's too big.
async function readBody(request: Request, limit: number) {
  if (Number(request.headers.get('content-length')) > limit) return null
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

// Vercel sets these itself, so visitors can't spoof them
function clientIp(request: Request) {
  return request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

// In-memory, so each serverless instance counts separately. It stops someone
// mashing the button; the Vercel firewall rule in SECURITY.md is the real limit.
const hits = new Map<string, number[]>()

function isRateLimited(ip: string) {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs)
  const limited = recent.length >= RATE_LIMIT.max
  if (!limited) recent.push(now)
  hits.set(ip, recent)

  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= RATE_LIMIT.windowMs)) hits.delete(key)
    }
  }
  return limited
}

type Message = { name: string; email: string; details: string; budget: string }

type Validation = { ok: true; value: Message; honeypot: boolean } | { ok: false; error: string }

// Control characters (apart from tabs and newlines) and the bidi overrides
// that can make text display differently from what it actually says
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g

// The WHATWG email pattern, but the domain needs a dot
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
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'Invalid request.' }
  }

  const data = input as Record<string, unknown>
  const field = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : '')

  const name = singleLine(field('name'))
  const email = singleLine(field('email')).toLowerCase()
  const details = multiLine(field('details'))
  const budget = singleLine(field('budget'))

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

  return { ok: true, value: { name, email, details, budget }, honeypot: field('website').trim() !== '' }
}

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
