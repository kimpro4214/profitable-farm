create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'bot')),
  text text not null check (char_length(text) between 1 and 5000),
  citation text check (citation is null or char_length(citation) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at desc);

alter table public.chat_messages enable row level security;
drop policy if exists "users read own chat messages" on public.chat_messages;
drop policy if exists "users create own chat messages" on public.chat_messages;
drop policy if exists "users delete own chat messages" on public.chat_messages;

create policy "users read own chat messages"
on public.chat_messages for select to authenticated
using (auth.uid() = user_id);

create policy "users create own chat messages"
on public.chat_messages for insert to authenticated
with check (auth.uid() = user_id);

create policy "users delete own chat messages"
on public.chat_messages for delete to authenticated
using (auth.uid() = user_id);
