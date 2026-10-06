# Contributing to Defentrax

Thanks for helping improve Defentrax. This project prioritizes **security → correctness → data integrity → reliability** over cosmetic polish.

## Before you start

1. Read [`SECURITY.md`](SECURITY.md) — never open public issues for vulnerabilities.
2. Skim [`sentinel/docs/architecture.md`](sentinel/docs/architecture.md) and the module README for the area you touch.
3. Prefer small, focused PRs over large mixed changes.
4. **License is unset.** Contributions are welcome, but there is no LICENSE file yet. By opening a PR you agree your contribution may be relicensed under the OSS license the maintainer eventually chooses (expected: Apache-2.0 or MIT). If that is a problem, wait until a license is published.

## Development setup

```bash
git clone https://github.com/luca-staudt/Defentrax.git
cd Defentrax
cp .env.example .env
# set SESSION_SECRET, DATABASE_URL (or use Docker Compose)

# Full stack
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# Or bare metal API
make build
make db-migrate-up
make run-api
```

Useful docs: [installation](sentinel/docs/installation.md), [configuration](sentinel/docs/configuration.md), [testing](sentinel/docs/testing.md), [CI](sentinel/docs/ci.md).

## Branch and PR workflow

1. Create a branch from the current integration branch (or `main` once phases are merged).
2. Keep commits coherent; messages should explain *why*.
3. Open a draft PR early if useful; mark ready when checks pass.
4. Fill in the PR template — link related issues, note test plan, call out security impact.

### What we expect in a PR

- [ ] Code builds (`make build` / frontend build as needed)
- [ ] Tests for security-critical or non-trivial logic
- [ ] `make fmt-check` (and lint where applicable)
- [ ] No secrets, tokens, or production data in the diff
- [ ] Docs updated when behavior or env vars change

## Coding guidelines

| Area | Guidance |
|------|----------|
| Go API / agent | Clear package boundaries; treat all external input as untrusted; no secrets in logs |
| Detection rules | Possibility language (“Possible …”), never definitive “attacker detected” |
| Frontend | Follow existing Next.js / Tailwind patterns; RBAC is server-enforced |
| Database | Add goose migrations; never DROP production data casually |
| Plugins | Stay within the v1 SDK; empty allowlist remains the secure default |

## Tests

```bash
make test                    # unit (CI-safe)
make api-test-integration    # needs Postgres / TEST_DATABASE_URL
make test-all
make openapi-validate        # if API routes change
```

Details: [`sentinel/docs/testing.md`](sentinel/docs/testing.md).

## Reporting bugs and proposing features

Use GitHub issue templates under [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/). Include version/commit, repro steps, and expected vs actual behavior. For security issues, email privately per [`SECURITY.md`](SECURITY.md).

## Code of conduct

Participation is governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Questions

Open a discussion/issue, or check [`sentinel/docs/troubleshooting.md`](sentinel/docs/troubleshooting.md).
