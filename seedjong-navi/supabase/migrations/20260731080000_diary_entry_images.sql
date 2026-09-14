alter table public.diary_entries
  add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('diary-images', 'diary-images', false, 8388608, array['image/*'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users read own diary images" on storage.objects;
drop policy if exists "users upload own diary images" on storage.objects;
drop policy if exists "users update own diary images" on storage.objects;
drop policy if exists "users delete own diary images" on storage.objects;

create policy "users read own diary images"
on storage.objects for select to authenticated
using (
  bucket_id = 'diary-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users upload own diary images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'diary-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users update own diary images"
on storage.objects for update to authenticated
using (
  bucket_id = 'diary-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'diary-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users delete own diary images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'diary-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
