-- 교회 참여 코드와 팀 소속 — 로그인한 사람이 어느 교회·어느 팀의 무엇인지.
--
--  코드는 두 종류다
--    church_join   교회당 1개. 여러 번 쓴다. 단톡방에 뿌려도 된다
--    team_leader   (교회·팀)당 1개. 1회용 — 쓰는 순간 소진된다
--
--  왜 '처음 들어온 사람이 팀장'이 아닌가
--    코드는 십중팔구 단톡방에 뿌려진다. 팀장에게 1:1 로 보내도 팀장이 그대로 복사해
--    팀원들에게 돌린다. 그러면 먼저 누른 사람이 팀장이 되고 다른 사람까지 세울 수 있다.
--    팀장 자리만 1회용으로 닫아 두면 코드가 돌아다녀도 사고가 나지 않는다.
--
--  교회 관리자는 그 교회 첫 사용자다 (church_members.role = 'admin').
--  구독을 결제한 사람이 가장 먼저 들어오므로 엉뚱한 사람이 될 위험이 거의 없다.
--
--  팀 이름은 아직 문자열이다. 교회마다 다르므로 언젠가 데이터로 빼야 하지만,
--  지금 빼면 화면·API 의 team 문자열을 전부 갈아야 한다. 두 번째 교회가 들어올 때 한다.
--  그때도 이 표들은 그대로 살아남는다.

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  church_id uuid not null references public.churches(id) on delete cascade,
  /* 사람이 카톡으로 전달한다 — 짧고 헷갈리지 않는 문자만 쓴다(0/O, 1/I 제외) */
  code text not null unique,
  kind text not null,                              -- church_join | team_leader
  team text,                                       -- team_leader 일 때만 채운다
  /* null 이면 무제한. team_leader 는 1 로 넣는다 */
  max_uses integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  created_by uuid references auth.users(id),
  revoked_at timestamptz
);

/* 교회당 살아 있는 참여 코드는 하나, 팀장 코드도 팀마다 하나 */
create unique index if not exists invite_codes_church_join_idx
  on public.invite_codes (church_id)
  where kind = 'church_join' and revoked_at is null;

create unique index if not exists invite_codes_team_leader_idx
  on public.invite_codes (church_id, team)
  where kind = 'team_leader' and revoked_at is null;

-- 팀 소속. 한 사람이 여러 팀에 속할 수 있다 —
-- 반주자가 1부와 수요예배를 같이 하는 경우가 흔하다.
create table if not exists public.worship_team_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  church_id uuid not null references public.churches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  team text not null,
  role text not null default 'member',             -- leader | member
  unique (church_id, user_id, team)
);

/* 팀장은 팀마다 하나 — 관리자가 교체할 때는 기존 행의 role 을 내리고 새로 올린다 */
create unique index if not exists worship_team_leader_idx
  on public.worship_team_members (church_id, team)
  where role = 'leader';

create index if not exists worship_team_members_user_idx
  on public.worship_team_members (user_id);

-- 접근은 서버(service role)만 한다. service role 은 RLS 를 통과하므로 정책은 두지 않는다.
alter table public.invite_codes enable row level security;
alter table public.worship_team_members enable row level security;

-- 첫 코드를 심는다.
--
-- 참여는 코드가 있어야 하는데, 코드를 만드는 화면은 관리자만 쓸 수 있고
-- 관리자는 '첫 참여자'다. 그대로 두면 아무도 들어올 수 없다.
-- 그래서 이미 있는 교회마다 교회 참여 코드를 하나 심어 그 고리를 끊는다.
--
-- 코드 글자는 손으로 옮겨 적을 때 헷갈리는 것(0/O, 1/I/L)을 뺀 31자에서 고른다 —
-- lib/authn/inviteCode.ts 의 CODE_ALPHABET 과 같은 규칙이다.
insert into public.invite_codes (church_id, code, kind, max_uses)
select
  c.id,
  (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
                            (floor(random() * 31) + 1)::int, 1), '')
   from generate_series(1, 6)),
  'church_join',
  null                                   -- 여러 번 쓴다
from public.churches c
where not exists (
  select 1 from public.invite_codes i
  where i.church_id = c.id and i.kind = 'church_join' and i.revoked_at is null
);

-- 심은 코드를 확인한다. 이 결과의 code 를 교회 담당자에게 전달하면 된다.
select c.name as 교회, i.code as 참여코드, i.kind as 종류
from public.invite_codes i
join public.churches c on c.id = i.church_id
order by c.name;
