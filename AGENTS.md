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
  127 passing Jest/Supertest tests. Untouched by the frontend redesign work
  described below — treat it as a stable API surface.

Current focus (per the user) is **frontend-only** work. Don't touch
`backend/` unless explicitly asked.

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
- **Live behavior, not decoration**: `AdminDashboardPage.jsx` polls the
  existing `getTodayAttendance()` + `getLeaveApplications({status:'pending'})`
  endpoints every 20s and appends genuinely new events to a `.ops-log-panel`
  feed (diffed via a `seenIds` ref — don't replace this with fake/static
  log lines). `AdminLayout.jsx` has a real `setInterval(1000)` IST clock
  chip in the header. Both reuse endpoints that already existed — no new
  backend routes were added for this.
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
- Backend is untouched and out of scope unless asked.
