alter table public.profiles add column if not exists onboarding_completed boolean not null default false;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists privacy_accepted_at timestamptz;
alter table public.profiles add column if not exists marketing_opt_in boolean not null default false;
