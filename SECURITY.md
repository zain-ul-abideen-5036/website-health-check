# Security Policy

## Supported versions

Security fixes are applied to the latest version on the `main` branch.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report them privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Include the steps to reproduce, the impact, and any suggested fix. You'll get a response as soon as possible, and credit in the release notes if you'd like it.

## Built-in protections

- **Server-side request forgery (SSRF)**: audit URLs are resolved and private, loopback and link-local addresses are rejected before any request is made.
- **Visitor isolation**: on public deployments each browser has an anonymous, HttpOnly visitor cookie; history and deletion are limited to the visitor who ran the audit.
- **Unguessable report links**: audit IDs include a long random component.
- **Rate limiting**: audits per visitor per hour are capped on public deployments.
- **CSV injection**: exported cells that start with formula characters are escaped.
- **Private storage**: on Vercel, audits are stored in a private Blob store.

Only audit websites you own or have permission to test.
