# Hub DSR Platform

Hub bench reporting app with a GitHub Pages frontend and Supabase-backed API/data/export pipeline.

## Current Architecture

- Frontend: React 19 + Webpack, deployed to a GitHub Pages project site
- Backend: Supabase Edge Functions, with `api` as the main frontend-facing endpoint for auth, admin, DSR, and export flows
- Database: Supabase Postgres via `supabase/migrations/0001_init.sql`
- Shared logic: `packages/shared/src`
- Local-only Express reference path: `apps/api` still exists for local development, but the active deployment target is Supabase Edge Functions

## What The App Does

- Saves one DSR per employee per day
- Lists reports for a selected date
- Exports one workbook per month from Supabase data
- Creates one worksheet per recorded day in that month
- Preserves the official workbook styling when the template exists in Supabase Storage

## Prerequisites

- Node.js 20+
- A Supabase project
- Supabase CLI
- The official Hub workbook uploaded to Supabase Storage as `templates/Hub_DSR_Template.xlsx` unless you intentionally want the simplified fallback sheet

## Local Setup

```bash
npm install
cp .env.example .env
```

Fill `.env` with your local or hosted Supabase values.

For local frontend work against the Express dev API:

```bash
npm run dev
```

For local frontend work against Supabase functions instead:

```bash
supabase start
WEB_API_URL=http://127.0.0.1:54321/functions/v1/api npm run web:dev
```

If you prefer `.env`, set `WEB_API_URL=http://127.0.0.1:54321/functions/v1/api` before starting the web app.

## Database

`supabase/migrations/0001_init.sql` creates the core DSR tables, and `supabase/migrations/0002_auth_accounts.sql` adds app-managed auth/account tables:

- `employees`
- `daily_reports`
- `training_tasks`
- `certification_progress`
- `dsr_flattened`
- `app_users`
- `dsr_assignments`

Apply locally:

```bash
supabase db reset
```

Push to the linked hosted project:

```bash
supabase db push
```

The UI expects the `employees` table to contain roster data before submissions can be created.

## Edge Functions

- `api`: frontend-facing auth, admin, employee, DSR, and workbook routes
- `employees-list`: legacy roster lookup endpoint
- `dsr`: legacy GET/POST DSR endpoint
- `dsr-export-month`: legacy monthly workbook download endpoint
- `purge-old-dsrs`: authenticated maintenance function for 7-day retention

Public function JWT checks are disabled in `supabase/config.toml` because the frontend is hosted on GitHub Pages and uses app-managed auth instead of Supabase Auth.

## Monthly Export Rules

- `month` query param uses `YYYY-MM`
- each workbook includes one worksheet per recorded `report_date`
- tasks with ETA equal to the report date are auto-completed on save
- already-completed tasks from earlier dates are excluded from later exports
- certification and CV labels follow the shared business rules in `packages/shared/src`

## Deployment

### GitHub Pages

`.github/workflows/deploy-pages.yml` builds `apps/web/dist` and deploys it to the repository project site.

Required GitHub secret:

- `SUPABASE_PROJECT_REF`

The workflow computes:

- `WEB_API_URL=https://<project-ref>.supabase.co/functions/v1/api`
- `WEB_PUBLIC_PATH=/<repo>/`

### Supabase

`.github/workflows/deploy-supabase.yml` links the hosted project, pushes migrations, syncs function secrets, and deploys the Edge Functions.

Required GitHub secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD`

Optional GitHub repository variables:

- `DSR_TEMPLATE_BUCKET` default: `templates`
- `DSR_TEMPLATE_OBJECT_PATH` default: `Hub_DSR_Template.xlsx`
- `AUTH_TOKEN_TTL_HOURS` default: `12`
- `BOOTSTRAP_ADMIN_USERNAME` default: `admin`

Required additional GitHub secrets for app-managed auth:

- `AUTH_TOKEN_SECRET`

Optional additional GitHub secrets:

- `BOOTSTRAP_ADMIN_PASSWORD` default: `admin123`

The workflow automatically sets `CORS_ORIGIN` to the GitHub Pages project-site URL.

## Scripts

- `npm run dev` - legacy web + Express local stack
- `npm run web:dev` - frontend only
- `npm run build` - web build plus legacy API TypeScript build
- `npm run lint` - web lint plus API type-check lint
- `npm test` - Jest
