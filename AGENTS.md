# AGENTS.md

## Project Overview

This project is for the ILOILO PROVINCE STARTUP HACKATHON, read guidelines in GUIDELINES.md if you need more context.

A capacity planning platform for the Iloilo Rice Processing Complex (IRPC): clients book drying/milling, offer palay and get quotes by SMS; staff see dryer, storage and mill load weeks ahead and act on suggested actions. Read `PRD.md` (what) and `TRD.md` (how) before working on a module. Decisions live in `docs/decisions/`.

## Project Structure

```
src/
  app/(app)/        staff pages behind login (sidebar layout)
  app/login/        staff sign-in
  app/api/          route handlers (SMS inbound webhook)
  components/ui/    shadcn/ui components (generated; edit sparingly)
  components/       app-level components (sidebar, nav, placeholders)
  modules/<name>/   one per PRD module (M1–M11): logic.ts, queries.ts, actions.ts, sms.ts, components/
  lib/              env, Supabase clients, SMS gateway, AI helper, dates, formatters, refs
  proxy.ts          session refresh and login redirect
supabase/           config, migrations, seeds/ (local dev via Docker)
data/opa/raw/       source data from IRPC/OPA (read-only)
data/forecast/      Python (uv): train the arrival forecast offline
services/sms-webhook/  SMSGate webhook relay (separate Vercel project)
infra/sms-gateway/  Optional self-hosted SMSGate server (Docker Compose)
```

Module folders: `setup` (M1), `accounts` (M2), `sms` (M3), `booking` (M4), `buying` (M5), `gate` (M6), `pricing` (M7), `forecast` (M8), `capacity` (M9), `prescriptions` (M10), `orders` (M11).

## Tech Stack

- Next.js 16 (App Router, Cache Components, server actions), strict TypeScript
- Tailwind CSS 4, shadcn/ui (Base UI), shadcn charts (Recharts)
- Supabase (Postgres, Auth) via supabase-js and `@supabase/ssr`; Supabase CLI for local dev, migrations and types
- Zod, React Hook Form
- Vercel AI SDK with `@ai-sdk/google` (Gemini) and `@openrouter/ai-sdk-provider` (OpenRouter)
- SMSGate cloud (SMS gateway for Android) with a webhook relay on Vercel, plus a web simulator
- Python (uv, pandas, openpyxl, SciPy) for the offline forecast
- pnpm, Vitest, ESLint, Prettier, commitlint, Husky, lint-staged

## Quick Start

Requires Node 24, pnpm, Docker and (for the forecast) uv.

```sh
pnpm install                   # also links agent skills (pnpm agents:setup)
pnpm db:start                  # local Supabase in Docker
cp .env.example .env.local     # fill keys from `pnpm db:status`
pnpm dev
```

Sign in at http://localhost:3000 with `manager@irpc.test` or `encoder@irpc.test` (password `password123`). Supabase Studio: http://127.0.0.1:54323.

## Commands

| Command                    | Does                                            |
| -------------------------- | ----------------------------------------------- |
| `pnpm dev`                 | Start the app                                   |
| `pnpm agents:setup`        | Symlink agent skill folders to `.agents/skills` |
| `pnpm build`               | Production build                                |
| `pnpm lint`                | ESLint                                          |
| `pnpm format`              | Prettier write (`format:check` to verify)       |
| `pnpm typecheck`           | Generate route types and run `tsc`              |
| `pnpm test`                | Vitest (`test:watch` for watch mode)            |
| `pnpm db:start` / `:stop`  | Start/stop local Supabase                       |
| `pnpm db:status`           | Local URLs and keys                             |
| `pnpm db:reset`            | Re-apply migrations and `supabase/seeds/*.sql`  |
| `pnpm db:migration <name>` | New migration file                              |
| `pnpm db:types`            | Regenerate `src/lib/supabase/database.types.ts` |
| `uv run pytest`            | Forecast tests (in `data/forecast/`)            |

After changing the schema: add a migration, `pnpm db:reset`, `pnpm db:types`, and commit the migration with the regenerated types. CI fails if the types are out of date. Merging migrations to `main` applies them to the hosted project (`.github/workflows/db-deploy.yml`; repo secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`). Never edit a migration that is already on `main`; add a new one.

## Environment Variables

See `.env.example`. Validated in `src/lib/env.ts`.

| Name                                                               | Used by                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`        | App, auth                                                           |
| `SUPABASE_SERVICE_ROLE_KEY`                                        | Server data access, SMS relay, seed                                 |
| `SMS_GATEWAY`                                                      | `simulator` (default) or `smsgate`                                  |
| `SMS_GATEWAY_URL`, `SMS_GATEWAY_USERNAME`, `SMS_GATEWAY_PASSWORD`  | Sending SMS, webhook setup; URL defaults to the SMSGate cloud API   |
| `SMS_GATEWAY_WEBHOOK_SIGNING_KEY`                                  | Webhook relay: verifying inbound webhooks                           |
| `SMS_RELAY_SECRET`                                                 | Shared by the app and relay; authenticates `/api/sms/process`       |
| `SMS_GATEWAY_DEVICE_ID`, `SMS_GATEWAY_SIM_NUMBER`                  | Optional; pick the gateway phone and SIM slot                       |
| `SMS_GATEWAY_PHONE_NUMBER`                                         | Optional; the gateway number shown on the landing page              |
| `SMS_GATEWAY_WEBHOOK_PORT`                                         | Validated; defaults to 3000, not yet consumed                       |
| `GOOGLE_GENERATIVE_AI_API_KEY`                                     | Gemini (optional; falls back to templates)                          |
| `GOOGLE_GENERATIVE_AI_API_KEYS`                                    | Comma-separated Gemini key pool; overrides the single key           |
| `GOOGLE_GENERATIVE_AI_RPM_LIMIT`, `GOOGLE_GENERATIVE_AI_RPD_LIMIT` | Local per-key request budgets (defaults: 10/minute, 250/Manila day) |
| `GOOGLE_GENERATIVE_AI_QUOTA_THRESHOLD`                             | Switch keys at this share of either budget (default: `0.9`)         |
| `OPENROUTER_API_KEY`                                               | Optional OpenRouter provider; also works without Gemini keys        |
| `OPENROUTER_MODEL`                                                 | Structured-output model (default: `openai/gpt-5.4-nano`)            |

`env()` maps the renamed SMS credentials to `SMSGATE_USERNAME`, `SMSGATE_PASSWORD`, and `SMSGATE_SIGNING_KEY` for internal consumers. Configure the `SMS_GATEWAY_*` input names shown above.

Gemini quotas are shared by keys from the same Google project. Set the request budgets to match the model and tier in AI Studio; these defaults are local budgets. Counters are per server instance and reset on cold starts. `extract()` tries OpenRouter if configured, then up to two different eligible Gemini keys. Quota, server, timeout, billing and retryable network failures advance to the next option; schema and validation failures return `null`. Within the 8-second total budget, each non-final attempt reserves half the remaining time for fallback. Log provider names and safe failure categories as `[ai:provider]`, and Gemini key switches by index as `[ai:key]`; keep credentials and raw errors out of logs.

## Code Conventions

### Modules

- `logic.ts` is pure (no I/O) and imports no other module. Unit-test it.
- Cross-module calls live only in `actions.ts` and `queries.ts`.
- All database access is server-side through `db()` (`src/lib/supabase/admin.ts`). RLS is on with no public policies.
- Server actions call `requireRole()` (`src/modules/accounts/auth.ts`) first; manager-only pages wrap content in `<RoleGate role="manager">`. Managers only: costs, prices, prescriptions, settings.
- Send SMS through `send()` (`src/modules/sms/queries.ts`), which logs and calls `smsGateway()`; register commands from each module's `sms.ts` with `registerCommand()`; AI through `extract()` (`src/lib/ai.ts`), always with a non-AI fallback. AI never computes numbers.
- Units: weight in integer kg, money in integer centavos (`_minor`), MC as `numeric(4,1)`. Time zone Asia/Manila; columns are `date` or `timestamptz`.
- Every table has `id` (UUID), `created_at`, `updated_at` (use the `set_updated_at()` trigger).
- With Cache Components, wrap components that read cookies, params or uncached data in `<Suspense>`.

### Style

- **Prettier**
- **ESLint**

### Git

- Use Conventional Commits (enforced by commitlint): `type(scope): concise description`.
- Keep commits atomic: each commit should represent one logical, self-contained change.
- Keep commit messages concise.
- Do not co-author commits or include yourself in commit messages.
- Do not amend, rebase, reset, or otherwise rewrite existing commits unless explicitly requested.
- Before committing, inspect the diff and ensure it contains only intended changes.
- When updating a branch with changes from its base branch, prefer rebasing over merging.

#### Branches

- Use descriptive branch names with the format `type/<short-description>`; prefer `feat/` over `feature/`.
- Do not include issue number in branch names.
- Keep branches focused on a single issue or logical change.
- Create a dedicated branch for each change. Do not make changes directly on the default branch.

#### Issues

- Keep issues focused and reasonably sized.
- Create an issue before opening a PR when the change is substantial enough to warrant dedicated tracking. For one-off changes, quick fixes, or simple patches that do not benefit from a dedicated issue, a PR may be created directly unless the user explicitly requests an issue.

#### Pull Requests

- Keep PRs focused and reasonably sized.
- Link the PR to its corresponding issue using `Closes #<issue-number>` when the PR fully resolves the issue.
- If a corresponding issue exists but the PR does not fully resolve it, link the issue without using a closing keyword.

## Verification

- Verify every code change before considering the task complete.
- Run the checks relevant to the files and behavior changed.
- At minimum, run linting for code changes.
- Use Playwright/browser automation ONLY WHEN NEEDED for browser behavior, end-to-end verification, or visual inspection of UI changes. Prefer static inspection and existing tests when sufficient; avoid unnecessary browser interactions and screenshots.

## Agent skills

### Issue tracker

GitHub Issues on `andrianllmm/hack-iloilo` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: glossary in `PRD.md` (or `GLOSSARY.md` if created), decisions in `docs/decisions/`. See `docs/agents/domain.md`.

## Skills & Docs Reference

Project skills live in `.agents/skills/` (tracked in `skills-lock.json`). Agent folders like `.claude/skills` and `.codex/skills` are gitignored symlinks to it, created by `pnpm install` or `pnpm agents:setup [claude codex ...]`. Add or edit skills only in `.agents/skills/`.

[insert later]

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
