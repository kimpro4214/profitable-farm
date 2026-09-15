-- ask-rag(Gemini) 호출을 사용자별 하루 N회로 제한하기 위한 사용량 테이블.
-- Edge Function이 service role로만 기록하며, 클라이언트는 직접 읽고 쓰지 못한다.
create table if not exists public.ask_rag_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  call_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.ask_rag_daily_usage enable row level security;

-- 한 번 호출할 때마다 오늘(한국 시간 기준) 사용량을 1 늘린다.
-- 한도 이내면 증가 후의 사용 횟수를, 한도를 넘었으면 null을 반환한다.
create or replace function public.consume_ask_rag_quota(p_user_id uuid, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_count integer;
begin
  insert into public.ask_rag_daily_usage (user_id, usage_date, call_count)
  values (p_user_id, v_today, 1)
  on conflict (user_id, usage_date) do update
    set call_count = ask_rag_daily_usage.call_count + 1,
        updated_at = now()
    where ask_rag_daily_usage.call_count < p_limit
  returning call_count into v_count;
  return v_count;
end;
$$;

revoke all on function public.consume_ask_rag_quota(uuid, integer) from public, anon, authenticated;
