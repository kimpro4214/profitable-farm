create extension if not exists postgis with schema extensions;

create table if not exists public.farmland_zones (
  id bigint generated always as identity primary key,
  source_id text not null,
  sigungu_code text,
  zone_type text not null check (zone_type in ('jinheung', 'boho')),
  geom extensions.geometry(MultiPolygon, 4326) not null
);
create index if not exists farmland_zones_geom_gix
  on public.farmland_zones using gist (geom);
create index if not exists farmland_zones_sigungu_idx
  on public.farmland_zones (sigungu_code);

create table if not exists public.reservoir_water_quality (
  facility_code text primary key,
  facility_name text not null,
  address text not null,
  observed_at date,
  water_ph double precision,
  electrical_conductivity_us_cm double precision,
  electrical_conductivity_ds_m double precision,
  latitude double precision not null,
  longitude double precision not null,
  source_name text not null default 'KRC 농업용저수지 수질정보'
);
create index if not exists reservoir_water_quality_point_gix
  on public.reservoir_water_quality using gist (
    (extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography)
  );

create table if not exists public.farm_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  region_id text,
  address text,
  pnu text,
  latitude double precision not null,
  longitude double precision not null,
  analysis jsonb not null default '{}'::jsonb,
  analyzed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.farmland_zones enable row level security;
alter table public.reservoir_water_quality enable row level security;
alter table public.farm_profiles enable row level security;

drop policy if exists "users read own farm profile" on public.farm_profiles;
drop policy if exists "users insert own farm profile" on public.farm_profiles;
drop policy if exists "users update own farm profile" on public.farm_profiles;
create policy "users read own farm profile" on public.farm_profiles
  for select to authenticated using (auth.uid() = user_id);
create policy "users insert own farm profile" on public.farm_profiles
  for insert to authenticated with check (auth.uid() = user_id);
create policy "users update own farm profile" on public.farm_profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.lookup_farm_conditions(p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  point_geom extensions.geometry(Point, 4326);
  matched_zone text;
  nearest_water jsonb;
begin
  if p_lat not between 30 and 40 or p_lng not between 120 and 135 then
    raise exception '대한민국 범위의 올바른 좌표가 아닙니다.';
  end if;

  point_geom := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326);

  select f.zone_type into matched_zone
  from public.farmland_zones f
  where extensions.st_covers(f.geom, point_geom)
  order by case f.zone_type when 'jinheung' then 1 else 2 end
  limit 1;

  select jsonb_build_object(
    'facilityCode', w.facility_code,
    'facilityName', w.facility_name,
    'address', w.address,
    'observedAt', w.observed_at,
    'ph', w.water_ph,
    'ecUsCm', w.electrical_conductivity_us_cm,
    'ecDsM', w.electrical_conductivity_ds_m,
    'distanceKm', round((extensions.st_distance(
      point_geom::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(w.longitude, w.latitude), 4326)::extensions.geography
    ) / 1000)::numeric, 1),
    'source', w.source_name
  ) into nearest_water
  from public.reservoir_water_quality w
  order by point_geom::extensions.geography <->
    extensions.st_setsrid(extensions.st_makepoint(w.longitude, w.latitude), 4326)::extensions.geography
  limit 1;

  return jsonb_build_object(
    'zoneType', coalesce(matched_zone, 'general'),
    'zoneMatched', matched_zone is not null,
    'zoneSource', 'KRC 농업진흥지역도 2025-12-31',
    'water', nearest_water
  );
end;
$$;

create or replace function public.import_farmland_zone_batch(rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare inserted_count integer;
begin
  insert into public.farmland_zones (source_id, sigungu_code, zone_type, geom)
  select
    x.source_id,
    x.sigungu_code,
    x.zone_type,
    extensions.st_multi(extensions.st_makevalid(
      extensions.st_setsrid(extensions.st_geomfromgeojson(x.geometry::text), 4326)
    ))
  from jsonb_to_recordset(rows) as x(
    source_id text,
    sigungu_code text,
    zone_type text,
    geometry jsonb
  )
  where x.zone_type in ('jinheung', 'boho');
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.reset_farm_reference_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate table public.farmland_zones restart identity;
  truncate table public.reservoir_water_quality;
end;
$$;

revoke all on function public.lookup_farm_conditions(double precision, double precision) from public, anon, authenticated;
revoke all on function public.import_farmland_zone_batch(jsonb) from public, anon, authenticated;
revoke all on function public.reset_farm_reference_data() from public, anon, authenticated;
grant execute on function public.lookup_farm_conditions(double precision, double precision) to service_role;
grant execute on function public.import_farmland_zone_batch(jsonb) to service_role;
grant execute on function public.reset_farm_reference_data() to service_role;
