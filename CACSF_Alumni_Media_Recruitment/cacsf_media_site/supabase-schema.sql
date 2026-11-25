-- CACSF Alumni Fellowship Media Unit application database
-- Run this entire script in the Supabase SQL Editor.
create table if not exists public.applications (
 id uuid primary key default gen_random_uuid(),
 full_name text not null,
 set_year text not null,
 phone text not null,
 whatsapp text not null,
 email text not null,
 state text not null,
 city text not null,
 location text not null,
 bio text not null,
 skills text[] not null,
 portfolio text not null default '',
 portfolio_files jsonb not null default '[]'::jsonb,
 experience text not null,
 created_at timestamptz not null default now()
);
-- Safe additions for an existing installation.
alter table public.applications add column if not exists state text not null default '';
alter table public.applications add column if not exists city text not null default '';
alter table public.applications add column if not exists portfolio_files jsonb not null default '[]'::jsonb;
alter table public.applications alter column portfolio set default '';

alter table public.applications enable row level security;
drop policy if exists "Anyone can submit application" on public.applications;
create policy "Anyone can submit application" on public.applications for insert to anon, authenticated with check (true);

create table if not exists public.media_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.media_admins enable row level security;
drop policy if exists "Admins can read admin list" on public.media_admins;
create policy "Admins can read admin list" on public.media_admins for select to authenticated using (user_id=auth.uid());
drop policy if exists "Approved admins can read applications" on public.applications;
create policy "Approved admins can read applications" on public.applications for select to authenticated using (exists (select 1 from public.media_admins where user_id=auth.uid()));

-- Private bucket for up to 10 portfolio samples per applicant.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('applicant-portfolio', 'applicant-portfolio', false, 26214400,
 array['image/jpeg','image/png','image/webp','image/gif','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/zip','video/mp4','video/quicktime'])
on conflict (id) do update set public=false, file_size_limit=26214400;

drop policy if exists "Applicants can upload portfolio samples" on storage.objects;
create policy "Applicants can upload portfolio samples" on storage.objects for insert to anon, authenticated with check (bucket_id='applicant-portfolio');
drop policy if exists "Approved admins can view portfolio samples" on storage.objects;
create policy "Approved admins can view portfolio samples" on storage.objects for select to authenticated using (bucket_id='applicant-portfolio' and exists (select 1 from public.media_admins where user_id=auth.uid()));

-- Create approved admin accounts under Authentication > Users, then add their UUID here:
-- insert into public.media_admins(user_id) values ('PASTE-USER-UUID-HERE');
