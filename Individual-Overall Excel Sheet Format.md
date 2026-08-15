# Salary Excel Export — Individual / Overall Sheet Format

Plan for a future feature: export salary rate data (current rate + full revision history) to Excel, both per-employee and for all employees at once. Not implemented yet — this is the spec to build against.

## Backend (`backend/src`)

New endpoint(s) using the existing `exceljs` dependency (already used for the consolidated payroll report):

- `GET /api/salary/export` — all employees, one sheet: employee name/ID, current per-day rate, and every rate revision (old rate → new rate → changed by → date) as history rows.
- `GET /api/salary/:userId/export` — same shape, scoped to one employee.

## Frontend

An "Export Excel" button added in two places, both triggering the same per-employee export:

- **Salary Rates page** — on each employee's row.
- **Employee Directory** — on the employee profile view (the modal already showing employee details).

Plus one "Export All (Excel)" button on the Salary Rates page for the consolidated version.

## Sheet contents

Current rate **plus** full history — not just a snapshot:

- Old rate
- New rate
- Changed by
- Date / note

## Scope note

This doesn't touch payroll calculation or the existing Reports & Payroll export — it's a separate, salary-rate-focused export.
