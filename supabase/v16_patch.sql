-- NEW HIS Demo V16 Patch
-- 補強月班表任務指派欄位與請假代理欄位。可重複執行。

alter table public.schedules
  add column if not exists task_group text,
  add column if not exists task_note text;

alter table public.leave_requests
  add column if not exists request_kind text default '請假',
  add column if not exists start_time text,
  add column if not exists end_time text,
  add column if not exists reason text,
  add column if not exists delegate_user_email text,
  add column if not exists delegate_approval_at timestamptz,
  add column if not exists manager_approval_at timestamptz,
  add column if not exists cancel_status text,
  add column if not exists cancelled_at timestamptz;

notify pgrst, 'reload schema';
