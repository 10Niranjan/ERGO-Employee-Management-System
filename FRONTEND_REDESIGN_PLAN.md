# Frontend Redesign — Audit & Phase Plan

Status: Audit complete. No implementation started yet.

## Current State Summary

- **Stack**: React 18 + Vite 5 + React Router 6 + Axios. No UI kit, no Tailwind, no animation library — hand-written CSS with design tokens in `frontend/src/index.css`.
- **State**: Only two Context providers — `AuthContext` (token/user in localStorage) and `ToastProvider`. Every page does its own `useEffect`/`useState` data fetching — no shared data-fetching layer.
- **Routing**: `AppRouter.jsx` + `ProtectedRoutes.jsx` — correct role-gating (RequireAdmin/RequireEmployee/GuestOnly/RequirePasswordReset). Solid, not touching this.
- **Design tokens already exist** (`index.css:7-64`): dark premium palette (`--color-bg #0f1117`, indigo primary `#6366f1`), Inter font, spacing/radius/shadow/transition scales. Reuse, don't replace.
- **Reusable components**: only `Modal` and `Toast`. No Button/Input/Card/Table/Badge/Skeleton/EmptyState components — every page reimplements cards, tables, forms inline.
- **Icons**: raw emoji used throughout — biggest "template" tell.
- **Dependencies**: `axios`, `react`, `react-dom`, `react-router-dom` only. No Motion/Framer, no Anime.js, no icon library.

### Pages by size
| Page | Lines |
|---|---|
| EmployeeDashboardPage | 1219 |
| SalaryManagementPage | 758 |
| EmployeesPage | 773 |
| AdminAttendancePage | 752 |
| AdminLeavesPage | 515 |
| HolidaysPage / LeaveTypesPage | ~400 |
| AdminDashboardPage | 242 |
| LoginPage / ResetPasswordPage | ~150 |

### UX/Design issues found
1. No design-system primitives — `.btn`/`.card`/`.kpi-card` classes repeated inline, mixed with raw `style={{}}`.
2. Emoji-as-icons everywhere instead of a real icon set.
3. No skeleton loading — spinner glyph per KPI card instead of skeleton shapes.
4. No shared EmptyState/ErrorState component.
5. Zero motion beyond CSS `:hover`/`:focus` — no page-transition, list-stagger, or modal enter/exit animation.
6. Dense pages (700+ lines) with per-page CSS files — table/form patterns duplicated across Attendance, Salary, Employees, Leaves.

### Files that will NOT be touched
`backend/**`, `AuthContext.jsx`, `ProtectedRoutes.jsx`, `AppRouter.jsx`, `api/*.js` (contracts) — functionally correct, presentation-only changes elsewhere.

---

## Phase Plan

**Step 1 — Audit repository** ✅ done (this document)

**Step 2 — Identify existing architecture** ✅ done

**Step 3 — Identify design inconsistencies** ✅ done (see UX/Design issues above)

**Step 4 — Create design direction**
Confirm dark premium direction using existing tokens; pick one icon set (lightest option: `lucide-react`) as the only new dependency for now.

**Step 5 — Create/update reusable UI primitives**
`Button`, `Card`, `Badge`, `EmptyState`, `Skeleton`, `PageHeader`, `DataTable` — built on top of existing `index.css` tokens, zero new deps beyond the icon set.

**Step 6 — Improve global layout/navigation**
`AdminLayout` nav icons → real icon set; header/nav spacing and hierarchy pass.

**Step 7 — Improve highest-priority screens**
Order: Login → Admin Dashboard → Employee Dashboard (mandatory attendance popup — good Motion candidate) → Attendance/Leaves/Salary tables.

**Step 8 — Improve secondary screens**
HolidaysPage, LeaveTypesPage, SalaryHistoryPage, ResetPasswordPage.

**Step 9 — Add purposeful animations**
Modal enter/exit, list stagger, mandatory-popup entrance — using native CSS transitions first, Motion only where orchestration genuinely helps.

**Step 10 — Improve responsive behavior**
1440 / 1280 / 1024 / 768 / 640 / 480 breakpoints; tables → cards on mobile where needed.

**Step 11 — Improve loading/error/empty states**
Roll out `Skeleton`/`EmptyState`/`ErrorState` primitives consistently across all data-fetching pages.

**Step 12 — Run tests/build/lint**

**Step 13 — Fix regressions**

**Step 14 — Final UI consistency audit**

---

## Approach

Ship one screen first as proof of direction (Login or Admin Dashboard), get sign-off on the visual language, then roll out to the rest — rather than changing all 12 pages in one uncontrolled pass.
