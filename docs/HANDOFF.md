# EnglishLearn — Handoff

**Last updated:** 2026-10-13
**Status:** MVP-1 шаг 1 (deploy) закрыт 2026-10-11. **2026-10-12 — гигиена + auth hardening:** Tailwind в `packages/ui`, CI (runner pin, actions на Node 24, Playwright-артефакт), чистка истории (AI-трейлер, фрагмент Neon-хоста), RBAC переделан (`requireRole`/`authorizeAction`, proxy реально гейтит сессию, 404 на `/admin/*` для не-админов), локаль и `callbackUrl` сохраняются через логин/регистрацию/логаут, неверный пароль → локализованная ошибка вместо error page. **Вечер 2026-10-12:** ошибки формы регистрации, нормализация `//`, редиректы индексов `/admin`, 404 для не-локалей + `robots.ts` + иконка, заглушка `/exercises` → локализованный следующий шаг. **2026-10-13:** D (`StudentProfile`) закрыт — `nativeLanguage` nullable (миграция применена на dev, CI, prod), профиль создаётся при регистрации + `ensureStudentProfile` на `/diagnostic`. Прод живой: `english-learn-web-two.vercel.app`.
Typecheck 5/5, **416/416 unit tests** (learner-model 158 · web 210 · db 45 · ui 3), **e2e 58/58** (последний полный прогон 2026-10-13, свежий сервер).
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
├── app/[locale]/(auth)/{login,register}      # *-form.tsx (useActionState) + actions.ts → Result (registerUser public)
├── app/[locale]/(student)/{dashboard,diagnostic,exercises}   # diagnostic = STUB; exercises = «скоро» + CTA на диагностику
├── app/[locale]/admin/{users,content/*}      # ← реальный сегмент admin/; каждая page/layout → requireRole('ADMIN'); индексы → редирект
├── app/[locale]/layout.tsx                   # hasLocale → иначе notFound() (/missing.png и т.п. больше не рендерят лендинг)
├── app/[locale]/not-found.tsx                # локализованный 404 (сюда же падает /admin/* для не-админов)
├── app/not-found.tsx                         # реэкспорт [locale]/not-found — ловит notFound() из [locale]/layout
├── app/robots.ts · app/icon.svg              # robots: allow /, disallow /api (без /admin); иконка-заглушка
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

Последняя миграция — `20261013163605_student_profile_native_language_optional` (`nativeLanguage` → `String?`, 2026-10-13).
- Auth: `User`(+role STUDENT/TUTOR/ADMIN), `Account`, `Session`, `VerificationToken`
- `StudentProfile` (создаётся при регистрации; `nativeLanguage String?` — спрашивается в онбординге, см. §7), `SkillTag`, `SkillLevel`
- `Vocab/Grammar/ListeningExercise` (+Attempts) — lifecycle DRAFT→REVIEW→PUBLISHED→ARCHIVED→REJECTED
- `DiagnosticItem` (+irtDiscrimination/irtDifficulty) + `DiagnosticAttempt` + `DiagnosticAnswer`
- `Concept`(15) + `ConceptEdge`(10) + `ConceptMastery`
- `Item`(60, все PUBLISHED) + `ItemReviewState`
- `LearnerEvent` — `ITEM_ATTEMPTED | LEARNER_BOOTSTRAPPED`

Прод-БД: контент есть, в августе вычищена от юзеров (`prod-cleanup.ts`); 3 тестовых юзера (собственные smoke-регистрации Ivan, 2026-10-11..13); профили досоздаются лениво через `/diagnostic`.
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
pnpm test        # 413/413 (если «0 passed» — turbo run test --force)
pnpm typecheck   # 5/5
pnpm --filter @englishlearn/web test:e2e   # 58/58, нужен dev-сервер + БД с seed-юзерами

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
71. ✅ RESOLVED (`76f2fd9`) — `[locale]` принимал любой сегмент: `/robots.txt`, `/favicon.ico`, `/missing.png` отдавали 200 с HTML лендинга (matcher пропускает эти расширения мимо proxy, `i18n/request.ts` молча падал на `en`)
72. e2e против `next dev` флакает (компиляция маршрутов по требованию, в т.ч. внутри server action) → `AFTER_SUBMIT` 15 с в `tests/e2e/helpers/auth.ts`; правильное решение — e2e на `next build && next start` (§10)
73. Переписывание истории: локальные ветки держат старые объекты → удалить ветки, `git reflog expire --expire=now --all`, `git gc --prune=now`
74. zsh: никаких inline `# комментариев` во вставляемых командах

### Вечерняя сессия (2026-10-12)
75. Vercel deployment URL с хешем — неизменяемая сборка конкретного коммита. Прод-смоук — только на production-алиасе `english-learn-web-two.vercel.app`
76. Next сам отвечает 308 на `//` ещё до proxy → ветка нормализации в `proxy.ts` — страховка; доказана unit-тестом (сырой `/ru//dashboard` проходит мимо гейта `resolveAccess`), e2e её не доказывает (проходит и без ветки)
77. `notFound()` в `[locale]/layout.tsx` НЕ ловится `[locale]/not-found.tsx` (тот лежит ниже этого layout) → нужен корневой `app/not-found.tsx`, иначе дефолтная английская 404 Next
78. Клиентский `minLength` на поле блокирует отправку формы → серверное сообщение валидации нельзя ни увидеть, ни протестировать; убирать, если сервер отдаёт локализованную ошибку
79. Пропущенный деплой `c943264` (в Vercel — под старым хэшем `d625d6b`; грабли 65) — единичный потерянный вебхук, не системная проблема. У Vercel GitHub app висит запрос на расширение прав — принять
80. Проверять «хвосты» через `git grep`, не `grep -r` — последний цепляет build-кеши (`.next`, `.turbo`, `node_modules`)

### StudentProfile (2026-10-13)
81. `vercel pull` отдаёт Sensitive env vars как литерал `"[SENSITIVE]"` → прод-миграции идут по direct (не `-pooler`) строке из Neon Console, введённой через `read -rs PROD_DIRECT` отдельной командой, никогда не вставлять inline (`?` в URL — zsh падает с «no matches found», и строка утекает в history)
82. В прод `_prisma_migrations` есть откаченные orphan-строки (`20260705045244_add_learner_event`, `20260706071803_add_learner_event`) от июльских попыток — безвредны, `migrate deploy` их игнорирует; если `migrate status` покажет их как «not found locally» — это ожидаемо
83. Чтение прод-данных: `prisma db execute` не показывает результат SELECT → одноразовый запрос через node + `pg`, запускать из `packages/db` (из корня репо `pg` не резолвится)

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
- **NEW:** не-админы (включая гостей) получают **404** на `/admin/*` — существование раздела скрыто; proxy `/admin/*` не трогает; `robots.ts` `/admin` не упоминает
- **NEW:** proxy только гейтит сессию: гость в student-зоне / `/tutor/*` → `/{locale}/login?callbackUrl=<относительный путь>`; залогиненный на `/login`/`/register` → `/{locale}/dashboard`. Ролей в proxy нет
- **NEW:** `callbackUrl` потребляется только через `isSafeCallbackPath` + `resolvePostAuthRedirect`
- **NEW:** локаль в URL — источник истины; редиректы только через `@/i18n/navigation` (guard-тест `navigation-guard.test.ts` запрещает `redirect`/`permanentRedirect` из `next/navigation` под `app/[locale]/**`)
- **NEW:** server actions возвращают `Result<T, E>`; `AuthError` ловится; одна общая ошибка логина для «нет такого email» и «неверный пароль» (без перечисления аккаунтов)

### Решения 2026-10-12 (auth)
- **1.в** — неверная роль → 404 (`notFound()`), не редирект и не 403
- **2.а** — `callbackUrl` только относительные пути того же origin
- **3.а** — устаревшая роль в JWT (роль кладётся в токен только при логине) пока принимается; TODO на будущее
- Вариант A для локали: путь без префикса + cookie `NEXT_LOCALE=ru` → 307 на `/ru/...` (дефолт next-intl), а не «всегда en»

### Решения 2026-10-12 (вечер)
- **StudentProfile (1.а):** создаётся атомарно при регистрации (nested create в том же `prisma.user.create`, только роль STUDENT) + страховка `ensureStudentProfile(db, userId)` в `packages/db/src/queries/student-profile.ts`: `createMany` + `skipDuplicates` (`INSERT ... ON CONFLICT DO NOTHING`, race-free, не upsert), клиент передаётся параметром; вызывается в `diagnostic/page.tsx` только для роли STUDENT. Покрывает существующих юзеров без профиля и будущие sign-up через Auth.js adapter (OAuth)
- **`nativeLanguage` (вариант 1):** становится nullable аддитивной миграцией (DROP NOT NULL). Родной язык спрашивается в онбординге перед диагностикой и **никогда не угадывается** по локали UI (UI-язык ≠ родной; `User.locale` при регистрации не заполняется и всегда `en`)
- **`/exercises`:** заглушка ведёт на диагностику — это шаг активации, а не тупик

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
  - `baca0f4` Tailwind `@source` для `packages/ui` · `75e90f0` e2e-guard стилей · `210c1eb` runner `ubuntu-24.04` + actions на Node 24 · `5a72dc5` Playwright html-отчёт и трейсы в артефактах
  - `447da4e` `requireRole`/`authorizeAction` + guard-тест + локализованный 404 · `c943264` proxy гейтит сессию, `callbackUrl`, узкий matcher · `fb38cc6` локаль и `callbackUrl` через логин/регистрацию/логаут, ошибка логина, guard против `next/navigation`
- **2026-10-12 вечер — хвосты auth/i18n** (см. лог сессии в конце)
  - `9102f87` ошибки формы регистрации (`useActionState`, `VALIDATION`/`EMAIL_TAKEN`/`AUTH_FAILED`, 4 локали) + e2e · `284a661` нормализация `//` в proxy · `c9dbf21` `/admin` → `/admin/users`, `/admin/content` → `/admin/content/vocab`
  - `76f2fd9` `hasLocale` → `notFound()` в `[locale]/layout`, корневой `not-found.tsx`, `robots.ts`, `icon.svg` · `fee33cc` экспорт `buttonVariants` из `packages/ui` · `a2a72fc` `/exercises` → локализованный следующий шаг (CTA на диагностику)
- **2026-10-13 — D: `StudentProfile` при регистрации** (см. лог сессии в конце)
  - `185d030` feat(db) nullable `nativeLanguage` (миграция на dev, CI, prod) · `161b5c9` feat(auth) профиль при регистрации + `ensureStudentProfile`

### ➡️ Дальше (по порядку)
1. **e2e на `next build && next start`** (грабли 72 — флаки первой компиляции маршрута повторились 2026-10-12)
2. **Дизайн-решения** (§8 #5, всё ещё открыты) — 3 вопроса из сессии 2026-09-24
3. **MVP-1 шаг 2: Adaptive exercise UI** поверх `selectNext` — `apps/web` впервые получает зависимость `@englishlearn/learner-model`; `exercises/page.tsx` и `diagnostic/page.tsx` из заглушек → реальные; заодно integration-тест bootstrap→selection (грабля 37) и решение #4
4. Онбординг: выбор родного языка перед диагностикой
5. Progress dashboard с семантическими CEFR-уровнями
6. Сквозной флоу Guest → registration (+`StudentProfile`) → onboarding → diagnostic → exercises
7. Расширить контент-пул (60/15 исчерпается быстро)

### ⏸️ Отложено
- AI Tutor context builder (блок #1), eval harness — после MVP-1
- **E-reader** (сессия 2026-09-18: Phase 1–3 оценены, 3 вопроса без ответа) — после MVP-1, сначала основной цикл
- Payments, Tutoring Platform — MVP-2+ (Vercel Hobby → Pro до монетизации)

---

## 10. TODO (техдолг)

### Auth / UX
- [ ] Онбординг: выбор родного языка перед диагностикой (`nativeLanguage`, решение §7)
- [ ] Тайминг-перечисление аккаунтов на логине: для неизвестного email нет `bcrypt.compare` → ответ быстрее; фиктивное сравнение
- [ ] Admin UI только на английском — решить: задокументированное исключение или i18n
- [ ] Dashboard: CTA по состоянию (до/после `LEARNER_BOOTSTRAPPED`)
- [ ] Устаревшая роль в JWT (решение 3.а) — вернуться, когда появится смена ролей

### Тесты / CI
- [ ] CI e2e на `next build && next start` вместо `next dev` (грабли 72; флак первой компиляции маршрута повторился 2026-10-12 в `exercises.spec.ts`)
- [ ] Флак: `protected-routes › no redirect loop from /` (664 мс, один раз; текст ошибки не сохранён — при повторе снять trace)
- [ ] Принять ожидающий запрос прав у Vercel GitHub app (грабли 79)
- [ ] Периодически чистить e2e-юзеров `@e2e.englishlearn.dev` в Neon development
- [ ] `ubuntu-24.04` → `26.04` позже (сейчас pin)
- [ ] commit-msg hook, вырезающий AI-трейлеры, — локальный (`.git/hooks`), переустанавливать на новых клонах

### Infra / DB
- [ ] **Процедура миграций (expand → code):** (1) аддитивная миграция на dev (`migrate diff` против dev `DIRECT_URL`) → (2) commit + push только schema/migration, CI `migrate deploy` с нуля → (3) прод `migrate deploy` запускает **Ivan вручную** (грабли 81) → (4) только потом push кода, который от неё зависит
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
- [ ] 57 biome warnings (на 2026-10-12) → разобрать, потом поднять до error в CI
- [ ] Biome override: разрешить `console` в `scripts/**` и `seed.ts`

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

### Закрыто 2026-10-13
- [x] D — `nativeLanguage` → `String?` (`185d030`, миграция на dev, CI, prod), `StudentProfile` при регистрации + `ensureStudentProfile` на `/diagnostic` (`161b5c9`)

### Закрыто 2026-10-12 (вечер)
- [x] Ошибки регистрации: `as unknown as` убран, `useActionState`, локализованные ошибки полей / «email занят» в 4 локалях, имя и email сохраняются, пароль нет + e2e (`9102f87`)
- [x] Нормализация `//` → 308 до `resolveAccess` (`284a661`)
- [x] `/admin` → `/admin/users`, `/admin/content` → `/admin/content/vocab` (`c9dbf21`)
- [x] Не-локаль в `[locale]` → 404, корневой `not-found.tsx`, `robots.ts`, `icon.svg` (`76f2fd9`; грабли 71)
- [x] Заглушка `/exercises` → локализованный следующий шаг без жаргона (`a2a72fc`); экспорт `buttonVariants` из `packages/ui` (`fee33cc`)
- [x] Пропущенный деплой `c943264` — разобран: единичный потерянный вебхук (грабли 79)

### Закрыто 2026-10-12
- [x] Tailwind не видел классы `packages/ui` → `@source` (`baca0f4`) + e2e-guard стилей (`75e90f0`)
- [x] GitHub Actions: runner `ubuntu-24.04` + actions на Node 24 (`210c1eb`)
- [x] CI: Playwright html-отчёт и трейсы загружаются в артефакты (`5a72dc5`)
- [x] `AUTH_TRUST_HOST` удалён из Vercel env
- [x] История: фрагмент Neon-хоста в старых HANDOFF-файлах заменён, AI-трейлер убран из коммита от 2026-08-08 (хэши переписаны)
- [x] HANDOFF-файлы с пробелами/скобками → `docs/HANDOFF.md` (`9af1af7`, закоммичено 2026-10-11)
- [x] RBAC: proxy реально гейтит сессию; `requireRole` в каждой admin page/layout; не-админ на `/admin/*` → 404; `/admin/users` под студентом проверен e2e (`447da4e`, `c943264`)
- [x] Локаль после логина: `/ru/login` → `/ru/dashboard`; `callbackUrl` сохраняется; логаут → `/{locale}` (`fb38cc6`)
- [x] Неверный пароль → локализованная ошибка вместо «This page couldn’t load» (`fb38cc6`)

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
1. **Ревизия** (Claude Code, read-only): после последнего коммита от 2026-09-04 (сейчас `a071acd docs: rewrite README`; хэш изменился при переписывании истории 2026-10-12) коммитов нет, но 5 недель работы лежали незакоммиченными; CI красный с 2026-08-30 (P1012 `DIRECT_URL`); learner-model не подключён к `apps/web`
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
4. **Push:** Vercel молча пропустил деплой `c943264` (грабли 65) — позже разобрано: единичный потерянный вебхук (грабли 79)

### Лог сессии 2026-10-12 (вечер)
1. `2c8c72a` — убран неиспользуемый импорт в e2e auth-редиректов
2. **6 коммитов с diff, паузой на «ok» и полным прогоном CI-команд** (lint, typecheck, unit, весь Playwright; последние два — один общий прогон): ошибки регистрации → `//` → индексы `/admin` → 404 для не-локалей + robots + иконка → экспорт `buttonVariants` → `/exercises`
3. **Доказательства «сломать → тест падает → вернуть»:** дубликат email (подмена action на «всегда ok»), `hasLocale` (без проверки `/missing.png` и `/favicon.ico` → 200). Честно зафиксировано, где e2e НЕ доказывает: ветка `//` в proxy (грабли 76), guard в `admin/page.tsx` (404 даёт `requireRole` в layout)
4. **D (`StudentProfile`) остановлен до кода:** `nativeLanguage` обязательное без default → решение §7, перенесено на 2026-10-13
5. Полный e2e на свежем сервере: 58/58. Флак первой компиляции маршрута повторился (`exercises.spec.ts`) → `AFTER_SUBMIT`; системно — e2e на `next start`

### Лог сессии 2026-10-13
1. **Миграция (expand):** `185d030` — `nativeLanguage` → `String?` аддитивной миграцией; применена на dev, CI (`migrate deploy` с нуля), prod (Ivan вручную, direct URL через `read -rs` — грабли 81). В прод `_prisma_migrations` найдены июльские orphan-строки (грабли 82)
2. **Код:** `161b5c9` — nested `profile: { create: {} }` + явный `role: 'STUDENT'` в регистрации; `ensureStudentProfile` (`createMany` + `skipDuplicates`, а не upsert, как было записано в §7) в `packages/db/src/queries`, вызов на `/diagnostic` только для STUDENT. Read-only инспекция → diff → пауза на «ok»
3. **Доказательства «сломать → тест падает → вернуть»:** без nested create падает `register-action.test.ts`, без `skipDuplicates` падает тест в `packages/db`. Честно: ни один e2e не открывает `/diagnostic`, `ensureStudentProfile` против реальной БД не прогонялся
4. Полный прогон: lint (57 warnings, без изменений), typecheck 5/5, unit 416/416, e2e 58/58 на свежем сервере без флаков, `vercel build` + `check:bundle` PASS
5. Хэши в §9/§10 (и ссылки в §6 и логах) сверены с `git log` — история переписывалась после вечерней сессии 2026-10-12
