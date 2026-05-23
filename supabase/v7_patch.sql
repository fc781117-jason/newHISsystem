-- NRS Demo V7 Patch
-- 已部署 V6 的專案只需要再執行這段即可。

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

alter table public.shift_swap_requests enable row level security;

drop policy if exists "shift_swap_requests_all_authenticated" on public.shift_swap_requests;
create policy "shift_swap_requests_all_authenticated"
on public.shift_swap_requests
for all to authenticated
using (true)
with check (true);
