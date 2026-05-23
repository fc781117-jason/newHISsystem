-- NRS Demo V7 Supabase Schema
-- 目的：建立多人雲端互動 Demo。所有患者資料皆為假資料，不可匯入真實病患資料。
-- V6/V7 新增：OpenAI 使用紀錄、月排班與三個月預先請假卡位欄位。

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  role text not null default 'frontdesk',
  group_name text default '待設定',
  default_clinic text default '台北',
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.patients_mock (
  id uuid primary key default gen_random_uuid(),
  chart_no text,
  name text not null,
  gender text,
  age int,
  birthday date,
  phone_masked text,
  clinic text not null,
  disease text,
  current_status text default '已報到',
  appointment_time text,
  seat_no text,
  therapist text,
  doctor text,
  treatment_minutes int,
  home_status text,
  garment_status text,
  risk_level text default '一般',
  progress int default 0,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients_mock(id) on delete set null,
  title text not null,
  task_type text,
  priority text default '中',
  status text default '待處理',
  clinic text not null,
  group_name text,
  owner_id uuid references auth.users(id),
  due_date date,
  content text,
  completed_at timestamptz,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text,
  scope text default '院區',
  clinic text,
  group_name text,
  required_read boolean default false,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz default now()
);

create table if not exists public.announcement_reads (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid references public.announcements(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  user_email text,
  read_at timestamptz default now(),
  unique(announcement_id, user_id)
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid references auth.users(id),
  applicant_name text,
  leave_type text,
  period_text text,
  start_date date,
  end_date date,
  month_key text,
  delegate_name text,
  delegate_status text default '待同意',
  approval_status text default '待審核',
  progress int default 0,
  clinic text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.delegations (
  id uuid primary key default gen_random_uuid(),
  grantor_id uuid references auth.users(id),
  delegate_id uuid references auth.users(id),
  scope text,
  start_time timestamptz,
  end_time timestamptz,
  reason text,
  approved_by uuid references auth.users(id),
  status text default '待審核',
  created_at timestamptz default now()
);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  work_date date,
  month_key text,
  staff_name text,
  group_name text,
  shift_name text,
  hours numeric default 0,
  clinic text,
  created_at timestamptz default now()
);



create table if not exists public.shift_swap_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references auth.users(id),
  requester_name text,
  target_name text,
  request_date date,
  original_shift text,
  requested_shift text,
  reason text,
  status text default '待對方同意',
  clinic text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  user_email text,
  clinic text,
  prompt_type text,
  input_summary text,
  output_text text,
  model text,
  created_at timestamptz default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  actor_email text,
  actor_role text,
  clinic text,
  action text,
  module text,
  target_type text,
  target_id text,
  detail text,
  user_agent text,
  created_at timestamptz default now()
);

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select role in ('super_admin','clinic_manager') from public.profiles where id = auth.uid()), false);
$$;

alter table public.profiles enable row level security;
alter table public.patients_mock enable row level security;
alter table public.tasks enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;
alter table public.leave_requests enable row level security;
alter table public.delegations enable row level security;
alter table public.schedules enable row level security;
alter table public.shift_swap_requests enable row level security;
alter table public.ai_usage_logs enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles for select to authenticated using (true);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles for insert to authenticated with check (id = auth.uid());

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

drop policy if exists "patients_mock_all_authenticated" on public.patients_mock;
create policy "patients_mock_all_authenticated" on public.patients_mock for all to authenticated using (true) with check (true);

drop policy if exists "tasks_all_authenticated" on public.tasks;
create policy "tasks_all_authenticated" on public.tasks for all to authenticated using (true) with check (true);

drop policy if exists "announcements_all_authenticated" on public.announcements;
create policy "announcements_all_authenticated" on public.announcements for all to authenticated using (true) with check (true);

drop policy if exists "announcement_reads_all_authenticated" on public.announcement_reads;
create policy "announcement_reads_all_authenticated" on public.announcement_reads for all to authenticated using (true) with check (true);

drop policy if exists "leave_requests_all_authenticated" on public.leave_requests;
create policy "leave_requests_all_authenticated" on public.leave_requests for all to authenticated using (true) with check (true);

drop policy if exists "delegations_all_authenticated" on public.delegations;
create policy "delegations_all_authenticated" on public.delegations for all to authenticated using (true) with check (true);

drop policy if exists "schedules_all_authenticated" on public.schedules;
create policy "schedules_all_authenticated" on public.schedules for all to authenticated using (true) with check (true);



drop policy if exists "shift_swap_requests_all_authenticated" on public.shift_swap_requests;
create policy "shift_swap_requests_all_authenticated" on public.shift_swap_requests for all to authenticated using (true) with check (true);

drop policy if exists "ai_usage_logs_all_authenticated" on public.ai_usage_logs;
create policy "ai_usage_logs_all_authenticated" on public.ai_usage_logs for all to authenticated using (true) with check (true);

drop policy if exists "audit_logs_select_authenticated" on public.audit_logs;
create policy "audit_logs_select_authenticated" on public.audit_logs for select to authenticated using (true);

drop policy if exists "audit_logs_insert_authenticated" on public.audit_logs;
create policy "audit_logs_insert_authenticated" on public.audit_logs for insert to authenticated with check (true);

-- 注意：
-- 以上 RLS 為 Demo 方便多人測試而設計，仍屬寬鬆策略。
-- 正式版應依院區、角色、組別、個案敏感度、負責人與代理權限再收緊。



-- NRS Demo V9 Patch
-- 新增虛擬員工資料表，用於排班、任務分組與訓練測試。

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

alter table public.demo_staff enable row level security;

drop policy if exists "demo_staff_all_authenticated" on public.demo_staff;
create policy "demo_staff_all_authenticated" on public.demo_staff
for all to authenticated using (true) with check (true);

-- 建議：正式版應依主管角色與院區權限收斂 demo_staff 的 insert/update/delete 權限。
