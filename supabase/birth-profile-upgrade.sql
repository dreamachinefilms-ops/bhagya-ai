alter table public.profiles
add column if not exists first_name text;

alter table public.profiles
add column if not exists full_name text;

alter table public.user_birth_details
add column if not exists birth_time_known boolean not null default true;

with ranked_birth_details as (
  select
    id,
    row_number() over (
      partition by user_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as row_number
  from public.user_birth_details
)
delete from public.user_birth_details
using ranked_birth_details
where public.user_birth_details.id = ranked_birth_details.id
  and ranked_birth_details.row_number > 1;

create unique index if not exists user_birth_details_user_id_unique
on public.user_birth_details (user_id);
