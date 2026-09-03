create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  password_hash text not null,
  role text not null check (role in ('admin', 'user')),
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_app_users_username_ci on public.app_users (lower(username));
create index if not exists idx_app_users_role on public.app_users (role);

create table if not exists public.dsr_assignments (
  report_date date primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_dsr_assignments_user_id on public.dsr_assignments (user_id);
