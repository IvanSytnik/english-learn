# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

B2C adults 18–40, CEFR levels A2–C1, learning English for work, immigration, or travel. B2B (language schools) is a planned later audience, not yet served.

## Product Purpose

EnglishLearn diagnoses exactly where a learner is weak across vocabulary, grammar, and listening, then builds every practice session around closing that specific gap instead of running everyone through the same syllabus.

Success is defined by the North Star metric: Weekly Active Learners with ≥3 completed sessions. Supporting metrics: activation (diagnostic + 3 exercises completed within the first 7 days), D7/D30 retention, and — once the tutor marketplace ships — tutor occupancy and per-tutor student NPS.

## Positioning

The mechanism a generic course cannot copy: the product is designed so that a per-skill diagnostic feeds a continuously-recalibrating personalization engine (Bayesian Knowledge Tracing + spaced repetition over a prerequisite knowledge graph), so the practice a learner sees is measured to them and keeps adjusting as they improve — not a fixed path everyone walks.

Long-term positioning (roadmap, not yet live): one product that unifies self-study with a live tutor marketplace, so learners don't need two separate services for self-study and tutoring.

## Operating Context

Route groups: `(marketing)` public landing, `(auth)` login/register, `(student)` dashboard/diagnostic/exercises; admin pages live in a real `admin/` segment (`/admin/*`: content review, users, AI-review). The schema defines `STUDENT`, `TUTOR` and `ADMIN` roles, but only student and admin have any UI; there are no tutor routes or marketplace UI — planned, not built.

The intended core student ritual (not yet wired end-to-end) is: take/retake the diagnostic → get a personalized exercise queue → practice → watch progress update. Admins run the content lifecycle (`DRAFT → REVIEW → PUBLISHED → ARCHIVED`/`REJECTED`) that gates what students can see.

Multilingual by design: EN/RU/UK/DE via next-intl. Content is authored in EN first with per-locale fallback; the working-language convention (RU chat / EN code+docs+UI+commits) is a project convention, not a product fact.

## Capabilities and Constraints

- Status: pre-launch, no real users. The learner model (knowledge graph, BKT+, FSRS, Thompson-sampling selection, diagnostic bootstrap) is implemented and tested as a package but not yet wired to the UI. The exercise and diagnostic pages are stubs; admin content pages are placeholders (no moderation/publishing UI yet — the status lifecycle exists only in the schema).
- Implemented today: registration and login, locale routing (EN/RU/UK/DE), a dashboard shell, and a read-only admin user list.
- Not yet built, explicitly roadmap-only: live tutor marketplace / tutor-facing UI, AI tutor context builder, B2B (schools) offering. These must never be presented in the UI as available — only as "coming soon."
- Monetization (planned, not implemented yet — no billing code exists): Free tier — limited knowledge base + 5 exercises/day. Pro ($9.99/mo) — unlimited AI, full library, analytics. Pro + Tutor — Pro plus N tutor hours, 20% marketplace fee.
- Terminology: "diagnostic" = the CEFR-skill assessment that seeds/re-seeds personalization; "concept" = a node in the prerequisite knowledge graph; "session" = one practice sitting.

## Brand Commitments

- Name: EnglishLearn.
- Lead value proposition, binding: "AI knows where you're weak" — this stays the lead message across surfaces.
- Tutoring/marketplace must be shown only as a roadmap ("coming soon"), never as an available feature, until it actually ships.
- No fabricated social proof: use explicit `[TODO]` placeholders in place of invented testimonials, logos, or case studies.
- Source: `docs/landing-copy.en.md` (EN is the source-of-truth language for product copy; RU/UK/DE are downstream localizations via next-intl).

## Evidence on Hand

- `docs/landing-copy.en.md` — drafted EN landing copy (hero, problem/shift, value props), explicit source of truth for landing messaging.
- Seed/demo accounts exist (`admin@englishlearn.dev`, `student@englishlearn.dev`) for demoing flows — not real user evidence.
- No customer testimonials, case studies, press mentions, or usage benchmarks exist yet. Future work must not fabricate them; the landing copy explicitly calls for `[TODO]` placeholders instead.

## Product Principles

1. Personalization is the product, not a feature — every surface should reflect what this learner needs next, not a fixed curriculum.
2. Never claim what isn't shipped — unshipped capabilities (tutor marketplace, B2B) are marked as roadmap, never presented as active.
3. Evidence over invention — no fabricated social proof; real gaps in evidence are stated, not papered over.
4. One product, not two services — self-study and (future) live tutoring live in a single account/experience, never a separate app.
5. English-first authoring, multilingual by design — content is authored in EN and localized outward; never mix a locale's UI copy with another language's conventions.

## Accessibility & Inclusion

WCAG 2.1 AA is the conformance target for the web app.
