-- 팀을 데이터로 — 교회마다 팀 이름이 다르다.
--
--  울주교회는 준비찬양이 주일1부·2부·수요예배·금요기도회이고 찬양대가 헵시바다.
--  다른 교회는 시온찬양대·호산나찬양대일 수 있고 찬양팀 이름도 다르다.
--  화면에 목록을 박아 두면 두 번째 교회에서 바로 무너진다.
--
--  카테고리는 화면을 나누는 이름이지 권한 축이 아니다. 권한은 팀과 작성자 둘로만 갈린다
--  (docs/features/auth-church-scope/context-notes.md).
--  설교대지는 팀이 없다 — 담임목사도 부교역자도 각자 자기 것을 쓴다.

create table if not exists public.worship_teams (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  church_id uuid not null references public.churches(id) on delete cascade,
  /* 준비찬양 | 찬양대 */
  category text not null,
  name text not null,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by uuid references auth.users(id)
);

/* 이름이 곧 키다 — worship_prep_songs.team 등이 이름 문자열을 그대로 쓴다.
   team_id 로 바꾸면 이미 쌓인 자료를 전부 옮겨야 해서, 이름을 고유하게 두고 넘어간다. */
create unique index if not exists worship_teams_name_idx
  on public.worship_teams (church_id, name)
  where archived_at is null;

create index if not exists worship_teams_church_idx
  on public.worship_teams (church_id, category, sort_order);

alter table public.worship_teams enable row level security;

-- 지금 화면에 박혀 있던 팀을 그대로 옮겨 심는다. 울주교회 기준이다.
-- 다른 교회가 들어오면 관리자가 자기 팀을 직접 만든다.
insert into public.worship_teams (church_id, category, name, sort_order)
select c.id, t.category, t.name, t.sort_order
from public.churches c
cross join (values
  ('준비찬양', '주일1부',   1),
  ('준비찬양', '주일2부',   2),
  ('준비찬양', '수요예배',  3),
  ('준비찬양', '금요기도회', 4),
  ('찬양대',   '헵시바',    5)
) as t(category, name, sort_order)
where c.slug = coalesce(current_setting('app.default_church_slug', true), 'ulju')
  and not exists (
    select 1 from public.worship_teams w
    where w.church_id = c.id and w.name = t.name and w.archived_at is null
  );

select c.name as 교회, w.category as 카테고리, w.name as 팀
from public.worship_teams w
join public.churches c on c.id = w.church_id
order by c.name, w.sort_order;
