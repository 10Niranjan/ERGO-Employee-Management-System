# AGENTS.md — Context for AI Coding Agents

This file orients an AI agent (or a new contributor) picking up this repo. It
covers what exists, what was recently changed, and non-obvious conventions
that are easy to break without knowing they're there.

## Project

ERGO is an Employee Salary, Leave & Daily Attendance Management System (HRMS)
for a ~10-person startup team. Two roles: **Admin** (1 manager) and
**Employee** (~10). Full business rules live in `BRD_Employee_Management.pdf`
at the repo root — read it before changing any cutoff times, salary formulas,
or leave logic.

- **Frontend**: `frontend/` — React 18 + Vite 5 + React Router 6, plain CSS
  (no Tailwind/CSS-in-JS), `lucide-react` for icons.
- **Backend**: `backend/` — Node.js + Express + PostgreSQL, JWT auth,
  154 passing Jest/Supertest tests (9 suites).

The frontend redesign further down was frontend-only; the salary engine
section below was an explicit, deliberate backend change (migration +
service + controllers + tests). Backend is not off-limits — it just wasn't
in scope until the user asked for it. Same rule either way: don't touch
`backend/` speculatively, only when a task actually calls for it.

## Local dev

```bash
# Backend (needs PostgreSQL running, backend/.env configured)
cd backend && npm install && npm run migrate && npm run seed && npm run dev
# → http://localhost:5000

# Frontend
cd frontend && npm install && npm run dev
# → http://localhost:5173
```

Seeded admin login: `admin@ergo.com` / `Admin@1234` (forces a password reset
on first login — that's the `RequirePasswordReset` flow in
`frontend/src/routes/ProtectedRoutes.jsx`).

`npm run lint` in `frontend/` is currently a no-op — `eslint` was never
installed as a devDependency. Pre-existing gap, not fixed yet.

## Salary engine — calendar-days monthly model (current, 15 Aug 2026)

The salary engine (`backend/src/services/salaryService.js`) computes pay from
a **monthly salary figure**, not an admin-entered flat daily rate. This
**replaced** the previous per-day-rate model — check `git log` on
`services/salaryService.js` if you need the old formula for reference.

Confirmed formula (owner-approved, not up for silent reinterpretation):

```
Per-Day Rate = Monthly Salary ÷ Actual Days in That Calendar Month  (28-31, floats)
Paid Days    = every day except: Unpaid Leave, Absent/Unmarked working days (0%),
               Half-Days (50%) — present, travel, paid leave, weekends AND
               company holidays are all full-pay (100%) days
Final Salary = sum of (that day's rate × payable factor) across the month
```

The single biggest behavior change from the old model: **weekends and
holidays are now paid**, not excluded. If you're debugging a salary number
that looks "too high" compared to the old system, that's very likely why —
check `payable_factor` on the weekend/holiday rows in the day-by-day
breakdown before assuming it's a bug.

- **DB**: `users.monthly_salary` is the source of truth (migration `012`).
  `users.per_day_salary` still exists in the table but is deprecated —
  nothing reads or writes it anymore. Existing employees started at
  `monthly_salary = 0` after the migration; there's no auto-conversion from
  the old rate (`rate × N` is a guess, not a fact) — an admin has to
  re-enter it per employee via Salary Rates or the Employee Directory edit
  form.
- **Audit trail**: `salary_history.old_monthly_salary` /
  `new_monthly_salary` (additive columns, migration `012`) — the legacy
  `old_rate`/`new_rate` columns are kept for historical rows only, never
  rewritten, and every query that reads revisions filters
  `WHERE new_monthly_salary IS NOT NULL` so legacy per-day-rate rows don't
  leak into the new UI as `null → null`.
- **`payslips.per_day_salary`** was deliberately *repurposed*, not replaced
  — it now stores the *derived* rate for that snapshot (shown read-only next
  to the new `payslips.monthly_salary` column), per the owner's explicit
  ask that the derived rate stay visible even though it's no longer the
  input.
- **Mid-month revisions**: `getApplicableMonthlySalary()` resolves the
  correct *monthly* figure for a given date by walking `salary_history`;
  the caller always divides by that same month's day count regardless of
  which side of the revision boundary the day falls on — never re-derive a
  different divisor for the "before" and "after" halves of a revision.
- **No rounding-remainder absorption** — a per-day round-then-sum can leave
  a few-paise gap versus the raw monthly figure. That's expected, not a bug
  (matches the owner's own worked example).
- Full spec and the six resolved open questions this was built from:
  see `salary-logic-spec.md` if it's still in the repo/Downloads, or ask —
  it was a one-time input doc, not committed as a permanent reference.

## Password reset — two flows (15 Aug 2026)

Migration `013`. Two separate recovery paths, both reached from the login
screen's "Forgot password?" link via a role chooser at `/forgot-password`
(admins and employees share one login screen, and auto-detecting the role
server-side would leak which accounts are admins).

- **Flow 1 — admin, self-service.** `/admin/forgot-password` → `/admin/verify-otp`
  → `/admin/reset-password`. A 6-digit code, 5-minute expiry, single use,
  locked after 5 failed attempts. Codes are stored only as a keyed
  HMAC-SHA256 (`OTP_PEPPER`, falling back to `JWT_SECRET`) — never plaintext.
  A correct code mints a 32-byte, 10-minute, single-use *reset session token*
  stored hashed; it is scoped to the reset action only and is never accepted
  by the authenticate middleware.
- **Flow 2 — employee, admin-mediated.** `/employee/forgot-password` raises a
  request; an admin actions it under **Password Resets** in the sidebar, which
  generates a 14-char random temp password shown **once** and never stored in
  plaintext. A partial unique index (`uq_one_pending_reset_per_employee`)
  guarantees one pending request per employee, so resubmitting surfaces the
  existing row instead of duplicating it.

Things that will bite you if you don't know them:

- **`must_change_password` is `users.first_login`.** The spec named a new
  column; `first_login` already meant exactly this and was already wired into
  login, `GuestOnly`, `RequirePasswordReset` and the reset screen. A second
  column would be two sources of truth for one state. Don't add one.
- **"Log out of all devices" is `users.password_changed_at`.** Auth is
  stateless JWT with no session store, so `authenticate` re-reads the account
  on every request and rejects any token whose `iat` predates the last
  password change. It compares at whole-second precision on purpose — without
  that tolerance a token minted in the same second as a legitimate reset gets
  rejected immediately. That lookup uses the raw `pool` rather than the shared
  `query` helper specifically so it doesn't consume the per-request mock
  chains the controller tests set up on `query`; each test file's `jest.mock`
  factory gives `pool.query` a default active-user row.
- **A pending password change is enforced twice, and it needs to be.** The
  route guards redirect, and `blockUntilPasswordChanged` (applied in `app.js`
  to every `/api` router except `/api/auth`) returns 403. The frontend guard
  alone was a real, verified hole: a `first_login` user could type
  `/employee/dashboard` and walk straight past the mandatory screen.
- **Two password policies coexist deliberately.** The legacy
  `POST /api/auth/reset-password` keeps its original looser rules (>=8, a
  letter, a number) so existing behaviour and tests don't shift. Everything
  new — the admin reset and the forced change — uses the strong policy in
  `utils/passwordPolicy.js` (length, uppercase, number, symbol), mirrored on
  the client by `components/PasswordChecklist.jsx`. Change one, change both.
- **Rate limiters are skipped when `NODE_ENV === 'test'`** because their
  counters are per-process and would leak across test cases. They are fully
  active in dev and production.
- **Email needs no SMTP locally.** With `SMTP_HOST` unset outside production,
  `services/mailer.js` prints the message (including the code) to the server
  console; in production a missing `SMTP_HOST` throws rather than silently
  dropping a reset email.

## Frontend design system — "Ops Console" (current, 15 Aug 2026)

The whole frontend runs one visual direction: **Ops Console** — "attendance
treated as infrastructure monitoring." Picked from five options mocked up in
`ergo-ui-directions.html` (kept at repo root as a design reference; not part
of the build). This **replaced** an in-progress, never-shipped neo-brutalist
"Bold Blocks" theme (hard 3px offset shadows, Arial Black, thick ink
borders) — if you see any trace of that language (hard drop shadows, `translate(Npx,Npx)`
hover "press" effects, `#000000`/`#fff` hardcoded instead of tokens), it's a
regression, not a feature.

- **All tokens live in `frontend/src/index.css`**: `:root` is dark (default),
  `:root[data-theme="light"]` overrides for light. Never hardcode a color,
  border width, radius, or shadow in a page/component CSS file — use the
  `--color-*` / `--border-w*` / `--radius-*` / `--shadow-*` custom
  properties so both themes stay correct automatically.
- **Font is monospace, everywhere** (`--font-sans` / `--font-display`, both
  point at the same system stack: `ui-monospace, Cascadia Mono, Consolas, SF
  Mono, monospace` — no webfont, nothing to load). Because of this, any
  multi-column CSS grid with bare `1fr 1fr` tracks needs `min-width: 0` on
  the grid children — monospace inputs have a wider intrinsic min-content
  width than a proportional font did, and without it a column silently
  overflows its container (bit `EmployeesPage.css` `.form-grid-2` once;
  already fixed there, watch for it in any new multi-column form).
- **Color meaning is strict**: `--color-primary` / `--color-accent` /
  `--color-warning` are all the same amber — it's the one brand/interactive/
  attention color. `--color-success` (green) and `--color-danger` (red) are
  reserved *only* for genuine pass/fail state (attendance present/absent,
  active/inactive, approved/declined). Don't reach for green or red to
  decorate something that isn't a state.
- **`.icon-chip` utility**: colored icon badges — `icon-chip-sm|md|lg` for
  size, `icon-chip-primary|success|warning|danger` for color. Reuse instead
  of inventing new badge styles.
- **Live behavior, not decoration**: `AdminDashboardPage.jsx` polls five
  existing endpoints every 20s (`getTodayAttendance`, `getLeaveApplications`,
  `getSalaryHistory`, `getCorrections`, `getUsers`) and appends genuinely new
  events to a `.ops-log-panel` feed — attendance marks, leave filed/approved/
  declined, salary rate changes, correction requests, and employee onboarding/
  activation/deactivation. Everything except status changes carries a real
  timestamp from its own record (`marked_at`/`created_at`/`changed_at`/
  `correction_requested_at`) and is safe to seed on first load. Status
  changes have **no historical audit trail** (only current status is
  stored), so `diffUserEvents` in that file can only detect them live —
  against the previous *poll's* snapshot (`prevUserStatus` ref) — never
  seed them from history. Seeding (`seedUserEvents`) and the polling diff
  are deliberately separate functions: the seed path must stay pure/
  idempotent because React StrictMode double-invokes the mount effect in
  dev, and a stateful diff there would silently eat its own baseline (this
  was a real bug, fixed once). `AdminLayout.jsx` has a real
  `setInterval(1000)` IST clock chip in the header. No new backend routes
  were added — everything reuses endpoints that already existed.
- **Dark/light theme**: `frontend/src/context/ThemeContext.jsx` +
  `frontend/src/components/ThemeToggle.jsx`. Toggles `data-theme` on
  `<html>`, applied synchronously in `main.jsx` before React mounts (no
  flash-of-wrong-theme). Default is dark. The Login page's left brand panel
  uses its own local CSS variables (`--lp-*` in `LoginPage.css`) and is
  *intentionally* always dark regardless of theme, like a fixed terminal
  boot screen — that's a deliberate design call, not a bug.
- **Login page**: split-panel layout (dark brand rail + form panel), not a
  plain centered card. Keep that pattern if asked to touch it again.
- Emoji are not used as icons anywhere (`lucide-react` only). The one
  decorative 👋 that used to sit in the Admin Dashboard greeting copy was
  removed to match the deadpan "ops console" tone — don't add it back.

## Architecture quirk you need to know about

`frontend/src/routes/AppRouter.jsx` imports **every** page component eagerly
(no `React.lazy`). Because of that, Vite bundles every page's CSS file into
one global stylesheet that's present from the very first page load —
**regardless of which route the user is on**. In practice this means a class
defined in, say, `EmployeesPage.css` (`.page-wrapper`, `.data-table`,
`.status-pill`, `.state-container`, etc.) is available and expected to be
used on every other page too. This is why you'll see pages importing classes
that aren't defined in their own `.css` file — that's normal here, not a bug.

**The trap**: if the *same* class gets a responsive override in more than one
page's CSS file (e.g. a `@media` block in `PageA.css` overriding a base rule
defined in `PageB.css`), which override wins depends on fragile bundle/source
order — it is **not** guaranteed by specificity. This caused a real bug (the
"+ Add" buttons rendering centered instead of left-aligned on mobile) that
was fixed by consolidating `.page-header-row` and `.page-controls`'s mobile
behavior into one place (`EmployeesPage.css`, next to their base rules) and
deleting the duplicate overrides elsewhere. **Rule of thumb**: if a class is
used across multiple pages, its base rule *and* all its responsive overrides
should live in the same file — ideally `index.css` if it's used broadly
enough. Don't add a second `@media` override for a class defined elsewhere.

## Bug pattern to avoid

`EmployeeDashboardPage.jsx` had an infinite render loop: `const now = new
Date()` was declared fresh on every render and used inside a `useCallback`
dependency array. A new `Date` object never reference-equals the previous
one, so the callback's identity changed every render, which retriggered the
`useEffect` that called it — infinite loop, hammering the backend with
requests. Fixed by removing `now` from the dependency array and computing
`new Date().getFullYear()` inline where needed instead. **Never put a
freshly-constructed object/array/date in a `useCallback`/`useEffect`
dependency array** — memoize it or compute primitives inline.

## Known gaps / not yet done

- `npm run lint` unconfigured (no eslint devDependency).
- Responsive testing only covered ~500px mobile and desktop widths; tablet
  breakpoints (768/1024px) not specifically audited.
- No keyboard-navigation/focus-visible accessibility audit done.
- Existing employees' `monthly_salary` is 0 until an admin re-enters it per
  employee (see the salary engine section above) — payroll for them will be
  ₹0 until that happens, not a bug.
- `BRD_Employee_Management.pdf` §5.7 still documents the old per-day-rate
  formula — it's a compiled PDF, not editable by an agent; needs a manual
  update to match the new calendar-days monthly model.
