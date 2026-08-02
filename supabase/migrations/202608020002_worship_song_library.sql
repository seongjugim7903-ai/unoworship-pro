-- 준비찬양 곡 라이브러리 — 팀이 반복해서 쓰는 곡을 한 번만 등록해 두고 매주 끌어 쓴다.
--
--  왜 worship_prep_songs 와 나누는가
--    worship_prep_songs 는 '그 주에 무엇을 불렀는가'라는 회차 기록이다.
--    라이브러리에서 곡을 빼는 것과 이력을 지우는 것은 다른 일이므로 테이블을 나눈다.
--    (곡을 지웠다고 지난 주 셋리스트가 사라지면 안 된다)
--
--  악보는 worship-sheets 버킷을 그대로 쓴다. 다시 올리지 않고 경로만 참조한다.

create table if not exists public.worship_song_library (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  church_id uuid references public.churches(id) on delete cascade,
  team text not null default '주일1부',            -- 주일1부 | 주일2부 | 수요예배 | 금요기도회
  title text not null,

  -- 반주자가 보는 값들
  song_key text not null default '',              -- 악보에 적힌 조
  sung_key text not null default '',              -- 실제로 부르는 조. 조 흐름은 이 값으로 본다
  tempo_bpm integer,                              -- 없으면 매주 다른 속도로 시작한다
  time_signature text not null default '',        -- 4/4 · 6/8 · 3/4. 6/8 을 4/4 로 들어가면 무너진다

  -- 진행은 자유 텍스트다. 곡 구조 용어(Intro·Verse·Chorus…)를 필드로 쪼개지 않는다 —
  -- 슬라이드를 조정하지 않으므로 반주자가 악보를 본다. 칸만 늘어난다.
  arrangement text not null default 'chorus_first', -- chorus_only | chorus_first | custom
  arrangement_custom text not null default '',

  sheet_bucket text,
  sheet_path text,
  sheet_content_type text,

  last_used_at timestamptz,                       -- 최근에 쓴 곡을 앞에 보여주기 위한 값
  source text not null default 'unoworship-pro',
  metadata jsonb not null default '{}'::jsonb
);

-- 같은 팀에 같은 제목이 두 번 등록되지 않는다. 저장할 때 이 제약으로 upsert 한다.
create unique index if not exists worship_song_library_unique_idx
  on public.worship_song_library (church_id, team, title);

create index if not exists worship_song_library_search_idx
  on public.worship_song_library (church_id, title);

create index if not exists worship_song_library_recent_idx
  on public.worship_song_library (church_id, last_used_at desc nullsfirst);

drop trigger if exists worship_song_library_set_updated_at on public.worship_song_library;
create trigger worship_song_library_set_updated_at
before update on public.worship_song_library
for each row execute function public.set_updated_at();

-- 지금까지 저장한 곡을 라이브러리로 옮겨 심는다.
-- 이걸 안 하면 라이브러리가 비어서, 쓰던 곡이 검색에서 통째로 사라진 것처럼 보인다.
-- (교회·팀·제목) 하나당 가장 최근 회차의 값을 쓴다.
insert into public.worship_song_library
  (church_id, team, title, song_key, arrangement, arrangement_custom,
   sheet_bucket, sheet_path, sheet_content_type, last_used_at)
select distinct on (church_id, team, title)
  church_id, team, title, song_key, arrangement, arrangement_custom,
  sheet_bucket, sheet_path, sheet_content_type,
  service_date::timestamptz
from public.worship_prep_songs
where church_id is not null
  and btrim(title) <> ''
order by church_id, team, title, service_date desc nulls last, created_at desc
on conflict (church_id, team, title) do nothing;

-- 회차 기록에도 같은 세 값을 남긴다. 그 주에 실제로 어떤 템포·조로 했는지는
-- 라이브러리 기본값과 다를 수 있고, 나중에 되짚을 수 있어야 한다.
alter table public.worship_prep_songs add column if not exists sung_key text not null default '';
alter table public.worship_prep_songs add column if not exists tempo_bpm integer;
alter table public.worship_prep_songs add column if not exists time_signature text not null default '';
