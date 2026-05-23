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
