-- NEW HIS Demo V11 Patch
-- 目的：新增患者事件紀錄表，支援初診建檔、複診登記、客服關懷、列管事項、居家諮詢等流程紀錄。

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

alter table public.patient_events enable row level security;

drop policy if exists "patient_events_all_authenticated" on public.patient_events;
create policy "patient_events_all_authenticated" on public.patient_events
for all to authenticated using (true) with check (true);

-- 讓 PostgREST 重新讀取 schema，避免 schema cache 找不到新表。
notify pgrst, 'reload schema';
