Code Conventions
File naming: kebab-case
Components: PascalCase
Server actions in actions/ with "use server"
One component per file
Co-locate tests: Component.test.tsx
All UI text → next-intl, no hardcoded strings
Errors: typed Result<T, E> для server actions
DB access only via packages/db
AI calls only via packages/ai (centralized prompts + logging)
Commits: Conventional Commits (feat:, fix:, chore:...)
Enums: Prisma enum is canonical; Zod runtime twin is named XxxValue + XxxSchema (e.g. ItemKindValue) to avoid export collisions in @englishlearn/db
All Prisma CLI operations against Neon (migrate diff/deploy, db execute) use the DIRECT connection URL, never the pooler
Static assets: lowercase file names (the proxy matcher's extension list is case-sensitive, so `logo.PNG` goes through the proxy and 404s)
E2E: logins go through tests/e2e/helpers/auth.ts (login/submitLogin, seed users, AFTER_SUBMIT timeout); no ad-hoc login code in specs
