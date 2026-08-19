# `@fylune/backend`

Optional self-hosted account API for Fylune. The desktop app remains fully usable without this service.

## Endpoints

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /ai/agent/status`
- `GET /ai/agent/skills`
- `POST /ai/agent/v1/chat/completions`
- `GET /health`

The service stores account and refresh-session records only. It never receives document content, names, paths, or workspace metadata. The optional Agent API is a self-hosted OpenAI-compatible proxy: the provider key stays on this backend, and the desktop's local Agent protocol remains responsible for reviewing and applying file changes.

Set `OPENROUTER_API_KEY` (and optionally `OPENROUTER_BASE_URL` and `OPENROUTER_TEXT_MODEL`) to enable it. Without a key, the account API and offline desktop still work and Agent status reports `configured: false`.

## Local development

From the repository root:

```bash
cp .env.example .env
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm dev:backend
```
