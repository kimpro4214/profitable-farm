create table if not exists public.price_forecast_snapshots (
  id integer primary key check (id = 1),
  data jsonb not null check (coalesce(jsonb_typeof(data->'items'), '') = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.price_forecast_snapshots enable row level security;
revoke all on public.price_forecast_snapshots from anon, authenticated;
grant select on public.price_forecast_snapshots to anon, authenticated;
grant select, insert, update on public.price_forecast_snapshots to service_role;

drop policy if exists "Published forecasts are readable by everyone" on public.price_forecast_snapshots;
create policy "Published forecasts are readable by everyone"
on public.price_forecast_snapshots for select
to anon, authenticated
using (true);
