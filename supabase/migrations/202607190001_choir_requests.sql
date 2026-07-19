-- 찬양대 자막 요청/이미지/프로그램 저장소 — Vercel 페이지에서 생성한 자료를 Supabase에 보관한다.

create extension if not exists pgcrypto;

create table if not exists public.choir_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  service_date date,
  service_type text not null default '주일낮예배',
  song_title text not null,
  composer text not null default '',
  arranger text not null default '',
  lyrics text not null,
  note text not null default '',
  section_count integer not null default 0,
  source text not null default 'unoworship-pro',
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.choir_generated_images (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.choir_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  section_index integer not null,
  label text not null,
  bucket text not null default 'choir-generated-images',
  storage_path text not null,
  content_type text not null default 'image/png',
  size_bytes integer not null default 0,
  width integer not null default 1920,
  height integer not null default 1080,
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  unique (request_id, section_index)
);

create table if not exists public.choir_programs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.choir_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  program_id text not null,
  title text not null,
  program_payload jsonb not null,
  status text not null default 'ready',
  imported_at timestamptz,
  imported_program_file text,
  unique (request_id)
);

create index if not exists choir_requests_created_at_idx
  on public.choir_requests (created_at desc);

create index if not exists choir_requests_service_date_idx
  on public.choir_requests (service_date desc);

create index if not exists choir_generated_images_request_idx
  on public.choir_generated_images (request_id, section_index);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists choir_requests_set_updated_at on public.choir_requests;
create trigger choir_requests_set_updated_at
before update on public.choir_requests
for each row execute function public.set_updated_at();

drop trigger if exists choir_programs_set_updated_at on public.choir_programs;
create trigger choir_programs_set_updated_at
before update on public.choir_programs
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'choir-generated-images',
  'choir-generated-images',
  false,
  10485760,
  array['image/png']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.choir_requests enable row level security;
alter table public.choir_generated_images enable row level security;
alter table public.choir_programs enable row level security;

-- 현재 저장은 Next.js 서버 Route Handler의 service role key로 수행한다.
-- anon 공개 정책은 일부러 만들지 않는다. 공개 조회/공유가 필요해지면 별도 API로 signed URL을 발급한다.
