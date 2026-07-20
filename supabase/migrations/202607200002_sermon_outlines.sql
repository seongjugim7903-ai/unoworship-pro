-- 설교대지 + 주보 저장소.
--  · sermon_outlines: 정기예배마다 작성 (일자·예배종류·내용·찬양)
--  · weekly_bulletins: 주 1회 작성 (주 시작일 기준 1건)

create extension if not exists pgcrypto;

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

create index if not exists sermon_outlines_service_date_idx
  on public.sermon_outlines (service_date desc);

create index if not exists sermon_outlines_created_at_idx
  on public.sermon_outlines (created_at desc);

-- 주보: 한 주에 한 건. week_start(그 주 일요일)로 유일성을 보장한다.
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

create index if not exists weekly_bulletins_week_start_idx
  on public.weekly_bulletins (week_start desc);

-- set_updated_at()는 choir 마이그레이션에서 이미 만들었지만 독립 실행 대비 재정의한다.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sermon_outlines_set_updated_at on public.sermon_outlines;
create trigger sermon_outlines_set_updated_at
before update on public.sermon_outlines
for each row execute function public.set_updated_at();

drop trigger if exists weekly_bulletins_set_updated_at on public.weekly_bulletins;
create trigger weekly_bulletins_set_updated_at
before update on public.weekly_bulletins
for each row execute function public.set_updated_at();

alter table public.sermon_outlines enable row level security;
alter table public.weekly_bulletins enable row level security;

-- 저장/조회는 Next.js 서버 Route Handler의 service role key로만 수행한다. anon 공개 정책은 만들지 않는다.
