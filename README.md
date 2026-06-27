# EnglishLearn

AI-powered English learning platform. Monorepo with Next.js 16, Prisma 7, Auth.js v5, next-intl, Tailwind v4.

## Quick start (macOS)

### 1. Prereqs

```bash
# Node 22 LTS via nvm (or just install Node 22 directly)
nvm install 22 && nvm use 22

# pnpm 10
corepack enable
corepack prepare pnpm@10.0.0 --activate
pnpm --version   # → 10.x
```

### 2. Create a Neon database

1. Go to https://console.neon.tech and create a project (free tier is fine).
2. Copy the **pooled** connection string (the one ending in `-pooler`).
3. Save it for the next step.

### 3. Install + configure

```bash
# in the project root
pnpm install

cp apps/web/.env.example apps/web/.env
# Edit apps/web/.env:
#   DATABASE_URL=<your neon pooled url>
#   AUTH_SECRET=<run: openssl rand -base64 32>
```

Also create `packages/db/.env` with the same `DATABASE_URL` so Prisma CLI can find it:

```bash
echo "DATABASE_URL=\"<your neon url>\"" > packages/db/.env
```

### 4. Initialize the database

```bash
# Generate the Prisma client and push the schema to Neon
pnpm db:generate
pnpm db:push        # for first-time setup; switch to db:migrate later

# Seed sample data (admin + student users, skill tags, a few exercises)
pnpm db:seed
```

Seed users:
- `admin@englishlearn.dev` / `admin1234`  → ADMIN
- `student@englishlearn.dev` / `student1234`  → STUDENT

### 5. Run

```bash
pnpm dev          # http://localhost:3000
```

## Common commands

| Command                | What it does                                     |
| ---------------------- | ------------------------------------------------ |
| `pnpm dev`             | Run all apps in dev mode                         |
| `pnpm build`           | Build all apps                                   |
| `pnpm lint`            | Biome lint                                       |
| `pnpm check`           | Biome lint + format with autofix                 |
| `pnpm typecheck`       | TypeScript check across the workspace            |
| `pnpm test`            | Vitest unit tests                                |
| `pnpm test:e2e`        | Playwright e2e (requires dev server)             |
| `pnpm db:generate`     | Regenerate Prisma client                         |
| `pnpm db:push`         | Push schema to DB without migration files (dev)  |
| `pnpm db:migrate`      | Create + apply a migration                       |
| `pnpm db:seed`         | Seed sample data                                 |
| `pnpm db:studio`       | Open Prisma Studio                               |

## Deployment to Vercel

1. Push to GitHub.
2. Import the repo on Vercel.
3. **Root Directory:** `apps/web` (Vercel detects the monorepo via `vercel.json`).
4. **Framework Preset:** Next.js.
5. Add env vars in the Vercel dashboard:
   - `DATABASE_URL` (Neon pooled connection)
   - `AUTH_SECRET`
   - `AUTH_URL` (`https://your-domain.vercel.app`)
6. After first deploy, run migrations once:

   ```bash
   # Locally, against the production DB:
   DATABASE_URL=<prod url> pnpm --filter @englishlearn/db migrate:deploy
   ```

## Project structure

```
englishlearn/
├── apps/
│   └── web/                         # Next.js 16 app (student + admin)
│       ├── app/
│       │   ├── (marketing)/         # public landing
│       │   ├── (auth)/login,register
│       │   ├── (student)/dashboard,diagnostic,exercises
│       │   └── (admin)/content/*,users,ai-review
│       ├── i18n/                    # next-intl routing config
│       ├── messages/                # en | ru | uk | de
│       ├── lib/                     # auth, env
│       ├── tests/unit, tests/e2e
│       └── proxy.ts                 # NEW in Next.js 16 (was middleware.ts)
├── packages/
│   ├── db/                          # Prisma schema, client, seed, queries
│   ├── ai/                          # Claude/OpenAI prompts + schemas
│   ├── ui/                          # shared React components (Tailwind)
│   └── config/                      # shared tsconfig
├── pnpm-workspace.yaml              # catalog: pinned versions
├── turbo.json
└── biome.json
```

## Architectural notes

### Why a route group for admin and not a separate app?

One auth, one Prisma client, one deploy. RBAC enforced in `proxy.ts` via the `authorized` callback. Bundle size watched via `@next/bundle-analyzer` (add in next phase). When admin needs heavy deps (rich text, audio editor), it gets extracted into its own app.

### Why `proxy.ts` and not `middleware.ts`?

Next.js 16 renamed it. The old `middleware.ts` still works with a deprecation warning, but new projects should use `proxy.ts`. The runtime is now Node.js only (no Edge) for the proxy.

### Why `publishedExercises` wrapper in `@englishlearn/db/queries/exercises`?

To prevent leaking DRAFT content into the student app. Student-facing pages MUST import from `@englishlearn/db/queries/exercises`. Admin pages can use the raw `prisma` client.

### Content lifecycle

Every content model has a `status` field: `DRAFT → REVIEW → PUBLISHED → ARCHIVED` (or `REJECTED`). AI-generated content is always created as `DRAFT`; an admin must explicitly publish.

### Pseudo-CAT diagnostic

Simple branching logic (2 right → level up, 2 wrong → level down) without IRT calibration. Good enough for MVP. Track `levelTrajectory` per attempt for debugging. Replace with real CAT (Maximum Fisher Information) once you have ~1000 attempts to calibrate item parameters.

## Watch out

- **Next.js 16 + next-intl + `use cache`:** known compat friction. We don't use `use cache` yet; if you add it, read https://aurorascharff.no/posts/implementing-nextjs-16-use-cache-with-next-intl-internationalization/ first.
- **NextAuth v5 is technically still in beta.** Stable enough for prod (most of the ecosystem uses it), but follow https://github.com/nextauthjs/next-auth/releases.
- **Prisma 7** uses a custom generator output path (`packages/db/src/generated/client`). Don't move it without updating imports.
- **Tailwind v4** uses CSS-first config (`@theme { ... }` in `globals.css`). No `tailwind.config.ts`.
- **`.env` is per-package** for Prisma but per-app for Next.js. Both files need `DATABASE_URL`.
- **Seed passwords are sample only.** Change them before exposing to anyone.

## Roadmap (rough)

- **MVP-0 (current scaffolding):** auth, diagnostic shell, exercise listing, admin shell.
- **MVP-0 finish:** real diagnostic engine (pseudo-CAT), exercise UIs with attempt persistence, admin CRUD with audio upload to R2.
- **MVP-1:** Tutor Workspace (async — assignments, progress, notes).
- **MVP-2:** Live lessons (LiveKit + Yjs whiteboard).
- **MVP-3:** Stripe + tutor marketplace.

