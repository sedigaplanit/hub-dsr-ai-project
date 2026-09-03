# Hub DSR Platform

Production-ready starter for Hub bench teams to capture Daily Status Reports (DSRs), enforce certification rules, and export the official Excel ledger.

## Stack

- **Frontend**: React 19 + Webpack 5 dev server, TanStack Query, Zustand-lite state, custom gradient UI
- **Backend**: Express + TypeScript with Supabase client, ExcelJS export pipeline
- **Shared**: `apps/api/src/shared` centralizes schemas, enums, and Excel column mapping used by both layers
- **Supabase**: Postgres tables + Edge Function (`purge-old-dsrs`) to enforce 7-day retention

## Prerequisites

- Node.js 20+
- Supabase project (free tier is enough)
- Excel template copied to `resources/templates/Hub_DSR_Template.xlsx` (use the official Hub DSR workbook)

## Getting Started

```bash
npm install
cp .env.example .env        # fill with Supabase + API values
npm run dev                 # starts Webpack dev server + API concurrently
```

Frontend expects `WEB_API_URL` to point at the API (`http://localhost:4000/api` by default).
The DSR form now loads employees from `GET /api/employees`, so seed the `employees` table before using the app.

## Database Schema

`supabase/migrations/0001_init.sql` provisions the following entities:

- `employees`: master roster for bench associates
- `daily_reports`: one row per employee per date (cv status + notes)
- `training_tasks`: child rows storing detailed upskilling entries
- `certification_progress`: ISTQB/CAE status snapshot tied to a report

Apply with the Supabase CLI:

```bash
supabase migration up
```

## Excel Export

`apps/api` loads the Hub template from `DSR_TEMPLATE_PATH`, injects rows with canonical colors (light green for `completed`, orange for `hold`), and enforces:

1. ISTQB + CAE both done → `Done`
2. Single certificate done → `ISTQB - Done & CAE yet to complete (Target …)` style strings
3. CV submitted without review feedback → `Done`, otherwise `Sent for Review`
4. Tasks auto-complete when ETA equals report date
5. Rows completed before the previous day are suppressed in exports

GET `GET /api/export/dsr?date=YYYY-MM-DD` returns the `.xlsx` ready for leadership.

## Retention (Last 7 Days)

Supabase Edge Function `supabase/functions/purge-old-dsrs` deletes rows older than 7 days (child tables first). Deploy:

```bash
supabase functions deploy purge-old-dsrs --project-ref <your-ref>
```

Schedule it via an external cron (GitHub Action, Cloud Scheduler, etc.) that `POST`s to the function URL with the service key.

## Scripts

- `npm run dev` – Webpack dev server + ts-node-dev API watcher
- `npm run build` – type-check + production builds (web bundle + API)
- `npm run lint` – TypeScript project references
- `npm test` – Jest (jsdom)

## Next Steps

- Wire authentication (Supabase OAuth / SSO)
- Add employee directory picker in the UI
- Persist toast + validation states across navigation
- Extend CI with Jest/API contract tests and Excel snapshot assertions
