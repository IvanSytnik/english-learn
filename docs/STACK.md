# Tech Stack

> **Легенда статусов:**
> ✅ `verified` — стоит, работает, проверено live
> 🟡 `planned` — решение принято, ещё не внедрено
> ⚪ `not wired` — присутствует в зависимостях/плане, но не подключено
>
> Last synced with HANDOFF: 2026-08-02 (v11). Source of truth — этот файл в репо, не Claude Project.

---

## Frontend (Web App)
- ✅ **Next.js 16.2.9** (App Router) + **React 19.2.7** — `proxy.ts` вместо `middleware.ts`; `typedRoutes` в корне `next.config.ts`
- ✅ **TypeScript 6.0.3** — `moduleResolution: "Bundler"` (БЕЗ `.js` суффиксов в relative imports; в `paths` НЕТ `baseUrl`)
- ✅ **Tailwind 4.3.1** + custom design system (no UI kit) — сейчас functional bootstrap, не финальный дизайн
- ✅ **next-intl 4.13** (i18n: en, ru, uk, de) — `app/[locale]/...`, `localePrefix: 'as-needed'`
- ✅ **TanStack Query 5** + **Zustand 5**
- ✅ **React Hook Form 7.80** + **Zod 4.4**

## Backend
- ✅ **Next.js API routes / Server Actions** — server actions в `actions/` с `"use server"`, typed `Result<T, E>`
- ⚪ **tRPC / Hono** — НЕ выбрано; вопрос отложен, пока хватает server actions
- ✅ **PostgreSQL (Neon, eu-central-1)** + **Prisma 6.16.2**
  - ⚠️ Prisma НЕ 7.x — 7 ломает `datasource.url`; закреплено на 6.16.2
  - `directUrl = env("DIRECT_URL")` в datasource (закрыто 2026-08-02)
  - CLI-миграции против Neon — только через direct (non-pooler) URL
- ⚪ **Redis (sessions, rate limit, queue)** — в плане, не подключено
- ⚪ **BullMQ (background jobs)** — в плане, не подключено

## Auth
- ✅ **next-auth 5.0.0-beta.31** (Auth.js v5) — JWT sessions, Credentials + Prisma adapter
- 🟡 **OAuth (Google, Apple)** — запланировано, пока только credentials
- ✅ **RBAC:** student / tutor / admin (+ guest) — role на `User`

## AI Layer
- ⚪ **Anthropic Claude API** (основной) — НЕ подключено (open question #1: provider strategy)
- ⚪ **OpenAI** (fallback / embeddings) — НЕ подключено
- 🟡 **pgvector** (в той же Postgres) — план для RAG
- 🟡 **RAG** для knowledge base — план
- 🟡 **Eval harness** для prompt-регрессий — не заблокирован (seedable RNG готов), но не приоритет до реальной выдачи

> **Learner Model** (ядро, ✅ verified, pure TS в `packages/learner-model`):
> - Layer 3 — Knowledge Graph (`Concept` + `ConceptEdge`)
> - Layer 2 — BKT+ (IRT 2PL-augmented, per-user p_learn, exp forgetting)
> - Layer 1 — FSRS через **ts-fsrs 5.4.1** (fuzz off, `Grade` type)
> - Event sourcing через `LearnerEvent` (append-only, ITEM_ATTEMPTED | LEARNER_BOOTSTRAPPED)
> - Selection Policy — Thompson Sampling (concept-level, Bernoulli active), prereq gating, seedable RNG
> - Diagnostic v2 bootstrap (θ per axis → pKnown mapping)

## Real-time (lessons) — MVP-2, ничего не внедрено
- 🟡 **LiveKit / Daily.co** (video) — не выбрано
- 🟡 **Yjs + y-websocket** (collaborative whiteboard)
- 🟡 **Socket.io** (chat, presence)

## Infra
- ✅ **Vercel** (`apps/web` only) — ⚠️ deploy ещё НЕ запускался; landing отдельно не настроен
- ✅ **Neon** (Postgres) — `main` = production, `development` = dev branch; миграции вручную из local через `DIRECT_URL`
- ⚪ **Upstash (Redis)** — при подключении Redis
- 🟡 **Cloudflare R2** (audio, materials) — план (связано с open question #2: listening audio source)
- 🟡 **Resend** (email) — план
- 🟡 **Stripe** (payments) — MVP-3, не тронуто

## Monitoring
- 🟡 **Sentry** — scoped in для MVP-1 deploy, ещё не активен в проде
- ⚪ **PostHog** (analytics + feature flags) — deferred до MVP-1 шаг 4
- 🟡 **Axiom / Better Stack** (logs) — не выбрано

## Dev
- ✅ **pnpm 10** (workspaces + catalogs) — monorepo: `apps/{web,landing}`, `packages/{db,ai,ui,config,learner-model}`
- ✅ **Turborepo 2.10**
- ✅ **Node 22 LTS** (локально v22.23.1; `engines >=22.0.0`)
- ✅ **Biome 2.5** (lint + format)
- ✅ **Vitest 4.1.9** + **Playwright 1.61** + **fast-check 3.23.2** (property-based) — 211/211 tests passing
- ⚪ **GitHub Actions** (CI) — НЕ проверен, не настроен
- **Repo:** `IvanSytnik/english-learn`