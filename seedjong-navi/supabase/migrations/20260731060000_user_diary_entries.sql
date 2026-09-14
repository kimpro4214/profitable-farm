create table if not exists public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null default current_date,
  crop text not null default '미등록 작물',
  work text not null check (char_length(work) between 1 and 500),
  description text not null default '' check (char_length(description) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists diary_entries_user_date_idx
  on public.diary_entries (user_id, work_date desc, created_at desc);

alter table public.diary_entries enable row level security;
drop policy if exists "users read own diary" on public.diary_entries;
drop policy if exists "users create own diary" on public.diary_entries;
drop policy if exists "users update own diary" on public.diary_entries;
drop policy if exists "users delete own diary" on public.diary_entries;
create policy "users read own diary" on public.diary_entries
  for select to authenticated using (auth.uid() = user_id);
create policy "users create own diary" on public.diary_entries
  for insert to authenticated with check (auth.uid() = user_id);
create policy "users update own diary" on public.diary_entries
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users delete own diary" on public.diary_entries
  for delete to authenticated using (auth.uid() = user_id);
