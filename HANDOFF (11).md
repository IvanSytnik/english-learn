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
LayerChoiceNotesFrameworkNext.js 16.2.9 + React 19.2.7proxy.ts вместо middleware.ts; typedRoutes в корне next.config.tsLanguageTypeScript 6.0.3moduleResolution: "Bundler" — БЕЗ .js суффиксов; в paths НЕТ baseUrlDB/ORMPrisma 6.16.2Prisma 7 ломает datasource.url — остаёмся на 6.16.2DatabaseNeon Postgres (eu-central-1)Connection string в apps/web/.env И packages/db/.env. CLI-миграции ТОЛЬКО через direct URLAuthnext-auth 5.0.0-beta.31 (Auth.js v5)JWT, Credentials + Prisma adapteri18n UInext-intl 4.13app/[locale]/..., localePrefix: 'as-needed'i18n contenthybrid JSON + Zodcontent Json (jsonb) + LocalizedString (EN required, fallback)StylingTailwind 4.3.1UI functional bootstrap, не финальный дизайнState/FormsTanStack Query 5, Zustand 5, RHF 7.80 + Zod 4.4TestingVitest 4.1.9, Playwright 1.61, fast-check 3.23.2property-based в learner-model и dbSpaced repetitionts-fsrs 5.4.1единственный импортёр — learner-model/src/core/fsrs/wrapper.tsToolingBiome 2.5, Turborepo 2.10, pnpm 10 (catalogs), Node 22 LTSлокально v22.23.1 (bumped 2026-07-11); engines требует >=22.0.0, WARN ушёлAIAnthropic Claude (primary) + OpenAI (fallback)Не подключено

3. Структура (learner-model — актуальная)
packages/learner-model/src/
├── core/
│   ├── graph/        # Layer 3: types/build/graph — 33 tests
│   ├── bkt/          # Layer 2: constants, types, irt, forgetting, model — 38 tests
│   └── fsrs/         # Layer 1: types, wrapper (ЕДИНСТВЕННЫЙ импортёр ts-fsrs) — 17 tests
├── adapters/         # BktState↔ConceptMastery, FsrsCardState↔ItemReviewState — 8 tests
├── policy/           # ← NEW (Week 2): Thompson Sampling selection
│   ├── rng.ts        #   seedable mulberry32 + Beta (Marsaglia–Tsang). Math.random ЗАПРЕЩЁН
│   ├── types.ts      #   PolicyConfig, SelectionInput/Result, snapshots
│   ├── reward.ts     #   strategy dispatch + calibration gate (bernoulli|learning_gain|hybrid)
│   ├── posterior.ts  #   Beta-параметры + informative IRT cold-start prior
│   ├── curriculum.ts #   prereq hard-gate (introduction) / soft (review)
│   ├── select.ts     #   ГЛАВНЫЙ orchestrator: REVIEW_DUE → NEW_INTRODUCTION → EXPLORATION_FLOOR
│   ├── index.ts
│   └── __tests__/    #   rng(7) + reward(9) + curriculum(6) + select(9) = 31 tests
├── service/
│   ├── db-port.ts            # repository-интерфейс (+ 4 selection read-методов, Week 2)
│   ├── prisma-db.ts          # единственная Prisma-реализация (+ 4 метода: 2 через $queryRaw)
│   ├── event-store.ts        # конструирование/парсинг событий через Zod
│   ├── apply.ts              # ЕДИНЫЙ pure fold (live path + replay)
│   ├── learner-service.ts    # recordOutcome orchestrator (WRITE path)
│   ├── selection-service.ts  # ← NEW: selectNext orchestrator (READ path)
│   ├── replay.ts             # replayUser, full rebuild, курсорная пагинация
│   └── __tests__/            # learner-service(8) + selection-service(4, in-memory fake port)
├── index.ts          # barrel: graph + bkt + policy + createSelectionService
└── seed/             # concepts(15)+edges(10), items(60)
Остальные пакеты: apps/web, apps/landing, packages/{db,ai,ui,config}.

4. Schemas + Data в Neon (без изменений с 2026-07-06)

Auth: User(+role), Account, Session, VerificationToken
StudentProfile, SkillTag, SkillLevel
VocabExercise/GrammarExercise/ListeningExercise (+Attempts) — content Json, lifecycle DRAFT→REVIEW→PUBLISHED→ARCHIVED→REJECTED
DiagnosticItem + DiagnosticAttempt (pseudo-CAT) + DiagnosticAnswer
Concept(15) + ConceptEdge(10) + ConceptMastery (per-user BKT snapshot)
Item(60) — conceptId FK, irtDiscrimination/irtDifficulty, stable IDs item.<concept>.<slug>. Все status = PUBLISHED (verified live 2026-07-11; seed/items/run.ts:67 ставит статус)
ItemReviewState — per-user FSRS snapshot
LearnerEvent — append-only, ITEM_ATTEMPTED; payload = self-contained snapshot (denormalized conceptId, frozen rating + irt {a,b})

Seed users: admin@englishlearn.dev / admin1234, student@englishlearn.dev / student1234
Selection policy миграций НЕ требует — читает существующие таблицы.

5. Команды (рабочие)
bashpnpm install
pnpm --filter @englishlearn/db generate
pnpm db:seed
pnpm --filter @englishlearn/learner-model seed:concepts
pnpm --filter @englishlearn/learner-model seed:items
pnpm dev
pnpm test        # 192/192 (learner-model 139 · db 44 · ui 3 · web 6 · ai 0)
pnpm typecheck   # CLEAN across 6 packages

# Миграции — ТОЛЬКО через direct URL (без -pooler), из директории пакета (грабли 24-25, 32):
export DIRECT_DB_URL="postgresql://...@ep-...-asj7wsfl.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
cd packages/db
pnpm exec prisma migrate diff --from-url "$DIRECT_DB_URL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<name>/migration.sql
head -3 prisma/migrations/<name>/migration.sql
DATABASE_URL="$DIRECT_DB_URL" pnpm exec prisma migrate deploy

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

Neon pooler silent-fail на DDL — всегда DATABASE_URL="$DIRECT_DB_URL" ... migrate deploy. Direct URL = убрать -pooler (но .c-4. оставить!)
migrate diff через pooler = стейл schema view → всегда --from-url "$DIRECT_DB_URL"
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

Зелёные тесты bootstrap (158, packages/learner-model/src/service/__tests__/bootstrap-service.test.ts + src/diagnostic/__tests__/bootstrap.test.ts) и зелёные тесты selection (policy/__tests__/select.test.ts) по отдельности НЕ доказывают, что bootstrap реально долетает до selectNext — каждый набор тестирует свою подсистему через свой fake/in-memory DB-порт, независимо друг от друга. Нужен явный integration-тест: bootstrap пишет ConceptMastery для userId → selectNext на том же userId читает и решает по итоговому состоянию. Такого теста сейчас нет (см. открытый вопрос #4, раздел 8) — граница между «bootstrap пишет» и «selection читает и на что-то влияет» технически не покрыта.


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


8. 🔴 Открытые вопросы
#ВопросБлокируетПриоритет1AI provider strategy wiring (Claude + OpenAI fallback)AI-generation pipeline; нужен до AI Tutor context builder🟡 Medium2Listening audio source (TTS vs open-source datasets)Listening exercises + seed🟡 Medium3DiagnosticItem polymorphic vs 3 таблицыРасширение pool; решается в Diagnostic v2🟢 Low

4Cold-start bootstrap → selection (переформулировано 2026-08-02, НЕ закрыт): bootstrap технически пишет ConceptMastery.pKnown (через LEARNER_BOOTSTRAPPED), НО этот сигнал НЕ доходит до Thompson-приора в posterior.ts — betaParamsForConcept читает только eventCounts (из ITEM_ATTEMPTED) и meanDifficulty (IRT-сложность контента), масштаб/mastery туда не передаётся. Плюс bootstrap ceiling 0.6 жёстко ниже prereqThreshold 0.7 → bootstrap сам по себе никогда не открывает curriculum-гейт, для этого всё равно нужен минимум один реальный recordOutcome. Итог: диагностика уже влияет на ConceptMastery (→ dashboard, AI Tutor context, будущую калибровку BKT), но НЕ на то, какой концепт selectNext выберет первым для новичка — Thompson-сэмплинг стартует с той же generic IRT-приорой, что и без диагностики. Подключение bootstrap→bandit — отдельный тикет MVP-1 (см. раздел 10), решается вместе с adaptive exercise UI, где эффект станет видимым и калибруемым 🟡 Medium → MVP-1


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

➡️ Week 2 — осталось

AI Tutor context builder — блокирован open question #1 (AI provider strategy)
Eval harness — можно строить на policy (seedable RNG уже готов к offline-прогону)

Diagnostic v2 — clarifying questions (для нового чата)
Рекомендация Claude: 1.б 2.в 3.в

Насколько «настоящий» CAT в v2: (а) full IRT-CAT — адаптивный выбор по max Fisher info, стоп по SE(θ), переиспользует существующий IRT 2PL; (б) CEFR-branching (как сейчас) + IRT-скоринг на выходе → θ→CEFR + маппинг в ConceptMastery; (в) только bootstrap — механику выбора вопросов не трогаем, добавляем лишь маппинг результата в mastery
Как diagnostic инициализирует ConceptMastery (#4): (а) через event sourcing — новый тип DIAGNOSTIC_ANSWERED, фолдится обычным путём (нужен conceptId на DiagnosticItem); (б) прямой bootstrap-снэпшот в ConceptMastery (два пути записи); (в) единый event LEARNER_BOOTSTRAPPED с полным начальным снэпшотом, фолдится существующим apply
Решаем ли #3 (polymorphic vs 3 таблицы) сейчас: (а) 3 таблицы (симметрично Exercise: Vocab/Grammar/Listening Diagnostic); (б) single polymorphic table с content Json (YAGNI, pool маленький); (в) откладываем — не блокирует CAT/bootstrap
Обоснование 1.б/2.в/3.в: не строить full-CAT на некалиброванных a/b (мнимая точность до 500 outcomes/concept — тот же strategy-switch, что в selection); LEARNER_BOOTSTRAPPED сохраняет инвариант «никаких прямых UPDATE на mastery» и не плодит второй путь записи; polymorphic-разбиение без сигнала = работа впустую (YAGNI, как ExerciseItem M:N).

MVP-1

Финальный UX/UI; переписать exercises/page.tsx (сейчас stub) на reader-helpers + selectNext
Multilingual landing SEO, tutor onboarding, Stripe, PostHog + Sentry

MVP-2

Tutor Workspace (video + whiteboard + chat)


10. TODO (техдолг)

 (приоритет — ПЕРЕД миграциями Diagnostic v2) directUrl = env("DIRECT_URL") в datasource + DIRECT_URL в обоих .env — снимет всю хореографию DATABASE_URL=$DIRECT_DB_URL. Корень граблей #24/#32/#33 и слетающего export при смене shell (эта сессия споткнулась трижды). v2 потянет миграцию → закрыть до неё
 Проверить "fast-check": "3.23.2" в catalog yaml (сейчас работает, тесты идут)
 package.json#prisma → prisma.config.ts (deprecation в Prisma 7; warn виден на каждом generate)
 @types/bcryptjs@3.0.0 deprecated — удалить
 register/page.tsx: as unknown as cast → useActionState
 CI GitHub Actions не проверен; Vercel deploy не запускался
 Node 20 → 22 локально — сделано 2026-07-11 (v22.23.1)
 Fix seed item statuses DRAFT→PUBLISHED — оказалось не нужно, уже PUBLISHED (грабля #36 RESOLVED)
 MVP-1: расширить betaParamsForConcept входом от mastery/bootstrap, чтобы диагностика влияла на приоритет бандита (Thompson-сэмплинг), а не только на curriculum-гейт (см. открытый вопрос #4, раздел 8). Решить коэффициент перевеса pKnown/bootstrap-сигнала vs eventCounts — на реальной выдаче UI, не вслепую


11. Принципы (для AI-ассистента в следующем чате)

Working language: русский в чате, английский в коде/docs/UI/commits — никогда не смешивать
Стиль: прямые ответы; 2-3 варианта с trade-offs когда неочевидно; архитектурные решения за Ivan, AI рекомендует и аргументирует
Не редактировать файлы автоматически без явной просьбы — давать точные инструкции или diff
Доставка кода: 1-2 маленьких файла — в чат; много / новый пакет — ZIP + пошаговый README на русском
В конце сложных ответов — секция «⚠️ Watch out»
Формат фич: Уточнения → Product view → Architecture → Implementation plan → Risks → Definition of done
Перед имплементацией — clarifying questions с lettered options; Ivan отвечает кратко («1.а 2.а 3.а»)
Доверяй, но проверяй HANDOFF: если заявлено «работает» — попроси Ivan проверить запуск
Все CLI Prisma с Neon — только через DIRECT_DB_URL; для чтения — node $queryRawUnsafe


Готов начинать? Рекомендуемый следующий шаг — Diagnostic v2 (разблокирует cold-start bootstrap #4 + решает #3, ничем внешним не заблокирован). Clarifying questions уже намечены в разделе 9 (рекомендация 1.б 2.в 3.в).

Совет по порядку: перед первой миграцией v2 сначала закрыть TODO directUrl (раздел 10) — снимет хореографию с DIRECT_DB_URL и класс граблей #24/#32/#33. Это ~15 минут и убирает главный источник трения при миграциях.


Лог сессии 2026-07-11 (что реально сделано)

Проверена грабля #36 на живой БД — оказалась ложной: 60/60 items уже PUBLISHED, seed сам ставит статус. Грабля закрыта, TODO снят.
selectNext verified live — createPrismaLearnerDb + createSelectionService против Neon: ok:true, tier NEW_INTRODUCTION, item item.vocab.travel.boarding_pass, детерминизм по seed=42. Cold-start informative prior не вырожден (scores 0.12–0.74).
Node 20 → 22 LTS — nvm use 22 (v22.23.1) + nvm alias default 22, pnpm install, Prisma client регенерирован, live-запрос OK, 192/192 + typecheck clean.
Код не менялся (smoke-скрипт временный, удалён). Коммит — docs:.
