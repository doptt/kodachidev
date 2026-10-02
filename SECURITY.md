# Security

If you find a security problem with kodachi.dev, please email contact@kodachi.dev instead of opening a public issue.

## How the site is set up

Almost everything is static files. The only thing that takes input is the contact form, which posts to a single serverless function (`api/contact.ts`). That function never fetches a URL a visitor gives it, and the only outbound request it makes is to Resend's API, so there's nothing to point at internal services (SSRF).

## Headers

`vercel.json` sets these on every response:

- **Content-Security-Policy**: scripts only from the site itself, styles and fonts only from the site and Google Fonts, no inline styles or scripts, no plugins, no framing, and requests only back to the site.
- **Strict-Transport-Security**: HTTPS only, for two years.
- **X-Frame-Options: DENY** and `frame-ancestors 'none'`: the site can't be embedded, so no clickjacking.
- **X-Content-Type-Options: nosniff**: browsers don't guess file types.
- **Referrer-Policy**: other sites only ever see the domain.
- **Permissions-Policy**: camera, microphone, location, payments and USB are off.
- **Cross-Origin-Opener-Policy / Cross-Origin-Resource-Policy**: other sites can't reach into a window opened from here, or embed the site's files.

## The contact form

Each request goes through these checks before anything is sent:

1. **Same site only (CSRF).** The `Origin` header has to match the site, and requests that the browser marks as cross-site (`Sec-Fetch-Site`) are refused. Browsers won't let other pages fake either header.
2. **JSON only.** The content type has to be exactly `application/json`, so a plain HTML form on another site can't post here.
3. **Rate limit.** Five messages per IP every 10 minutes. This is kept in memory per serverless instance, so use the firewall rule below for a hard limit.
4. **Size cap.** Bodies over 16 KB are cut off while they're being read, so a huge upload never sits in memory.
5. **Validation.** Every field is type and length checked, the email has to be well formed and the budget has to be one of the listed options. Control characters and text direction overrides are removed, and the name is squashed onto one line before it goes in the subject, so it can't add email headers.
6. **Honeypot.** A hidden field only bots fill in. They get a fake success and nothing is sent.
7. **Escaping.** Everything is HTML-escaped before it goes into the email.
8. **Generic errors.** Visitors get a friendly message, the details go to the Vercel logs.

Messages only ever go to my inbox, with the visitor as reply-to, so the form can't be used to email anyone else.

On the browser side React escapes all output, there's no `dangerouslySetInnerHTML`, and external links use `rel="noopener noreferrer"`.

## Secrets

The Resend key only exists as a server environment variable. Nothing in `src/` reads environment variables, and Vite only exposes ones prefixed with `VITE_`, so the key can't end up in the browser bundle. `.env` files are git-ignored.

## Dependencies

The only runtime dependencies are React and React DOM, and Resend is called with plain `fetch`. Everything installs from npm through the lockfile.

## Worth turning on in dashboards

- **Vercel Firewall**: add a rate limit rule for `/api/contact` (about 10 requests a minute per IP). Unlike the in-code limit, it applies across all instances.
- **Resend**: use a key with sending access only, restricted to kodachi.dev, and verify the domain so SPF and DKIM are set up.
- **Two-factor auth** on GitHub, Vercel, Resend and the domain registrar.

## Before a release

- [ ] `npm audit` is clean
- [ ] `npm run typecheck` and `npm run build` pass
- [ ] No keys or `.env` files in `git status`
- [ ] Headers look right on [securityheaders.com](https://securityheaders.com)
- [ ] A test message through the live form arrives
