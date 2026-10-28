# Code Conventions

## Files and structure
- File names: kebab-case (`exercise-player.tsx`); React components: PascalCase exports, one component per file.
- Server actions: `actions.ts` co-located with the route segment, `"use server"`, return `Result<T, E>`.
- Tests: next to the code in `__tests__/` or in `apps/web/tests/{unit,e2e}`; file name `<name>.test.ts(x)`, DB tests `<name>.db.test.ts`.
- DB access only via `packages/db` (queries in `src/queries`); `new PrismaClient` only in `packages/db/src/create-client.ts`.
- AI calls only via `packages/ai` (planned, MVP-2 — the package does not exist yet).

## Language
- Code, comments, commits, docs, UI strings, DB entities: English. No Cyrillic in code.
- All UI text goes through next-intl; keys are identical in all 4 locales (enforced by `tests/unit/messages.test.ts`).

## Invariants (break one only with an explicit decision in DECISIONS.md)
- Learner state changes only through `LearnerEvent` (`recordOutcome`, bootstrap); no direct UPDATE of mastery/review rows.
- The answer key (`correctIndex`, `acceptedAnswers`) never reaches the client; grading happens on the server.
- No `Math.random` in policy code — only the injected seedable `Rng`.
- Every `page`/`layout` under `admin/` and `tutor/` calls `requireRole(...)`; every server action there calls `authorizeAction(...)`.
- Redirects under `app/[locale]/**` only via `@/i18n/navigation`.
- Colors only via semantic tokens; feedback never by color alone (icon + word).
- Learners never see BKT numbers — only semantic stages.
- AI-generated content goes DRAFT → REVIEW → PUBLISHED.
- Every client call of a server action inside a transition is wrapped in `try/catch` with an inline retry.

## Enums and schemas
- Prisma enum is canonical; the Zod runtime twin is named `XxxValue` + `XxxSchema` (e.g. `ItemKindValue`).

## Database operations
- All Prisma CLI operations against Neon (`migrate diff/deploy/status`, `db execute`) use the DIRECT connection URL, never the pooler.
- Expand migrations ship before the code that uses them; contract migrations ship after the code stops using the column.
- The assistant never writes to the production database; prod commands are prepared for Ivan.

## Commits
- Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`), English, no AI trailers.
- Migrations in a separate commit from the code that depends on them.
