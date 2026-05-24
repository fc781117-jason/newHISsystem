-- NEW HIS Demo V17 Patch
-- 目的：手動排班、班表移動/刪除、任務指派與個人額外權限。
-- 可重複執行。

alter table public.schedules
  add column if not exists assigned_clinic text,
  add column if not exists task_group text,
  add column if not exists task_note text;

alter table public.profiles
  add column if not exists extra_permissions jsonb default '[]'::jsonb;

-- 調班申請保險欄位
alter table public.shift_swap_requests
  add column if not exists manager_note text,
  add column if not exists approved_at timestamptz;

notify pgrst, 'reload schema';
