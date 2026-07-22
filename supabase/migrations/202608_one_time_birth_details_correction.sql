alter table public.user_birth_details add column if not exists correction_used boolean not null default false;
alter table public.user_birth_details add column if not exists corrected_at timestamptz;
alter table public.user_birth_details add column if not exists correction_version integer not null default 0;

create table if not exists public.birth_profile_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('birth-profile-corrected')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.birth_profile_events enable row level security;
-- No client policies: these internal context events are written only by the security-definer function.

drop policy if exists "Users can update own birth details" on public.user_birth_details;
drop policy if exists "Users can delete own birth details" on public.user_birth_details;

create or replace function public.correct_birth_details_once(
  p_full_name text, p_first_name text, p_date_of_birth text, p_birth_time text,
  p_birth_time_known boolean, p_birth_place text, p_latitude numeric,
  p_longitude numeric, p_timezone_offset text, p_timezone_id text
)
returns public.user_birth_details
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare updated_row public.user_birth_details;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if p_full_name is null or char_length(btrim(p_full_name)) < 2 or char_length(p_full_name) > 80 or p_full_name ~ '[<>[:cntrl:]]' then raise exception 'INVALID_BIRTH_DETAILS'; end if;
  if p_date_of_birth is null or p_date_of_birth !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_BIRTH_DETAILS'; end if;
  begin
    if to_char(to_date(p_date_of_birth, 'YYYY-MM-DD'), 'YYYY-MM-DD') <> p_date_of_birth or to_date(p_date_of_birth, 'YYYY-MM-DD') >= current_date then raise exception 'INVALID_BIRTH_DETAILS'; end if;
  exception when others then raise exception 'INVALID_BIRTH_DETAILS'; end;
  if p_birth_time_known is null or (p_birth_time_known and (p_birth_time is null or p_birth_time !~ '^([01]\d|2[0-3]):[0-5]\d$')) then raise exception 'INVALID_BIRTH_DETAILS'; end if;
  if p_birth_place is null or char_length(btrim(p_birth_place)) < 2 or char_length(p_birth_place) > 120 or p_birth_place ~ '[<>[:cntrl:]]' then raise exception 'INVALID_BIRTH_DETAILS'; end if;
  if p_latitude is null or p_latitude not between -90 and 90 or p_longitude is null or p_longitude not between -180 and 180 or nullif(btrim(p_timezone_offset), '') is null then raise exception 'INVALID_BIRTH_DETAILS'; end if;
  if not exists (select 1 from public.user_birth_details where user_id = auth.uid()) then raise exception 'BIRTH_PROFILE_NOT_FOUND'; end if;

  update public.user_birth_details set
    full_name = p_full_name, date_of_birth = p_date_of_birth,
    birth_time = case when p_birth_time_known then p_birth_time else null end,
    birth_time_known = p_birth_time_known, birth_place = p_birth_place,
    latitude = p_latitude, longitude = p_longitude,
    timezone_offset = p_timezone_offset, timezone_id = p_timezone_id,
    correction_used = true, corrected_at = now(), correction_version = 1, updated_at = now()
  where user_id = auth.uid() and correction_used = false and correction_version = 0
  returning * into updated_row;

  if updated_row.id is null then raise exception 'BIRTH_DETAILS_CORRECTION_UNAVAILABLE'; end if;

  update public.profiles set full_name = p_full_name, first_name = p_first_name, updated_at = now() where id = auth.uid();
  delete from public.numerology_profiles where user_id = auth.uid();
  if to_regclass('public.daily_horoscopes') is not null then execute 'delete from public.daily_horoscopes where user_id = $1' using auth.uid(); end if;
  insert into public.birth_profile_events (user_id, event_type, metadata)
    values (auth.uid(), 'birth-profile-corrected', jsonb_build_object('correctedAt', updated_row.corrected_at, 'useNewProfileFromNowOn', true));
  return updated_row;
end;
$$;

revoke all on function public.correct_birth_details_once(text,text,text,text,boolean,text,numeric,numeric,text,text) from public;
grant execute on function public.correct_birth_details_once(text,text,text,text,boolean,text,numeric,numeric,text,text) to authenticated;
