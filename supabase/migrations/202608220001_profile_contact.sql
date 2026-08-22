-- 연락처 한 칸 — 담당자가 팀원에게 연락할 때 쓴다.
--
-- 형식을 강제하지 않는다. 010-1234-5678, 01012345678, 집 전화가 다 온다 —
-- 사람이 보고 거는 번호라 저장한 그대로 두는 편이 낫다.
--
-- 안 적어도 되는 칸이다. 비어 있으면 화면에 안 보인다.

alter table public.profiles add column if not exists phone text;

select count(*) as 프로필수 from public.profiles;
