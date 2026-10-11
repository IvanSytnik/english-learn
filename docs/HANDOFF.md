# EnglishLearn — Handoff

**Last updated:** 2026-10-11
**Status:** MVP-1 **шаг 1 (deploy) ЗАКРЫТ.** Прод живой: `english-learn-web-two.vercel.app` → health `{"status":"ok","db":"up"}`, регистрация + логин → dashboard работают, RBAC в проде подтверждён. Prisma переведена на Rust-free (`prisma-client` generator + `engineType="client"` + `@prisma/adapter-pg`). CI зелёный впервые с 2026-08-30 (lint/typecheck/unit/build + e2e, `migrate deploy` на чистом `postgres:16`).
Typecheck 5/5, **220/220 tests** (learner-model 158 · db 44 · web 15 · ui 3).
**Next:** короткая гигиена (Preview env, docs-коммит, мелкие auth-TODO) → **MVP-1 шаг 2: adaptive exercise UI** (перед ним — 3 дизайн-решения, см. §9).

> Документ — единый источник правды. Заменяет HANDOFF (10) и (11) — их убрать из Project knowledge.
> Правило доверия: если что-то заявлено «работает» — попроси Ivan проверить запуск перед опорой на это.

---

## 1. Что за проект

EnglishLearn — веб-платформа для изучения английского: CEFR-контент, AI-тьюторы, marketplace преподавателей, мультиязычность (EN/RU/UK/DE). Ivan — технический co-founder и единственный разработчик. **Pre-launch:** реальных пользователей нет, AI Tutor не построен, контент демо-масштаба (60 items / 15 concepts).

Ядро — **3-слойная Learner State Model** (всё реализовано и протестировано, **но НЕ подключено к UI**):
- Layer 3 — Knowledge Graph (`Concept` + `ConceptEdge`) ✅
- Layer 2 — BKT+ (IRT 2PL-augmented, per-user p_learn, exp forgetting) ✅
- Layer 1 — FSRS (через `ts-fsrs`) ✅
- Event sourcing (`LearnerEvent` + service layer) ✅
- Selection Policy — Thompson Sampling ✅
- Diagnostic v2 bootstrap (`LEARNER_BOOTSTRAPPED`) ✅

---

## 2. Стек

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16.2.9 + React 19.2.7 | `proxy.ts` вместо `middleware.ts`; `typedRoutes` в корне `next.config.ts` |
| Language | TypeScript 6.0.3 | `moduleResolution: "Bundler"` — БЕЗ `.js` суффиксов в value-импортах; в `paths` НЕТ `baseUrl` |
| DB/ORM | **Prisma 6.16.2, Rust-free** | generator `provider = "prisma-client"`, `engineType = "client"`, `moduleFormat = "esm"`; `@prisma/adapter-pg@6.16.2` + `pg`. Query compiler = wasm, инлайнится как base64-модуль. Prisma 7 по-прежнему не трогаем |
| Database | Neon Postgres (eu-central-1) | ветки `production` + `development`; локальные `.env` (`apps/web`, `packages/db`) → **development** |
| Auth | next-auth 5.0.0-beta.31 | JWT, Credentials + `@auth/prisma-adapter` |
| i18n UI | next-intl 4.13 | `app/[locale]/...`, `localePrefix: 'as-needed'` |
| i18n content | hybrid JSON + Zod | `content Json` + `LocalizedString` (EN required, fallback) |
| Styling | Tailwind 4.3.1 | functional bootstrap, не финальный дизайн |
| State/Forms | TanStack Query 5, Zustand 5, RHF 7.80 + Zod 4.4 | |
| Testing | Vitest 4.1.9, Playwright 1.61, fast-check 3.23.2 | |
| Spaced repetition | **ts-fsrs 5.2.3** | (не 5.4.1, как писали раньше) единственный импортёр — `learner-model/src/core/fsrs/wrapper.ts` |
| Tooling | Biome 2.5, Turborepo 2.10, pnpm 10 (catalogs), **Node 22** | `engines: 22.x` в корне И в `apps/web/package.json` (Vercel читает второй) |
| Hosting | Vercel Hobby, проект `english-learn-web` | Root Directory `apps/web`, `regions: ["fra1"]`, runtime nodejs22.x, `ignoreCommand: npx turbo-ignore@2.10.0` |
| CI | GitHub Actions | `postgres:16` service container, `prisma migrate deploy` (не `db push`), `SKIP_ENV_VALIDATION=1` |
| AI | Anthropic Claude + OpenAI fallback | **Не подключено** |

---

## 3. Структура

```
apps/web/
├── app/[locale]/(auth)/{login,register}      # register/actions.ts → registerUser (public)
├── app/[locale]/(student)/{dashboard,diagnostic,exercises}   # diagnostic + exercises = STUB
├── app/[locale]/admin/{users,content/*}      # ← реальный сегмент admin/ (было route group (admin))
├── app/api/health/route.ts                   # SELECT 1 → 200 {status,db,latencyMs} | 503
├── lib/env.ts                                # Zod-валидация env, импортируется из next.config.ts
├── proxy.ts                                  # RBAC: stripLocale() → проверки /admin, /tutor, public paths
├── scripts/check-vercel-bundle.ts            # pnpm check:bundle — проверка упаковки Prisma в функции
├── vercel.json                               # перенесён сюда из корня (корневой Vercel не читал)
└── PRODUCT.md                                # контекст для дизайн-тулинга, честный pre-launch статус

packages/db/
├── prisma/schema.prisma                      # generator prisma-client, engineType client
├── src/create-client.ts                      # ЕДИНСТВЕННОЕ место `new PrismaClient` (adapter-pg)
├── src/client.ts                             # Next-синглтон (server-only) → createPrismaClient
├── src/generated/client/                     # gitignored
└── scripts/prod-cleanup.ts

packages/learner-model/src/
├── core/{graph,bkt,fsrs}/   adapters/   policy/   diagnostic/
├── service/{db-port,prisma-db,event-store,apply,learner-service,selection-service,bootstrap-service,replay}.ts
└── seed/                                     # seed:concepts / seed:items через фабрику, --env-file-if-exists=../db/.env
```

Экспорт фабрики: `@englishlearn/db/create-client`. `grep "new PrismaClient"` вне `create-client.ts` = 0.

---

## 4. Schemas + Data в Neon

Без изменений схемы с 2026-08-02 (миграция `20260711_diagnostic_v2_bootstrap` — последняя).
- Auth: `User`(+role STUDENT/TUTOR/ADMIN), `Account`, `Session`, `VerificationToken`
- `StudentProfile` (**при регистрации НЕ создаётся** — TODO), `SkillTag`, `SkillLevel`
- `Vocab/Grammar/ListeningExercise` (+Attempts) — lifecycle DRAFT→REVIEW→PUBLISHED→ARCHIVED→REJECTED
- `DiagnosticItem` (+irtDiscrimination/irtDifficulty) + `DiagnosticAttempt` + `DiagnosticAnswer`
- `Concept`(15) + `ConceptEdge`(10) + `ConceptMastery`
- `Item`(60, все PUBLISHED) + `ItemReviewState`
- `LearnerEvent` — `ITEM_ATTEMPTED | LEARNER_BOOTSTRAPPED`

Прод-БД: контент есть, в августе вычищена от юзеров (`prod-cleanup.ts`); 2026-10-11 зарегистрирован один тестовый юзер (smoke).
Цепочка миграций **проверена с нуля** на `postgres:16` в CI (`migrate deploy`).

Seed users (dev/CI): `admin@englishlearn.dev` / `admin1234`, `student@englishlearn.dev` / `student1234`

---

## 5. Команды

```bash
pnpm install
pnpm --filter @englishlearn/db generate
pnpm db:seed
pnpm --filter @englishlearn/learner-model seed:concepts
pnpm --filter @englishlearn/learner-model seed:items
pnpm dev
pnpm test        # 220/220
pnpm typecheck   # 5/5

# Миграции: migrate deploy/status и db execute берут DIRECT_URL из datasource сами.
# migrate diff --from-url — исключение, direct URL передаётся явно:
cd packages/db
pnpm exec prisma migrate diff --from-url "$DIRECT_DB_URL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<name>/migration.sql
head -3 prisma/migrations/<name>/migration.sql
pnpm exec prisma migrate deploy

# Проверка упаковки Vercel ПЕРЕД push (обязательно при любых изменениях Prisma / next.config / зависимостей db):
cd apps/web
vercel pull --yes --environment=production     # секреты → apps/web/.vercel/ (gitignored)
SKIP_ENV_VALIDATION=1 vercel build --prod --yes
pnpm check:bundle                               # PASS для register и api/health

# Деплой и наблюдение
git push                                        # remote = HTTPS через gh (SSH-ключ недоступен)
gh run watch $(gh run list --limit 1 --json databaseId -q '.[0].databaseId')
vercel ls english-learn-web | head -3
curl -s https://english-learn-web-two.vercel.app/api/health
vercel logs <deployment-url> --json | python3 -c '...'   # grep на macOS ломается на длинных строках
```

---

## 6. ⚠️ Грабли (кумулятивно)

### Bootstrap (MVP-0)
1. Prisma 7 ломает `datasource.url` — оставаться на 6.16.2
2. `packages/db/.env` обязателен — Prisma CLI не читает env соседних пакетов
3. `bcryptjs` в `dependencies` `packages/db`
4. Проект НЕ в `~/Downloads/` — Vitest подхватывает чужие конфиги
5. `.js` суффиксы в relative value-импортах ломают Turbopack (`import type` — безопасно, стирается)
6. `localePrefix: 'as-needed'` требует `app/[locale]/`
7. `typedRoutes` — в корне `next.config.ts`

### Knowledge Graph / TS config
8. `library.json` задаёт `rootDir` — каждый пакет переопределяет `"rootDir": "."`
9. `baseUrl` deprecated в TS 6 — убран
10. `@types/node` обязателен в Node-пакетах
11. `server-only` в `db/client.ts` блокирует CLI — сиды/скрипты идут через `create-client.ts`, не через `client.ts`
12. `db` exports должен включать `"./generated/*"` (+ теперь `"./create-client"`)
13. `server-only` type-stub в learner-model
14. Neon без shadow DB — `migrate diff` + `migrate resolve --applied`
15. `migration_lock.toml` обязателен
17. `packages/db/src/generated/` в `.gitignore`

### BKT+
18. `pnpm db:generate` НЕ существует — `pnpm --filter @englishlearn/db generate`
19. `migrate deploy` сам регенерирует client
20. `prisma db execute` НЕ показывает SELECT — для чтения node-скрипт
21. `migrate diff --from-url` требует пары `--to-...`
22. fast-check twin-float guard: `< 1e-9` + `toBeLessThanOrEqual`
23. `apps/web` через turbo иногда «0 passed» — кеш-флак, `turbo --force`

### i18n content
24. Neon pooler silent-fail на DDL — ✅ MITIGATED через `directUrl`
25. `migrate diff` через pooler = стейл schema → `--from-url "$DIRECT_DB_URL"`
26. Self-import по имени пакета не работает внутри `db`
28. `ADD COLUMN ... NOT NULL` падает на existing rows

### Item + FSRS
29. `ts-fsrs` `scheduler.next()` принимает `Grade`, не `Rating`
30. Prisma enum канонический, Zod-двойник = `XxxValue`/`XxxSchema`
31. Зелёные тесты ≠ зелёный `tsc` (Vitest не тайпчекает)

### Event sourcing
32. `pnpm --filter <pkg> exec prisma ... > file` на Node < 22 льёт WARN в stdout
33. Упавший `migrate deploy` оставляет advisory lock → `pg_terminate_backend` / Neon restart
34. `page[page.length-1]` под `noUncheckedIndexedAccess` → `page.at(-1)` + guard

### Selection Policy
35. `Math.random` запрещён в policy-коде — только инъектируемый seedable `Rng`
36. ✅ RESOLVED — seed-items уже PUBLISHED

### Diagnostic v2
37. Зелёные тесты bootstrap и selection по отдельности НЕ доказывают, что bootstrap долетает до `selectNext` — нужен integration-тест (см. §8 #4)

### Deploy (2026-08-31 — 2026-10-11)
38. **Бандлинг Prisma-клиента с кастомным `output` в монорепо:** Turbopack теряет `__dirname`, клиент ищет свои файлы в `process.cwd() + "src/generated/client"` → на Vercel `cwd = apps/web` → `/var/task/apps/web/src/generated/client/...` → ENOENT. Это настоящая причина и августовского «engine not found» (`.so`), и октябрьского (`.wasm`). Локально НЕ воспроизводится — fallback находит `packages/db/...`. Лечение: генератор `prisma-client` (wasm инлайнится как base64-модуль, путей к файлам нет)
39. `driverAdapters` сам по себе НЕ убирает Rust engine — нужен `engineType = "client"`
40. `@prisma/adapter-neon` не работает с обычным Postgres (CI-контейнер) — поэтому `adapter-pg` везде
41. Локальная NFT-трасса ≠ содержимое Vercel-функции. Проверять только `vercel build` + `pnpm check:bundle`
42. Трасса `@prisma/client/runtime` тянет wasm ВСЕХ СУБД (~57 МБ) → `outputFileTracingExcludes` (query_engine_bg.* + не-postgres компиляторы). Итог register: 11,2 МБ
43. Turbopack выносит `@prisma/client` в externals под хеш-алиасом (`@prisma/client-<hash>`, симлинк в `.next/node_modules`) — проверка бандла должна проверять и симлинк, и цель
44. Генератор `prisma-client` НЕ грузит `.env` сам → скрипты сидов: `tsx --env-file-if-exists=...`
45. `declaration: true` на сгенерированных файлах нового генератора → TS4094 (`@ts-nocheck` не глушит) → в `packages/db` декларации выключены (пакет `noEmit`)
46. `@auth/prisma-adapter` автоматически ставит Prisma **7.x** как peer, если `apps/web` не объявляет `@prisma/client`/`prisma` → оба `catalog:` в `apps/web`
47. При Root Directory = `apps/web` Vercel читает `apps/web/package.json#engines`, а НЕ корневой; корневой `vercel.json` тоже не читается
48. Без `regions` Vercel исполняет функции в `iad1` (США) при Neon во Франкфурте — проверять `x-vercel-id` (`fra1::fra1` = ок)
49. Turbo strict env: переменная из Vercel, которой нет в `turbo.json`, не доходит до build (предупреждение про `AUTH_TRUST_HOST`)
50. `pg` игнорирует `channel_binding=require` из URL (нужна опция `enableChannelBinding`); `sslmode=require` сейчас = `verify-full`, в pg v9 ослабнет
51. `/api/health` будит Neon на каждый вызов — НЕ вешать на него uptime-монитор (сожжёт compute-часы)
52. Первый запрос после сна Neon ~2 с (`connect_timeout=15` в URL обязателен), тёплый — ~5 мс
53. `vercel link` создаёт `apps/web/.gitignore` и `apps/web/.env.local` с `VERCEL_OIDC_TOKEN` — корневой `.gitignore` уже покрывает, лишний файл удалить
54. `gh run watch` сразу после push — «no runs», вебхук ещё не дошёл; ждать ~20 с
55. Откаченный Vercel-деплой не виден в Runtime Logs — сверять commit hash в Overview
56. NFT-предупреждение «whole project traced» — шум (от fallback-логики Prisma), реальная метрика — размер функции
57. Disk ENOSPC молча блокирует запись файлов — `ls` перед доверием выводу тулинга
58. `tsc --noEmit` зелёный бессмысленен, если файл вне `include` (`scripts/`)
59. Inline env с `\` + перенос строки ломает присваивание — команда одной строкой
60. `ignoreCommand` скипает docs-only коммиты → деплой «Canceled» за 5 с, прод крутит старую сборку
61. Работа, не закоммиченная 5 недель, — главный риск сессии 2026-10-11. Коммитить в конце каждой сессии, даже WIP

---

## 7. Архитектурные решения (зафиксировано)

### Learner Model / Event sourcing / Selection / Diagnostic v2
Без изменений относительно HANDOFF (11): 3-layer, pure cores, одна транзакция на `recordOutcome`, replay = full rebuild, concept-level Thompson (Bernoulli за calibration-gate 500), prereq hard-gate 0.7, informative IRT prior, seedable RNG, `LEARNER_BOOTSTRAPPED` как единственный путь bootstrap-записи (formula v1: floor 0.15 / ceiling 0.60).

### Инварианты
- Никаких прямых UPDATE на mastery/review — только через `LearnerEvent`
- `Math.random` запрещён в policy
- Selection stateless, не событие
- AI-контент только через DRAFT → REVIEW → PUBLISHED
- BKT-числа ученику не показываем — только семантические уровни
- **NEW:** каждая server action под `admin/` / `tutor/` делает собственную проверку `auth()` + роль. Layout и proxy server actions НЕ защищают (сейчас в админке actions нет — правило сработает с CRUD контента)
- **NEW:** `new PrismaClient` — только в `packages/db/src/create-client.ts`

### Prisma runtime (2026-10-11) — заменяет августовский Option A
- Rust-free: `prisma-client` generator + `engineType = "client"` + `@prisma/adapter-pg` везде (Vercel, local, CI, seeds). Отвергнуто: `adapter-neon` (оставляет Rust engine без `engineType client`, не работает с CI-контейнером); копирование `.so`/`.wasm` по fallback-пути (хрупко)
- Runtime — pooled `DATABASE_URL`; CLI — `DIRECT_URL` через `datasource.directUrl`
- Проверено: интерактивные транзакции (один txid, откат с пробросом), `$queryRaw` (int8 → bigint), `runInTx`, `getCandidateItems` — на Neon development
- Бонус: это модель Prisma 7, будущая миграция проще

### Deploy / CI (2026-10-11)
- Один Vercel-проект `english-learn-web`; `english-learn-web-two.vercel.app` = production-алиас
- CI: одноразовый `postgres:16` + `migrate deploy` (проверяет цепочку миграций с нуля), НЕ Neon
- `check:bundle` — обязательный pre-push gate для изменений, затрагивающих упаковку функций
- `lib/env.ts` валидирует env при сборке (CI: `SKIP_ENV_VALIDATION=1`)

---

## 8. 🔴 Открытые вопросы

| # | Вопрос | Блокирует | Приоритет |
|---|---|---|---|
| 1 | AI provider strategy wiring (Claude + OpenAI fallback) | AI Tutor, AI-generation | 🟡 → MVP-2 |
| 2 | Listening audio (TTS vs open-source datasets) | Listening exercises; решить до загрузки аудио в R2 | 🟡 |
| 3 | DiagnosticItem polymorphic vs 3 таблицы | отложен (YAGNI) | 🟢 |
| 4 | Bootstrap → bandit: `betaParamsForConcept` не читает mastery; ceiling 0.6 < prereqThreshold 0.7 (z≈-0.02 при N=2000) | «умный» старт selection | 🟡 → MVP-1, вместе с exercise UI |
| 5 | **NEW** Дизайн-направление (A Clinical Paper / B Coach's Chart / C Field Instrument; рекомендация B + C для exercise-экранов), первый экран, архитектура токенов. Fraunces/Newsreader/Archivo без кириллицы | MVP-1 шаг 2 (UI) | 🔴 до начала UI |
| 6 | **NEW** Preview-окружение: `DATABASE_URL` только в Production; `DIRECT_URL` для Preview, вероятно, = прод | любые не-main ветки → preview-сборка упадёт; риск миграции в прод с preview | 🟡 |

---

## 9. Дорожная карта

### ✅ Сделано
- MVP-0 bootstrap → Day 1-7 (graph, BKT+, FSRS, event sourcing) → Week 2 (Selection Policy) → Diagnostic v2 bootstrap (2026-08-02)
- **2026-10-11 — MVP-1 шаг 1: Deploy**
  - 9 коммитов пятинедельной незакоммиченной работы: RBAC/locale fix (`stripLocale`, реальный сегмент `admin/`, 7 тестов), `/api/health`, env-валидация при сборке, `vercel.json` → `apps/web` (+fra1, turbo-ignore), biome, engines, `.env.example` + `DIRECT_URL`, gitignore тулинга, честный `PRODUCT.md`
  - CI: `DIRECT_URL` + `migrate deploy` → зелёный впервые с 2026-08-30
  - Prisma Rust-free (8 коммитов): adapter-pg, фабрика, удаление tracing-костылей, pin catalog, генератор `prisma-client`, `outputFileTracingExcludes`, engines в `apps/web`, `check:bundle`
  - Прод smoke: health ok (fra1, warm ~5 мс), 4 локали 200, `/admin/users` → 307 с сохранением локали, регистрация + логин → dashboard ✅

### ➡️ Дальше (по порядку)
1. **Гигиена (~1 час):** Preview env (§8 #6), Node 22.x в дашборде (если не сделано), docs-коммит (§10 список), удалить `docs/revision/` и `AUTH_TRUST_HOST` из Vercel
2. **Дизайн-решения** (§8 #5) — 3 вопроса из сессии 2026-09-24
3. **MVP-1 шаг 2: Adaptive exercise UI** поверх `selectNext` — `apps/web` впервые получает зависимость `@englishlearn/learner-model`; `exercises/page.tsx` и `diagnostic/page.tsx` из заглушек → реальные; заодно integration-тест bootstrap→selection (грабля 37) и решение #4
4. Progress dashboard с семантическими CEFR-уровнями
5. Сквозной флоу Guest → registration (+`StudentProfile`) → diagnostic → exercises
6. Расширить контент-пул (60/15 исчерпается быстро)

### ⏸️ Отложено
- AI Tutor context builder (блок #1), eval harness — после MVP-1
- **E-reader** (сессия 2026-09-18: Phase 1–3 оценены, 3 вопроса без ответа) — после MVP-1, сначала основной цикл
- Payments, Tutoring Platform — MVP-2+ (Vercel Hobby → Pro до монетизации)

---

## 10. TODO (техдолг)

### Auth / UX (из смоука 2026-10-11)
- [ ] Редирект после логина теряет префикс локали (`/ru/login` → `/dashboard`, а не `/ru/dashboard`)
- [ ] ❓ Не проверено: `/admin/users` под залогиненным студентом → должен быть редирект
- [ ] Студент на `/admin` → сейчас редирект на `/login`; лучше `/dashboard` или 403
- [ ] Тест на `/ru//admin` (двойной слэш проходит proxy, ловит только layout)
- [ ] `admin/page.tsx` (индекс) → редирект на `/admin/users`; `/admin/content` без индекса → 404
- [ ] `StudentProfile` не создаётся при регистрации
- [ ] Hardcoded UI-строки (напр. `/ru/exercises` — английская заглушка); `register/page.tsx` `as unknown as` → `useActionState`

### Infra / DB
- [ ] Preview env: `DATABASE_URL` для Preview (Neon development); разделить `DIRECT_URL` Prod/Preview
- [ ] `enableChannelBinding: true` в `create-client.ts` + повторный smoke
- [ ] `sslmode=verify-full` явно в Vercel env (до pg v9)
- [ ] `AUTH_TRUST_HOST` — удалить из Vercel env (в коде не используется, turbo его режет)
- [ ] Health: разделить liveness (без БД) и readiness (с БД, за токеном); вернуть `HEALTH_TOKEN`
- [ ] Пути `COUNT(*)` / `dueAt` через adapter-pg на реальных данных — проверятся с exercise UI
- [ ] Если в логах «too many connections» — `max: 1–3` для pool в фабрике
- [ ] GitHub Actions: `actions/checkout`, `setup-node`, `upload-artifact`, `pnpm/action-setup` → версии на Node 24 (Node 20 deprecated); `ubuntu-latest` → Ubuntu 26 с 2026-10-19
- [ ] CI: `apps/web/playwright-report/` не создаётся — артефакт не загружается
- [ ] `package.json#prisma` → `prisma.config.ts` (deprecation)
- [ ] `@types/bcryptjs@3.0.0` deprecated — удалить
- [ ] Проверить `"fast-check": "3.23.2"` в catalog

### Код-качество
- [ ] 82 biome warnings → разобрать, потом поднять до error в CI

### Docs-коммит (устаревшие места)
- [ ] `CLAUDE.md:48`, `:80` — Diagnostic v2 как неприменённая миграция
- [ ] `README.md:172`, `:347` — корневой `vercel.json`, старый `ignoreCommand`
- [ ] `README.md:236` — `DIRECT_URL`: «required for Prisma CLI / migrations, not at runtime»
- [ ] `README.md:239` — `AUTH_TRUST_HOST`
- [ ] README: секции Prisma / deploy — Rust-free, adapter-pg, `check:bundle`; теперь можно упомянуть деплой (регистрация работает)
- [ ] `docs/STACK.md:45` ts-fsrs 5.2.3; `:56` «deploy не запускался»; `:69` `apps/landing` не существует; `:71` engines 22.x; `:73` 220 tests; Prisma-строка
- [ ] Удалить `docs/revision/` (суть перенесена сюда)

### Перед публикацией репо (портфолио)
- [ ] Вычистить фрагменты Neon-хостов из закоммиченных HANDOFF-файлов (история) + ротация пароля Neon
- [ ] Удалить из индекса `.bak`, `.patch`, `conspet_block.prisma` (перепроверить, что ещё отслеживаются)
- [ ] Переименовать HANDOFF-файлы с пробелами/скобками

### Закрыто 2026-10-11
- [x] `directUrl` в datasource — (2026-08-02)
- [x] `DIRECT_URL` в CI
- [x] Prisma engine на Vercel — Rust-free
- [x] Незакоммиченная работа — 9 коммитов
- [x] `smoke-diagnostic-v2.ts` — удалён
- [x] Паразитная Prisma 7.8 — pin catalog
- [x] Регион iad1 → fra1; Node 24 → 22 (runtime)

---

## 11. Принципы (для AI-ассистента в следующем чате)
- **Working language:** русский в чате, английский в коде/docs/UI/commits
- **Стиль:** прямые ответы; 2-3 варианта с trade-offs; архитектурные решения за Ivan, AI рекомендует и аргументирует; спорить, если Ivan неправ
- **Не редактировать файлы автоматически** без явной просьбы
- **Коммиты:** Conventional Commits, английский, **никаких Co-Authored-By / AI-трейлеров**
- В конце сложных ответов — «⚠️ Watch out»
- **Формат фич:** Уточнения → Product view → Architecture → Implementation plan → Risks → DoD
- Clarifying questions с lettered options; Ivan отвечает «1.а 2.б»
- **Доверяй, но проверяй HANDOFF** — и код тоже: сессия 2026-10-11 нашла 5 недель незакоммиченной работы и расхождения docs ↔ репо
- **Claude Code workflow, который сработал:** read-only ревизия → отчёт → коммиты группами с diff + ревью + паузой на «ok» → гипотеза проверяется локально воспроизводимо (`vercel build` + `check:bundle`), только потом push. Не гонять деплои вслепую
- Prisma CLI с Neon: `migrate deploy/status`, `db execute` — `DIRECT_URL` из datasource; `migrate diff --from-url` — явный `$DIRECT_DB_URL`

---

### Лог сессии 2026-10-11
1. **Ревизия** (Claude Code, read-only): после `c7206a9` (2026-09-04) коммитов нет, но 5 недель работы лежали незакоммиченными; CI красный с 2026-08-30 (P1012 `DIRECT_URL`); learner-model не подключён к `apps/web`
2. **9 коммитов** рабочего дерева с поштучным ревью. Аудит server actions: в админке actions нет → новый инвариант
3. **CI:** `DIRECT_URL` + `db push` → `migrate deploy`. Цепочка миграций проверена с нуля на `postgres:16`
4. **Git → HTTPS через `gh`** (пароль от SSH-ключа утерян). **Vercel CLI** установлен, проект прояснён: один проект, `web-two` = алиас; найдено: Node 24, регион iad1, `DATABASE_URL` только в Production, корневой `vercel.json` не читался
5. **Push #1** → health 503: `engine not found` (тот же блокер, что в августе)
6. **Prisma → adapter-pg + `engineType client`** (отказ от adapter-neon, см. §7). Трасса 43,66 → 8,42 МБ. **Push #2** → health 503: ENOENT `query_compiler_bg.wasm` по пути `apps/web/src/generated/client` → найден настоящий корень (грабля 38)
7. Воспроизведено локально через `vercel build` + чек-скрипт (FAIL с прод-путём) → **генератор `prisma-client`** (wasm как base64-модуль) + `outputFileTracingExcludes` + engines в `apps/web` + `check:bundle`. Локально PASS + `next start` health 200
8. **Push #3** → CI зелёный, health `ok` (fra1, ~5 мс warm), регистрация + логин → dashboard ✅
