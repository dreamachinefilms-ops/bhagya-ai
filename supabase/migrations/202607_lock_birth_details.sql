alter table public.user_birth_details
add column if not exists full_name text;

update public.user_birth_details birth
set full_name = profile.full_name
from public.profiles profile
where birth.user_id = profile.id
  and nullif(trim(birth.full_name), '') is null
  and nullif(trim(profile.full_name), '') is not null;

alter table public.user_birth_details enable row level security;

create unique index if not exists user_birth_details_user_id_unique
on public.user_birth_details (user_id);

drop policy if exists "Users can select own birth details" on public.user_birth_details;
drop policy if exists "Users can read own birth details" on public.user_birth_details;
create policy "Users can read own birth details"
on public.user_birth_details for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own birth details" on public.user_birth_details;
drop policy if exists "Users can create own birth details once" on public.user_birth_details;
create policy "Users can create own birth details once"
on public.user_birth_details for insert to authenticated
with check (auth.uid() = user_id);

-- The existing unique user_id constraint makes a second insert impossible.
-- No authenticated UPDATE or DELETE policy is intentionally created.
drop policy if exists "Users can update own birth details" on public.user_birth_details;
drop policy if exists "Users can delete own birth details" on public.user_birth_details;
