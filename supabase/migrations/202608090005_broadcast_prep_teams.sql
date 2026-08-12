-- 방송실 · 예배준비 두 카테고리를 더한다.
--
--  방송실   — 모든 팀이 올린 자료를 한자리에서 살피고 예배를 운영한다(읽기 중심).
--  예배준비 — 새신자 명단·긴급 준비 내용·그날 준비 항목을 챙긴다. 직접 자막 협조는 없다.
--
--  worship_teams 는 카테고리(화면 분류)와 이름(팀)만 갖는다 — 권한 축이 아니다.
--  이 둘은 한 카테고리에 팀 하나씩(이름=카테고리)으로 넣는다. 준비찬양처럼 여러 팀으로
--  쪼갤 필요가 아직 없다. 다른 교회는 관리자가 자기 팀을 직접 만든다.
--  (202608090002_worship_teams.sql 과 같은 방식)

insert into public.worship_teams (church_id, category, name, sort_order)
select c.id, t.category, t.name, t.sort_order
from public.churches c
cross join (values
  ('방송실',   '방송실',   6),
  ('예배준비', '예배준비', 7)
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
