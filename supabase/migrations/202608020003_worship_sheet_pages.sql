-- 악보를 여러 장으로 — 실제 악보는 보통 2~4페이지다.
--
--  지금까지는 곡당 sheet_path 하나였다. 연주용 보기가 한 장밖에 못 넘겼고,
--  가로 2페이지 펼침·반 페이지 넘김 같은 것이 애초에 불가능했다.
--
--  왜 별도 테이블이 아니라 jsonb 배열인가
--    페이지는 항상 곡과 함께 통째로 읽고 통째로 쓴다. 따로 조회할 일이 없고
--    연주 화면은 셋의 모든 페이지를 한 번에 받아야 하므로 조인이 손해다.
--
--  페이지 한 장의 모양
--    { "path": "library/…/x-01.png", "contentType": "image/png",
--      "w": 1240, "h": 1754,
--      "crop": { "l": 0.06, "t": 0.04, "r": 0.06, "b": 0.05 } }
--    crop 은 원본 대비 비율이다. 업로드할 때 흰 여백을 재서 넣는다 —
--    태블릿 화면의 3~4할을 여백이 먹기 때문이다. 없으면 자르지 않는다.

alter table public.worship_song_library
  add column if not exists sheet_pages jsonb not null default '[]'::jsonb;

alter table public.worship_prep_songs
  add column if not exists sheet_pages jsonb not null default '[]'::jsonb;

-- 지금까지 올린 한 장짜리 악보를 1페이지로 옮긴다.
-- 크기(w·h)와 crop 은 모른다 — 비워 두면 화면이 자르지 않고 원본 그대로 그린다.
update public.worship_song_library
set sheet_pages = jsonb_build_array(
      jsonb_build_object('path', sheet_path, 'contentType', coalesce(sheet_content_type, ''))
    )
where sheet_path is not null
  and jsonb_array_length(sheet_pages) = 0;

update public.worship_prep_songs
set sheet_pages = jsonb_build_array(
      jsonb_build_object('path', sheet_path, 'contentType', coalesce(sheet_content_type, ''))
    )
where sheet_path is not null
  and jsonb_array_length(sheet_pages) = 0;

-- sheet_path 는 그대로 둔다. 1페이지를 가리키는 값으로 계속 채우므로
-- 예전 화면·API 가 깨지지 않는다(악보 있음/없음 표시 등).
