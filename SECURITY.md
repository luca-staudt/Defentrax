# Sentinel Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| `main` (pre-1.0) | Yes — best-effort security fixes |
| Tagged releases (`v0.x`, later `v1.x`) | Yes once published |

There is no LTS track yet. Prefer the latest tagged release or `main` for self-hosted installs.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email the maintainer privately (see the GitHub profile for [luca-staudt/Sentinel](https://github.com/luca-staudt/Sentinel)) with:

1. Affected version / commit
2. Impact (confidentiality / integrity / availability)
3. Reproduction steps or proof-of-concept (kept private)
4. Any suggested fix

You should receive an acknowledgment within a few days. We will coordinate disclosure after a fix is available or a risk acceptance is documented.

## Out of scope (examples)

- Denial-of-service from unbounded legitimate event volume without rate-limit / retention tuning
- Issues that require already-compromised admin credentials or host root on agent machines
- Findings that only apply when operators disable secure defaults (`COOKIE_SECURE=false` in production without break-glass, `SENTINEL_TLS_INSECURE=true`, empty plugin allowlist bypass attempts that still require ADMIN)

## Hardening reference

Operator-facing guidance, CSRF/cookie/TLS notes, and residual risks: [`sentinel/docs/security.md`](sentinel/docs/security.md).
