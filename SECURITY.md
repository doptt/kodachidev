# Security

## Reporting a problem

If you find a security issue with kodachi.dev, please email **contact@kodachi.dev** rather than opening a public issue. I'll reply within a couple of days.

## How the site is protected

Most of the site is static files, which leaves very little to attack. The one moving part is the contact form. Here is what's in place, and why.

### Response headers

Set in `vercel.json` for every page:

- **Content-Security-Policy.** The browser only runs scripts served from kodachi.dev itself. Styles and fonts are also allowed from Google Fonts. The page can't be framed, can't load plugins, and can only send data back to its own domain. This is the main defence against injected scripts.
- **Strict-Transport-Security.** Browsers always use HTTPS for the domain, for two years.
- **X-Frame-Options: DENY** and `frame-ancestors 'none'`. Other sites can't embed this one, which prevents clickjacking.
- **X-Content-Type-Options: nosniff.** Browsers won't guess file types.
- **Referrer-Policy.** Other sites only see the domain, never full URLs.
- **Permissions-Policy.** Camera, microphone, location, payments and USB are turned off for the site.
- **Cross-Origin-Opener-Policy.** Pages opened from other sites can't reach back into this one.

### The contact form (`api/contact.ts`)

Each request goes through these checks in order:

1. **Same-site only.** The `Origin` header has to match the domain the request was sent to, so other websites can't post to the endpoint from a visitor's browser.
2. **JSON only, with a 16 KB cap.** Plain HTML form posts from other sites are rejected outright.
3. **Rate limit.** Five messages per IP every 10 minutes. This limit lives in memory, so each serverless instance keeps its own count. See the next section for the version that can't be bypassed.
4. **Validation.** Every field is checked for type and length. Emails have to be properly formed, and the budget has to be one of the listed options. Invisible control and text-direction characters are stripped, and the name is flattened to a single line before it's used in the subject.
5. **Honeypot.** A hidden field that only bots fill in. When it's filled, the bot gets a fake "sent" and no email goes out.
6. **Escaping.** All user input is HTML-escaped before it goes into the email, so nobody can inject markup into my inbox.
7. **Quiet errors.** Visitors get a generic message when something fails. The details go to the Vercel logs.

The site never sends email to whatever address a visitor types in. Messages only go to my own inbox, with the visitor set as "reply-to", so the form can't be used to send spam to other people.

### Secrets

The Resend key only exists as an environment variable on the server. Nothing in `src/` reads environment variables, and Vite only exposes variables that start with `VITE_`, so the key can't end up in the browser bundle. `.env` files are ignored by git, and only `.env.example` (with placeholders) is committed.

### Dependencies

The only runtime dependencies are React and React DOM. Resend is called with `fetch`, so there's no email SDK to trust. Everything installs from the public npm registry through a lockfile.

## Things to switch on in dashboards

These can't live in the repo, but they're worth doing before launch:

- **Vercel Firewall rate limit.** In the project, go to Firewall → Rules and add a rate limit on `/api/contact`, around 10 requests per minute per IP. Unlike the in-code limit, this one is enforced for every instance.
- **Restricted Resend key.** Create the key with "Sending access" only, limited to the kodachi.dev domain. If it ever leaks, it can't read or delete anything.
- **Verified sending domain.** Verifying kodachi.dev in Resend adds SPF and DKIM records, so the form's emails don't land in spam and nobody else can send as the domain through Resend.
- **Two-factor auth** on GitHub, Vercel, Resend and the domain registrar.

## Before each release

- [ ] `npm audit` is clean (or the findings don't affect this site)
- [ ] `npm run typecheck` and `npm run build` both pass
- [ ] No keys or `.env` files in `git status`
- [ ] Headers check out at [securityheaders.com](https://securityheaders.com)
- [ ] A test message through the live form arrives
