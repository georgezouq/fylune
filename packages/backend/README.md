# `@fylune/backend`

Optional self-hosted account API for Fylune. The desktop app remains fully usable without this service.

## Endpoints

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /health`

The service stores account and refresh-session records only. It never receives document content, names, paths, or workspace metadata.

## Local development

From the repository root:

```bash
cp .env.example .env
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm dev:backend
```
