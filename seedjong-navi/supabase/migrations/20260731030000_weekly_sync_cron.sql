create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'weekly_sync_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'weekly_sync_secret',
      'Generated secret for the seedjong-navi weekly farming cron'
    );
  end if;
end;
$$;

create or replace function public.verify_weekly_sync_secret(candidate text)
returns boolean
language sql
security definer
set search_path = public, vault
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'weekly_sync_secret'
      and decrypted_secret = candidate
  );
$$;

revoke all on function public.verify_weekly_sync_secret(text) from public, anon, authenticated;
grant execute on function public.verify_weekly_sync_secret(text) to service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'seedjong-weekly-farming-daily';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end;
$$;

select cron.schedule(
  'seedjong-weekly-farming-daily',
  '15 21 * * *',
  $cron$
    select net.http_post(
      url := 'https://gigetevcjsyfrsacpvnd.supabase.co/functions/v1/sync-weekly-farming',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sync-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'weekly_sync_secret'
        )
      ),
      body := jsonb_build_object('scheduledAt', now())
    );
  $cron$
);
