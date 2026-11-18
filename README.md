# Deploy and Host Crumbs on Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/crumbs?referralCode=sLjDXb&utm_medium=integration&utm_source=button&utm_campaign=crumbs)

Crumbs is a self-hosted, privacy-first notes app in the spirit of Google Keep: a grid of colour-coded notes and checklists with images, tags, pins, archive and trash, full-text search and version history. It installs as an app on phones and desktops and keeps working offline, syncing when you're back. You can share notes with other users on your instance or by public link, and AI assistants can read and write your notes through its built-in MCP server. This template runs Crumbs 0.38.0 on Railway with a persistent volume and an admin account that is ready before the site goes public.

## About Hosting Crumbs

Deploy, wait for the green check, and open the Railway domain. Sign in with `ADMIN_EMAIL` and the generated `ADMIN_PASSWORD`, both on the service's Variables tab. Set `ADMIN_EMAIL` to your own address before deploying if you like; you can change both later in **Settings > Profile**.

**Nobody else can claim your instance.** Crumbs normally makes the first visitor of its setup page the admin. This template creates the admin from your variables on the first boot, before Crumbs listens on the public domain, so the setup page is closed from the first request. Crumbs has no self sign-up: add family or team members yourself in **Settings > Users**.

**Your notes live on the volume at `/data`:** the SQLite database and every uploaded image. Redeploys, restarts and Crumbs upgrades keep them.

**Install it as an app:** open the domain on your phone and use "Add to Home Screen" (iOS) or "Install app" (Android, Chrome, Edge). It works offline and syncs when it reconnects.

**Forgot the admin password?** Crumbs has no reset email. Set a new `ADMIN_PASSWORD` and add `RESET_ADMIN_PASSWORD=true` on the Variables tab. After the restart the admin signs in with the new password; then remove `RESET_ADMIN_PASSWORD`. Changing `ADMIN_PASSWORD` alone does nothing after the first boot.

**Custom domain:** add it in Settings > Networking, then set `ORIGIN=https://notes.example.com` (exactly what you type in the browser, no trailing slash). Without the right `ORIGIN`, image uploads are refused.

**Connect an AI assistant (MCP):** in Crumbs, create an API key in **Settings**, then point your MCP client at `https://your-app.up.railway.app/api/mcp` with the header `Authorization: Bearer <key>`.

**Optional extras**, set as variables:
- **Sign in with Google, GitHub or any OIDC provider** (Authentik, Keycloak, Okta…): `AUTH_GOOGLE_CLIENT_ID`/`AUTH_GOOGLE_CLIENT_SECRET`, `AUTH_GITHUB_CLIENT_ID`/`AUTH_GITHUB_CLIENT_SECRET`, or `AUTH_OIDC_ISSUER`/`AUTH_OIDC_CLIENT_ID`/`AUTH_OIDC_CLIENT_SECRET`. The callback is `https://<your-domain>/api/auth/oauth/<google|github|oidc>/callback`. Accounts are invite-only: create the user in Settings > Users with the same email first.
- **Email notifications** (shares, welcome mails, lockout alerts): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

## Common Use Cases

- A private Google Keep replacement for quick notes, shopping lists and to-dos on every device
- Shared checklists and notes for a family, flat or small team
- Saving screenshots, receipts and photos with a note and tags
- An offline-capable notebook that syncs when you're back online
- A notes store AI assistants can search and write to over MCP

## Dependencies for Crumbs Hosting

- None. One service with one volume; the database is SQLite on the volume.

### Deployment Dependencies

- [Crumbs on GitHub](https://github.com/bretzel-app/crumbs)
- [Template source](https://github.com/two-workspaces/crumbs)

### Implementation Details

- **First-boot admin:** on a volume with no account, the template starts a private copy of Crumbs on `127.0.0.1` only, creates the admin through Crumbs' own setup endpoint (Argon2 hashing, upstream schema), stops it, and only then starts Crumbs on the public port. Once an account exists, Crumbs refuses setup for good. If the account can't be created, the service shows a "Crumbs is not running" page instead of an open setup screen, and the deploy logs say why.
- **Never crash-looping on a variable:** a missing or malformed variable is logged and replaced with a safe default. If `ADMIN_PASSWORD` is empty on the first boot, a random one is generated and printed once in the deploy logs.
- **ORIGIN** is set from the Railway domain, so SvelteKit's upload check and OAuth callbacks work without setup. Set it yourself for a custom domain.
- **Client address:** login lockout (5 failed attempts locks an address out for 15 minutes) uses the real visitor's address from Railway's edge (`X-Real-IP`), so a stranger's guesses don't lock you out.
- **Uploads:** images up to 10 MB (`BODY_SIZE_LIMIT=12M` leaves room for the thumbnail).
- **Memory:** Crumbs idles at about 30 MB. Linux keeps uploaded and viewed images in its page cache, which Railway counts as the service's memory, so the template drops that cache every 15 minutes.
- **Healthcheck:** `/login`.
- **Image:** upstream's `ghcr.io/bretzel-app/crumbs:0.38.0`, pinned, plus a small entrypoint. The schema upgrades itself on start when the version is bumped.

## Why Deploy Crumbs on Railway?

Railway is a singular platform to deploy your infrastructure stack. Railway will host your infrastructure so you don't have to deal with configuration, while allowing you to vertically and horizontally scale it.

By deploying Crumbs on Railway, you are one step closer to supporting a complete full-stack application with minimal burden. Host your servers, databases, AI agents, and more on Railway.
