create table if not exists public.groundwater_wells (
  well_id text primary key,
  address text,
  use_code text,
  well_depth_m double precision,
  pump_capacity_m3_day double precision,
  latitude double precision not null,
  longitude double precision not null
);

create index if not exists groundwater_wells_geog_gix
  on public.groundwater_wells using gist (
    (extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography)
  );

create table if not exists public.groundwater_usage_areas (
  id bigint generated always as identity primary key,
  usage_level integer not null,
  geom extensions.geometry(MultiPolygon, 4326) not null
);
create index if not exists groundwater_usage_areas_geom_gix on public.groundwater_usage_areas using gist (geom);

create table if not exists public.groundwater_pollution_areas (
  id bigint generated always as identity primary key,
  risk_code text not null,
  geom extensions.geometry(MultiPolygon, 4326) not null
);
create index if not exists groundwater_pollution_areas_geom_gix on public.groundwater_pollution_areas using gist (geom);

create or replace function public.lookup_groundwater_conditions(p_lat double precision, p_lng double precision)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare point_geom extensions.geometry(Point, 4326); nearest_well jsonb; usage integer; risk text;
begin
  point_geom := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326);
  select jsonb_build_object('wellId', well_id, 'address', address, 'distanceKm', round((extensions.st_distance(point_geom::extensions.geography, extensions.st_setsrid(extensions.st_makepoint(longitude, latitude),4326)::extensions.geography)/1000)::numeric,1), 'pumpCapacityM3Day', pump_capacity_m3_day, 'depthM', well_depth_m)
    into nearest_well from public.groundwater_wells order by point_geom::extensions.geography <-> extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326)::extensions.geography limit 1;
  select usage_level into usage from public.groundwater_usage_areas where extensions.st_covers(geom, point_geom) limit 1;
  select risk_code into risk from public.groundwater_pollution_areas where extensions.st_covers(geom, point_geom) limit 1;
  return jsonb_build_object('nearestWell', nearest_well, 'usageLevel', usage, 'pollutionRiskCode', risk);
end; $$;

revoke all on function public.lookup_groundwater_conditions(double precision, double precision) from public, anon, authenticated;
grant execute on function public.lookup_groundwater_conditions(double precision, double precision) to service_role;
