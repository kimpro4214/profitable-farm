-- One-time smoke test for the same Vault-authenticated request used by pg_cron.
-- It is safe to replay: the Edge Function skips Gemini when the source URL exists.
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
  body := jsonb_build_object('smokeTest', true, 'requestedAt', now())
);
