-- 설교대지 참고자료(사진) 저장 버킷.
--  · 영상 파일은 받지 않는다 — 유튜브 링크로 대체한다(Vercel 4.5MB 요청 상한 + 스토리지 용량).
--  · 브라우저에서 1920px WebP 로 변환해 올리므로 10MB 상한이면 충분하다.
--  · 테이블 변경은 없다. 메타데이터는 sermon_outlines.metadata 에 들어간다.

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
