# Dance Palace Management System

A React/Vite frontend and Express REST API with persistent PostgreSQL data, JWT sessions, and administrator/staff permissions. The default local database is PGlite, an embedded PostgreSQL engine running **on the server**, persisted under `data/postgres`. Set `DATABASE_URL` to use a regular PostgreSQL server with the same schema.

## Run locally

Requires Node.js 22 or later. On Windows PowerShell use `npm.cmd` if execution policy blocks `npm.ps1`.

```powershell
npm.cmd install
Copy-Item .env.example .env
npm.cmd run dev
```

Open **http://localhost:5173**. Initial login: **admin / admin123**. Change the password in Users. Configure the database URL and full backend secret key in `.env` first. Demo seeding is disabled by default. No source Excel workbooks were supplied, so the original 478 transactions are not included.

The API automatically applies its idempotent schema and seeds missing canonical structure at startup. Explicit commands are also available:

```powershell
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd test
npm.cmd run build
npm.cmd start
```

The production build is served by Express at **http://localhost:3001**. Do not run two server processes against the same embedded database directory. The test suite uses its own temporary database.

## Deployment

Deploy the Node server (or the included Docker image), not just the Vite `dist` folder. The Express server serves the frontend and `/api` routes from the same origin. A static-only deployment does not provide the backend: requests to `/api/auth/me` will return 404. If the frontend stays on a static host, deploy this server separately and configure that host to proxy every `/api/*` request to the server.

Set these environment variables on the **backend**:

- `NODE_ENV=production`
- `DATABASE_URL`: persistent PostgreSQL connection URL. For Supabase, copy the PostgreSQL URI from **Project → Connect → Session pooler** (recommended if the backend host does not support IPv6) or use the direct connection when supported. Do not use the Supabase project URL, publishable key, or secret key as the database URL. The app runs its migrations automatically on startup.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `SUPABASE_JWKS_URL`: copy these from Supabase API/Auth settings. Keep the secret key backend-only; the publishable key is embedded in the frontend bundle and is designed to be public.
- `APP_ORIGIN`: exact HTTPS origin, with no trailing slash or path (for this deployment: `https://dance.wabisabibymk.com`).
- `SEED_DEMO=false`
- `TRUST_PROXY`: number of trusted reverse-proxy hops (usually `1` behind one proxy; use `0` when directly exposed).

The frontend build uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env` or the build environment. The shared client in `src/supabase.js` uses these values for Supabase Auth. Legacy builds can still fall back to the unprefixed public variables. Keep frontend and backend values on the same Supabase project and rebuild after changing frontend variables. Never prefix a secret key or database password with `VITE_`. School data continues through the authenticated Express API and its PostgreSQL connection; the public API URL and key do not replace `DATABASE_URL`. For a new, empty app database, set `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` before the first startup. This creates a confirmed Supabase Auth user and assigns it the app administrator role. The requested initial credentials are `admin / admin123`; change the password in Users after signing in. These values do not reset existing accounts. `DATABASE_SSL` defaults to `verify`; keep it at `verify` for Supabase. `PORT` is normally supplied by the host and `HOST` defaults to `0.0.0.0`.

Existing app users must be linked to Supabase Auth accounts once. After applying migrations, set each user's `supabase_user_id` to the matching UUID from Supabase Auth. In Supabase SQL Editor, inspect `auth.users.id` and update the matching `public.users` row with that UUID. Usernames are independent of the internal Supabase email identity. A valid Supabase login without a matching app user row does not receive application access.

Supabase Auth sessions use cookies through `@supabase/ssr`; the browser client uses only the publishable key. The Express server validates cookie sessions with Supabase Auth and continues to verify bearer-token clients. All school records live in PostgreSQL. Supabase Auth handles passwords and session renewal; the backend verifies access tokens with the project JWKS and checks each user's app role in PostgreSQL. Migration `004_enable_rls.sql` enables Row Level Security without client policies, keeping browser clients from reading app tables through the Supabase Data API; the backend connects with the database owner role. The Supabase secret key is used only by the backend to administer Auth accounts. Backups include personal records and app role mappings and are administrator-only. A restore must preserve the signed-in administrator's ID and Supabase Auth mapping.

## Modules

- Fees dashboard: transaction filters, sorting, income chart, administrator KPIs, category prices, consecutive fee-month windows with year wrapping, historical balance/credit breakdown, fixed dates, derived status, and automatic roster/fee updates.
- Batches: year and month filters, due-by-default matrix, recent student activity, student management, and manual payment cells backed by matching transactions.
- Manager: editable worklog, student register, timetable, enquiry and pending-fee tables; reusable message templates; register-to-roster/attendance synchronization.
- Staff worklog: server-time manager login/logout for today's IST date, fixed shifts, late/early/overtime summaries, faculty class times, calendar, people management.
- Attendance: multiple years, per-month batch sheets, new-month generation, inline editing, present/absent toggles, student synchronization, year workbook export.
- Progress: ten skills, calculated score/grade/status, monthly reviews, overview charts, and print-styled report cards.
- Users: role assignment, password reset/show-hide, last-administrator and current-account deletion protection.

Staff can record and edit transactions and operational records. They cannot modify fee matrices or rosters directly, view administrator KPI bars, manage users, restore backups, or delete records. Staff may add students through Student Register and Attendance, as specified by those workflows.

## Fee accounting details

Transactions are the source of truth. Every fee matrix read reconciles paid cells; orphan paid cells revert to due. Editing a transaction reverses its previous effect and applies the new one atomically. When multiple transactions pay the same cell, the remaining transactions continue to support it after a deletion, and amounts add together. Income payments propagate even when their status is Pending, as required in the build prompt.

Manual cell payments create `CELL-…` ledger entries. For cells covered by ordinary transactions, matrix corrections are persisted as per-month allocation metadata on those transactions. The original receipt and cash amount remain unchanged; the corrected allocation determines the matrix. Editing the transaction itself reapplies its standard consecutive window and even allocation. When several receipts cover one cell, a manual correction replaces that cell’s aggregate allocation without duplicating the amount. Manual entries retain the selected plan in their description and matrix.

Carry-forward sums **all historical balances minus all historical overpayments**, excluding the entry being edited. It does not automatically settle or consume prior balances, because the supplied rules explicitly require the full history sum. The suggested amount is editable, and balance/overpayment determine status independently.

The fee run starts in the transaction date's year, with the year increasing only across December. To pay an entire future-year run, choose a date in that year. The base matrix year is 2026 with April–December plus stored months. Other years show all 12 months.

## Import and export

Use **Import backup** for all import tools and JSON backup download. Make a JSON backup before replacing a dataset. Imports run atomically and roll back on validation errors.

- **JSON backup** restores every table, including accounts and attendance. It replaces the existing dataset.
- **Dance Palace Excel export** contains human-readable Transactions, original mapped fee sheet names with PLAN/AMOUNT/C-G/P-D month groups, Setup, manager tables, templates, worklogs, and progress. Additional `_dp_…` sheets preserve complete records in chunks so the app can restore its own export without loss. Password hashes are excluded from Excel; existing users are preserved on Excel restore.
- **Original fees workbook** expects a Transactions (or Dashboard) sheet with headers matching the requested transaction columns, including Month through Month6. Blank cached dates are rejected instead of inventing a date or evaluating `TODAY()`. Categories determine the consecutive fee-month count. Recognized batch sheets seed student rosters; transaction reconciliation determines paid cells.
- **Original manager workbook** preserves each sheet's columns and rows. Student Register expects NAME and BATCHES / BATCHES 2 for automatic synchronization.
- **Attendance workbook** is imported into the chosen year/month. `DATA` is dropped and sheet-name mappings are applied. Boolean present/absent grids are editable; Dashboard and Student Summary are read-only.
- **Progress workbook** supports Student, Batch, Month (YYYY-MM), Attendance %, ten named skill columns (or Ratings JSON), Strengths, Needs Improvement, and Remarks. An unknown sample layout requires a mapping once the actual file is available.
- Attendance can also be exported separately by year with unique Excel-safe sheet names.

The original workbook files and progress sample were not available for verifying their precise header positions, merged cells, or cached formula values. Their adapters should be checked against real files before replacing live records. The app's own workbook and JSON restore paths are covered by integration tests.

## API and project layout

`shared/domain.js` holds fee-month, currency/date, grade, carry-forward, and salary rules. `server/migrations/001_initial.sql` contains the relational schema. `server/services.js` handles transactional propagation and synchronization. `server/app.js` contains authenticated REST routes; `server/transfers.js` handles files. `src/` contains the React Router screens, Zustand UI state, React Query server state, and responsive teal/dark styles.

Key endpoints, all under `/api`:

| Resource | Operations |
| --- | --- |
| `/auth/me` | Return the current Supabase-authenticated app user |
| `/transactions`, `/transactions/:id` | List/filter, create, edit, delete |
| `/transaction-defaults` | Carry-forward, next fee window and ID |
| `/batches`, `/students`, `/students/:id` | Batch metadata and rosters |
| `/fees`, `/fees/:student/:year/:month`, `/reconcile` | Matrix and reconciliation |
| `/manager/:name/rows`, `/manager/:name/rows/:id` | Generic row CRUD |
| `/templates`, `/templates/:id` | Message templates |
| `/attendance`, `/attendance/year`, `/attendance/month` | Year/month/sheet generation |
| `/attendance/:id/cell`, `/attendance/:id/student` | Grid edits and students |
| `/people`, `/people/:id`, `/worklog`, `/worklog/:id` | Staff and salary summaries |
| `/reviews`, `/reviews/:id`, `/users`, `/users/:id` | Reviews and accounts |
| `/export/excel`, `/export/backup`, `/export/attendance/:year` | File exports |
| `/import/excel`, `/import/backup` | Multipart imports (`file` field) |

Tests cover month/year wrapping and sliding, carry-forward, status, grading boundaries, salary shifts, authentication, staff denials, propagation/reversal/overlap, orphan reconciliation, register sync, new-month generation, server clock restrictions, and JSON/Excel round trips. `node scripts/browser-check.mjs` checks the running app in Chrome (set `BROWSER_PATH` and `APP_URL` if needed), including navigation, a year-wrapping payment form, dark mode, and mobile layout; screenshots are saved under `artifacts/`.

## Username login and administrator setup

The login screen accepts a username and password. The backend resolves the linked Supabase identity and signs in with Supabase Auth; users do not enter an email. New users receive an internal email identity solely for Supabase password authentication.

Run `npm run db:admin` once to create or link the configured administrator in an existing database. This applies migrations and explicitly sets that administrator's password from `BOOTSTRAP_ADMIN_PASSWORD`. Normal application startup only bootstraps an empty users table and never resets existing passwords. Keep the real secret key in the ignored `.env`; the masked key from the dashboard cannot be used. URL-encode special characters in the PostgreSQL password. If the direct host cannot resolve or IPv6 is unavailable, use the Session pooler URI from Supabase Connect.

## Database availability and daily keep-alive

The new HTTP repository (`server/http-db.js`) uses `@supabase/supabase-js` with the server-only secret key and no persisted Auth session. It requires `SUPABASE_URL` and `SUPABASE_SECRET_KEY`; `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supported fallbacks. Missing credentials produce a clear configuration error. These HTTP checks do not require `DATABASE_URL`. The existing fees, attendance, migrations, and backup operations still use PostgreSQL transactions and require the Session pooler connection for the main production app.

Local Node commands load the root `.env` with `process.loadEnvFile()`. Production reads only hosting environment variables when started with `NODE_ENV=production`. Keep `.env` uncommitted. Set `APP_ORIGIN` to the actual frontend origin (`http://localhost:5173` for Vite, or your deployed HTTPS origin). The old `PUBLIC_ORIGIN` remains a fallback. Never put the secret key or cron secret in a `VITE_` variable.

`GET /api/cron/keepalive` requires `Authorization: Bearer <CRON_SECRET>` with a random secret at least 16 characters long. Missing, wrong, or unconfigured secrets receive 401 before any database read. It reads the seeded `setup` row whose key is `categories`, then at most one ID from `users`. Missing setup or a failed read returns 503; only two successful reads return `{"ok":true}`. No records, profiles, or credentials are returned. Responses are not cached and queries have a 10-second timeout. `GET /api/health` performs the same setup read without cron authorization, returning 200 only when the required row exists.

The previous in-process timer has been removed. `vercel.json` schedules the keep-alive daily at `0 6 * * *`: 06:00 UTC / 11:30 AM IST. Standalone functions in `api/` serve cron and health without starting the SQL backend or running migrations. This does not move the remaining Express routes to Vercel; retain their existing Node deployment and API proxy when deploying the frontend and monitoring functions to Vercel.

To activate the schedule:

1. In Vercel **Production** environment settings, configure `NODE_ENV=production`, `APP_ORIGIN` (your HTTPS origin), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `CRON_SECRET`. The Vite build also uses the two public `VITE_SUPABASE_*` values. Generate the cron secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, or copy the generated value from your local ignored `.env` into the hosting secret setting.
2. Deploy/redeploy. Vercel attaches the configured cron secret as the bearer token automatically. Do not put the secret into `vercel.json` or the scheduled URL.
3. Open **Settings ? Cron Jobs** and inspect the execution logs. Expect HTTP 200 and `keepalive: database reads succeeded`. A 401 indicates secret configuration; a 503 indicates missing school setup, unavailable tables, or a database/network error. Initialize the real application with migrations/seeding before expecting success; do not add dummy data just to make the check green.
4. Run `npm run db:check` locally for the same two HTTP reads. Tests cover authorization before queries, missing records, both database failures, response privacy, health checks, cookie login, and the scheduled route configuration.

Vercel cron runs on production deployments; the expression specifies 06:00 UTC, but exact invocation timing depends on the hosting plan. Other hosts need an external scheduler calling the same URL with the bearer header. See [Vercel cron configuration and logs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

This is a best-effort mitigation for Supabase inactivity pausing. It cannot resume an already-paused project or guarantee uninterrupted availability. Resume paused projects in the Supabase dashboard; a paid plan removes inactivity pausing. See [Supabase project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).
