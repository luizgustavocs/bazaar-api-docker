# Bazaar API (Docker)

Data engine of the Tibia Scout ecosystem: scrapes the Tibia Bazaar (CipSoft), processes auction data with queues and workers, and serves it through a REST API. Containerised to run API, crawler and worker in a single Docker image on a free hosting plan.

**Front end:** [tibia-scout](https://github.com/luizgustavocs/tibia-scout) · **Previous version (Railway):** [bazaar-api](https://github.com/luizgustavocs/bazaar-api)

## Architecture

NPM Workspaces monorepo with three apps that share database and queue connections:

| App | Responsibility |
|---|---|
| `apps/api` | Fastify server that exposes the processed data |
| `apps/crawler` | Scraping engine that extracts auction data from the official website |
| `apps/worker` | BullMQ worker that persists data in batches (upsert) and removes expired records |

```
crawler ──► Redis / BullMQ queue ──► worker ──► Turso (libSQL) ◄── api ◄── tibia-scout
```

## Tech stack

| Concern | Technology |
|---|---|
| Runtime | Node.js 20+, TypeScript |
| Web framework | Fastify |
| ORM and database | Prisma 7, Turso (distributed SQLite / libSQL) |
| Queues | BullMQ, Redis (local in the container or Upstash) |
| Scheduling | node-cron |
| Scraping | Axios, Cheerio |
| Deployment | Docker, Render |

## Engineering highlights

- **Single-container deployment:** an `entrypoint.sh` runs Redis, API, crawler and worker in one container, fitting the 512 MB RAM limit of the free plan.
- **Batching:** whole pages (25 characters at a time) are processed per job, reducing Redis commands by about 25 times and keeping usage within the Upstash free tier.
- **Resilient persistence:** data lives in Turso, independent of container restarts; upserts keyed by unique IDs keep it consistent.
- **Memory control:** `removeOnComplete` and retry attempts tuned in BullMQ; apps compiled to plain JavaScript (`dist/`) before deployment.
- **Scheduled refresh:** heavy scraping runs at midnight (Brasília time), with an external health-check ping to avoid hibernation.

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Application, Turso and Redis health |
| GET | `/characters` | Processed characters with filters |
| GET | `/bazaar` | Auction data and status |

## Getting started

Requirements: Node.js 20+, a Redis instance (local or Upstash) and a Turso database (or local SQLite for development).

```bash
git clone https://github.com/luizgustavocs/bazaar-api-docker.git
cd bazaar-api-docker
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Environment variables (see `.env.example`):

| Variable | Description |
|---|---|
| `PORT` | API port (default 3333) |
| `DATABASE_URL` / `TURSO_DATABASE_URL` | Turso (libSQL) database URL |
| `DATABASE_AUTH_TOKEN` / `TURSO_AUTH_TOKEN` | Turso auth token |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Redis connection |

## Deployment (Render)

Runtime: Docker · Plan: Free · Set the Redis and Turso variables above in the service settings.

## Commit convention

Conventional Commits (`feat`, `fix`, `docs`, `chore`).

## Author and license

Luiz Gustavo Costa e Silva · [GitHub](https://github.com/luizgustavocs) · [LinkedIn](https://www.linkedin.com/in/luizgustavocs) · MIT License

<details>
<summary>Versão em português</summary>

### Bazaar API (Docker)

Motor de dados do ecossistema Tibia Scout: faz o scraping do Bazaar do Tibia, processa os leilões com filas e workers e distribui os dados por uma API REST.

**Destaques técnicos**
- Monorepo com NPM Workspaces: `api` (Fastify), `crawler` (scraping) e `worker` (BullMQ).
- Prisma 7 com Turso (libSQL), Redis/BullMQ (local ou Upstash) e node-cron.
- Container único no plano gratuito do Render, com Redis interno e apps compilados para JavaScript, dentro do limite de 512 MB de RAM.
- Processamento em lote (25 personagens por vez), reduzindo em cerca de 25 vezes os comandos no Redis.
- Upsert por ID único, garantindo integridade mesmo com reinicializações do container.

**Como executar:** `npm install`, `npx prisma generate`, `npx prisma db push`, configurar o `.env` (Turso e Redis) e rodar `npm run dev`.
</details>
