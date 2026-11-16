# Security Policy

## Supported versions

EnglishLearn is pre-launch and ships continuously from `main`. Only the current `main` branch and the deployment built from it are supported; there are no versioned releases to backport fixes to.

## Reporting a vulnerability

Please **do not** open a public issue, pull request or discussion for a security problem.

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** ([direct link](https://github.com/IvanSytnik/english-learn/security/advisories/new)). If that option is not available, contact the maintainer through the [GitHub profile](https://github.com/IvanSytnik) and ask for a private channel before sharing any details.

Helpful to include:

- the affected route, server action or package (for example `apps/web/app/[locale]/(auth)/login`, `packages/db/src/queries/...`);
- steps to reproduce, and what an attacker gains;
- whether you tested against a local instance or the live deployment.

Never paste real secrets into a report: no database URLs, auth secrets, AI provider keys or `.env` contents. If you found a leaked secret, say where it is, not what it is.

Every report is acknowledged. Fixes are made on `main`; you will be told when the fix is deployed and, if you want, credited in the advisory.

## Scope

In scope: the code in this repository and the deployment built from it — authentication and session handling (Auth.js), role checks on `/admin` routes and server actions, answer-key exposure (grading is server-side; keys must never reach the client), data access in `packages/db`, the GitHub Actions workflows in `.github/workflows`, and secrets handling.

Out of scope: denial-of-service and volume testing, social engineering, findings in third-party services (Vercel, Neon, Sentry, Resend) that are not caused by this code, and reports from automated scanners without a demonstrated impact.

## Testing guidelines

- Prefer a local instance (see *Getting Started* in the [README](README.md)); the seeded dev accounts exist for that.
- Do not access, modify or delete data that is not yours, and do not degrade the live deployment.
- Never put secrets, tokens or personal data in an issue or a pull request.
