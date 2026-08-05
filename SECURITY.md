# Security Policy

## Supported Versions

Security updates are provided for the latest stable release and the immediately
preceding minor release.

| Version    | Supported          |
| ---------- | ------------------ |
| 1.1.x      | :white_check_mark: |
| 1.0.x      | :white_check_mark: |
| < 1.0      | :x:                |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.
Instead, report them privately so they can be triaged and fixed before
disclosure.

1. Open a private advisory at
   <https://github.com/elciomsantos/controle-share-videos-v1.0/security/advisories/new>.
2. Include a description of the vulnerability, affected version(s), steps to
   reproduce, and (if known) a proposed fix.

You should receive an acknowledgement within **48 hours**. We aim to ship a fix
within **30 days** depending on severity and scope. If a fix is not possible
within that window, we will communicate the expected timeline and any interim
mitigations.

## Scope

The backend (NestJS + Prisma), the frontend (Next.js), and the Docker/Caddy
deployment configuration are in scope. Issues limited to third-party
dependencies should be reported upstream as well.

## Responsible Disclosure

We appreciate coordinated disclosure. Please allow us time to fix and release a
patched version before publicly disclosing the issue.
