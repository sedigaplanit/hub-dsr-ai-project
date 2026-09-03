create extension if not exists pgcrypto;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null,
  pod text,
  location text,
  capability text,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  report_date date not null,
  blockers text,
  notes text,
  cv_status text not null default 'not_started',
  cv_target_date date,
  created_at timestamptz not null default now(),
  unique(employee_id, report_date)
);

create index if not exists idx_daily_reports_report_date on public.daily_reports(report_date);

create table if not exists public.training_tasks (
  id uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  title text not null,
  learning_type text not null,
  status text not null,
  eta_date date not null,
  target_date date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_training_tasks_report ON public.training_tasks(daily_report_id);
create index if not exists idx_training_tasks_eta ON public.training_tasks(eta_date);

create table if not exists public.certification_progress (
  id uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  istqb_done boolean not null default false,
  istqb_target_date date,
  cae_done boolean not null default false,
  cae_target_date date,
  created_at timestamptz not null default now(),
  unique(daily_report_id)
);

create or replace view public.dsr_flattened as
select
  dr.report_date,
  e.full_name,
  e.pod,
  e.location,
  e.capability,
  dr.cv_status,
  dr.cv_target_date,
  dr.blockers,
  dr.notes,
  t.title as training_title,
  t.learning_type,
  t.status as training_status,
  t.eta_date,
  t.target_date,
  t.notes as training_notes,
  cp.istqb_done,
  cp.istqb_target_date,
  cp.cae_done,
  cp.cae_target_date
from public.daily_reports dr
join public.employees e on e.id = dr.employee_id
left join public.training_tasks t on t.daily_report_id = dr.id
left join public.certification_progress cp on cp.daily_report_id = dr.id;
