# Security policy

## Supported versions

Only the current `main` branch is supported. It is what Vercel deploys to production (<https://englishlearn.sytnik-studio.com>); there are no maintained release branches.

## Reporting a vulnerability

**Do not open a public issue.** Report privately through GitHub: **Security → Report a vulnerability** on this repository, or open [a new private advisory](https://github.com/IvanSytnik/english-learn/security/advisories/new) directly.

Please include:

- what is affected (route, server action, package or workflow) and the impact;
- steps to reproduce, ideally against a local setup from the README;
- whether the issue is already public anywhere.

Never paste real secrets into a report: no database URLs, auth secrets, AI provider keys or `.env` contents. If you found a leaked secret, say where it is, not what it is.

## Scope

In scope:

- the web app in `apps/web` (authentication, session handling, authorisation of admin routes, server actions and API routes);
- the packages in `packages/` (database access, learner model, AI orchestration);
- the GitHub Actions workflows in `.github/workflows`.

Out of scope: vulnerabilities in Vercel, Neon, the AI providers or other third-party services themselves (report those to the vendor), and findings that need a compromised account on one of those services to begin with.

Please do not test against the production deployment in a way that affects other users.
