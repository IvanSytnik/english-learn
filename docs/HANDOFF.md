# EnglishLearn — Handoff

**Last updated:** 2026-10-12
**Status:** MVP-1 шаг 1 (deploy) закрыт 2026-10-11. **2026-10-12 — гигиена + auth hardening:** Tailwind в `packages/ui`, CI (runner pin, actions на Node 24, Playwright-артефакт), чистка истории (AI-трейлер, фрагмент Neon-хоста), RBAC переделан (`requireRole`/`authorizeAction`, proxy реально гейтит сессию, 404 на `/admin/*` для не-админов), локаль и `callbackUrl` сохраняются через логин/регистрацию/логаут, неверный пароль → локализованная ошибка вместо error page. Прод живой: `english-learn-web-two.vercel.app`.
Typecheck 5/5, **404/404 unit tests** (learner-model 158 · web 199 · db 44 · ui 3), **e2e 38/38** (последний полный прогон 2026-10-12).
**Next:** см. §9 «Дальше».

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
├── app/[locale]/admin/{users,content/*}      # ← реальный сегмент admin/; каждая page/layout → requireRole('ADMIN')
├── app/[locale]/not-found.tsx                # локализованный 404 (сюда же падает /admin/* для не-админов)
├── app/api/health/route.ts                   # SELECT 1 → 200 {status,db,latencyMs} | 503
├── lib/env.ts                                # Zod-валидация env, импортируется из next.config.ts
├── lib/authz.ts                              # requireRole (pages/layouts → notFound) · authorizeAction (actions → Result)
├── lib/access.ts                             # чистый resolveAccess(): гейт сессии для proxy, splitLocale/hasLocalePrefix
├── lib/safe-redirect.ts · post-auth-redirect.ts · auth-redirect.ts   # callbackUrl: валидация → цель → redirect
├── proxy.ts                                  # гейт сессии (resolveAccess) → next-intl; ролей НЕ проверяет
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
pnpm test        # 404/404 (если «0 passed» — turbo run test --force)
pnpm typecheck   # 5/5
pnpm --filter @englishlearn/web test:e2e   # 38/38, нужен dev-сервер + БД с seed-юзерами

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

### Гигиена + auth hardening (2026-10-12)
62. Tailwind 4 не сканирует workspace-пакеты → классы из `packages/ui` пропадали; нужен `@source` в `apps/web/app/globals.css`
63. Tailwind сканирует и тестовые файлы — никогда не писать имена utility-классов в тестах (сгенерирует CSS и замаскирует регресс)
64. Playwright-репортёр `github` не пишет файлов; `upload-artifact` по умолчанию `if-no-files-found: warn` → артефакт молча не загружается
65. **CI зелёный ≠ задеплоено:** Vercel может молча пропустить push. После каждого push проверять, что у коммита 3/3 (CI×2 + Vercel) или `vercel ls`; прод-смоук начинать с маркера нового кода
66. `vercel deploy` из `apps/web` падает из-за `rootDirectory` → ручной деплой через дашборд: Deployments → ⋯ → Create Deployment
67. Редирект из server action рендерится внутренним `fetch` с cookies запроса (`NEXT_LOCALE`) → next-intl редиректит этот fetch → контент ru при URL без префикса. Лечение: редиректить только на локализованный путь + синхронизировать `NEXT_LOCALE` (`lib/auth-redirect.ts`)
68. `signIn('credentials', …)` бросает `CredentialsSignin` даже с `redirect: false` → ловить `AuthError`, иначе пользователь видит «This page couldn’t load»
69. Если в `proxy.ts` в `auth()` передан handler, Auth.js **игнорирует** `false` из `authorized` → RBAC в proxy не работал ни дня, а тесты чистой функции были зелёными. Решение доступа теперь в `lib/access.ts`, proxy возвращает redirect сам
70. Старый matcher `/((?!api|_next|_vercel|.*\\..*).*)` пропускал мимо proxy **любой** путь с точкой (`/ru/exercises/jane.doe`) → обход гейта. Сейчас исключаются только реальные расширения статики (регистр важен)
71. `[locale]` принимает любой сегмент: `/robots.txt`, `/favicon.ico` отдают 200 с HTML лендинга (открыто, см. §10)
72. e2e против `next dev` флакает (компиляция маршрутов по требованию, в т.ч. внутри server action) → `AFTER_SUBMIT` 15 с в `tests/e2e/helpers/auth.ts`; правильное решение — e2e на `next build && next start` (§10)
73. Переписывание истории: локальные ветки держат старые объекты → удалить ветки, `git reflog expire --expire=now --all`, `git gc --prune=now`
74. zsh: никаких inline `# комментариев` во вставляемых командах

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
- `new PrismaClient` — только в `packages/db/src/create-client.ts`
- **NEW (2026-10-12):** каждая `page`/`layout` под `admin/` и `tutor/` вызывает `requireRole(...)`; каждая server action там вызывает `authorizeAction(...)`. Layout и proxy server actions НЕ защищают. Энфорсит guard-тест `tests/unit/authz-guard.test.ts` (заменяет правило «сама проверяет `auth()` + роль»)
- **NEW:** не-админы (включая гостей) получают **404** на `/admin/*` — существование раздела скрыто; proxy `/admin/*` не трогает
- **NEW:** proxy только гейтит сессию: гость в student-зоне / `/tutor/*` → `/{locale}/login?callbackUrl=<относительный путь>`; залогиненный на `/login`/`/register` → `/{locale}/dashboard`. Ролей в proxy нет
- **NEW:** `callbackUrl` потребляется только через `isSafeCallbackPath` + `resolvePostAuthRedirect`
- **NEW:** локаль в URL — источник истины; редиректы только через `@/i18n/navigation` (guard-тест `navigation-guard.test.ts` запрещает `redirect`/`permanentRedirect` из `next/navigation` под `app/[locale]/**`)
- **NEW:** server actions возвращают `Result<T, E>`; `AuthError` ловится; одна общая ошибка логина для «нет такого email» и «неверный пароль» (без перечисления аккаунтов)

### Решения 2026-10-12 (auth)
- **1.в** — неверная роль → 404 (`notFound()`), не редирект и не 403
- **2.а** — `callbackUrl` только относительные пути того же origin
- **3.а** — устаревшая роль в JWT (роль кладётся в токен только при логине) пока принимается; TODO на будущее
- Вариант A для локали: путь без префикса + cookie `NEXT_LOCALE=ru` → 307 на `/ru/...` (дефолт next-intl), а не «всегда en»

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
  - Прод smoke: health ok (fra1, warm ~5 мс), 4 локали 200, `/admin/users` → 307 с сохранением локали, регистрация + логин → dashboard ✅ (307 давал guard в layout, не proxy — см. грабли 69)
- **2026-10-12 — гигиена + auth hardening** (см. лог сессии в конце)
  - `263d654` Tailwind `@source` для `packages/ui` · `d1d9c38` e2e-guard стилей · `862ae6c` runner `ubuntu-24.04` + actions на Node 24 · `24d99fe` Playwright html-отчёт и трейсы в артефактах
  - `2ee439b` `requireRole`/`authorizeAction` + guard-тест + локализованный 404 · `d625d6b` proxy гейтит сессию, `callbackUrl`, узкий matcher · `07db173` локаль и `callbackUrl` через логин/регистрацию/логаут, ошибка логина, guard против `next/navigation`

### ➡️ Дальше (по порядку)
1. **Ошибки регистрации** — `useActionState` в register-форме («Email already in use» и т.п.) + e2e регистрации с уникальным email против Neon development
2. **Хвосты auth/i18n из §10:** нормализация `//`, `/admin` → `/admin/users`, `hasLocale` → `notFound` в `[locale]/layout`, `app/robots.ts` + favicon, тайминг логина, `StudentProfile` при регистрации
3. **Дизайн-решения** (§8 #5, всё ещё открыты) — 3 вопроса из сессии 2026-09-24
4. **MVP-1 шаг 2: Adaptive exercise UI** поверх `selectNext` — `apps/web` впервые получает зависимость `@englishlearn/learner-model`; `exercises/page.tsx` и `diagnostic/page.tsx` из заглушек → реальные; заодно integration-тест bootstrap→selection (грабля 37) и решение #4
5. Progress dashboard с семантическими CEFR-уровнями
6. Сквозной флоу Guest → registration (+`StudentProfile`) → diagnostic → exercises
7. Расширить контент-пул (60/15 исчерпается быстро)

### ⏸️ Отложено
- AI Tutor context builder (блок #1), eval harness — после MVP-1
- **E-reader** (сессия 2026-09-18: Phase 1–3 оценены, 3 вопроса без ответа) — после MVP-1, сначала основной цикл
- Payments, Tutoring Platform — MVP-2+ (Vercel Hobby → Pro до монетизации)

---

## 10. TODO (техдолг)

### Auth / UX
- [ ] Ошибки регистрации: `register/page.tsx` `as unknown as` → `useActionState` («Email already in use» и т.п.) + e2e регистрации с уникальным email против Neon development
- [ ] Нормализация пути `//` (`/ru//exercises` проходит мимо гейта proxy) — канонизировать до `resolveAccess`; `/admin` (индекс) → `/admin/users`, `/admin/content` → `/admin/content/vocab`
- [ ] `hasLocale` → `notFound()` в `[locale]/layout.tsx` (грабли 71); `app/robots.ts`; favicon
- [ ] `StudentProfile` не создаётся при регистрации; заглушка `/exercises` — в i18n и без жаргона
- [ ] Тайминг-перечисление аккаунтов на логине: для неизвестного email нет `bcrypt.compare` → ответ быстрее; фиктивное сравнение
- [ ] Admin UI только на английском — решить: задокументированное исключение или i18n
- [ ] Dashboard: CTA по состоянию (до/после `LEARNER_BOOTSTRAPPED`)
- [ ] Устаревшая роль в JWT (решение 3.а) — вернуться, когда появится смена ролей

### Тесты / CI
- [ ] CI e2e на `next build && next start` вместо `next dev` (грабли 72)
- [ ] Флак: `protected-routes › no redirect loop from /` (664 мс, один раз; текст ошибки не сохранён — при повторе снять trace)
- [ ] Выяснить, почему Vercel пропустил push `d625d6b` (грабли 65)
- [ ] `ubuntu-24.04` → `26.04` позже (сейчас pin)
- [ ] commit-msg hook, вырезающий AI-трейлеры, — локальный (`.git/hooks`), переустанавливать на новых клонах

### Infra / DB
- [ ] Preview env: `DATABASE_URL` для Preview (Neon development); разделить `DIRECT_URL` Prod/Preview
- [ ] `enableChannelBinding: true` в `create-client.ts` + повторный smoke
- [ ] `sslmode=verify-full` явно в Vercel `DATABASE_URL` (до pg v9)
- [ ] Health: разделить liveness (без БД) и readiness (с БД, за токеном); вернуть `HEALTH_TOKEN`
- [ ] Пути `COUNT(*)` / `dueAt` через adapter-pg на реальных данных — проверятся с exercise UI
- [ ] Если в логах «too many connections» — `max: 1–3` для pool в фабрике
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
- [ ] Ротация пароля Neon (фрагменты хостов из истории вычищены 2026-10-12)
- [ ] Удалить из индекса `.bak`, `.patch`, `conspet_block.prisma` (перепроверить, что ещё отслеживаются)

### Закрыто 2026-10-12
- [x] Tailwind не видел классы `packages/ui` → `@source` (`263d654`) + e2e-guard стилей (`d1d9c38`)
- [x] GitHub Actions: runner `ubuntu-24.04` + actions на Node 24 (`862ae6c`)
- [x] CI: Playwright html-отчёт и трейсы загружаются в артефакты (`24d99fe`)
- [x] `AUTH_TRUST_HOST` удалён из Vercel env
- [x] История: фрагмент Neon-хоста в старых HANDOFF-файлах заменён, AI-трейлер убран из коммита от 2026-08-08 (хэши переписаны)
- [x] HANDOFF-файлы с пробелами/скобками → `docs/HANDOFF.md` (`301f835`, закоммичено 2026-10-11)
- [x] RBAC: proxy реально гейтит сессию; `requireRole` в каждой admin page/layout; не-админ на `/admin/*` → 404; `/admin/users` под студентом проверен e2e (`2ee439b`, `d625d6b`)
- [x] Локаль после логина: `/ru/login` → `/ru/dashboard`; `callbackUrl` сохраняется; логаут → `/{locale}` (`07db173`)
- [x] Неверный пароль → локализованная ошибка вместо «This page couldn’t load» (`07db173`)

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
1. **Ревизия** (Claude Code, read-only): после последнего коммита от 2026-09-04 (сейчас `cb21404 docs: rewrite README`; хэш изменился при переписывании истории 2026-10-12) коммитов нет, но 5 недель работы лежали незакоммиченными; CI красный с 2026-08-30 (P1012 `DIRECT_URL`); learner-model не подключён к `apps/web`
2. **9 коммитов** рабочего дерева с поштучным ревью. Аудит server actions: в админке actions нет → новый инвариант
3. **CI:** `DIRECT_URL` + `db push` → `migrate deploy`. Цепочка миграций проверена с нуля на `postgres:16`
4. **Git → HTTPS через `gh`** (пароль от SSH-ключа утерян). **Vercel CLI** установлен, проект прояснён: один проект, `web-two` = алиас; найдено: Node 24, регион iad1, `DATABASE_URL` только в Production, корневой `vercel.json` не читался
5. **Push #1** → health 503: `engine not found` (тот же блокер, что в августе)
6. **Prisma → adapter-pg + `engineType client`** (отказ от adapter-neon, см. §7). Трасса 43,66 → 8,42 МБ. **Push #2** → health 503: ENOENT `query_compiler_bg.wasm` по пути `apps/web/src/generated/client` → найден настоящий корень (грабля 38)
7. Воспроизведено локально через `vercel build` + чек-скрипт (FAIL с прод-путём) → **генератор `prisma-client`** (wasm как base64-модуль) + `outputFileTracingExcludes` + engines в `apps/web` + `check:bundle`. Локально PASS + `next start` health 200
8. **Push #3** → CI зелёный, health `ok` (fra1, ~5 мс warm), регистрация + логин → dashboard ✅

### Лог сессии 2026-10-12
1. **Гигиена:** Tailwind `@source` для `packages/ui` + e2e-guard стилей; CI — pin `ubuntu-24.04`, actions на Node 24, Playwright html-отчёт/трейсы в артефактах; `AUTH_TRUST_HOST` удалён из Vercel; история переписана (AI-трейлер, фрагмент Neon-хоста) → хэши всех коммитов начиная с 2026-08-08 сменились
2. **Аудит RBAC/locale** (Claude Code, read-only): RBAC в proxy не работал вовсе (грабли 69), matcher пропускал пути с точкой (грабли 70), единственный барьер — layout; потеря локали после логина объяснена внутренним fetch server action (грабли 67)
3. **3 коммита с поштучным ревью и паузой на «ok»:** `requireRole`/`authorizeAction` + guard-тест + локализованный 404 → proxy гейтит сессию (`resolveAccess`, `isSafeCallbackPath`, узкий matcher) → локаль и `callbackUrl` через логин/регистрацию/логаут, ошибка логина, guard против `next/navigation`. Каждый гейт доказан «сломать → тест падает → вернуть → проходит»
4. **Push:** Vercel молча пропустил деплой `d625d6b` (грабли 65) — причина не выяснена (§10)
