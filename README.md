# Dance Palace Management System

React + Vite frontend, Express REST API, and Supabase PostgreSQL for Dance Palace, Nedumangad. The browser never stores school records. Authentication uses a signed JWT in an HttpOnly cookie; passwords use bcrypt. Admin/staff permissions are checked on the server.

## Connect your Supabase project

1. Open your [Supabase project](https://supabase.com/dashboard/project/zjycceqmgwfzoazelbtc). Restore it first if it is paused.
2. Open **SQL Editor → New query**. Copy **all of [database/supabase.sql](database/supabase.sql)** and run it. This is the complete schema, constraints, indexes, private-schema security, canonical batches, setup lists, templates, empty attendance months, and default admin seed. Re-running it preserves existing records and passwords.
3. In **Connect → Session pooler**, copy the PostgreSQL connection URI. Replace the database-password placeholder with your database password. URL-encode special characters in that password. Use the session pooler on port 5432 for this long-running Express server. The publishable key is not a database password.
4. Copy `.env.example` to `.env` if needed. Set `DATABASE_URL` to that connection string. Generate distinct random `JWT_SECRET` and `MONITOR_SECRET` values (at least 32 characters). A local `.env` has already been prepared in this workspace with random secrets; only the database connection needs filling in.
5. Run the commands below, then visit **http://localhost:5173**. Sign in as **admin / admin123**. Change this password under **Users → Edit**; changing it ends existing sessions.

```powershell
npm.cmd install
npm.cmd run dev
```

On macOS/Linux use `npm` instead of `npm.cmd`. Windows PowerShell execution policy can block `npm.ps1`; `npm.cmd` avoids changing that policy.

Alternatively, after setting `DATABASE_URL`, run `npm.cmd run db:migrate` to execute the same SQL through the backend connection. Do either the SQL Editor setup or this command; both are idempotent.

The supplied public configuration is included:

```dotenv
VITE_SUPABASE_URL=https://zjycceqmgwfzoazelbtc.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ZAGzjB40_sZcvQT3_te7ug_muY6VR7p
```

`src/utils/supabase.ts` initializes the requested Supabase browser client. School data goes through `/api` because the app uses its own username/password roles. The `dance_palace` database schema is private, has RLS enabled, and grants no public access. Do **not** expose it in Supabase Data API settings or add anonymous read policies. No service-role key or database password belongs in a `VITE_` variable. The backend connects as the database owner via the pooler and enforces permissions before querying this private schema.

TLS certificate verification is enabled for hosted PostgreSQL. If your environment needs Supabase's root certificate, download it from the dashboard and set `DATABASE_CA_PATH`; do not disable certificate verification.

## Supabase inactivity pausing

There is **no SQL query that disables Supabase Free project pausing**, and code inside an already paused database cannot wake it up. [Supabase's documented policy](https://supabase.com/docs/guides/platform/free-project-pausing) says low activity over seven days can pause Free projects. A paid plan removes inactivity pausing. To recover a paused project, restore it in the dashboard.

This project includes an authenticated database availability monitor:

- `GET /api/health/database`, with `Authorization: Bearer <MONITOR_SECRET>`, performs a real PostgreSQL upsert and returns availability. The public `/api/health` checks only the Express process.
- `.github/workflows/database-monitor.yml` calls the database check daily. After pushing this repository to GitHub, add repository Actions secrets `MONITOR_URL` (your deployed app origin, without `/api`) and `MONITOR_SECRET` (matching the backend environment). Enable Actions and workflow failure notifications.
- To run it elsewhere, schedule `npm run monitor` with those environment variables on an independent scheduler. The Express host must be reachable while the browser is closed.
- Scheduled database requests provide monitoring and activity, **not a guarantee against Free plan pausing**. GitHub schedules can be delayed or disabled for inactive repositories. The workflow does not automatically restore projects or change billing plans.

The interface reports database unavailability and retains failed form data. It does not pretend a failed server write was saved.

## Included workflows

- **Fees:** fixed transaction dates; all financial columns; filters/sorting; filtered admin KPI cards; income-by-fee-month chart; category amounts; monthly/quarterly/half-yearly month selection and rollover; carry-forward breakdown; automatic status; required-field gating; year-aware matrices; fee cell editing; student activity sorting.
- **Manager:** editable/searchable worklog, register, timetable, enquiry and pending-fee tables; two clean batch dropdowns in the register; roster/attendance sync; five editable, copyable message templates.
- **Attendance:** multiple years, sidebar months, batch tabs, generated 31-day sheets, present/absent toggles, inline text editing and added rows; imported Dashboard/Student Summary sheets are read-only; DATA is excluded.
- **Worklog:** manager/faculty calendars; fixed manager shifts; server-only India-time clock punches for today; leave; faculty manual class times; salary summaries, late/early/overtime coloring and monthly entries.
- **Progress:** ten rated skills, server-calculated averages/grades/statuses; monthly reviews; overview charts; student/month report cards and print stylesheet.
- **Administration:** user creation, role changes, password changes with visibility toggle, session revocation, current-account deletion guard and last-admin protection.
- **Data transfer:** server-side XLSX parsing/export, complete JSON backups and transactional restore; original sheet-name mappings; templates, worklog and attendance preserved in full exports.

All monetary values display with Indian digit grouping. The base-year fee season is April–December 2026; other years show January–December. Other-year dates and manager clock punches use the intended India timezone independently of the machine's timezone.

## Important data semantics

Transaction updates, fee rebuilding, registration sync and imports execute atomically and take a database advisory lock. This avoids two concurrent payments or imports producing partial state. Reconciliation uses the surviving transactions: deleting one of two payments covering the same month preserves the other payment's effect.

A manual PAID fee cell creates a linked `CELL-…` income transaction so reconciliation will not erase it. A manual DUE correction removes only that cell's month links and annotates the affected transaction; historical monetary amounts remain visible. If several payments cover one cell, the most recent surviving payment supplies the displayed cell amount. All transactions remain visible in the dashboard.

Amounts in the new-payment form follow the requested sum of **all** historical balances minus **all** historical overpayments in that student/batch. Those historical figures are not silently consumed or cleared. The breakdown identifies each contributing transaction. Review and edit historical balances when they are settled if that is your accounting practice.

Manager punches cannot be entered manually, backdated, or overwritten. Choose today's date to use Login now / Logout now. Leave can be recorded for another date but cannot replace an existing punch. Faculty entries may be edited and cannot overlap an existing class or leave.

## Importing your workbooks

No original Excel files were supplied in the workspace. The seed contains the required structure and empty rows rather than fabricated historical payments. The eight 2026 attendance months are Jan, Feb, Mar, Apr, May, Jul, Aug and Sep.

Use **Import backup** in the header:

1. Download a JSON backup before replacing data.
2. For Fees/Manager/Progress, choose the general Excel option and upload `.xlsx`.
3. For an attendance workbook, choose **Monthly attendance**, select its year/month, then upload. Each source batch sheet becomes the corresponding attendance sheet.
4. A JSON restore replaces the dataset, requires the current administrator to remain an administrator, and signs users out. Invalid restores roll back as a whole.

The importer recognizes transaction column headers (including Month through Month6), the canonical batch sheets, manager table names, exported templates/setup, and tabular progress reviews with student, batch, month, attendance and ratings columns. Transaction IDs are upserted; imported manager sheets replace their matching tables. Formula results use cached values, including cached Excel serial dates; a missing cached formula result is an explicit error, never recalculated as today. Historical fee month lists are normalized to the category's consecutive count.

Unrecognized source sheets and extra columns are retained in the `import_sources` archive and full JSON/Excel backups with an import warning. A custom non-tabular progress sample may need a mapping once its actual layout is supplied. Original workbook-specific visual formatting and formulas are not recreated; the exported data layout is rebuilt.

**Export Excel** creates Transactions, twelve original-name fee sheets in PLAN/AMOUNT/C-G/P-D groups, Setup, Manager sheets, Templates, Progress Report and worklog sheets. Its hidden structured payload preserves all data including attendance and archived source sheets for lossless re-import; account password hashes are excluded from Excel. The admin-only JSON backup includes users and bcrypt hashes. Attendance can also be exported separately per year from its screen; sheet names are shortened and made unique within Excel's limits.

## Build, tests and deployment

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
```

Tests run against PGlite (real PostgreSQL compiled to WASM) with the actual migration and Express routes, independently of your live Supabase project. Coverage includes auth/role restrictions, rollover and sliding selection, carry-forward/status, propagation/edit reversal/delete/reconciliation, register sync, attendance, manager punch tampering, faculty hours, grade thresholds, admin guards, session revocation, cached formula dates and backup rollback/restore.

The browser check uses an isolated PostgreSQL test database and a headless browser, starts temporary servers on ports 3001/5175, then shuts them down. It checks login, fee-year rollover, register/attendance syncing, attendance editing, reviews, report cards, dark mode and mobile navigation. On Windows it finds installed Chrome/Edge; elsewhere run `npx playwright install chromium` first or set `BROWSER_PATH`. Screenshots are saved to ignored `.local/` files.

For production, build with Node 22 and serve Vite's `dist` through Express:

```sh
npm ci
npm run build
NODE_ENV=production npm start
```

On Windows, set `$env:NODE_ENV='production'` before `npm.cmd start`. Configure `DATABASE_URL`, `JWT_SECRET`, `MONITOR_SECRET`, `APP_ORIGIN` (the exact HTTPS app origin), and optionally `PORT`/`DATABASE_CA_PATH` in your host. HTTPS is required for production session cookies. Do not upload `.env`. The included Dockerfile provides the same single-server deployment. Supabase hosts the database; deploy the Node application on a host that supports a persistent Node/Express process or Docker.

Run the SQL migration against a backed-up target database before starting a new deployment. No live Supabase connection has been verified with the public key alone; the private connection string is still required. No production deployment is provisioned automatically by this repository.

API routes and permission boundaries are listed in [docs/API.md](docs/API.md).
