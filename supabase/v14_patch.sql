-- NEW HIS Demo V14 Patch
-- 目標：一次補齊 V12~V14 大版測試所需資料表。
-- 可重複執行，不會刪除既有資料。

create extension if not exists "pgcrypto";

create table if not exists public.demo_staff (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  title text,
  role text default 'frontdesk',
  group_name text default '待設定',
  default_clinic text default '台北',
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.patient_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients_mock(id) on delete cascade,
  event_type text not null,
  title text,
  content text,
  clinic text,
  created_by uuid references auth.users(id),
  created_by_email text,
  created_at timestamptz default now()
);

create table if not exists public.appointments_mock (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients_mock(id) on delete set null,
  patient_name text,
  appointment_type text,
  visit_type text,
  appointment_date date,
  appointment_time text,
  clinic text,
  doctor text,
  therapist text,
  status text default '已預約',
  cancel_reason text,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients_mock(id) on delete set null,
  patient_name text,
  order_type text,
  title text,
  status text default '待處理',
  priority text default '中',
  clinic text,
  group_name text,
  owner_name text,
  due_date date,
  content text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.shift_swap_requests (
  id uuid primary key default gen_random_uuid(),
  requester_name text,
  target_name text,
  request_date date,
  original_shift text,
  requested_shift text,
  status text default '待對方同意',
  reason text,
  clinic text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table public.demo_staff enable row level security;
alter table public.patient_events enable row level security;
alter table public.appointments_mock enable row level security;
alter table public.work_orders enable row level security;
alter table public.shift_swap_requests enable row level security;

drop policy if exists "demo_staff_all_authenticated" on public.demo_staff;
create policy "demo_staff_all_authenticated" on public.demo_staff for all to authenticated using (true) with check (true);

drop policy if exists "patient_events_all_authenticated" on public.patient_events;
create policy "patient_events_all_authenticated" on public.patient_events for all to authenticated using (true) with check (true);

drop policy if exists "appointments_mock_all_authenticated" on public.appointments_mock;
create policy "appointments_mock_all_authenticated" on public.appointments_mock for all to authenticated using (true) with check (true);

drop policy if exists "work_orders_all_authenticated" on public.work_orders;
create policy "work_orders_all_authenticated" on public.work_orders for all to authenticated using (true) with check (true);

drop policy if exists "shift_swap_requests_all_authenticated" on public.shift_swap_requests;
create policy "shift_swap_requests_all_authenticated" on public.shift_swap_requests for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
