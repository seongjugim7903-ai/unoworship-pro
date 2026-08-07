-- 찬양 구성 기본값을 '절 전체'(full)로 변경.
--   악보의 절을 1절부터 순서대로 다 부르는 경우가 가장 흔한데 선택지에 없어서
--   그동안 'chorus_first'(후렴 먼저)가 기본으로 잡혀 있었다.
--   기존 행의 값은 담당자가 실제로 고른 결과일 수 있으므로 그대로 둔다(기본값만 교체).

alter table public.worship_prep_songs
  alter column arrangement set default 'full';

alter table public.worship_song_library
  alter column arrangement set default 'full';
