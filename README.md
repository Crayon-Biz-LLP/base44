# Ops Desk

The Automated Nightly Operations Director for 5–15 branch retail operators.
Software that acts as the owner's Chief of Staff — delivering a verdict they can
act on before they sleep.

> New here? Read [`docs/00-vision-and-mindset.md`](docs/00-vision-and-mindset.md)
> first — it is the canonical product reference, and [`AGENTS.md`](AGENTS.md)
> holds the engineering rules (root-cause procedure, test gate, standards).

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **React 19**
- **Drizzle ORM** on **Neon Postgres** (serverless, transactional driver)
- **Vercel AI SDK v7** (`@ai-sdk/google`) for extraction / repair

## Prerequisites

- Node **22+**
- A Postgres database (Neon)
- A Google Generative AI API key

## Setup

```bash
git clone <repo-url>
cd ops-desk
npm install          # runs `prepare`, which wires the git hooks
cp .env.example .env.local
# fill in .env.local (see Environment below)
npm run dev          # http://localhost:3000
```

## Environment

All variables are documented in [`.env.example`](.env.example). Copy it to
`.env.local`. The essentials:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres (Neon) connection string |
| `APP_SECRET` | **prod** | HMAC key for signing session cookies; generation **fails closed** without it |
| `GOOGLE_GENERATIVE_AI_API_KEY` | yes | Extraction / repair |
| `NEXT_PUBLIC_APP_URL` | yes | Public base URL |

`.env.local` is gitignored — **never commit secrets**. `APP_SECRET` must be set
in production (generate with `openssl rand -hex 32`); in development an insecure
fallback is used and warned about.

## Database migrations

Schema lives in [`src/db/schema.ts`](src/db/schema.ts); migrations are generated
by drizzle-kit into [`drizzle/`](drizzle).

```bash
npm run db:generate   # diff schema.ts → a new SQL migration in drizzle/
npm run db:migrate    # apply pending migrations to DATABASE_URL
npm run db:push       # push schema directly (dev only — skips migration files)
npm run db:studio     # browse the database
```

Workflow: change `schema.ts` → `db:generate` → **review the generated SQL** →
commit it → `db:migrate` against staging, then production. Never hand-edit a
migration that has already been applied.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate Next route types + typecheck |
| `npm run test:unit` | Domain/unit tests (hermetic) |
| `npm run test:zero-llm` | Console behavior tests, no model calls (hermetic) |
| `npm run test:behavior` | Re-seed fixtures + 8 browser suites (needs dev server + DB) |
| `npm run test:dashboards` / `test:renderer` | Server-dependent suites |
| `npm run test:all` | Everything |
| `npm run db:generate` / `db:migrate` / `db:push` / `db:studio` | Migrations |

## Testing & the gate

- **Fast, hermetic:** `npm run lint && npm run typecheck && npm run test:unit && npm run test:zero-llm`.
  This is what CI runs on every pull request.
- **Integration** (`test:behavior`, `test:dashboards`, `test:renderer`) needs a
  running dev server and a seeded database; it runs on `main` and nightly.
- Behavior suites mutate the database and re-seed on each run — do **not** run
  them against a shared/production database.

## Git hooks

Hooks live in `.githooks/` and are wired by `npm install` (the `prepare` script).
If you cloned without running install:

```bash
git config core.hooksPath .githooks
```

- `commit-msg` — every commit must contain a `Root Cause:` line (see the
  root-cause procedure in [`AGENTS.md`](AGENTS.md)).
- `pre-push` — runs `lint` + `tsc`; the fast checkpoint before the remote.

## CI / CD

- **`.github/workflows/ci.yml`** — PR + `main`: lint, typecheck, unit, zero-LLM.
- **`.github/workflows/integration.yml`** — `main` push + nightly + manual:
  Chromium + dev server + behavior/dashboard/renderer suites.
- **Deploy** on Vercel. Set `DATABASE_URL` and `APP_SECRET` in the Vercel
  project's environment variables before the first production deploy.

## Project layout

```
src/app/         Next.js routes (pages + /api)
src/components/  shared UI
src/lib/domain/   manifest, guardrails, business rules
src/lib/consoles/ the 10 archetype consoles + their runtime (escape, chrome, branding, repair, ai)
src/lib/pipeline/ extraction → assembly (archetypes, artifact, assemble-registry, edit-pipeline)
src/lib/auth/     owner/staff sessions + guards
src/lib/data/     db-backed stores (audit, lineage, alert-store)
src/lib/util/     generic helpers (fetch, channels)
src/db/          Drizzle schema + client
drizzle/         generated SQL migrations
tests/           unit + browser behavior suites (tests/helpers/ = shared harness)
scripts/         operational + migration scripts
docs/            product vision, ADRs, references
```
