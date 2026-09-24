# Setting up the contact form

The form on the home page sends messages to my inbox through [Resend](https://resend.com). The browser posts to `/api/contact`, the function in `api/contact.ts` checks the message, and then it calls Resend's API. This page covers getting it running from scratch.

## 1. Verify the domain in Resend

Resend will only send from a domain you've proven you own.

1. Sign in at [resend.com](https://resend.com) and open **Domains → Add Domain**.
2. Enter `kodachi.dev`.
3. Resend shows a few DNS records (SPF, DKIM and optionally DMARC). Add them where the domain's DNS is managed.
4. Wait for the domain to show **Verified**. This is usually a few minutes, but DNS can take longer.

Until the domain is verified, you can test with Resend's sandbox sender `onboarding@resend.dev`. It only delivers to the email address on your Resend account.

## 2. Create an API key

1. Go to **API Keys → Create API Key**.
2. Set permission to **Sending access** and restrict it to `kodachi.dev`.
3. Copy the key (it starts with `re_`). Resend only shows it once.

## 3. Try it locally

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```bash
RESEND_API_KEY=re_your_key_here
CONTACT_FROM_EMAIL="kodachi.dev <noreply@kodachi.dev>"
CONTACT_TO_EMAIL=contact@kodachi.dev
```

Then run `npm run dev`, fill in the form and hit send. `vite.config.ts` has a small dev-only route that runs the same `api/contact.ts` the live site uses, so what you see locally is what you get in production. `.env.local` is ignored by git, so the key stays on your machine.

## 4. Add the keys to Vercel

In the Vercel project, go to **Settings → Environment Variables** and add:

| Name                 | Value                                  | Required |
| -------------------- | -------------------------------------- | -------- |
| `RESEND_API_KEY`     | your `re_...` key                      | yes      |
| `CONTACT_FROM_EMAIL` | `kodachi.dev <noreply@kodachi.dev>`    | yes      |
| `CONTACT_TO_EMAIL`   | `contact@kodachi.dev`                  | no       |
| `ALLOWED_ORIGINS`    | leave empty                            | no       |

Redeploy afterwards, because environment variables only apply to new deployments.

## 5. Add a firewall rule (recommended)

The function has its own rate limit, but it's per-instance. For a hard limit, open **Firewall → Rules** in Vercel and add a rate limit on the path `/api/contact` (10 requests per minute per IP is plenty for a contact form).

## Changing the budget options

The choices are listed in two places, which have to match:

- `src/lib/contact.ts`, which is what the dropdown shows
- `api/contact.ts`, which is what the server accepts

If the two drift apart, anyone who picks a new option gets "Please pick a budget from the list."

## When something goes wrong

The visitor always sees a friendly message. The real reason shows up in **Vercel → Logs**, where each line starts with `[contact]`.

| What the visitor sees | What it usually means |
| --- | --- |
| "The form is not set up yet" | `RESEND_API_KEY` or `CONTACT_FROM_EMAIL` is missing, or you haven't redeployed since adding it |
| "Your message couldn't be sent" | Resend turned the request down. The log shows why; it's usually an unverified domain or a sender that doesn't match it |
| "Too many messages" | The same IP sent more than five messages in 10 minutes |
| "Forbidden" | The request came from a different domain. If you're serving the site from a second domain, add it to `ALLOWED_ORIGINS` |
