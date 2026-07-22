-- 멀티테넌트(교회별 격리) 이관 — 1단계: 스키마 + 기존 데이터 배정
-- 기획: docs/UNOWORSHIP_ONBOARDING_DEVICE_AUTH_PLAN_2026-07-23.md §5
--       docs/UNOWORSHIP_SAAS_ELECTRON_DATA_ARCHITECTURE_PLAN.md §3-4
--
-- 원칙:
--   · 기존 데이터는 삭제하지 않고 울주교회(slug 'ulju')로 명시 배정한다.
--   · 모든 문장은 재실행 가능(idempotent)하게 작성한다.
--   · 콘텐츠 테이블 접근은 계속 서버(service role)로만 한다. anon 정책 없음.
--
-- 적용: Supabase Dashboard → SQL Editor 에서 전체 실행.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- 1. 핵심 테넌트 테이블
-- ─────────────────────────────────────────────────────────────

create table if not exists public.churches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  slug text not null unique,
  status text not null default 'active',          -- active | pending | suspended
  contact_email text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.church_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  church_id uuid not null references public.churches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',            -- admin | crew | member
  unique (church_id, user_id)
);

-- 이하 3개 테이블은 운영 DB(맥미니 개발분)에 이미 존재할 수 있다.
-- IF NOT EXISTS 이므로 존재하면 그대로 두고, 없을 때만 코드가 기대하는 모양으로 만든다.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  full_name text,
  role text not null default 'member',
  church_id uuid references public.churches(id)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'church_basic',
  status text not null default 'trial',           -- trial | active | expired | cancelled
  started_at timestamptz,
  expires_at timestamptz,
  trial_ends_at timestamptz
);

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  church_id uuid references public.churches(id),
  token_hash text not null unique,
  device_name text not null,
  device_type text not null default 'server',
  os_platform text,
  app_version text,
  subscription_snapshot jsonb,
  last_verified_at timestamptz,
  last_verified_ip text,
  revoked_at timestamptz,
  revoked_reason text
);

-- profiles 에 church_id 가 없던 구버전 대비
alter table public.profiles add column if not exists church_id uuid references public.churches(id);
alter table public.device_tokens add column if not exists church_id uuid references public.churches(id);

-- ─────────────────────────────────────────────────────────────
-- 2. 콘텐츠 테이블에 교회 소속 컬럼 추가
-- ─────────────────────────────────────────────────────────────

alter table public.choir_requests         add column if not exists church_id uuid references public.churches(id);
alter table public.choir_requests         add column if not exists created_by uuid references auth.users(id);
alter table public.choir_generated_images add column if not exists church_id uuid references public.churches(id);
alter table public.choir_programs         add column if not exists church_id uuid references public.churches(id);
alter table public.sermon_outlines        add column if not exists church_id uuid references public.churches(id);
alter table public.sermon_outlines        add column if not exists created_by uuid references auth.users(id);
alter table public.weekly_bulletins       add column if not exists church_id uuid references public.churches(id);
alter table public.worship_prep_songs     add column if not exists church_id uuid references public.churches(id);
alter table public.worship_prep_songs     add column if not exists created_by uuid references auth.users(id);

-- 주보 "주당 1건" 제약을 전역 → 교회별로 변경 (unique(week_start) → unique(church_id, week_start))
alter table public.weekly_bulletins drop constraint if exists weekly_bulletins_week_start_key;
create unique index if not exists weekly_bulletins_church_week_key
  on public.weekly_bulletins (church_id, week_start);

create index if not exists choir_requests_church_idx         on public.choir_requests (church_id, created_at desc);
create index if not exists choir_generated_images_church_idx on public.choir_generated_images (church_id);
create index if not exists choir_programs_church_idx         on public.choir_programs (church_id, created_at desc);
create index if not exists sermon_outlines_church_idx        on public.sermon_outlines (church_id, service_date desc);
create index if not exists weekly_bulletins_church_idx       on public.weekly_bulletins (church_id, week_start desc);
create index if not exists worship_prep_songs_church_idx     on public.worship_prep_songs (church_id, service_date desc);
create index if not exists device_tokens_church_idx          on public.device_tokens (church_id);
create index if not exists church_members_user_idx           on public.church_members (user_id);

-- ─────────────────────────────────────────────────────────────
-- 3. 울주교회 생성 + 기존 데이터 배정 (삭제 없음)
-- ─────────────────────────────────────────────────────────────

insert into public.churches (name, slug, status)
values ('울주교회', 'ulju', 'active')
on conflict (slug) do nothing;

do $$
declare
  ulju uuid;
begin
  select id into ulju from public.churches where slug = 'ulju';

  -- 콘텐츠: 소속 없는 기존 행 전부를 울주교회로 배정
  update public.choir_requests         set church_id = ulju where church_id is null;
  update public.choir_generated_images set church_id = ulju where church_id is null;
  update public.choir_programs         set church_id = ulju where church_id is null;
  update public.sermon_outlines        set church_id = ulju where church_id is null;
  update public.weekly_bulletins       set church_id = ulju where church_id is null;
  update public.worship_prep_songs     set church_id = ulju where church_id is null;

  -- 기존 사용자: 현재 등록된 계정은 모두 울주교회 운영 인원이므로 울주 소속으로 배정
  update public.profiles set church_id = ulju where church_id is null;
  update public.device_tokens set church_id = ulju where church_id is null;

  -- church_members 연결 (이미 있으면 무시)
  insert into public.church_members (church_id, user_id, role)
  select ulju, p.id, coalesce(nullif(p.role, ''), 'member')
  from public.profiles p
  on conflict (church_id, user_id) do nothing;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────

alter table public.churches       enable row level security;
alter table public.church_members enable row level security;
alter table public.profiles       enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.device_tokens  enable row level security;

-- 본인 프로필 조회
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- 소속 교회 정보 조회
drop policy if exists churches_select_member on public.churches;
create policy churches_select_member on public.churches
  for select to authenticated
  using (id in (select church_id from public.church_members where user_id = auth.uid()));

-- 소속 교회의 멤버 목록 조회
drop policy if exists church_members_select_same_church on public.church_members;
create policy church_members_select_same_church on public.church_members
  for select to authenticated
  using (church_id in (select church_id from public.church_members where user_id = auth.uid()));

-- 본인 구독 조회
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (user_id = auth.uid());

-- 본인 기기 조회·해제 (웹 "연결된 기기" 화면이 세션 클라이언트로 사용)
drop policy if exists device_tokens_select_own on public.device_tokens;
create policy device_tokens_select_own on public.device_tokens
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists device_tokens_update_own on public.device_tokens;
create policy device_tokens_update_own on public.device_tokens
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 콘텐츠 테이블: 서버(service role) 전용 유지. anon/authenticated 정책 일부러 없음.
-- (향후 웹 클라이언트 직접 조회가 필요해지면 church_members 기반 select 정책을 추가한다.)
