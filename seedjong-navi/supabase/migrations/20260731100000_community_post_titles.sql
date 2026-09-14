alter table public.posts
  add column if not exists title text;

update public.posts
set title = left(coalesce(nullif(trim(split_part(body, E'\n', 1)), ''), '농사 이야기'), 100)
where title is null or trim(title) = '';

alter table public.posts
  alter column title set not null;

alter table public.posts
  drop constraint if exists posts_title_length_check;
alter table public.posts
  add constraint posts_title_length_check check (char_length(title) between 1 and 100);
