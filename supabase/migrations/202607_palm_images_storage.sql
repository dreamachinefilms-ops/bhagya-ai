insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'palm-images',
  'palm-images',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Users can read own palm images"
on storage.objects;

create policy "Users can read own palm images"
on storage.objects
for select
using (
  bucket_id = 'palm-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can upload own palm images"
on storage.objects;

create policy "Users can upload own palm images"
on storage.objects
for insert
with check (
  bucket_id = 'palm-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own palm images"
on storage.objects;

create policy "Users can update own palm images"
on storage.objects
for update
using (
  bucket_id = 'palm-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'palm-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own palm images"
on storage.objects;

create policy "Users can delete own palm images"
on storage.objects
for delete
using (
  bucket_id = 'palm-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
