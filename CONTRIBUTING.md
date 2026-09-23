# Contributing to Fylune

Thank you for helping make local-first document work better.

## Before you start

- Search existing issues and discussions.
- Open an issue before large behavior, architecture, or dependency changes.
- Keep local editing usable without login, telemetry, payment, or network access.
- Never send document content, names, paths, or workspace metadata through analytics or background services. The optional Agent proxy may send only the prompt explicitly submitted by the user to their configured backend and provider.

## Development

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @fylune/desktop exec playwright install chromium
pnpm --filter @fylune/desktop test:e2e
```

Use `pnpm dev:desktop` for the offline desktop app. Use the root `.env.example`, Docker Compose, and `pnpm dev` only when working on optional accounts.

## Publication checks

Run the checks above from a clean checkout with the committed lockfile. End-to-end tests use port `45173` and temporary profiles under `tmp/qa/`; they do not require a signed-in account or modify an installed app's data.

Run `pnpm audit --prod` for runtime dependency advisories. With [Gitleaks](https://github.com/gitleaks/gitleaks) installed, run `gitleaks git . --log-opts="--all" --redact` to scan all fetched history. The repository configuration allows only the explicit, nonfunctional JWT placeholder in `.env.example` files. Inspect uncommitted files separately before committing.

Keep real `.env` files, provider keys, signing identities, provisioning profiles, database exports, user files, and QA captures out of commits. The example database credentials are for the local development database only. Public repository visibility and signed application releases are separate owner-controlled publishing actions.

## Pull requests

- Keep each pull request focused and explain the user-visible result.
- Add the smallest test that would fail without the behavior change.
- Preserve ordinary files as the source of truth and keep writes conflict-safe.
- Put temporary screenshots and test captures under `tmp/`; never commit them.
- Update documentation when setup, behavior, or public APIs change.

By contributing, you agree that your contribution is licensed under AGPL-3.0-only.
