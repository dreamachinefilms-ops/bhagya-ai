alter table public.numerology_profiles enable row level security;

create unique index if not exists numerology_profiles_user_id_unique
on public.numerology_profiles (user_id);

drop policy if exists "Users can select own numerology profile" on public.numerology_profiles;
create policy "Users can select own numerology profile"
on public.numerology_profiles for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own numerology profile" on public.numerology_profiles;
create policy "Users can insert own numerology profile"
on public.numerology_profiles for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own numerology profile" on public.numerology_profiles;
create policy "Users can update own numerology profile"
on public.numerology_profiles for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
