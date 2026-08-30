EnglishLearn — Handoff
Last updated: 2026-08-02
Status: MVP-0.5 Week 2. Diagnostic v2 bootstrap COMPLETE (LEARNER_BOOTSTRAPPED, strictly-once, replay-эквивалентность verified live). Typecheck clean across 6 packages, 158/158 learner-model + 44/44 db tests passing.
Next: подключить bootstrap→bandit (betaParamsForConcept) — отложено в MVP-1 вместе с adaptive exercise UI. Рекомендуемый следующий шаг сейчас — начать MVP-1 критический путь (deploy scaffold на Vercel ИЛИ adaptive exercise UI).

Документ — единый источник правды. Объединяет все предыдущие handoff'ы без дублей.
Правило доверия: если что-то заявлено «работает» — попроси Ivan проверить запуск перед опорой на это.


1. Что за проект
EnglishLearn — веб-платформа для изучения английского: CEFR-контент, AI-тьюторы, marketplace преподавателей, мультиязычность (EN/RU/UK/DE). Ivan — технический co-founder, есть полная Claude Project конфигурация.
Ядро — 3-слойная Learner State Model (все pure-ядра + event sourcing + selection готовы):

Layer 3 — Knowledge Graph (Concept + ConceptEdge) ✅
Layer 2 — BKT+ (IRT 2PL-augmented, per-user p_learn, exp forgetting) ✅
Layer 1 — FSRS (через ts-fsrs) ✅
Event sourcing через LearnerEvent + service layer ✅ (Day 7)
Selection Policy — Thompson Sampling, поверх трёх слоёв ✅ (Week 2, verified live 2026-07-11)


2. Стек

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16.2.9 + React 19.2.7 | proxy.ts вместо middleware.ts; typedRoutes в корне next.config.ts |
| Language | TypeScript 6.0.3 | moduleResolution: "Bundler" — БЕЗ .js суффиксов; в paths НЕТ baseUrl |
| DB/ORM | Prisma 6.16.2 | Prisma 7 ломает datasource.url — остаёмся на 6.16.2 |
| Database | Neon Postgres (eu-central-1) | Connection string в apps/web/.env И packages/db/.env. CLI-миграции ТОЛЬКО через direct URL |
| Auth | next-auth 5.0.0-beta.31 (Auth.js v5) | JWT, Credentials + Prisma adapter |
| i18n UI | next-intl 4.13 | app/[locale]/..., localePrefix: 'as-needed' |
| i18n content | hybrid JSON + Zod | content Json (jsonb) + LocalizedString (EN required, fallback) |
| Styling | Tailwind 4.3.1 | UI functional bootstrap, не финальный дизайн |
| State/Forms | TanStack Query 5, Zustand 5, RHF 7.80 + Zod 4.4 | — |
| Testing | Vitest 4.1.9, Playwright 1.61, fast-check 3.23.2 | property-based в learner-model и db |
| Spaced repetition | ts-fsrs 5.4.1 | единственный импортёр — learner-model/src/core/fsrs/wrapper.ts |
| Tooling | Biome 2.5, Turborepo 2.10, pnpm 10 (catalogs), Node 22 LTS | локально v22.23.1 (bumped 2026-07-11); engines требует >=22.0.0, WARN ушёл |
| AI | Anthropic Claude (primary) + OpenAI (fallback) | Не подключено |

3. Структура (learner-model — актуальная)

```
packages/learner-model/src/
├── core/
│   ├── graph/        # Layer 3: types/build/graph — 33 tests
│   ├── bkt/          # Layer 2: constants, types, irt, forgetting, model — 38 tests
│   └── fsrs/         # Layer 1: types, wrapper (ЕДИНСТВЕННЫЙ импортёр ts-fsrs) — 17 tests
├── adapters/         # BktState↔ConceptMastery, FsrsCardState↔ItemReviewState — 8 tests
├── policy/           # Thompson Sampling selection (Week 2)
│   ├── rng.ts        #   seedable mulberry32 + Beta (Marsaglia–Tsang). Math.random ЗАПРЕЩЁН
│   ├── types.ts      #   PolicyConfig, SelectionInput/Result, snapshots
│   ├── reward.ts     #   strategy dispatch + calibration gate (bernoulli|learning_gain|hybrid)
│   ├── posterior.ts  #   Beta-параметры + informative IRT cold-start prior (НЕ читает mastery/bootstrap — см. §8 #4)
│   ├── curriculum.ts #   prereq hard-gate (introduction) / soft (review) — единственный читатель pKnown в policy/
│   ├── select.ts     #   ГЛАВНЫЙ orchestrator: REVIEW_DUE → NEW_INTRODUCTION → EXPLORATION_FLOOR
│   ├── index.ts
│   └── __tests__/    #   rng(7) + reward(9) + curriculum(6) + select(9) = 31 tests
├── diagnostic/       # ← NEW (Diagnostic v2, 2026-08-02): θ→pKnown bootstrap mapping
│   ├── types.ts            #   BootstrapConcept, AxisEstimate, MappingConstants
│   ├── theta-estimator.ts  #   ThetaEstimator interface-шов: accuracyBasedEstimator сейчас, irt2plEstimator later
│   ├── bootstrap.ts        #   MAPPING_V1 (floor/ceiling/aboveLevelFactor/minAnswersPerAxis), categoryToAxis, buildBootstrapSnapshots
│   ├── index.ts
│   └── __tests__/          #   theta-estimator(4) + bootstrap(11) = 15 tests
├── service/
│   ├── db-port.ts            # repository-интерфейс (+ 4 selection read-методов, Week 2)
│   ├── prisma-db.ts          # единственная Prisma-реализация (+ 4 метода: 2 через $queryRaw)
│   ├── event-store.ts        # конструирование/парсинг событий через Zod
│   ├── apply.ts              # ЕДИНЫЙ pure fold (live path + replay) — теперь + LEARNER_BOOTSTRAPPED ветка
│   ├── learner-service.ts    # recordOutcome orchestrator (WRITE path)
│   ├── selection-service.ts  # selectNext orchestrator (READ path)
│   ├── bootstrap-service.ts  # ← NEW: LEARNER_BOOTSTRAPPED orchestrator, strictly-once guard внутри tx
│   ├── replay.ts             # replayUser, full rebuild, курсорная пагинация + discriminated-union branching по event type
│   └── __tests__/            # learner-service(8) + selection-service(4) + bootstrap-service(4) = 16, in-memory fake port
├── index.ts          # barrel: graph + bkt + policy + diagnostic + createSelectionService + createBootstrapService
└── seed/             # concepts(15)+edges(10), items(60)
```

Остальные пакеты: apps/web, apps/landing, packages/{db,ai,ui,config}.
learner-model итого: 33 + 38 + 17 + 8 + 31 + 15 + 16 = 158 tests.

4. Schemas + Data в Neon (Diagnostic v2 обновление 2026-08-02)

Auth: User(+role), Account, Session, VerificationToken
StudentProfile, SkillTag, SkillLevel
VocabExercise/GrammarExercise/ListeningExercise (+Attempts) — content Json, lifecycle DRAFT→REVIEW→PUBLISHED→ARCHIVED→REJECTED
DiagnosticItem + DiagnosticAttempt (pseudo-CAT) + DiagnosticAnswer. DiagnosticItem теперь + irtDiscrimination/irtDifficulty (defaults a=1.0/b=0.0) — под будущий irt2plEstimator (§7 #8.а), сегодняшний accuracyBasedEstimator их не читает. conceptId на DiagnosticItem НЕ добавлен — решение 4.б (§7): θ считается per-axis, не per-concept
Concept(15) + ConceptEdge(10) + ConceptMastery (per-user BKT snapshot)
Item(60) — conceptId FK, irtDiscrimination/irtDifficulty, stable IDs item.<concept>.<slug>. Все status = PUBLISHED (verified live 2026-07-11; seed/items/run.ts:67 ставит статус)
ItemReviewState — per-user FSRS snapshot
LearnerEvent — append-only, LearnerEventType = ITEM_ATTEMPTED | LEARNER_BOOTSTRAPPED. ITEM_ATTEMPTED payload = self-contained snapshot (denormalized conceptId, frozen rating + irt {a,b}). LEARNER_BOOTSTRAPPED payload = self-contained: N per-concept BKT-снэпшотов (pKnown + BKT_DEFAULTS + observationCount=0 + sourceAxis), diagnosticAttemptId, assessedLevel, per-axis AxisEstimate[], formulaVersion ('v1'), mappingConstants (floor/ceiling/aboveLevelFactor/minAnswersPerAxis) — replay читает snapshots напрямую, apply.ts формулу не пересчитывает

Seed users: admin@englishlearn.dev / admin1234, student@englishlearn.dev / student1234
Selection policy миграций НЕ требует — читает существующие таблицы. Diagnostic v2 потребовала одну миграцию (20260711_diagnostic_v2_bootstrap): LearnerEventType.LEARNER_BOOTSTRAPPED + DiagnosticItem.irtDiscrimination/irtDifficulty. Имя папки — по дате планирования Diagnostic v2 (2026-07-11), не по дате фактического применения (2026-08-02); проверено ls packages/db/prisma/migrations/ — папку не переименовывали, чтобы не разойтись с уже применённой на Neon миграцией.

5. Команды (рабочие)

```bash
pnpm install
pnpm --filter @englishlearn/db generate
pnpm db:seed
pnpm --filter @englishlearn/learner-model seed:concepts
pnpm --filter @englishlearn/learner-model seed:items
pnpm dev
pnpm test        # 211/211 (learner-model 158 · db 44 · ui 3 · web 6 · ai 0)
pnpm typecheck   # CLEAN across 6 packages
```

```bash
# Миграции (directUrl закрыт 2026-08-02 — раздел 10): migrate deploy/status и db execute читают DIRECT_URL
# из datasource САМИ — хореография DATABASE_URL="$DIRECT_DB_URL" для них больше не нужна.
# Исключение: migrate diff --from-url НЕ читает directUrl (raw URL в обход datasource) — туда direct URL
# по-прежнему передаётся явно (грабли 24-25, 32):
cd packages/db
export DIRECT_DB_URL="postgresql://...@ep-...-asj7wsfl.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
pnpm exec prisma migrate diff --from-url "$DIRECT_DB_URL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<name>/migration.sql
head -3 prisma/migrations/<name>/migration.sql
pnpm exec prisma migrate deploy
```

6. ⚠️ Грабли (полный кумулятивный список)
Bootstrap (MVP-0)

Prisma 7 ломает datasource.url — оставаться на 6.16.2
packages/db/.env обязателен — Prisma CLI не читает env соседних пакетов
bcryptjs в dependencies packages/db
Проект НЕ в ~/Downloads/ — Vitest подхватывает чужие конфиги (держать в ~/Projects/)
.js суффиксы в relative imports ломают Turbopack (Bundler resolution)
localePrefix: 'as-needed' требует app/[locale]/
typedRoutes — в корне next.config.ts

Knowledge Graph / TS config (Day 1-2)

library.json tsconfig задаёт rootDir — каждый пакет переопределяет "rootDir": "."
baseUrl deprecated в TS 6 — убран; paths работают без него
@types/node обязателен в Node-пакетах ("types": ["node"])
server-only в db/client.ts блокирует CLI — seed импортирует PrismaClient из generated напрямую
db exports должен включать "./generated/*"
server-only type-stub в learner-model
Neon без shadow DB — flow: migrate diff + migrate resolve --applied
migration_lock.toml обязателен
packages/db/src/generated/ в .gitignore (per-platform binaries)

BKT+ (Day 3-4)

pnpm db:generate НЕ существует — pnpm --filter @englishlearn/db generate
migrate deploy сам регенерирует client
prisma db execute НЕ показывает SELECT-результаты — для чтения node-скрипт с $queryRawUnsafe
migrate diff --from-url требует пары --to-...
fast-check twin-float guard: < 1e-9 + toBeLessThanOrEqual
apps/web через turbo иногда даёт «0 passed» — кеш-флак; лечить turbo --force или изолированным --filter ... exec vitest run

i18n content (2026-06-30)

Neon pooler silent-fail на DDL — всегда DATABASE_URL="$DIRECT_DB_URL" ... migrate deploy. Direct URL = убрать -pooler (но .c-4. оставить!). ✅ MITIGATED 2026-08-02 через directUrl в datasource — migrate deploy/status и db execute больше не требуют ручного DATABASE_URL=$DIRECT_DB_URL
migrate diff через pooler = стейл schema view → всегда --from-url "$DIRECT_DB_URL" — актуально и сегодня: migrate diff НЕ читает directUrl, это единственное оставшееся исключение (см. раздел 5)
Self-import по имени пакета не работает внутри db — relative import generated client
ADD COLUMN ... NOT NULL падает на existing rows — TRUNCATE до ALTER

Item + FSRS (Day 5-6)

ts-fsrs scheduler.next() принимает Grade, не Rating (Grade = Rating без Manual)
Naming: Prisma enum канонический, Zod-двойник = XxxValue/XxxSchema (ItemKindValue)
tsc в db не тайпчекает __tests__; Vitest не тайпчекает — зелёные тесты ≠ зелёный tsc

Event sourcing (Day 7)

pnpm --filter <pkg> exec prisma ... > file на Node < 22 льёт WARN в STDOUT — генерить из директории пакета (cd packages/db && pnpm exec ...), либо head -3 перед deploy
Упавший migrate deploy оставляет advisory lock → pg_terminate_backend или Neon Compute Restart
page[page.length-1] под noUncheckedIndexedAccess → page.at(-1) + explicit guard

Selection Policy (Week 2)

Math.random запрещён в policy-коде — вся стохастика через инъектируемый seedable Rng (mulberry32). Иначе ломается детерминизм тестов и будущий eval/replay (тот же класс бага, что FSRS fuzz)
✅ RESOLVED (2026-07-11). Ложная тревога — seed-items уже PUBLISHED (seed/items/run.ts:67 ставит status: 'PUBLISHED' as const), БД синхронна (60/60 PUBLISHED, проверено $queryRawUnsafe). selectNext проверен на живой БД → ok:true, tier NEW_INTRODUCTION, seed=42 детерминирован, debugScores по 8 unlocked-концептам (остальные 7 залочены prereq-гейтом — корректно). Candidate pool НЕ пуст. HANDOFF (9) в этом месте отставал от реальности.

Diagnostic v2

Зелёные тесты bootstrap (19 тестов: diagnostic 15 + bootstrap-service 4; packages/learner-model/src/diagnostic/__tests__/ + src/service/__tests__/bootstrap-service.test.ts) и зелёные тесты selection (policy/__tests__/select.test.ts) по отдельности НЕ доказывают, что bootstrap реально долетает до selectNext — каждый набор тестирует свою подсистему через свой fake/in-memory DB-порт, независимо друг от друга. Нужен явный integration-тест: bootstrap пишет ConceptMastery для userId → selectNext на том же userId читает и решает по итоговому состоянию. Такого теста сейчас нет (см. открытый вопрос #4, раздел 8) — граница между «bootstrap пишет» и «selection читает и на что-то влияет» технически не покрыта.


7. Архитектурные решения (зафиксировано)
Learner Model

3-layer: Graph ✅ / BKT+ ✅ / FSRS ✅ — все pure cores готовы
BKT+: pure-функциональное ядро, IRT через σ(a(θ−b)), exp forgetting, immutable. Per-user p_learn/p_slip/p_guess — placeholder, готовы к калибровке при ≥500 outcomes/concept
FSRS: fuzz OFF (детерминизм), BigInt Unix ms на границах
IRT params = typed columns на Item (a=1.0, b=0.0)
Item ≠ Exercise; ExerciseItem M:N отложен (Item крепится через conceptId; selection работает прямо на нём — junction не нужен до Exercise UI, YAGNI подтверждён в Week 2)
DiagnosticKind enum = VOCAB/GRAMMAR/LISTENING

Event sourcing (Day 7)

Одна DB-транзакция на recordOutcome: event insert → чтение снэпшотов ВНУТРИ tx → pure fold → upsert обеих projection, один timestamp
Outcome → FSRS rating: бинарно (correct→GOOD, incorrect→AGAIN), frozen в payload
Replay = full rebuild (delete + refold)
Concept IDs — human-readable, dotted snake_case (immutable)

Selection Policy (Week 2) — решения 1.в 2.в 3.в, 0.7 / 500 / no-log

Гранулярность (1.в): concept-level Thompson. Item внутри концепта — scheduling (FSRS-due), не bandit. Per-item reward слишком разрежён
Reward (2.в): learning_gain — целевая стратегия, но за calibration-gate (500 outcomes/concept) форсится bernoulli. Strategy-switch в reward.ts — переключение конфигом, не рефактором. Сейчас фактически работает Bernoulli-Thompson
Curriculum (3.в): hard-gate на introduction нового концепта (все PREREQUISITE-предки ≥ prereqThreshold=0.7), review уже начатого концепта НЕ блокируется. Проверяются только прямые родители (транзитивность неявна)
Приоритет select(): REVIEW_DUE (FSRS-due item ≤ now) → NEW_INTRODUCTION (Thompson по unlocked) → EXPLORATION_FLOOR (гарантия непустого ответа). No-starvation инвариант (property-tested)
Cold-start prior: informative от IRT-difficulty концепта (НЕ uniform Beta(1,1)) — гасит хаотичную выдачу новичку
Determinism: seedable RNG на границе policy. Seed НЕ персистится (3.а: selection stateless, не событие)
SelectionService: READ path, симметричен LearnerService (WRITE path). Read-only, без транзакции. 4 read-метода на LearnerModelDb (не в Tx)

i18n content

hybrid JSON + Zod (source/localized split, EN required, fallback)

Diagnostic v2 (2026-08-02) — решения 1.б 2.в 3.в 4.б 5.в 6.а 7.а 8.а 9.а

1.б CEFR-branching оставлен как есть, IRT-скоринг добавлен только на выходе (θ→CEFR + маппинг в ConceptMastery) — не строим full-CAT на некалиброванных a/b (мнимая точность до 500 outcomes/concept, тот же strategy-switch, что bernoulli→learning_gain в selection)
2.в единый event LEARNER_BOOTSTRAPPED с полным начальным снэпшотом, фолдится существующим apply.ts — сохраняет инвариант «никаких прямых UPDATE на mastery», не плодит второй путь записи
3.в polymorphic DiagnosticItem (vs 3 отдельные таблицы) отложен — YAGNI, как в своё время ExerciseItem M:N
4.б θ считается per-axis (DiagnosticKind = VOCAB/GRAMMAR/LISTENING); Concept наследует ось через ConceptCategory (categoryToAxis). Следствие: conceptId на DiagnosticItem НЕ добавлялся — он понадобился бы только при 4.в (прямое per-concept покрытие diagnostic-айтемами, не выбрано)
5.в ThetaEstimator — interface-шов: accuracyBasedEstimator работает сейчас, irt2plEstimator замещает его позже с нулевыми изменениями в bootstrap.ts. На сегодняшних a=1.0/b=0.0 полный 2PL MLE математически вырождается в logit(accuracy) — считаем accuracy напрямую, без лишней машинерии
6.а категории без диагностической оси (PHONETICS/DISCOURSE/PRAGMATICS) → null axis → концепт остаётся на selection cold-start prior, значение НЕ фабрикуется
7.а strictly-once guard: countEvents(userId) внутри той же transaction, что и запись события — конкурентные диагностики не проходят гонку
8.а IRT 2PL параметры (irtDiscrimination/irtDifficulty, defaults 1.0/0.0) добавлены на DiagnosticItem сразу, в одной миграции с enum-значением LEARNER_BOOTSTRAPPED, хотя accuracy-based эстиматор их не потребляет — чтобы будущая irt2pl-реализация шва встала без второй миграции (ADD COLUMN с DEFAULT не падает на existing rows, в отличие от NOT NULL без дефолта — грабля #28). Калибровка потребует ≥500 diagnostic-outcomes на item. Решение про миграцию, не про логику — комментария в коде нет, материализовалось в schema.prisma
9.а формула v1: floor 0.15 / ceiling 0.60 / aboveLevelFactor 0.5 / minAnswersPerAxis 3. Консерватизм намеренный: недооценить концепт стоит один лишний review, переоценить — пропущенный пробел, который selection перестанет докручивать. Константы вморожены в LEARNER_BOOTSTRAPPED payload (formulaVersion + mappingConstants) — смена v1→v2 не переписывает историю
Асимметрия (обнаружена live-смоуком, наблюдение, не решение): LISTENING-ось считается ThetaEstimator'ом, но ни один seed-концепт не имеет ConceptCategory=LISTENING → сигнал по этой оси сегодня никуда не идёт. Заработает автоматически при добавлении listening-концептов, без изменений в diagnostic/


8. 🔴 Открытые вопросы

| # | Вопрос | Блокирует | Приоритет |
|---|---|---|---|
| 1 | AI provider strategy wiring (Claude + OpenAI fallback) | AI-generation pipeline; нужен до AI Tutor context builder | 🟡 Medium |
| 2 | Listening audio source (TTS vs open-source datasets) | Listening exercises + seed | 🟡 Medium |
| 3 | DiagnosticItem polymorphic vs 3 таблицы | ОТЛОЖЕН решением 3.в (2026-08-02): polymorphic-разбиение без сигнала = работа впустую, YAGNI. Вернуться, когда diagnostic pool реально вырастет | 🟢 Low |
| 4 | Cold-start bootstrap → selection (переформулировано 2026-08-02, НЕ закрыт): bootstrap технически пишет ConceptMastery.pKnown (через LEARNER_BOOTSTRAPPED), НО этот сигнал НЕ доходит до Thompson-приора в posterior.ts — betaParamsForConcept читает только eventCounts (из ITEM_ATTEMPTED) и meanDifficulty (IRT-сложность контента), масштаб/mastery туда не передаётся. Плюс bootstrap ceiling 0.6 жёстко ниже prereqThreshold 0.7 → bootstrap сам по себе никогда не открывает curriculum-гейт, для этого всё равно нужен минимум один реальный recordOutcome | «умный» старт selection для новичка — диагностика влияет на ConceptMastery (dashboard, AI Tutor context, калибровку BKT), но НЕ на то, какой концепт selectNext выберет первым. Подключение bootstrap→bandit — отдельный тикет MVP-1 (раздел 10), решается вместе с adaptive exercise UI | 🟡 Medium → MVP-1 |

9. Дорожная карта
✅ Сделано

MVP-0 bootstrap — монорепо, auth, i18n UI, Prisma, 9 tests
Day 1-2 — Knowledge Graph, 33 tests, 15 concepts + 10 edges
Day 3-4 — BKT+ core, 38 tests, ConceptMastery
i18n content — hybrid JSON+Zod, 4 exercise schemas, reader-helpers
Day 5-6 — Item + ItemReviewState, FSRS wrapper, 60 items, 141 tests
Day 7 — Event sourcing + Service layer, 157 tests
Week 2 — Selection Policy — Thompson Sampling (concept-level, Bernoulli active), prereq gating, review-due priority, informative IRT prior, seedable RNG, SelectionService. +35 tests → 192 total. Verified live 2026-07-11 (selectNext → NEW_INTRODUCTION, детерминизм по seed)
Node 20 → 22 LTS (2026-07-11) — рантайм v22.23.1, WARN про engine ушёл, Prisma client регенерирован под новый ABI, live-запрос к Neon OK. Снимает корень граблей #32/#33 (WARN в stdout, advisory lock) перед миграциями v2
Diagnostic v2 bootstrap (2026-08-02) — LEARNER_BOOTSTRAPPED event: diagnostic (θ per axis) → консервативный маппинг accuracy→pKnown (formula v1: floor 0.15 / ceiling 0.6, aboveLevelFactor 0.5) → upsert N ConceptMastery snapshots. Пишет ТОЛЬКО через event fold (apply.ts) — единственный-путь-записи-инвариант сохранён, никаких прямых UPDATE на ConceptMastery. Strictly-once guard внутри той же transaction (decision 7.a, count существующих событий перед записью). Replay-эквивалентность проверена live — LEARNER_BOOTSTRAPPED фолдится через тот же apply.ts, что и live-путь. learner-model: 158/158 tests. НЕ закрывает #4 полностью — см. раздел 8: сигнал не доходит до Thompson-приора

⏸️ Week 2 — отложено (после MVP-1)

НЕ делается сейчас — оба пункта уезжают после MVP-1:
AI Tutor context builder — блокирован open question #1 (AI provider strategy)
Eval harness — технически не заблокирован (seedable RNG уже готов к offline-прогону), но не приоритет до реальной пользовательской выдачи

MVP-1 — критический путь (по порядку)

1. Deploy пустого scaffold на Vercel — вскрыть инфра-сюрпризы рано, пока цена ошибки низкая (Vercel env vars, DIRECT_URL в проде, Neon prod instance, Sentry/PostHog wiring)
2. Adaptive exercise UI поверх selectNext — переписать exercises/page.tsx (сейчас stub) на reader-helpers + selectNext
3. Progress dashboard с семантическими CEFR-уровнями — BKT-числа (pKnown) ученику не показываем, только понятные уровни/прогресс
4. Реальная регистрация: Guest → registration → diagnostic → exercises (сквозной флоу, сейчас развязан по кускам)
5. Расширить контент-пул — 60 items / 15 concepts исчерпываются быстро при реальном использовании

Также в MVP-1: подключение bootstrap→bandit (открытый вопрос #4, раздел 8; TODO раздел 10)
Cut из MVP-1 (сознательно): AI Tutor (блокирован open question #1), payments, Tutoring Platform — уезжают в MVP-2+

MVP-2

Tutor Workspace (video + whiteboard + chat)


10. TODO (техдолг)

- [x] directUrl = env("DIRECT_URL") в datasource + DIRECT_URL в обоих .env — закрыто 2026-08-02. Снимает хореографию DATABASE_URL=$DIRECT_DB_URL для migrate deploy/status и db execute; митигирует грабли #24/#32/#33 (migrate diff --from-url по-прежнему требует явного direct URL — см. раздел 5)
- [ ] DIRECT_URL в Vercel env vars — до первого деплоя (MVP-1 шаг 1, раздел 9), иначе миграции/db execute в проде тихо используют pooler
- [ ] Проверить "fast-check": "3.23.2" в catalog yaml (сейчас работает, тесты идут)
- [ ] package.json#prisma → prisma.config.ts (deprecation в Prisma 7; warn виден на каждом generate)
- [ ] @types/bcryptjs@3.0.0 deprecated — удалить
- [ ] register/page.tsx: as unknown as cast → useActionState
- [ ] CI GitHub Actions не проверен; Vercel deploy не запускался
- [x] Node 20 → 22 локально — сделано 2026-07-11 (v22.23.1)
- [x] Fix seed item statuses DRAFT→PUBLISHED — оказалось не нужно, уже PUBLISHED (грабля #36 RESOLVED)
- [ ] MVP-1: расширить betaParamsForConcept входом от mastery/bootstrap, чтобы диагностика влияла на приоритет бандита (Thompson-сэмплинг), а не только на curriculum-гейт (см. открытый вопрос #4, раздел 8). Решить коэффициент перевеса pKnown/bootstrap-сигнала vs eventCounts — на реальной выдаче UI, не вслепую


11. Принципы (для AI-ассистента в следующем чате)

Working language: русский в чате, английский в коде/docs/UI/commits — никогда не смешивать
Стиль: прямые ответы; 2-3 варианта с trade-offs когда неочевидно; архитектурные решения за Ivan, AI рекомендует и аргументирует
Не редактировать файлы автоматически без явной просьбы — давать точные инструкции или diff
Доставка кода: 1-2 маленьких файла — в чат; много / новый пакет — ZIP + пошаговый README на русском
В конце сложных ответов — секция «⚠️ Watch out»
Формат фич: Уточнения → Product view → Architecture → Implementation plan → Risks → Definition of done
Перед имплементацией — clarifying questions с lettered options; Ivan отвечает кратко («1.а 2.а 3.а»)
Доверяй, но проверяй HANDOFF: если заявлено «работает» — попроси Ivan проверить запуск
Prisma CLI с Neon: migrate deploy/status и db execute берут DIRECT_URL из datasource сами (закрыто 2026-08-02); migrate diff --from-url — исключение, требует явного $DIRECT_DB_URL. Для чтения — node $queryRawUnsafe


Готов начинать? Diagnostic v2 сделан (раздел 9). Рекомендуемый следующий шаг — MVP-1 критический путь (раздел 9), первым пунктом — deploy пустого scaffold на Vercel: дешёвая страховка от поздних инфра-сюрпризов (env vars, DIRECT_URL в проде, Neon prod, Sentry/PostHog), пока цена ошибки низкая.

Совет по порядку: не откладывать deploy scaffold до готового UI — прод-окружение стоит проверить ДО того, как на нём появится что показать, иначе инфра-грабли (в духе #24/#32/#33, но уже на Vercel) всплывут одновременно с первым релизом, а не отдельно от него.


Лог сессии 2026-07-11 (что реально сделано)

Проверена грабля #36 на живой БД — оказалась ложной: 60/60 items уже PUBLISHED, seed сам ставит статус. Грабля закрыта, TODO снят.
selectNext verified live — createPrismaLearnerDb + createSelectionService против Neon: ok:true, tier NEW_INTRODUCTION, item item.vocab.travel.boarding_pass, детерминизм по seed=42. Cold-start informative prior не вырожден (scores 0.12–0.74).
Node 20 → 22 LTS — nvm use 22 (v22.23.1) + nvm alias default 22, pnpm install, Prisma client регенерирован, live-запрос OK, 192/192 + typecheck clean.
Код не менялся (smoke-скрипт временный, удалён). Коммит — docs:.


Лог сессии 2026-08-02 (что реально сделано)

directUrl закрыт — datasource.directUrl = env("DIRECT_URL"), оба .env обновлены; хореография DATABASE_URL=$DIRECT_DB_URL снята для migrate deploy/status и db execute (migrate diff --from-url — исключение, см. раздел 5)
Diagnostic v2 спроектирован и внедрён: миграция 20260711_diagnostic_v2_bootstrap (имя папки — по дате планирования, не применения; см. раздел 4) (LearnerEventType.LEARNER_BOOTSTRAPPED + DiagnosticItem.irtDiscrimination/irtDifficulty), diagnostic-модуль (types/theta-estimator/bootstrap/index), bootstrap-service.ts (strictly-once guard), replay.ts — discriminated-union ветвление по типу события
Live-смоук (временный скрипт, удалён после прогона) подтвердил: асимметрия pKnown между осями воспроизводится корректно, ceiling 0.6 не нарушается, strictly-once guard блокирует повторный bootstrap, replay бит-в-бит совпадает с live-путём
Смоук ЖЕ вскрыл разрыв: bootstrap-асимметрия НЕ смещает Thompson-выдачу selectNext статистически значимо (z≈-0.02 при N=2000 сэмплов) — подтверждает архитектурный анализ (betaParamsForConcept не читает mastery/bootstrap). Разрыв задокументирован как открытый вопрос #4 → MVP-1 (разделы 8, 10), а не залатан вслепую
learner-model: 158/158 tests (+19: diagnostic 15, bootstrap-service 4). db: 44/44. Typecheck clean across 6 packages
