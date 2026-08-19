-- Run once against your Supabase project to configure the render cache bucket.
-- Dashboard → SQL Editor → paste and run.

-- 1. Create the public storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'story-renders',
  'story-renders',
  true,                          -- public: CDN URLs work without auth
  2097152,                       -- 2 MB max per file
  array['image/jpeg']
)
on conflict (id) do nothing;

-- 2. Allow anon reads (public bucket, but be explicit)
create policy "Public read story renders"
  on storage.objects for select
  using (bucket_id = 'story-renders');

-- 3. Only service role can write (Edge Function uses service key)
create policy "Service role write story renders"
  on storage.objects for insert
  with check (bucket_id = 'story-renders');

create policy "Service role update story renders"
  on storage.objects for update
  using (bucket_id = 'story-renders');
