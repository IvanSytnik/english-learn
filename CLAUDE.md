# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

EnglishLearn — AI-powered English learning platform. Turborepo/pnpm monorepo: Next.js 16 + React 19, Prisma 6.16 (not 7 — see Watch out), Auth.js v5, next-intl, Tailwind v4. Multilingual (EN/RU/UK/DE).

## Commands

```bash
pnpm install
pnpm dev                    # all apps, dev mode
pnpm build                  # turbo build (respects task graph)
pnpm lint                   # biome lint .
pnpm check                  # biome check --write . (lint + format autofix)
pnpm typecheck              # turbo run typecheck across all packages
pnpm test                   # turbo run test (vitest, all packages)
pnpm test:e2e               # playwright e2e (needs dev server / DB)

pnpm db:generate             # regenerate Prisma client (packages/db)
pnpm db:push                 # push schema to DB, no migration file (dev only)
pnpm db:migrate              # create + apply a migration
pnpm db:seed                 # seed sample data
pnpm db:studio               # Prisma Studio
```

Run one package's tests/typecheck via turbo filter, e.g.:
```bash
pnpm --filter @englishlearn/learner-model test
pnpm --filter @englishlearn/learner-model exec vitest run src/policy/__tests__/select.test.ts
pnpm --filter @englishlearn/db typecheck
```
`turbo run test` sometimes reports a stale "0 passed" from cache — if a test result looks wrong, rerun with `turbo run test --force` or the isolated `--filter ... exec vitest run` form above.

Vitest does **not** type-check `__tests__` files — a green test run is not the same as a green `pnpm typecheck`. Run both before trusting a change.

## Monorepo layout

- `apps/web` — the only app. Route groups under `app/[locale]/`: `(marketing)`, `(auth)`, `(student)`, `(admin)`. `proxy.ts` (Next 16's replacement for `middleware.ts`) enforces RBAC via the `authorized` callback — no separate admin app; one auth, one Prisma client, one deploy.
  - **`apps/web/src/` is dead scaffolding** — every directory in it is empty (0 files). The real source tree is `apps/web/app/`, `apps/web/components/`, `apps/web/lib/`, `apps/web/i18n/`. Don't be misled by the near-duplicate tree; don't add files under `src/`.
- `packages/db` — Prisma schema (`prisma/schema.prisma`), generated client (custom output path `src/generated/client` — don't relocate without updating imports), queries, Zod schemas for JSON content, seed script.
- `packages/learner-model` — the core domain logic (see Architecture below). This is where most non-UI feature work happens.
- `packages/ai` — Claude/OpenAI prompt templates and structured-output schemas. Provider clients are not wired up yet (stub only, tracked as open question).
- `packages/ui` — shared React components (Tailwind).
- `packages/config` — shared `tsconfig` bases.
- Root `learner-model/` (no `packages/` prefix) and `packages/content/` are empty placeholder directories, not real packages — ignore them.
- `englishlearn-diagnostic-v2/` (untracked, repo root) — a staged, not-yet-applied patch set for the current "Diagnostic v2" migration (see below). Its `README.md` documents the exact file-by-file apply order (schema patch → migration → Zod schema swap → db-port → diagnostic module → service replacements → bootstrap-service → barrel exports). Treat files under here as instructions/diffs to apply into `packages/db` and `packages/learner-model`, not as already-live code.

## Architecture: the Learner State Model

`packages/learner-model` implements a 3-layer model, each layer a pure functional core with a thin adapter to Prisma-backed projections:

- **Layer 3 — Knowledge Graph** (`core/graph`): `Concept` + `ConceptEdge` (prerequisite/related edges).
- **Layer 2 — BKT+** (`core/bkt`): Bayesian Knowledge Tracing augmented with IRT 2PL (`σ(a(θ−b))`) and exponential forgetting. Per-user `p_learn`/`p_slip`/`p_guess` are placeholders pending calibration once there's enough data (~500 outcomes/concept) — this calibration-gate pattern recurs elsewhere (see Selection Policy).
- **Layer 1 — FSRS** (`core/fsrs`): spaced repetition via `ts-fsrs`. `core/fsrs/wrapper.ts` is the **only** allowed importer of `ts-fsrs` in the codebase — go through it, don't import `ts-fsrs` directly elsewhere.

`adapters/` convert between core pure state and Prisma projections (`BktState` ↔ `ConceptMastery`, `FsrsCardState` ↔ `ItemReviewState`).

### Event sourcing (`service/`)

`LearnerEvent` is an append-only log; `service/apply.ts` is the single pure fold function used both for the live write path and for full replay (`service/replay.ts`). `service/learner-service.ts` is the `recordOutcome` orchestrator: one DB transaction does event insert → read snapshots inside the tx → pure fold → upsert both projections, single timestamp. There is exactly one path that writes to `ConceptMastery`/`ItemReviewState` — never update those tables directly from elsewhere.

### Selection Policy (`policy/`)

Thompson Sampling over concepts (not items — per-item reward is too sparse; item choice within a concept is FSRS-due scheduling). `service/selection-service.ts` (`selectNext`) is the read-path orchestrator, symmetric to `learner-service.ts`'s write path — read-only, no transaction.

Priority order in `select.ts`: `REVIEW_DUE` (FSRS-due item ≤ now) → `NEW_INTRODUCTION` (Thompson sampling over unlocked concepts) → `EXPLORATION_FLOOR` (guarantees a non-empty result; no-starvation invariant, property-tested).

Hard invariant: **all randomness in `policy/` goes through the injectable seedable RNG in `policy/rng.ts` (mulberry32 + Marsaglia–Tsang Beta sampling) — `Math.random()` is forbidden there.** This is required for deterministic tests and for future offline replay/eval. Cold-start uses an informative Beta prior derived from item IRT-difficulty, not a uniform `Beta(1,1)`.

Curriculum gating: introducing a *new* concept requires all direct `PREREQUISITE` parents to have mastery ≥ `prereqThreshold` (0.7) — a hard gate. Reviewing an already-started concept is never gated. Only direct parents are checked (transitivity is implicit through the graph, not walked explicitly).

### Content lifecycle

Every content model (`VocabExercise`, `GrammarExercise`, `ListeningExercise`, etc.) has a `status`: `DRAFT → REVIEW → PUBLISHED → ARCHIVED` (or `REJECTED`). AI-generated content always starts as `DRAFT`; publishing is an explicit admin action. Student-facing code **must** go through `@englishlearn/db/queries/exercises` (the `publishedExercises` wrapper), never the raw `prisma` client, to avoid leaking unpublished content. Admin code may use the raw client.

### Diagnostic (in transition)

The current diagnostic is a pseudo-CAT (simple 2-right-levels-up / 2-wrong-levels-down branching, no IRT calibration) tracked via `DiagnosticAttempt`/`DiagnosticAnswer`. `englishlearn-diagnostic-v2/` (see above) is a staged migration that adds a `LEARNER_BOOTSTRAPPED` event type to initialize `ConceptMastery` from diagnostic results (θ → conservative capped `p_known`, capped at 0.6, `observationCount = 0` so BKT still treats it as unobserved). Same single-write-path invariant applies: bootstrap only writes via the event fold, never a direct `ConceptMastery` UPDATE, and is strictly-once per user (guarded by an event count check inside the same transaction).

## Watch out

- **Stay on Prisma 6.16.x** — Prisma 7 breaks `datasource.url`.
- **`packages/db/.env` is required separately from `apps/web/.env`** — the Prisma CLI doesn't read env files from sibling packages, and both need `DATABASE_URL`. Migrations against Neon must use the *direct* (non `-pooler`) URL — pooler silently no-ops on DDL. `datasource` also defines `directUrl` (`DIRECT_URL` env) so `migrate deploy`/`status` pick it up automatically, but `migrate diff --from-url` does not read `directUrl` — pass the direct URL explicitly there.
- Relative imports must **not** use `.js` suffixes — this breaks Turbopack under `moduleResolution: "Bundler"`.
- `next-auth` v5 is still beta but is the de-facto standard in use here.
- Tailwind v4 is CSS-first config (`@theme` in `globals.css`) — there is no `tailwind.config.ts`.
- Working language convention (per HANDOFF.md): chat in Russian, but all code/docs/UI/commit messages are in English — don't mix.
