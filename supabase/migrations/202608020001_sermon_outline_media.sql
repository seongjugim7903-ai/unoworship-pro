-- 설교 참고자료 — 업로드 버킷 + 별도 프로그램 저장소.
--  · 사진과 유튜브 링크를 각각 자기 프로그램으로 저장한다(설교대지 3종과 독립).
--  · 영상 파일은 받지 않는다 — 유튜브 링크로 대체한다(Vercel 4.5MB 요청 상한 + 스토리지 용량).
--  · 사진은 브라우저에서 1920px WebP 로 변환해 올리므로 10MB 상한이면 충분하다.

-- 1. Storage 버킷 (사진 전용)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sermon-outline-media',
  'sermon-outline-media',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 2. 참고자료 프로그램 — 현장 Composer 가 이 행을 읽어 프로그램을 만든다.
--    kind='image'   → items = [{ path, width, height, caption }]
--    kind='youtube' → items = [{ url, videoId, caption }]
--    두 종류를 한 테이블에 두는 이유: 저장·조회·정리 흐름이 완전히 같고,
--    Composer 가 목록 하나만 읽으면 되기 때문이다.
create table if not exists public.sermon_media_programs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  church_id uuid references public.churches(id) on delete cascade,
  kind text not null check (kind in ('image', 'youtube')),
  service_type text not null default '주일낮예배',
  service_date date,
  title text not null default '설교 참고자료',
  items jsonb not null default '[]'::jsonb,
  status text not null default 'saved',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists sermon_media_programs_church_idx
  on public.sermon_media_programs (church_id, created_at desc);

create index if not exists sermon_media_programs_service_date_idx
  on public.sermon_media_programs (service_date desc);

create index if not exists sermon_media_programs_kind_idx
  on public.sermon_media_programs (kind, created_at desc);

-- set_updated_at() 는 앞선 마이그레이션에서 만들었지만 독립 실행 대비 재정의한다.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sermon_media_programs_set_updated_at on public.sermon_media_programs;
create trigger sermon_media_programs_set_updated_at
before update on public.sermon_media_programs
for each row execute function public.set_updated_at();

-- 저장/조회는 Next.js 서버 Route Handler 의 service role key 로만 한다. anon 공개 정책은 만들지 않는다.
alter table public.sermon_media_programs enable row level security;
