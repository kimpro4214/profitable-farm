create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_nickname text;
begin
  profile_nickname := left(
    trim(coalesce(
      new.raw_user_meta_data->>'nickname',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      '농업인'
    )),
    20
  );

  if coalesce(char_length(profile_nickname), 0) < 2 then
    profile_nickname := '농업인';
  end if;

  insert into public.profiles (id, nickname)
  values (new.id, profile_nickname)
  on conflict (id) do nothing;

  return new;
end;
$$;
