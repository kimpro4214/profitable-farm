-- Supabase Dashboard > SQL Editor에서 한 번 실행
create extension if not exists vector;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 20),
  onboarding_completed boolean not null default false,
  terms_accepted_at timestamptz,
  privacy_accepted_at timestamptz,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);
alter table profiles add column if not exists onboarding_completed boolean not null default false;
alter table profiles add column if not exists terms_accepted_at timestamptz;
alter table profiles add column if not exists privacy_accepted_at timestamptz;
alter table profiles add column if not exists marketing_opt_in boolean not null default false;
create table if not exists posts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 2000),
  image_path text,
  created_at timestamptz not null default now()
);
alter table posts add column if not exists image_path text;
create table if not exists comments (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000), created_at timestamptz not null default now()
);
create table if not exists post_likes (
  post_id uuid references posts(id) on delete cascade, user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (post_id, user_id)
);
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'bot')),
  text text not null check (char_length(text) between 1 and 5000),
  citation text check (citation is null or char_length(citation) <= 1000),
  created_at timestamptz not null default now()
);
create table if not exists diary_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null default current_date, crop text not null default '미등록 작물',
  work text not null check (char_length(work) between 1 and 500),
  description text not null default '' check (char_length(description) <= 3000),
  image_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table diary_entries add column if not exists image_path text;
create table if not exists documents (
  id uuid primary key default gen_random_uuid(), title text not null, source_url text,
  content text not null, metadata jsonb not null default '{}'::jsonb,
  -- Gemini gemini-embedding-001 outputDimensionality=768
  embedding vector(768), created_at timestamptz not null default now()
);
create table if not exists weekly_farming_reports (
  id uuid primary key default gen_random_uuid(), source_url text not null unique, title text not null,
  pdf_url text, headline text, published_at date, source_content text not null, summary jsonb not null default '[]'::jsonb,
  briefing text, status text not null default 'ready', fetched_at timestamptz not null default now(), created_at timestamptz not null default now()
);
alter table weekly_farming_reports add column if not exists pdf_url text;
alter table weekly_farming_reports add column if not exists headline text;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'nickname', new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', '농업인'), 20))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
drop function if exists public.match_documents(vector, integer);
-- create table if not exists does not alter an already-created 1536-dimension
-- OpenAI column. This migration switches the empty MVP RAG store to Gemini 768.
alter table documents alter column embedding type vector(768) using embedding::vector(768);
create or replace function match_documents(query_embedding vector(768), match_count int default 5)
returns table (id uuid, title text, source_url text, content text, metadata jsonb, similarity float)
language sql stable security definer set search_path = public as $$
  select id, title, source_url, content, metadata, 1 - (embedding <=> query_embedding) as similarity
  from documents where embedding is not null order by embedding <=> query_embedding limit match_count;
$$;

alter table profiles enable row level security; alter table posts enable row level security;
alter table comments enable row level security; alter table post_likes enable row level security; alter table documents enable row level security;
alter table chat_messages enable row level security;
alter table diary_entries enable row level security;
alter table weekly_farming_reports enable row level security;
drop policy if exists "public profiles read" on profiles;
drop policy if exists "users update own profile" on profiles;
drop policy if exists "public posts read" on posts;
drop policy if exists "users create posts" on posts;
drop policy if exists "users update own posts" on posts;
drop policy if exists "users delete own posts" on posts;
drop policy if exists "public comments read" on comments;
drop policy if exists "users create comments" on comments;
drop policy if exists "users delete own comments" on comments;
drop policy if exists "public likes read" on post_likes;
drop policy if exists "users manage own likes" on post_likes;
drop policy if exists "users read own chat messages" on chat_messages;
drop policy if exists "users create own chat messages" on chat_messages;
drop policy if exists "users delete own chat messages" on chat_messages;
drop policy if exists "users read own diary" on diary_entries;
drop policy if exists "users create own diary" on diary_entries;
drop policy if exists "users update own diary" on diary_entries;
drop policy if exists "users delete own diary" on diary_entries;
drop policy if exists "public weekly reports read" on weekly_farming_reports;
create policy "public profiles read" on profiles for select using (true);
create policy "users update own profile" on profiles for update to authenticated using (auth.uid() = id);
create policy "public posts read" on posts for select using (true);
create policy "users create posts" on posts for insert to authenticated with check (auth.uid() = user_id);
create policy "users update own posts" on posts for update to authenticated using (auth.uid() = user_id);
create policy "users delete own posts" on posts for delete to authenticated using (auth.uid() = user_id);
create policy "public comments read" on comments for select using (true);
create policy "users create comments" on comments for insert to authenticated with check (auth.uid() = user_id);
create policy "users delete own comments" on comments for delete to authenticated using (auth.uid() = user_id);
create policy "public likes read" on post_likes for select using (true);
create policy "users manage own likes" on post_likes for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users read own chat messages" on chat_messages for select to authenticated using (auth.uid() = user_id);
create policy "users create own chat messages" on chat_messages for insert to authenticated with check (auth.uid() = user_id);
create policy "users delete own chat messages" on chat_messages for delete to authenticated using (auth.uid() = user_id);
create policy "users read own diary" on diary_entries for select to authenticated using (auth.uid() = user_id);
create policy "users create own diary" on diary_entries for insert to authenticated with check (auth.uid() = user_id);
create policy "users update own diary" on diary_entries for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users delete own diary" on diary_entries for delete to authenticated using (auth.uid() = user_id);
create policy "public weekly reports read" on weekly_farming_reports for select using (true);
-- documents는 Edge Function(service role)만 쓰므로 앱 직접 접근을 허용하지 않는다.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-images', 'community-images', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "community images public read" on storage.objects;
drop policy if exists "users upload own community images" on storage.objects;
drop policy if exists "users update own community images" on storage.objects;
drop policy if exists "users delete own community images" on storage.objects;
create policy "community images public read" on storage.objects for select using (bucket_id = 'community-images');
create policy "users upload own community images" on storage.objects for insert to authenticated
with check (bucket_id = 'community-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users update own community images" on storage.objects for update to authenticated
using (bucket_id = 'community-images' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'community-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users delete own community images" on storage.objects for delete to authenticated
using (bucket_id = 'community-images' and (storage.foldername(name))[1] = auth.uid()::text);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('diary-images', 'diary-images', false, 8388608, array['image/*'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "users read own diary images" on storage.objects;
drop policy if exists "users upload own diary images" on storage.objects;
drop policy if exists "users update own diary images" on storage.objects;
drop policy if exists "users delete own diary images" on storage.objects;
create policy "users read own diary images" on storage.objects for select to authenticated
using (bucket_id = 'diary-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users upload own diary images" on storage.objects for insert to authenticated
with check (bucket_id = 'diary-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users update own diary images" on storage.objects for update to authenticated
using (bucket_id = 'diary-images' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'diary-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users delete own diary images" on storage.objects for delete to authenticated
using (bucket_id = 'diary-images' and (storage.foldername(name))[1] = auth.uid()::text);
