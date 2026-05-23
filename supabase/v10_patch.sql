-- NEW HIS Demo V10 Patch
-- 修正 demo_staff 資料表不存在或 PostgREST schema cache 尚未更新的問題。
-- 請到 Supabase → SQL Editor / SQL 編輯器 → New query / 新查詢，貼上後執行。

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

-- 通知 PostgREST 重新載入 schema cache，避免 Could not find the table 'public.demo_staff' in the schema cache。
notify pgrst, 'reload schema';
