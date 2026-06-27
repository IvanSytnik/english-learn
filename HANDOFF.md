# EnglishLearn — Project Handoff & Context

> Этот файл нужен для передачи контекста проекта между чатами с Claude.
> Загружай его в начале нового чата, чтобы новый ассистент продолжил работу
> в той же роли (senior full-stack + PM + architect, общение по-русски, код по-английски).

---

## Кто я и как со мной работать

Технический сооснователь стартапа EnglishLearn. Работаю с тобой (Claude) как с senior full-stack разработчиком, product manager и solution architect в одном лице.

**Стиль:**
- Общение РУ, код/коммиты/доки/UI — EN, не смешивать
- Прямые ответы, без воды; если решение неочевидно — 2–3 варианта с trade-offs
- Архитектурные решения за мной, но ты даёшь рекомендованный вариант с обоснованием
- В конце сложных ответов — секция «⚠️ Watch out» с подводными камнями
- НЕ редактируй файлы автоматически без явной просьбы — давай actionable инструкции
- Спорь если я не прав, не соглашайся ради вежливости

**Формат для новых фич:** Уточнения → Product view → Architecture → Implementation plan → Risks & alternatives → Definition of done.
**Формат для ревью:** что хорошо → 🔴 critical / 🟡 important / 🟢 nitpick с diff-предложениями.

---

## Продукт

**EnglishLearn** — платформа для изучения английского с упором на персонализацию через AI и связку «ученик ↔ репетитор».

**Модули:**
1. Knowledge Base (грамматика, лексика, фонетика, идиомы; A1–C2)
2. AI Trainers (vocabulary, listening, speaking, writing, grammar drills с адаптивной сложностью)
3. AI Tutor (отслеживает прогресс, выявляет слабые места, генерирует персональные упражнения)
4. Tutoring Platform (учителя ведут учеников, видео-уроки + whiteboard + chat) — **отложено в MVP-2**
5. Progress Analytics (дашборды ученик/учитель/родитель)
6. Multilingual Landing (EN/RU/UK/DE)
7. Payments & Subscriptions (freemium + paid + tutor marketplace) — **отложено в MVP-3**

**Аудитория:** B2C, взрослые 18–40, уровни A2–C1, цель: работа/иммиграция/путешествия.
**North Star:** Weekly Active Learners with ≥3 completed sessions.
**Монетизация:** Free (5 упр/день) / Pro $9.99 (unlimited AI) / Pro+Tutor (marketplace fee 20%).

**Роли:** Student, Tutor, Admin, Guest.

---

## Принятые архитектурные решения (всё уже зафиксировано в коде)

| Решение | Что выбрано | Почему |
|---|---|---|
| Monorepo layout | **Variant A.2 — Lean MVP, admin как route group в `apps/web`** | Один auth, один Prisma, один deploy. Выделим admin в отдельный app, когда команда > 3 человек или появятся тяжёлые admin-only либы. |
| Diagnostic test | **Pseudo-CAT** (branching: 2 right → up, 2 wrong → down, stop after 15–20 items) | Реальный CAT требует калибровку IRT через ~500 ответов на вопрос. Перейдём после ~1000 прохождений. Контент маркирован CEFR-уровнем. |
| Exercise schema | **Нормализованные таблицы** `VocabExercise`, `GrammarExercise`, `ListeningExercise` (НЕ один JSON-payload) | Чище типизация, проще миграции, лучше индексы. |
| Tutor Workspace | **MVP-1, НЕ MVP-0** | Сначала валидируем self-study (главный value prop). Tutoring без видео — половинчатая ценность. |
| Admin panel | **Route group в `apps/web/(admin)`, не отдельный app** | См. Variant A.2 выше. |
| AI-generation flow | **DRAFT → REVIEW → PUBLISHED обязательно** | AI косячит на edge cases. Никогда auto-publish. |
| Content lifecycle | На каждой content-модели: `status`, `createdById`, `reviewedById`, `reviewedAt`, `reviewNotes`, `publishedAt` | Soft delete через `ARCHIVED`, физически НЕ удаляем (attempts ссылаются). |
| Student-facing queries | **Только через `@englishlearn/db/queries/exercises.ts`** (wrapper с принудительным `status=PUBLISHED`) | Иначе DRAFT-контент утечёт ученикам. |
| Real CRM (sales/support) | **НЕ строим**, внешний инструмент (HubSpot/Pipedrive/Intercom) | Не наша задача. |

---

## Tech stack (зафиксировано, проверены актуальные версии на 27 июня 2026)

- **Frontend:** Next.js 16.2.9 (App Router, Turbopack default), React 19.2.7, TypeScript 6.0.3
- **Styling:** Tailwind CSS 4.3.1 (CSS-first config через `@theme {}`, no `tailwind.config.ts`)
- **i18n:** next-intl 4.13.0 (EN/RU/UK/DE)
- **State/Data:** TanStack Query 5.101, Zustand 5.0
- **Forms:** React Hook Form 7.80 + Zod 4.4
- **DB:** Prisma 7.8 + PostgreSQL (Neon hosting)
- **Auth:** next-auth 5.0.0-beta.31 (Auth.js v5, JWT sessions, Credentials provider, Prisma adapter)
- **AI:** Anthropic Claude API (main) + OpenAI fallback (не подключено в MVP-0)
- **Testing:** Vitest 4.1.9 + Playwright 1.61.1
- **Tooling:** Biome 2.5.1, Turborepo 2.10, pnpm 10 с **catalogs** (единая версия зависимости в `pnpm-workspace.yaml`)
- **Runtime:** Node.js 22 LTS

**Важно про Next.js 16:** `middleware.ts` переименован в `proxy.ts`, runtime Node.js (не Edge). NextAuth v5 формально в beta, но это стандарт сообщества для Next 16.

---

## Что СДЕЛАНО (MVP-0 bootstrap)

### Структура проекта
```
englishlearn/
├── apps/web/                         # Next.js 16 — student + admin + landing
│   ├── app/
│   │   ├── (marketing)/page.tsx      # лендинг (/)
│   │   ├── (auth)/login,register     # ✅ работающие формы с server actions
│   │   ├── (student)/dashboard,diagnostic,exercises  # каркас
│   │   ├── (admin)/                  # RBAC через layout.tsx (role !== ADMIN → /login)
│   │   │   ├── content/{vocab,grammar,listening,diagnostic,skill-tags}  # placeholder pages
│   │   │   ├── users/page.tsx        # ✅ список users (read-only)
│   │   │   └── ai-review/page.tsx    # placeholder
│   │   ├── api/auth/[...nextauth]/route.ts
│   │   ├── layout.tsx
│   │   └── globals.css               # Tailwind v4 + @theme
│   ├── i18n/{routing,request,navigation}.ts  # ✅ next-intl настроен
│   ├── messages/{en,ru,uk,de}.json   # ✅ все ключи покрыты
│   ├── lib/{auth.ts,auth.config.ts,env.ts}  # ✅ NextAuth split-config + @t3-oss/env
│   ├── tests/unit/auth-config.test.ts  # ✅ 5 tests
│   ├── tests/e2e/smoke.spec.ts       # ✅ 3 Playwright tests
│   ├── proxy.ts                      # ✅ Next.js 16 proxy с NextAuth + intl
│   ├── types/next-auth.d.ts          # session.user.role типизация
│   ├── next.config.ts                # ✅ withNextIntl + transpilePackages
│   ├── postcss.config.mjs            # @tailwindcss/postcss
│   ├── vitest.config.ts
│   ├── playwright.config.ts
│   └── tsconfig.json
├── packages/
│   ├── db/                           # @englishlearn/db
│   │   ├── prisma/schema.prisma      # ✅ полная schema MVP (см. ниже)
│   │   └── src/
│   │       ├── client.ts             # ✅ singleton с HMR-safe globalThis
│   │       ├── index.ts              # re-export client + generated types
│   │       ├── queries/exercises.ts  # ✅ publishedExercises wrapper
│   │       └── seed.ts               # ✅ admin + student + skill tags + 6 diagnostic items + 4 exercises
│   ├── ai/                           # @englishlearn/ai
│   │   └── src/prompts/index.ts      # ✅ Zod schemas для AI-generation
│   ├── ui/                           # @englishlearn/ui
│   │   └── src/{button,input,card}.tsx + button.test.tsx  # ✅ 3 tests passing
│   └── config/tsconfig/              # shared tsconfig (base/library/react-library/nextjs)
├── .github/workflows/ci.yml          # ✅ полный CI: lint, typecheck, test, build, e2e (с Postgres service)
├── pnpm-workspace.yaml               # ✅ catalog: пины версий
├── turbo.json                        # ✅ pipeline с ^db:generate dep
├── biome.json                        # ✅ Biome 2.5 конфиг
├── vercel.json                       # ✅ настройки для monorepo deploy
├── README.md                         # ✅ полная инструкция
└── HANDOFF.md                        # этот файл
```

### Prisma schema (`packages/db/prisma/schema.prisma`) — финальная
- **Auth:** User (+role: STUDENT/TUTOR/ADMIN, +passwordHash, +locale), Account, Session, VerificationToken
- **Profile:** StudentProfile (nativeLanguage, selfReportedLevel, assessedLevel, goal, dailyGoalMin, streakDays)
- **Taxonomy:** SkillTag, SkillLevel (per-user mastery 0..1, placeholder — алгоритм не выбран)
- **Content (с lifecycle: DRAFT/REVIEW/PUBLISHED/ARCHIVED/REJECTED):**
  - VocabExercise + VocabAttempt
  - GrammarExercise + GrammarAttempt
  - ListeningExercise + ListeningAttempt
  - DiagnosticItem (polymorphic: VOCAB/GRAMMAR/LISTENING)
- **Diagnostic:** DiagnosticAttempt (pseudo-CAT state: currentLevel, consecutiveCorrect/Wrong, itemsAnswered, levelTrajectory[]), DiagnosticAnswer (отдельная таблица, НЕ JSON)
- **Enums:** UserRole, CefrLevel, LearningGoal, ContentStatus, ExerciseSource, SkillCategory, DiagnosticItemType, DiagnosticStatus

### Что РАБОТАЕТ end-to-end сейчас
- `pnpm install` ✅ (309 пакетов, lockfile committed)
- `pnpm lint` ✅ (Biome, 0 errors)
- `pnpm --filter @englishlearn/ui test` ✅ (3/3 passing)
- `pnpm --filter @englishlearn/web test` ✅ (6/6 passing, всего 9/9 в проекте)
- Регистрация → автологин → /dashboard
- Логин с credentials
- Admin RBAC через layout (STUDENT → redirect to /login)
- i18n с правильным резолвом локали через next-intl
- Seed создаёт: admin@englishlearn.dev / admin1234, student@englishlearn.dev / student1234

### CI/CD
- **GitHub Actions:** lint + typecheck + unit tests + build + Playwright e2e (с Postgres 16 service)
- **Vercel:** `vercel.json` настроен на monorepo; root directory = `apps/web`

---

## Что НЕ СДЕЛАНО (приоритеты для следующего чата)

### Высокий приоритет (закрыть MVP-0)
1. **Diagnostic engine** — `app/(student)/diagnostic/page.tsx` сейчас плейсхолдер. Нужно:
   - Server action `startDiagnostic`, `submitAnswer`
   - Логика pseudo-CAT (выбор следующего item по `currentLevel`, обновление trajectory)
   - Stopping rule: 15–20 items ИЛИ 3 раунда без смены уровня
   - Финальный assessedLevel = модальный из последних 5 ответов
   - Сохранение `assessedLevel` в `StudentProfile`
2. **Exercise UI с attempt persistence** — сейчас просто listing. Нужно:
   - VocabExercise: radio choices, submit, мгновенный фидбек
   - GrammarExercise: input, fuzzy match по acceptedAnswers (Levenshtein с tolerance)
   - ListeningExercise: audio player, transcription input, similarity score
   - Запись VocabAttempt/GrammarAttempt/ListeningAttempt
3. **Mastery algorithm** — решить SM-2 vs BKT vs простой EMA. Сейчас `SkillLevel.mastery` — пустой Float, не обновляется. **Это блокирует AI Tutor.**
4. **Admin CRUD** — все страницы `(admin)/content/*` сейчас плейсхолдеры. Нужно:
   - TanStack Table list view (фильтры по status, cefrLevel)
   - Generic `<ExerciseForm type="vocab|grammar|listening" />` с RHF + Zod
   - Audio upload to Cloudflare R2 (presigned URLs) для listening
5. **AI-generation pipeline** — `packages/ai` имеет только Zod schemas. Нужно:
   - Anthropic SDK wrapper
   - Prompt templates для vocab/grammar
   - Endpoint `POST /api/admin/generate/vocab` — генерит N штук как DRAFT
   - `/admin/ai-review` — queue с approve/reject

### Средний приоритет
6. **Eval harness для prompts** (`packages/ai/evals`) — golden dataset 50–100 рукописных примеров, regression-тесты на промпты. Делать ДО заливки AI-контента в прод.
7. **Bundle analyzer** — `@next/bundle-analyzer`, мониторить admin-routes не утекают в student bundle.
8. **Larger diagnostic item pool** — сейчас всего 6 items в seed. Нужно минимум 50–100 (по 8–15 на CEFR-уровень × 3 типа).
9. **Listening audio sources** — решить: TTS-генерация (ElevenLabs/OpenAI) vs open-source (LibriSpeech, Common Voice). Без аудио listening не работает.

### Низкий приоритет (после MVP-0 launch)
10. **OAuth providers** (Google, Apple) — сейчас только credentials.
11. **Password reset flow** — пишем сами, NextAuth credentials его не даёт.
12. **Background job для ABANDONED diagnostic attempts** (TTL 24h).
13. **MVP-1: Tutor Workspace** — отдельный спринт.

---

## ⚠️ Подводные камни (важно помнить)

1. **Prisma client НЕ сгенерирован до `pnpm db:generate`.** Папка `packages/db/src/generated/` в .gitignore. Импорты `@englishlearn/db` упадут в IDE/typecheck до первого запуска `pnpm db:generate`. Это нормально.

2. **`.env` нужен в ДВУХ местах** — `apps/web/.env` для Next.js (через `@t3-oss/env-nextjs`) и `packages/db/.env` для Prisma CLI. Оба требуют `DATABASE_URL`.

3. **Neon connection string** — используй **pooled URL** (`-pooler` в host) для рантайма, **direct URL** для миграций. Сейчас в схеме только `DATABASE_URL`; для prod нужно добавить `directUrl = env("DIRECT_URL")` в `datasource db` и DIRECT_URL в env.

4. **NextAuth v5 + Next.js 16** — peer dep warning на install (next-auth заявляет `peer next@"^12..^15"`). `.npmrc` с `strict-peer-dependencies=false` это глушит. Когда выйдет stable v5 — обновить.

5. **`use cache` директива в Next.js 16 НЕ совместима с next-intl** в полную силу (известная проблема). Если будем кэшировать страницы с переводами — читай: https://aurorascharff.no/posts/implementing-nextjs-16-use-cache-with-next-intl-internationalization/

6. **String[] в Postgres** для choices/acceptedAnswers — `text[]`. На 100K+ exercises поиск по содержимому будет медленный, нужен GIN индекс. Сейчас норм.

7. **Pseudo-CAT psychometrically НЕ валиден.** В UI студенту показываем «вы готовы к материалам уровня B2», НЕ «ваш CEFR B2». CEFR — формальный фреймворк, легально-чувствительно.

8. **Tailwind v4** — конфиг через CSS `@theme {}` в `globals.css`. `tailwind.config.ts` не нужен и его НЕТ. Biome парсер ругается на `@theme` — отключил CSS-линт в `biome.json` через override.

9. **Soft delete only.** Никогда не делай `prisma.vocabExercise.delete()`. Только `update({ status: 'ARCHIVED' })`. Attempts ссылаются на exercises.

10. **Seed-пароли (admin1234/student1234)** — сменить ПЕРЕД любым publicly-accessible deploy.

11. **Pgvector extension в schema** — закомментирован. Когда подключим RAG для Knowledge Base — раскомментировать + включить в Neon.

12. **AUTH_SECRET минимум 16 символов** в Zod-валидации env. Для prod используй `openssl rand -base64 32` (выдаёт 44 char).

---

## Команды cheat sheet

```bash
pnpm install                  # install all deps
pnpm db:generate              # generate Prisma client (CRITICAL: do this first)
pnpm db:push                  # push schema to DB (dev, no migration files)
pnpm db:migrate               # create + apply migration (prod path)
pnpm db:seed                  # seed admin/student/skill tags/sample exercises
pnpm db:studio                # GUI for DB
pnpm dev                      # dev server (http://localhost:3000)
pnpm build                    # production build
pnpm lint                     # Biome lint
pnpm check                    # Biome lint + format autofix
pnpm typecheck                # TS across workspace (needs db:generate first)
pnpm test                     # Vitest unit
pnpm test:e2e                 # Playwright e2e
pnpm --filter @englishlearn/ui test    # one package
```

---

## Открытые архитектурные вопросы

1. **Mastery algorithm.** SM-2 (простой, проверенный, ~30 строк кода) vs BKT (точнее, требует калибровки) vs простой EMA по последним N ответам. Влияет на adaptive selection упражнений и на AI Tutor recommendations. **Не решено, блокирует AI Tutor.**

2. **AI provider primary.** PRODUCT.md говорит Claude main + OpenAI fallback. Не решено: каждый запрос пытаемся в Claude → fallback на OpenAI при ошибке/таймауте? Или Claude для генерации, OpenAI только для embeddings (RAG позже)?

3. **Listening audio source.** TTS (ElevenLabs ~$30/мес за 30k chars, нативное качество) vs open-source (LibriSpeech — academic English only, Common Voice — разные акценты). Не решено.

4. **i18n стратегия для exercise content.** Сейчас `prompt: String` хранит EN. Если объяснения нужны на родном языке студента — JSON `{ en, ru, uk, de }` в `explanation` или отдельная таблица `ExerciseTranslation`. **Не решено, нужно ДО seed AI-генерации.**

5. **DiagnosticItem polymorphic с nullable полями** vs 3 отдельные таблицы. Сейчас polymorphic. При росте можно разнести — некритично.

---

## Контекст разговора (до этого хэндофа)

Разговор шёл с senior-помощником из 4 ответов:
1. Выбор monorepo варианта и Prisma schema → выбран A + нормализованные exercises + CAT (изначально полный)
2. Уточнение по CAT → push на pseudo-CAT с обоснованием, обновлённая schema
3. Добавили CRM/admin/tutor скоуп → разрезали MVP на фазы, admin как route group, content lifecycle, AI generation flow с обязательным review
4. Финализация → выбран pseudo-CAT + admin route group + обязательное review + ждём решений
5. Bootstrap monorepo → Neon + Node 22 + pnpm 10 + macOS + ZIP, добавлены тесты и CI
6. Реализация → весь bootstrap проекта собран, тесты прошли (9/9), zip и HANDOFF собран

Ничего более раннего нет.

