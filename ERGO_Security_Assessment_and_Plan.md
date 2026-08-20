# ERGO HRMS — Security Assessment & Implementation Plan

**Prepared:** 20 August 2026
**Scope reviewed:** backend (`Node.js/Express/PostgreSQL`) and frontend (`React/Vite`) source, auth and session handling, all controllers/routes, dependency lockfiles, environment/secrets configuration.
**Method:** direct source review of every backend controller, route, and security-relevant utility; a dependency vulnerability scan (`npm audit`) against both lockfiles; a targeted grep sweep of the frontend for DOM-based XSS sinks; verification of `.env` handling and git exposure.

## Headline finding

The premise that "nothing has been done about security" is not accurate — this codebase already has a genuinely solid foundation: parameterized SQL everywhere (no injection found across 8 controllers), no broken-object-level-access found (an employee cannot read or edit another employee's attendance/leave/salary/payslip data — verified function by function), bcrypt at work factor 12, a real password-history and complexity policy, HMAC-hashed and constant-time-compared OTPs, hashed single-use reset tokens, JWT invalidation on password change (a real "log out of all devices"), generic error messages that prevent account enumeration, and rate limiting on every authentication-sensitive endpoint. The mandatory first-login password change is enforced on both the frontend *and* the backend — closing a hole the team found and fixed themselves.

What's missing is less about basic hygiene and more about production hardening, dependency freshness, and operational security (audit trails, monitoring, secrets management, MFA). Below is what was actually found, ranked by severity, followed by a phased plan.

---

## Findings

### High priority

1. **Vulnerable dependencies (confirmed via `npm audit`).**
   - Frontend: `react-router-dom` (6.x, in use) pulls in `react-router` versions affected by an open-redirect bypass and an arbitrary-constructor-injection issue in SSR hydration (moderate/high). Fix: `npm audit fix` in `frontend/` — this one is a non-breaking patch.
   - Frontend: `vite`/`esbuild` — the bundled dev server will accept and relay requests from any website that reaches it (moderate). Low real-world risk in production (the dev server is never exposed publicly), but the dev server should never be bound to `0.0.0.0` or exposed to the internet.
   - Backend: `exceljs` depends on a vulnerable `uuid` (buffer bounds check, moderate). No non-breaking fix exists yet (`npm audit fix --force` downgrades exceljs to 3.4.0, a breaking change) — track the advisory and re-run `npm audit` monthly rather than force-downgrading blind.

2. **`trust proxy` is never configured**, yet the README's own production guidance says to put Nginx/Caddy/Cloudflare in front of the app. Without `app.set('trust proxy', 1)` (or the correct hop count), Express's rate limiter reads the reverse proxy's IP for every request, not the real client's. Practical impact: either every user on the team shares one rate-limit bucket (one person's failed logins can lock out the whole 10-person office), or `express-rate-limit` throws validation errors on `X-Forwarded-For` and rate limiting silently misbehaves. This is a one-line fix but it's currently a real gap between what the README promises and what the code does.

3. **JWT lives in `localStorage`, and there is no Content-Security-Policy configured beyond Helmet's defaults.** No XSS sink was found in the current frontend (no `dangerouslySetInnerHTML`, `innerHTML`, or `eval` anywhere — verified by grep across all of `frontend/src`), so there is no exploitable XSS *today*. But the design has no defense-in-depth: if a future dependency or a future PR introduces one XSS bug, the attacker walks away with a token that's valid for 8 hours with no revocation short of a password change. Recommend adding an explicit CSP header and treating token storage as a design decision to revisit (see plan below), not just relying on "we don't have XSS yet."

### Medium priority

4. **No rate limiting on report/payroll-generation endpoints.** `/api/reports/salary/compute/download`, `/api/reports/payslips/:id/download`, and `/api/reports/consolidated/excel` (PDF/Excel generation, the most CPU/memory-expensive operations in the app) have no rate limiter, unlike every auth endpoint. Any authenticated user — including a compromised low-privilege employee account — could hammer these to degrade service for everyone.

5. **Sensitive admin actions bypass the audit log.** `services/auditLog.js` exists and is used consistently by the password-reset flows, but several destructive/high-impact mutations never call it: deleting an employee (`userController.deleteUser`, which cascades away their salary/attendance/leave/payslip history), activating/deactivating an account, changing someone's salary rate (`salaryController.updateSalaryRate`), and admin overrides on leave/attendance. For a payroll system, "who changed whose salary, when, and from what" needs to be answerable from an immutable log, not just the current row.

6. **Two temp-password generators with very different strength coexist.** `utils/secureTokens.js` generates a proper 14-character CSPRNG password used correctly by the password-reset flows. But `utils/passwordGen.js` — a separate, much weaker generator producing a fixed-pattern password (`Ergo@` + 4 digits + 2 letters, ~2.36 million possible combinations, predictable prefix) — is what actually gets used when an admin onboards a new employee (`userController.createUser`). The exposure window is short (the account is locked to the mandatory password-change screen and login is rate-limited), but there's no reason to have a weaker path at all when a stronger one already exists in the same codebase.

7. **Single admin account, no MFA.** One admin holds the keys to everyone's salary, bank details, and PII. Password strength and rate limiting help, but a single factor protecting that much sensitive data is a concentration risk worth closing.

8. **No per-account lockout on the main login endpoint**, only per-IP (10 failed/15min, successful logins don't count against it). A slow, distributed attempt spread across IPs against one specific `employee_id` isn't caught the way the OTP flow's 5-attempt account lock catches it. Low risk at 10 employees, but cheap to add.

### Low / informational

9. **Local `.env` values are dev-grade placeholders** (`DB_PASSWORD=postgres`, a human-readable `JWT_SECRET`) — this is correctly gitignored (verified at both repo root and `backend/.gitignore`) and the README already documents generating real secrets with `openssl rand -hex 32` for production. The only gap is *process*: recommend a secrets manager (Doppler, 1Password Secrets Automation, AWS/GCP Secrets Manager) for the production deployment instead of a flat `.env` file on the server, plus a documented rotation cadence.
10. No automated dependency scanning in CI — no Dependabot/Renovate config, no `npm audit` gate. This assessment was a point-in-time manual check; without automation, the findings above will simply recur.
11. No CI pipeline visible at all (no `.github/workflows`) — the 184 passing tests are a real asset but currently only run when someone remembers to run them locally.
12. `frontend/package.json` has a `lint` script but ESLint was never installed as a devDependency (confirmed in `AGENTS.md`), so no static analysis currently guards against risky patterns being introduced later (e.g., a careless `dangerouslySetInnerHTML`).
13. PII at rest — bank account numbers, IFSC codes, date of birth, home address — is stored as plain columns in Postgres with no column-level encryption and no documented DB backup/restore or encryption-at-rest policy. Reasonable for a 10-person startup on a managed Postgres host with disk encryption, but worth stating explicitly rather than leaving implicit.
14. No HTTPS enforcement inside the app itself — entirely delegated to the reverse proxy, which is a reasonable and common pattern, but the deployment runbook should make this a hard checklist item, not an assumption.

---

## Implementation plan

### Phase 0 — This week (cheap, no architecture change)
- Add `app.set('trust proxy', 1)` (or the correct hop count for your actual proxy chain) in `app.js`. *(Finding 2)*
- Run `npm audit fix` in `frontend/` to pick up the non-breaking `react-router-dom` patch. *(Finding 1)*
- Add a rate limiter to the report/payslip/Excel download routes (same `express-rate-limit` pattern already used in `authRoutes.js`, just a more generous per-user window). *(Finding 4)*
- Retire `utils/passwordGen.js` and point `userController.createUser` at `utils/secureTokens.js`'s `generateTempPassword` instead, so onboarding and reset share one strong implementation. *(Finding 6)*
- Add an explicit `Content-Security-Policy` via Helmet's `contentSecurityPolicy` option scoped to what the app actually needs (`default-src 'self'`, etc.). *(Finding 3)*

### Phase 1 — Next 2–4 weeks (moderate effort)
- Wire `services/auditLog.js` into `deleteUser`, `updateUserStatus`, `updateSalaryRate`, and leave/attendance admin overrides, so every sensitive mutation has a who/what/when trail. *(Finding 5)*
- Add per-account (not just per-IP) failed-login tracking on the main login endpoint, mirroring the 5-attempt lock already used for admin OTP verification. *(Finding 8)*
- Stand up a minimal CI pipeline (GitHub Actions is fine): run the existing 184 Jest/Supertest tests, `npm audit --audit-level=high` as a gate, and add ESLint (with `eslint-plugin-security`) to the frontend build. *(Findings 10, 11, 12)*
- Move production secrets out of a flat `.env` file into a secrets manager, with a documented rotation policy for `JWT_SECRET`, `OTP_PEPPER`, and `DB_PASSWORD`. *(Finding 9)*

### Phase 2 — Before/at production launch (higher effort, higher payoff)
- Add TOTP-based MFA for the admin account at minimum (libraries like `otplib` make this a contained addition given the existing OTP infrastructure you already built for password reset). *(Finding 7)*
- Formalize the production deployment checklist from the README into an actual runbook: HTTPS termination at the proxy verified end-to-end, `NODE_ENV=production` confirmed, `trust proxy` value matched to the real proxy topology, health checks wired into uptime monitoring. *(Finding 14)*
- Decide deliberately on the token-storage question — either keep `localStorage` and formally accept the tradeoff (XSS is your primary residual risk, so CSP + dependency hygiene become your main defenses), or move to an httpOnly-cookie + CSRF-token pattern if you want XSS-token-theft off the table entirely. Either is defensible for a 10-person internal tool; what matters is it's a decision, not a default. *(Finding 3)*
- Document a backup/restore drill for the Postgres database and confirm disk-level (or column-level, for bank details specifically) encryption at rest with your hosting provider. *(Finding 13)*

### Ongoing
- Re-run `npm audit` monthly (or on every dependency bump) for both `backend/` and `frontend/`, and track the `exceljs`/`uuid` advisory for a non-breaking fix.
- Review the audit log periodically as part of admin operations, now that Phase 1 makes it comprehensive.
- Revisit this assessment after any major feature (e.g., file uploads, a public-facing careers/applicant portal) — those introduce attack surface this review didn't need to cover because the current app doesn't have them.

---

## What NOT to worry about right now

To keep this actionable rather than alarming: there is no SQL injection, no broken access control/IDOR, no mass-assignment vulnerability, and no client-side XSS sink anywhere in the current codebase — these were the highest-value things to check and all came back clean on direct code review, not just documentation claims. The work above is about closing the gap between "secure for a 10-person internal tool run by people who know what they're doing" and "secure by design, with the guardrails that survive turnover, mistakes, and scale" — it's hardening on top of a real foundation, not a rescue.
