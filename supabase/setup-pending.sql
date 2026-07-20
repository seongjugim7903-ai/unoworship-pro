-- 미적용 테이블 일괄 적용 스크립트 (설교대지 + 준비찬양).
-- Supabase Dashboard > SQL Editor 에 통째로 붙여넣고 Run 하면 된다. 여러 번 실행해도 안전(idempotent).
-- 이미 적용된 choir_* 테이블은 건드리지 않는다.
--   원본 마이그레이션: 202607200002_sermon_outlines.sql, 202607200003_worship_prep.sql

create extension if not exists pgcrypto;

-- 공통: updated_at 자동 갱신 트리거 함수 (choir 마이그레이션에도 있지만 독립 실행 대비 재정의)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 설교대지 (예배마다 작성)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.sermon_outlines (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  service_type text not null default '주일낮예배',
  service_date date,
  content text not null default '',
  hymn text not null default '',
  source text not null default 'unoworship-pro',
  status text not null default 'saved',
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists sermon_outlines_service_date_idx on public.sermon_outlines (service_date desc);
create index if not exists sermon_outlines_created_at_idx on public.sermon_outlines (created_at desc);

drop trigger if exists sermon_outlines_set_updated_at on public.sermon_outlines;
create trigger sermon_outlines_set_updated_at
before update on public.sermon_outlines
for each row execute function public.set_updated_at();

alter table public.sermon_outlines enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 주보 (주 1회, week_start 유일)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.weekly_bulletins (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  week_start date not null,
  content text not null default '',
  source text not null default 'unoworship-pro',
  metadata jsonb not null default '{}'::jsonb,
  unique (week_start)
);
create index if not exists weekly_bulletins_week_start_idx on public.weekly_bulletins (week_start desc);

drop trigger if exists weekly_bulletins_set_updated_at on public.weekly_bulletins;
create trigger weekly_bulletins_set_updated_at
before update on public.weekly_bulletins
for each row execute function public.set_updated_at();

alter table public.weekly_bulletins enable row level security;

-- ─────────────────────────────────────────────────────────────
-- 준비찬양 (곡 1개 = 1행, team별 저장)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.worship_prep_songs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  service_type text not null default '주일낮예배',
  service_date date,
  team text not null default '주일1부',
  song_order integer not null default 0,
  title text not null,
  song_key text not null default '',
  arrangement text not null default 'chorus_first',
  arrangement_custom text not null default '',
  sheet_bucket text,
  sheet_path text,
  sheet_content_type text,
  source text not null default 'unoworship-pro',
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists worship_prep_songs_team_title_idx on public.worship_prep_songs (team, title);
create index if not exists worship_prep_songs_setlist_idx on public.worship_prep_songs (service_date desc, team);
create index if not exists worship_prep_songs_created_at_idx on public.worship_prep_songs (created_at desc);

drop trigger if exists worship_prep_songs_set_updated_at on public.worship_prep_songs;
create trigger worship_prep_songs_set_updated_at
before update on public.worship_prep_songs
for each row execute function public.set_updated_at();

alter table public.worship_prep_songs enable row level security;

-- 준비찬양 악보 Storage 버킷
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('worship-sheets', 'worship-sheets', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 저장/조회는 Next.js 서버 Route Handler의 service role key로만 수행한다. anon 공개 정책은 만들지 않는다.
