# Contributing to Fylune

Thank you for helping make local-first document work better.

## Before you start

- Search existing issues and discussions.
- Open an issue before large behavior, architecture, or dependency changes.
- Keep local editing usable without login, telemetry, payment, or network access.
- Never send document content, names, paths, or workspace metadata to a remote service.

## Development

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Use `pnpm dev:desktop` for the offline desktop app. Use the root `.env.example`, Docker Compose, and `pnpm dev` only when working on optional accounts.

## Pull requests

- Keep each pull request focused and explain the user-visible result.
- Add the smallest test that would fail without the behavior change.
- Preserve ordinary files as the source of truth and keep writes conflict-safe.
- Put temporary screenshots and test captures under `tmp/`; never commit them.
- Update documentation when setup, behavior, or public APIs change.

By contributing, you agree that your contribution is licensed under AGPL-3.0-only.
