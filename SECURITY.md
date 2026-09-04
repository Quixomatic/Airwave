# Security Policy

Airwave is self-hosted software that handles your media-server credentials (your Plex token is
encrypted at rest) and your own AI provider keys. If you find a vulnerability, I want to know.

## Reporting a vulnerability

**Please do not open a public issue for security problems.** Report privately, one of two ways:

- **GitHub private advisory (preferred):** on the repo, open the **Security** tab and click
  **"Report a vulnerability"**. That opens a private channel between us.
- **Email:** admin@getairwave.tv.

Please include, as best you can:

- A description of the issue and its impact.
- Steps to reproduce, or a proof of concept.
- The affected version or commit, and your setup (Docker self-host, desktop installer, etc.).

## What to expect

Airwave is maintained by one person, so I may not reply within hours. I will acknowledge your report as
soon as I reasonably can, work with you to confirm and fix it, and credit you in the release notes if
you would like (or keep you anonymous if you prefer). Please give me a reasonable window to ship a fix
before disclosing publicly.

## Supported versions

Airwave is pre-1.0 and ships frequently. Security fixes land in the **latest release** only, so the best
protection is to stay current:

```bash
docker compose pull && docker compose up -d
```

| Version | Supported |
|---|---|
| Latest release | ✅ |
| Anything older | ❌ (please update) |

## Scope

In scope: authentication or access-control bypasses, exposure of stored secrets (Plex tokens, AI keys,
session secrets), injection, remote code execution, and similar flaws in Airwave's own code.

Out of scope: issues that come from how an instance is deployed rather than from Airwave itself. For
example, running it on the public internet without TLS, choosing a weak `ADMIN_PASSWORD`, leaking your
own `BETTER_AUTH_SECRET`, or vulnerabilities in Plex, Docker, or other third-party software. Those are
worth hardening, but they are deployment concerns, not Airwave vulnerabilities.

Thanks for helping keep Airwave, and the people who self-host it, safe.
