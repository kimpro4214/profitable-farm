create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 20),
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.weekly_farming_reports (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique,
  pdf_url text,
  title text not null,
  headline text,
  published_at date,
  source_content text not null,
  summary jsonb not null default '[]'::jsonb,
  briefing text,
  status text not null default 'ready',
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists comments_post_id_idx on public.comments (post_id, created_at);
create index if not exists post_likes_user_id_idx on public.post_likes (user_id);
create index if not exists weekly_farming_reports_published_idx on public.weekly_farming_reports (published_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data->>'nickname', new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', '농업인'), 20)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into public.profiles (id, nickname)
select
  id,
  left(coalesce(raw_user_meta_data->>'nickname', raw_user_meta_data->>'name', raw_user_meta_data->>'full_name', '농업인'), 20)
from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.weekly_farming_reports enable row level security;

drop policy if exists "public profiles read" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "public posts read" on public.posts;
drop policy if exists "users create posts" on public.posts;
drop policy if exists "users update own posts" on public.posts;
drop policy if exists "users delete own posts" on public.posts;
drop policy if exists "public comments read" on public.comments;
drop policy if exists "users create comments" on public.comments;
drop policy if exists "users delete own comments" on public.comments;
drop policy if exists "public likes read" on public.post_likes;
drop policy if exists "users manage own likes" on public.post_likes;
drop policy if exists "public weekly reports read" on public.weekly_farming_reports;

create policy "public profiles read" on public.profiles for select using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "public posts read" on public.posts for select using (true);
create policy "users create posts" on public.posts for insert to authenticated with check (auth.uid() = user_id);
create policy "users update own posts" on public.posts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users delete own posts" on public.posts for delete to authenticated using (auth.uid() = user_id);
create policy "public comments read" on public.comments for select using (true);
create policy "users create comments" on public.comments for insert to authenticated with check (auth.uid() = user_id);
create policy "users delete own comments" on public.comments for delete to authenticated using (auth.uid() = user_id);
create policy "public likes read" on public.post_likes for select using (true);
create policy "users manage own likes" on public.post_likes for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "public weekly reports read" on public.weekly_farming_reports for select using (true);
