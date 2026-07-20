-- 준비찬양 — 정기예배·일자·찬양팀별 준비 곡 목록.
--   곡 1개 = 1행. (service_type, service_date, team)이 하나의 셋리스트를 이룬다.
--   제목·악보는 team 컬럼으로 팀별 저장/재사용된다.

create extension if not exists pgcrypto;

create table if not exists public.worship_prep_songs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  service_type text not null default '주일낮예배',
  service_date date,
  team text not null default '주일1부',           -- 주일1부 | 주일2부 | 수요예배 | 금요기도회
  song_order integer not null default 0,
  title text not null,
  song_key text not null default '',              -- 조(key): 예 G, Am
  arrangement text not null default 'chorus_first', -- chorus_only | chorus_first | custom
  arrangement_custom text not null default '',    -- arrangement=custom(직접기입)일 때 내용
  sheet_bucket text,
  sheet_path text,                                -- 찬양악보 Storage 경로 (nullable)
  sheet_content_type text,
  source text not null default 'unoworship-pro',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists worship_prep_songs_team_title_idx
  on public.worship_prep_songs (team, title);

create index if not exists worship_prep_songs_setlist_idx
  on public.worship_prep_songs (service_date desc, team);

create index if not exists worship_prep_songs_created_at_idx
  on public.worship_prep_songs (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists worship_prep_songs_set_updated_at on public.worship_prep_songs;
create trigger worship_prep_songs_set_updated_at
before update on public.worship_prep_songs
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'worship-sheets',
  'worship-sheets',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.worship_prep_songs enable row level security;

-- 저장/조회는 Next.js 서버 Route Handler의 service role key로만 수행한다.
