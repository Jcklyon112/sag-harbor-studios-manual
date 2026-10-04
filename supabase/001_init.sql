-- Sag Harbor Studios building manual: schema, roles, row-level security, private document storage.
-- Two roles: admin (everything) and manager (operations only; never sees leases, income, or rows marked restricted).
-- Sign-ups are disabled in Auth settings; users are invited from the Supabase dashboard.

-- ---------- Roles ----------
create table public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role       text not null default 'manager' check (role in ('admin','manager')),
  created_at timestamptz not null default now()
);

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid());
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin');
$$;

-- First account ever created becomes admin; every later invite is a manager until promoted.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, role)
  values (new.id, new.email,
          case when exists (select 1 from public.profiles) then 'manager' else 'admin' end);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Shared helpers ----------
create or replace function public.touch_updated() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- ---------- Tables ----------
create table public.building_info (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  value text,
  notes text,
  sort int default 0,
  restricted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table public.leases (
  id uuid primary key default gen_random_uuid(),
  tenant text not null,
  unit text,
  use text,
  sq_ft numeric,
  contact_name text,
  email text,
  phone text,
  status text not null default 'active' check (status in ('active','pending','expired','terminated')),
  start_date date,
  end_date date,
  monthly_rent numeric,
  escalation_pct numeric,
  escalation_date date,
  security_deposit numeric,
  notice_days int,
  renewal_terms text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  title text not null,
  category text,
  notes text,
  restricted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  frequency text not null default 'monthly'
    check (frequency in ('twice_monthly','monthly','quarterly','semiannual','annual')),
  due_days text,
  start_month int check (start_month between 1 and 12),
  assignee text,
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table public.task_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  done_on date not null default current_date,
  done_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  payee text not null,
  description text,
  amount numeric,
  frequency text not null default 'monthly'
    check (frequency in ('monthly','quarterly','semiannual','annual')),
  due_day int check (due_day between 1 and 31),
  start_month int check (start_month between 1 and 12),
  autopay boolean not null default false,
  pay_method text,
  account_ref text,
  notes text,
  restricted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table public.utility_costs (
  id uuid primary key default gen_random_uuid(),
  utility text not null,
  provider text,
  period_start date,
  period_end date,
  amount numeric,
  usage numeric,
  usage_unit text,
  paid_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  company text,
  name text,
  phone text,
  email text,
  after_hours text,
  notes text,
  restricted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table public.secrets (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  category text,
  location text,
  username text,
  value text,
  notes text,
  restricted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  lease_id uuid references public.leases(id) on delete set null,
  doc_date date,
  file_path text not null unique,
  file_name text,
  notes text,
  restricted boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

do $$
declare t text;
begin
  foreach t in array array['building_info','leases','events','tasks','task_log','bills',
                           'utility_costs','contacts','secrets','documents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated()',
                   t || '_touch', t);
  end loop;
end $$;

-- ---------- Policies ----------
-- Admin only: leases.
create policy leases_all on public.leases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Members read non-restricted rows; only admin writes.
do $$
declare t text;
begin
  foreach t in array array['building_info','bills','secrets','documents'] loop
    execute format($f$create policy %I on public.%I for select to authenticated
      using (public.is_admin() or (public.is_member() and not restricted))$f$, t || '_select', t);
    execute format($f$create policy %I on public.%I for insert to authenticated
      with check (public.is_admin())$f$, t || '_insert', t);
    execute format($f$create policy %I on public.%I for update to authenticated
      using (public.is_admin()) with check (public.is_admin())$f$, t || '_update', t);
    execute format($f$create policy %I on public.%I for delete to authenticated
      using (public.is_admin())$f$, t || '_delete', t);
  end loop;
end $$;

-- Members read and write non-restricted rows; only admin deletes or touches restricted rows.
do $$
declare t text;
begin
  foreach t in array array['events','contacts'] loop
    execute format($f$create policy %I on public.%I for select to authenticated
      using (public.is_admin() or (public.is_member() and not restricted))$f$, t || '_select', t);
    execute format($f$create policy %I on public.%I for insert to authenticated
      with check (public.is_admin() or (public.is_member() and not restricted))$f$, t || '_insert', t);
    execute format($f$create policy %I on public.%I for update to authenticated
      using (public.is_admin() or (public.is_member() and not restricted))
      with check (public.is_admin() or (public.is_member() and not restricted))$f$, t || '_update', t);
    execute format($f$create policy %I on public.%I for delete to authenticated
      using (public.is_admin())$f$, t || '_delete', t);
  end loop;
end $$;

-- Tasks: members read, admin writes.
create policy tasks_select on public.tasks for select to authenticated using (public.is_member());
create policy tasks_insert on public.tasks for insert to authenticated with check (public.is_admin());
create policy tasks_update on public.tasks for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy tasks_delete on public.tasks for delete to authenticated using (public.is_admin());

-- Task log and utility costs: members read and write, admin deletes.
do $$
declare t text;
begin
  foreach t in array array['task_log','utility_costs'] loop
    execute format($f$create policy %I on public.%I for select to authenticated using (public.is_member())$f$, t || '_select', t);
    execute format($f$create policy %I on public.%I for insert to authenticated with check (public.is_member())$f$, t || '_insert', t);
    execute format($f$create policy %I on public.%I for update to authenticated using (public.is_member()) with check (public.is_member())$f$, t || '_update', t);
    execute format($f$create policy %I on public.%I for delete to authenticated using (public.is_admin())$f$, t || '_delete', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- ---------- Private file storage ----------
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy documents_files_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (
    public.is_admin()
    or (public.is_member() and exists (
          select 1 from public.documents d where d.file_path = storage.objects.name and not d.restricted))
  ));
create policy documents_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.is_admin());
create policy documents_files_update on storage.objects for update to authenticated
  using (bucket_id = 'documents' and public.is_admin());
create policy documents_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.is_admin());

-- ---------- Recurring procedures Jack specified ----------
insert into public.tasks (title, frequency, due_days, instructions) values
  ('Pay open bills', 'monthly', '1', 'Pay every bill listed under Bills that is due this month and not on autopay. Log the payment here.'),
  ('Building walkthrough', 'twice_monthly', '1,15', 'Walk the full building inside and out. Log date and any issues found.');

-- ---------- Keep role helpers out of the public API (applied as a second migration) ----------
create schema if not exists private;
grant usage on schema private to authenticated;
alter function public.is_admin() set schema private;
alter function public.is_member() set schema private;
alter function public.handle_new_user() set schema private;
revoke execute on function private.is_admin(), private.is_member() from public, anon;
grant execute on function private.is_admin(), private.is_member() to authenticated;
